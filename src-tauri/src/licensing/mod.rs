/// Chave pública embarcada. A chave privada correspondente nunca integra o aplicativo.
pub const COMMERCIAL_PUBLIC_KEY_BASE64: &str = "3HS7NUbfwxJG1qVCWoIxe7YnN+3iETQlnQvZbmo1yUA=";
pub const ENTITLEMENT_PUBLIC_KEY_BASE64: &str = "d97l8J/dJRr3pmW29BchuLOn4PpnrIdmu6dHt8gpZ9k=";
pub const ENTITLEMENT_KEY_ID: &str = "cnc-commercial-2026-01";
pub fn entitlement_public_key(key_id: &str) -> Option<&'static str> {
    match key_id {
        ENTITLEMENT_KEY_ID => Some(ENTITLEMENT_PUBLIC_KEY_BASE64),
        "cnc-commercial-transition-2026" => Some(COMMERCIAL_PUBLIC_KEY_BASE64),
        _ => None,
    }
}
// Mantida separada para preservar a compatibilidade dos pacotes de atualização já emitidos.
pub const DEVELOPMENT_PUBLIC_KEY_BASE64: &str = "DLe0RQZcj/O9jsvf3CChR9dkGGUf6mvvoczRmOivxns=";
pub const PRODUCT_CODE: &str = "CAIXA_NO_CONTROLE";
pub const LICENSE_SCHEMA_VERSION: u32 = 1;
pub const INVALID_LICENSE_MESSAGE: &str =
    "Não foi possível validar esta licença. Verifique se o arquivo corresponde a este computador ou entre em contato com a BratecInfo.";
const ALLOWED_FEATURES: &[&str] = &[
    "financial_core",
    "contacts",
    "catalog",
    "sales",
    "reports",
    "backup",
    "goals",
    "professional_features",
    "inventory",
    "multi_user",
];

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub license_id: String,
    pub customer_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customer_document_optional: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customer_email_optional: Option<String>,
    pub product: String,
    pub edition: String,
    pub authorized_major_version: u32,
    pub installation_id: String,
    pub issued_at: String,
    pub device_limit: u32,
    pub features: Vec<String>,
    pub license_schema_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Deserialize)]
