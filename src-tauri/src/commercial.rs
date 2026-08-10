use std::{fs, path::PathBuf, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{application::entitlements, licensing};

const STATE_ENTROPY: &[u8] = b"BratecInfo|CaixaNoControle|CommercialState|v1";
const DEFAULT_API_URL: &str = "";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommercialPlan {
    pub code: String,
    pub name: String,
    pub billing_cycle: String,
    pub amount_cents: i64,
    pub offline_lease_days: i64,
    pub grace_period_days: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutRequest {
    pub name: String,
    pub email: String,
    pub document: Option<String>,
    pub plan_code: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutResponse {
    pub subscription_id: String,
    pub checkout_url: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementPayload {
    pub entitlement_id: String,
    pub customer_id: String,
    pub installation_id: String,
    pub device_public_key_fingerprint: String,
    pub product: String,
    pub edition: String,
    pub plan_code: String,
    pub features: Vec<String>,
    pub subscription_status: String,
    pub issued_at: String,
    pub not_before: String,
    pub valid_until: String,
    pub server_sequence: u64,
    pub schema_version: u32,
    pub key_id: String,
    pub trusted_server_time: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SignedEntitlement {
    pub payload: EntitlementPayload,
    pub signature: String,
    pub algorithm: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProtectedState {
    schema_version: u32,
    installation_code: String,
    device_private_key: String,
    device_public_key: String,
    device_fingerprint: String,
    subscription_id: Option<String>,
    signed_entitlement: Option<SignedEntitlement>,
    highest_server_sequence: u64,
    last_trusted_server_time: Option<String>,
    #[serde(default)]
    trial_usage_high_water: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommercialStatus {
    pub installation_code: String,
    pub subscription_id: Option<String>,
    pub state: String,
    pub plan_code: Option<String>,
    pub valid_until: Option<String>,
    pub offline: bool,
    pub requires_online_validation: bool,
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .local_data_dir()
        .map_err(|e| e.to_string())?
        .join("BratecInfo")
        .join("CaixaNoControle")
        .join("commercial-state.bin"))
}

#[cfg(windows)]
fn protect(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: STATE_ENTROPY.len() as u32,
        pbData: STATE_ENTROPY.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            &entropy,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err("O Windows não conseguiu proteger a identidade deste dispositivo.".into());
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(result)
}
#[cfg(windows)]
fn unprotect(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: STATE_ENTROPY.len() as u32,
        pbData: STATE_ENTROPY.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            &entropy,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(
            "A identidade comercial não pertence a este usuário do Windows ou foi corrompida."
                .into(),
        );
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(result)
}
#[cfg(not(windows))]
fn protect(_: &[u8]) -> Result<Vec<u8>, String> {
    Err("Proteção comercial disponível apenas no Windows.".into())
}
#[cfg(not(windows))]
fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> {
    Err("Proteção comercial disponível apenas no Windows.".into())
}

fn write_state(app: &AppHandle, state: &ProtectedState) -> Result<(), String> {
    let path = state_path(app)?;
    fs::create_dir_all(path.parent().ok_or("Diretório comercial inválido.")?)
        .map_err(|e| e.to_string())?;
    let clear = serde_json::to_vec(state).map_err(|e| e.to_string())?;
    let encrypted = protect(&clear)?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, encrypted).map_err(|e| e.to_string())?;
    fs::rename(temporary, path).map_err(|e| e.to_string())
}
fn read_state(app: &AppHandle) -> Result<Option<ProtectedState>, String> {
    let path = state_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let clear = unprotect(&fs::read(path).map_err(|e| e.to_string())?)?;
    let state: ProtectedState = serde_json::from_slice(&clear)
        .map_err(|_| "Estado comercial protegido está corrompido.".to_string())?;
    if state.schema_version != 1 {
        return Err("Versão do estado comercial não suportada.".into());
    }
    Ok(Some(state))
}
fn ensure_state(app: &AppHandle) -> Result<ProtectedState, String> {
    if let Some(state) = read_state(app)? {
        return Ok(state);
    }
    let signing = SigningKey::generate(&mut OsRng);
    let public = signing.verifying_key().to_bytes();
    let installation_code = entitlements::installation_id(app)?;
    let state = ProtectedState {
        schema_version: 1,
        installation_code,
        device_private_key: STANDARD.encode(signing.to_bytes()),
        device_public_key: STANDARD.encode(public),
        device_fingerprint: format!("{:x}", Sha256::digest(public)),
        subscription_id: None,
        signed_entitlement: None,
        highest_server_sequence: 0,
        last_trusted_server_time: None,
        trial_usage_high_water: 0,
    };
    write_state(app, &state)?;
    Ok(state)
}

fn api_url() -> Result<String, String> {
    let configured = option_env!("CNC_COMMERCIAL_API_URL").unwrap_or(DEFAULT_API_URL);
    #[cfg(debug_assertions)]
    let configured =
        std::env::var("CNC_COMMERCIAL_API_URL").unwrap_or_else(|_| configured.to_string());
    #[cfg(not(debug_assertions))]
    let configured = configured.to_string();
    if !configured.starts_with("https://")
        && !(cfg!(debug_assertions) && configured.starts_with("http://127.0.0.1"))
    {
        return Err("O serviço de assinaturas ainda não foi configurado nesta compilação.".into());
    }
    Ok(configured.trim_end_matches('/').to_string())
}
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("CaixaNoControle/", env!("CARGO_PKG_VERSION")))
        .https_only(!cfg!(debug_assertions))
        .build()
        .map_err(|_| "Não foi possível preparar a conexão segura.".into())
}
fn response<T: for<'a> Deserialize<'a>>(
    response: reqwest::blocking::Response,
) -> Result<T, String> {
    let status = response.status();
    if status.is_success() {
        return response
            .json()
            .map_err(|_| "O serviço comercial retornou dados inválidos.".into());
    }
    let detail = response
        .json::<Value>()
        .ok()
        .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_owned));
    Err(detail.unwrap_or_else(|| {
        if status.as_u16() == 429 {
            "Muitas tentativas. Aguarde um minuto.".into()
        } else {
            "Serviço comercial temporariamente indisponível.".into()
        }
    }))
}

pub fn plans() -> Vec<CommercialPlan> {
    vec![
        CommercialPlan {
            code: "ESSENTIAL_MONTHLY".into(),
            name: "Caixa no Controle Essencial".into(),
            billing_cycle: "MONTHLY".into(),
            amount_cents: 990,
            offline_lease_days: 7,
            grace_period_days: 5,
        },
        CommercialPlan {
            code: "ESSENTIAL_ANNUAL".into(),
            name: "Caixa no Controle Essencial".into(),
            billing_cycle: "ANNUAL".into(),
            amount_cents: 9990,
            offline_lease_days: 30,
            grace_period_days: 10,
        },
    ]
}
pub fn create_checkout(
    app: &AppHandle,
    input: CheckoutRequest,
) -> Result<CheckoutResponse, String> {
    if !matches!(
        input.plan_code.as_str(),
        "ESSENTIAL_MONTHLY" | "ESSENTIAL_ANNUAL"
    ) {
        return Err("Plano comercial inválido.".into());
    }
    let mut state = ensure_state(app)?;
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Body<'a> {
        name: &'a str,
        email: &'a str,
        document: &'a Option<String>,
        installation_code: &'a str,
        device_public_key: &'a str,
        device_fingerprint: &'a str,
        plan_code: &'a str,
    }
    let body = Body {
        name: &input.name,
        email: &input.email,
        document: &input.document,
        installation_code: &state.installation_code,
        device_public_key: &state.device_public_key,
        device_fingerprint: &state.device_fingerprint,
        plan_code: &input.plan_code,
    };
    let result = response(
        client()?
            .post(format!("{}/v1/checkout", api_url()?))
            .json(&body)
            .send()
            .map_err(|_| {
                "Não foi possível acessar o serviço comercial. Verifique sua internet.".to_string()
            })?,
    )?;
    let result: CheckoutResponse = result;
    if !result
        .checkout_url
        .starts_with("https://www.mercadopago.com")
    {
        return Err("O provedor retornou um endereço de checkout não autorizado.".into());
    }
    state.subscription_id = Some(result.subscription_id.clone());
    write_state(app, &state)?;
    Ok(result)
}

fn canonical(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys = map.keys().collect::<Vec<_>>();
            keys.sort();
            format!(
                "{{{}}}",
                keys.into_iter()
                    .map(|k| format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical(&map[k])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        _ => serde_json::to_string(value).unwrap(),
    }
}
fn verify_entitlement(document: &SignedEntitlement, state: &ProtectedState) -> Result<(), String> {
    if document.algorithm != "Ed25519"
        || document.payload.product != licensing::PRODUCT_CODE
        || document.payload.schema_version != 1
        || document.payload.device_public_key_fingerprint != state.device_fingerprint
    {
        return Err("Entitlement comercial inválido para este dispositivo.".into());
    }
    let public_key = licensing::entitlement_public_key(&document.payload.key_id)
        .ok_or("Chave de entitlement desconhecida.")?;
    verify_entitlement_signature(document, public_key)
}

fn verify_entitlement_signature(
    document: &SignedEntitlement,
    public_key: &str,
) -> Result<(), String> {
    let key_bytes = STANDARD
        .decode(public_key)
        .map_err(|_| "Chave pública comercial inválida.")?;
    let key = VerifyingKey::from_bytes(
        &key_bytes
            .try_into()
            .map_err(|_| "Chave pública comercial inválida.")?,
    )
    .map_err(|_| "Chave pública comercial inválida.")?;
    let signature = ed25519_dalek::Signature::from_slice(
        &STANDARD
            .decode(&document.signature)
            .map_err(|_| "Assinatura comercial inválida.")?,
    )
    .map_err(|_| "Assinatura comercial inválida.")?;
    let payload = serde_json::to_value(&document.payload).map_err(|e| e.to_string())?;
    key.verify(canonical(&payload).as_bytes(), &signature)
        .map_err(|_| "Assinatura comercial inválida.".into())
}

pub fn refresh(app: &AppHandle) -> Result<CommercialStatus, String> {
    let mut state = ensure_state(app)?;
    let subscription_id = state
        .subscription_id
        .clone()
        .ok_or("Nenhuma assinatura foi iniciada neste dispositivo.")?;
    let request_id = Uuid::new_v4().to_string();
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChallengeBody<'a> {
        installation_code: &'a str,
        action: &'static str,
        request_id: &'a str,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Challenge {
        challenge_id: String,
        nonce: String,
        request_id: String,
    }
    let challenge: Challenge = response(
        client()?
            .post(format!("{}/v1/installations/challenge", api_url()?))
            .json(&ChallengeBody {
                installation_code: &state.installation_code,
                action: "entitlement.refresh",
                request_id: &request_id,
            })
            .send()
            .map_err(|_| {
                "Serviço comercial indisponível; o uso offline continuará até o limite informado."
                    .to_string()
            })?,
    )?;
    if challenge.request_id != request_id {
        return Err("Resposta comercial não corresponde à solicitação.".into());
    }
    let timestamp = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let message = [
        "cnc-device-challenge-v1",
        &challenge.challenge_id,
        &state.installation_code,
        &challenge.nonce,
        &request_id,
        &timestamp,
        "entitlement.refresh",
    ]
    .join("|");
    let private: [u8; 32] = STANDARD
        .decode(&state.device_private_key)
        .map_err(|_| "Identidade protegida inválida.")?
        .try_into()
        .map_err(|_| "Identidade protegida inválida.")?;
    let signature = STANDARD.encode(
        SigningKey::from_bytes(&private)
            .sign(message.as_bytes())
            .to_bytes(),
    );
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct RefreshBody<'a> {
        installation_code: &'a str,
        subscription_id: &'a str,
        challenge_id: &'a str,
        nonce: &'a str,
        request_id: &'a str,
        timestamp: &'a str,
        action: &'static str,
        signature: &'a str,
    }
    let document:SignedEntitlement=response(client()?.post(format!("{}/v1/entitlements/refresh",api_url()?)).json(&RefreshBody{installation_code:&state.installation_code,subscription_id:&subscription_id,challenge_id:&challenge.challenge_id,nonce:&challenge.nonce,request_id:&request_id,timestamp:&timestamp,action:"entitlement.refresh",signature:&signature}).send().map_err(|_|"Não foi possível renovar a autorização. O uso offline continuará até o limite informado.".to_string())?)?;
    verify_entitlement(&document, &state)?;
    let client_now = Utc::now();
    let not_before = DateTime::parse_from_rfc3339(&document.payload.not_before)
        .map_err(|_| "Início da autorização inválido.")?
        .with_timezone(&Utc);
    let valid_until = DateTime::parse_from_rfc3339(&document.payload.valid_until)
        .map_err(|_| "Validade da autorização inválida.")?
        .with_timezone(&Utc);
    if not_before > client_now + chrono::Duration::minutes(5) || valid_until <= client_now {
        return Err("O servidor retornou uma autorização fora da validade.".into());
    }
    if document.payload.server_sequence <= state.highest_server_sequence {
        return Err("Resposta comercial repetida ou anterior à já validada.".into());
    }
    let trusted = DateTime::parse_from_rfc3339(&document.payload.trusted_server_time)
        .map_err(|_| "Horário confiável inválido.")?
        .with_timezone(&Utc);
    if let Some(previous) = &state.last_trusted_server_time {
        let previous = DateTime::parse_from_rfc3339(previous)
            .map_err(|_| "Estado temporal protegido inválido.")?
            .with_timezone(&Utc);
        if trusted < previous {
            return Err("O servidor retornou um horário anterior ao já validado.".into());
        }
    }
    state.highest_server_sequence = document.payload.server_sequence;
    state.last_trusted_server_time = Some(document.payload.trusted_server_time.clone());
    state.signed_entitlement = Some(document);
    write_state(app, &state)?;
    status(app)
}