struct SignedCommercialLicense {
    payload: LicensePayload,
    signature: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyLicensePayload {
    license_id: String,
    customer: String,
    edition: String,
    authorized_major_version: u32,
    issued_at: String,
    device_limit: u32,
    features: Vec<String>,
    #[serde(default)]
    installation_id: Option<String>,
}

#[derive(Deserialize)]
struct SignedLegacyLicense {
    payload: LegacyLicensePayload,
    signature: String,
}

fn verifying_key(public_key: &str) -> Result<VerifyingKey, String> {
    let bytes = STANDARD
        .decode(public_key)
        .map_err(|_| INVALID_LICENSE_MESSAGE)?;
    VerifyingKey::from_bytes(
        bytes
            .as_slice()
            .try_into()
            .map_err(|_| INVALID_LICENSE_MESSAGE)?,
    )
    .map_err(|_| INVALID_LICENSE_MESSAGE.to_owned())
}

fn signature(value: &str) -> Result<Signature, String> {
    let bytes = STANDARD
        .decode(value)
        .map_err(|_| INVALID_LICENSE_MESSAGE)?;
    Signature::from_slice(&bytes).map_err(|_| INVALID_LICENSE_MESSAGE.to_owned())
}

fn validate(payload: &LicensePayload) -> Result<(), String> {
    let current_major = env!("CARGO_PKG_VERSION")
        .split('.')
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(1);
    let has_core = payload
        .features
        .iter()
        .any(|feature| feature == "financial_core");
    let features_are_known = payload
        .features
        .iter()
        .all(|feature| ALLOWED_FEATURES.contains(&feature.as_str()));
    if payload.license_schema_version != LICENSE_SCHEMA_VERSION
        || payload.product != PRODUCT_CODE
        || payload.authorized_major_version != current_major
        || payload.license_id.trim().is_empty()
        || payload.customer_name.trim().is_empty()
        || payload.installation_id.trim().is_empty()
        || payload.issued_at.trim().is_empty()
        || payload.device_limit != 1
        || !has_core
        || !features_are_known
        || !["ESSENTIAL", "PROFESSIONAL", "BUSINESS"].contains(&payload.edition.as_str())
    {
        return Err(INVALID_LICENSE_MESSAGE.into());
    }
    Ok(())
}

pub fn verify(document: &str) -> Result<LicensePayload, String> {
    let is_commercial = serde_json::from_str::<serde_json::Value>(document)
        .ok()
        .and_then(|value| {
            value
                .get("payload")
                .and_then(|payload| payload.get("licenseSchemaVersion"))
                .cloned()
        })
        .is_some();
    verify_with_public_key(
        document,
        if is_commercial {
            COMMERCIAL_PUBLIC_KEY_BASE64
        } else {
            DEVELOPMENT_PUBLIC_KEY_BASE64
        },
    )
}

fn verify_with_public_key(document: &str, public_key: &str) -> Result<LicensePayload, String> {
    let value: serde_json::Value =
        serde_json::from_str(document).map_err(|_| INVALID_LICENSE_MESSAGE)?;
    let is_commercial = value
        .get("payload")
        .and_then(|payload| payload.get("licenseSchemaVersion"))
        .is_some();
    let key = verifying_key(public_key)?;

    if is_commercial {
        let signed: SignedCommercialLicense =
            serde_json::from_value(value).map_err(|_| INVALID_LICENSE_MESSAGE)?;
        let canonical =
            serde_json::to_string(&signed.payload).map_err(|_| INVALID_LICENSE_MESSAGE)?;
        key.verify(canonical.as_bytes(), &signature(&signed.signature)?)
            .map_err(|_| INVALID_LICENSE_MESSAGE.to_owned())?;
        validate(&signed.payload)?;
        return Ok(signed.payload);
    }

    // Compatibilidade de migração com licenças emitidas antes do esquema comercial v1.
    let signed: SignedLegacyLicense =
        serde_json::from_value(value).map_err(|_| INVALID_LICENSE_MESSAGE)?;
    let canonical = serde_json::to_string(&signed.payload).map_err(|_| INVALID_LICENSE_MESSAGE)?;
    key.verify(canonical.as_bytes(), &signature(&signed.signature)?)
        .map_err(|_| INVALID_LICENSE_MESSAGE.to_owned())?;
    let installation_id = signed
        .payload
        .installation_id
        .ok_or_else(|| INVALID_LICENSE_MESSAGE.to_owned())?;
    let payload = LicensePayload {
        license_id: signed.payload.license_id,
        customer_name: signed.payload.customer,
        customer_document_optional: None,
        customer_email_optional: None,
        product: PRODUCT_CODE.into(),
        edition: signed.payload.edition,
        authorized_major_version: signed.payload.authorized_major_version,
        installation_id,
        issued_at: signed.payload.issued_at,
        device_limit: signed.payload.device_limit,
        features: signed.payload.features,
        license_schema_version: LICENSE_SCHEMA_VERSION,
        notes: Some("Licença migrada do formato anterior".into()),
    };
    validate(&payload)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::{verify_with_public_key, LicensePayload, LICENSE_SCHEMA_VERSION, PRODUCT_CODE};
    use base64::{engine::general_purpose::STANDARD, Engine};
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;

    fn payload() -> LicensePayload {
        LicensePayload {
            license_id: "CNC-00000001".into(),
            customer_name: "Cliente Teste".into(),
            customer_document_optional: None,
            customer_email_optional: None,
            product: PRODUCT_CODE.into(),
            edition: "ESSENTIAL".into(),
            authorized_major_version: 1,
            installation_id: "CNC-ABCD-EF12-3456".into(),
            issued_at: "2026-08-03T00:00:00Z".into(),
            device_limit: 1,
            features: vec!["financial_core".into()],
            license_schema_version: LICENSE_SCHEMA_VERSION,
            notes: None,
        }
    }

    fn signed(payload: LicensePayload) -> (String, String) {
        let signing = SigningKey::from_bytes(&[7_u8; 32]);
        let canonical = serde_json::to_string(&payload).unwrap();
        let document=json!({"payload":payload,"signature":STANDARD.encode(signing.sign(canonical.as_bytes()).to_bytes())}).to_string();
        (
            document,
            STANDARD.encode(signing.verifying_key().to_bytes()),
        )
    }

    fn license() -> (String, String) {
        signed(payload())
    }

    #[test]
    fn accepts_valid_signature() {
        let (document, key) = license();
        assert_eq!(
            verify_with_public_key(&document, &key)
                .unwrap()
                .customer_name,
            "Cliente Teste"
        );
    }

    #[test]
    fn rejects_tampered_license() {
        let (document, key) = license();
        let tampered = document.replace("Cliente Teste", "Outro Cliente");
        assert!(verify_with_public_key(&tampered, &key).is_err());
    }

    #[test]
    fn rejects_another_product_or_major_version() {
        let mut wrong_product = payload();
        wrong_product.product = "OTHER".into();
        let (document, key) = signed(wrong_product);
        assert!(verify_with_public_key(&document, &key).is_err());
        let mut wrong_major = payload();
        wrong_major.authorized_major_version = 2;
        let (document, key) = signed(wrong_major);
        assert!(verify_with_public_key(&document, &key).is_err());
    }
}