pub fn status(app: &AppHandle) -> Result<CommercialStatus, String> {
    let state = ensure_state(app)?;
    let Some(document) = state.signed_entitlement.as_ref() else {
        let pending = state.subscription_id.is_some();
        return Ok(CommercialStatus {
            installation_code: state.installation_code,
            subscription_id: state.subscription_id,
            state: if pending {
                "PAYMENT_PENDING".into()
            } else {
                "TRIAL".into()
            },
            plan_code: None,
            valid_until: None,
            offline: true,
            requires_online_validation: false,
        });
    };
    verify_entitlement(document, &state)?;
    let valid_until = DateTime::parse_from_rfc3339(&document.payload.valid_until)
        .map_err(|_| "Validade comercial inválida.")?
        .with_timezone(&Utc);
    let clock_rollback = state
        .last_trusted_server_time
        .as_ref()
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .is_some_and(|trusted| Utc::now() + chrono::Duration::minutes(5) < trusted);
    let active = Utc::now() <= valid_until && !clock_rollback;
    Ok(CommercialStatus {
        installation_code: state.installation_code,
        subscription_id: state.subscription_id,
        state: if active {
            document.payload.subscription_status.clone()
        } else if clock_rollback {
            "REVALIDATION_REQUIRED".into()
        } else {
            "EXPIRED".into()
        },
        plan_code: Some(document.payload.plan_code.clone()),
        valid_until: Some(document.payload.valid_until.clone()),
        offline: true,
        requires_online_validation: clock_rollback
            || valid_until - Utc::now() < chrono::Duration::hours(24),
    })
}

pub fn active_payload(app: &AppHandle) -> Option<EntitlementPayload> {
    let state = read_state(app).ok().flatten()?;
    let document = state.signed_entitlement.as_ref()?;
    verify_entitlement(document, &state).ok()?;
    let now = Utc::now();
    let trusted = DateTime::parse_from_rfc3339(state.last_trusted_server_time.as_ref()?)
        .ok()?
        .with_timezone(&Utc);
    let valid = now + chrono::Duration::minutes(5) >= trusted
        && DateTime::parse_from_rfc3339(&document.payload.valid_until)
            .ok()?
            .with_timezone(&Utc)
            >= now;
    (valid
        && matches!(
            document.payload.subscription_status.as_str(),
            "ACTIVE" | "GRACE_PERIOD"
        ))
    .then(|| document.payload.clone())
}

pub fn protected_trial_high_water(app: &AppHandle) -> i64 {
    read_state(app)
        .ok()
        .flatten()
        .map_or(0, |state| state.trial_usage_high_water)
}

pub fn record_trial_high_water(app: &AppHandle, usage: i64) -> Result<(), String> {
    let mut state = ensure_state(app)?;
    if usage > state.trial_usage_high_water {
        state.trial_usage_high_water = usage.clamp(0, entitlements::TRIAL_OPERATION_LIMIT);
        write_state(app, &state)?;
    }
    Ok(())
}

pub fn record_trial_high_water_if_initialized(app: &AppHandle, usage: i64) -> Result<(), String> {
    let Some(mut state) = read_state(app)? else {
        return Ok(());
    };
    if usage > state.trial_usage_high_water {
        state.trial_usage_high_water = usage.clamp(0, entitlements::TRIAL_OPERATION_LIMIT);
        write_state(app, &state)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{canonical, verify_entitlement_signature, EntitlementPayload, SignedEntitlement};
    use base64::{engine::general_purpose::STANDARD, Engine};
    use ed25519_dalek::{Signer, SigningKey};
    use rand_core::OsRng;
    use serde_json::json;
    #[test]
    fn canonical_json_sorts_all_object_keys() {
        assert_eq!(
            canonical(&json!({"z":1,"a":{"b":2,"a":1}})),
            r#"{"a":{"a":1,"b":2},"z":1}"#
        )
    }

    #[test]
    fn entitlement_tampering_invalidates_signature() {
        let key = SigningKey::generate(&mut OsRng);
        let payload = EntitlementPayload {
            entitlement_id: "entitlement".into(),
            customer_id: "customer".into(),
            installation_id: "installation".into(),
            device_public_key_fingerprint: "fingerprint".into(),
            product: "CAIXA_NO_CONTROLE".into(),
            edition: "ESSENTIAL".into(),
            plan_code: "ESSENTIAL_MONTHLY".into(),
            features: vec!["financial_core".into()],
            subscription_status: "ACTIVE".into(),
            issued_at: "2026-08-07T12:00:00.000Z".into(),
            not_before: "2026-08-07T12:00:00.000Z".into(),
            valid_until: "2026-08-14T12:00:00.000Z".into(),
            server_sequence: 1,
            schema_version: 1,
            key_id: "test".into(),
            trusted_server_time: "2026-08-07T12:00:00.000Z".into(),
        };
        let serialized = canonical(&serde_json::to_value(&payload).unwrap());
        let mut document = SignedEntitlement {
            payload,
            signature: STANDARD.encode(key.sign(serialized.as_bytes()).to_bytes()),
            algorithm: "Ed25519".into(),
        };
        let public = STANDARD.encode(key.verifying_key().to_bytes());
        assert!(verify_entitlement_signature(&document, &public).is_ok());
        document.payload.server_sequence = 2;
        assert!(verify_entitlement_signature(&document, &public).is_err());
    }
}
