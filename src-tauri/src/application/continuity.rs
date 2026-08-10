use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use thiserror::Error;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipWriter};

use crate::{
    application::entitlements,
    commercial,
    database::{self, DatabaseError},
    licensing,
};

#[derive(Debug, Error)]
pub enum ContinuityError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error("falha ao acessar arquivo: {0}")]
    Io(#[from] std::io::Error),
    #[error("falha ao localizar diretório da aplicação: {0}")]
    Path(#[from] tauri::Error),
    #[error("arquivo inválido: {0}")]
    Invalid(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Phase2Status {
    pub app_version: String,
    pub license_status: String,
    pub license_edition: Option<String>,
    pub license_customer: Option<String>,
    pub authorized_major_version: Option<i64>,
    pub installation_id: String,
    pub license_id: Option<String>,
    pub license_issued_at: Option<String>,
    pub license_product: Option<String>,
    pub license_schema_version: Option<i64>,
    pub enabled_features: Vec<String>,
    pub can_create_financial_operation: bool,
    pub demo_data_loaded: bool,
    pub trial_expired: bool,
    pub trial_ends_at: Option<String>,
    pub trial_entry_limit: Option<i64>,
    pub trial_usage_count: i64,
    pub trial_remaining_entries: Option<i64>,
    pub subscription_state: String,
    pub subscription_plan_code: Option<String>,
    pub subscription_valid_until: Option<String>,
    pub subscription_requires_online_validation: bool,
}

struct LicenseState {
    status: String,
    edition: Option<String>,
    customer: Option<String>,
    authorized_major_version: Option<i64>,
    trial_ends_at: Option<String>,
    trial_entry_limit: Option<i64>,
    trial_usage_count: i64,
    trial_expired: bool,
    license_id: Option<String>,
    issued_at: Option<String>,
    product: Option<String>,
    schema_version: Option<i64>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format_version: u32,
    app_version: String,
    generated_at_epoch: u64,
    business_name: Option<String>,
    database_sha256: String,
    #[serde(default)]
    logo_sha256: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupDocument {
    manifest: BackupManifest,
    database_base64: String,
    logo_name: Option<String>,
    logo_base64: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProtectedBackup {
    format_version: u32,
    protected: bool,
    salt_base64: String,
    nonce_base64: String,
    payload_base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub business_name: Option<String>,
    pub app_version: String,
    pub generated_at_epoch: u64,
    pub checksum: String,
    pub protected: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettingsInput {
    pub directory: Option<String>,
    pub enabled: bool,
    pub frequency: String,
    pub retention_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    pub directory: Option<String>,
    pub enabled: bool,
    pub frequency: String,
    pub retention_count: i64,
    pub last_backup_at: Option<String>,
    pub due: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupHistoryItem {
    pub id: String,
    pub backup_type: String,
    pub path: String,
    pub protected: bool,
    pub status: String,
    pub size_bytes: Option<i64>,
    pub error_summary: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuityOverview {
    pub settings: BackupSettings,
    pub history: Vec<BackupHistoryItem>,
    pub database_version: u32,
    pub database_size_bytes: u64,
    pub database_integrity: String,
    pub foreign_key_violations: i64,
    pub log_file_count: usize,
    pub log_size_bytes: u64,
    pub app_version: String,
    pub operating_system: String,
    pub architecture: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManifest {
    pub version: String,
    pub published_at: String,
    pub summary: String,
    pub installer_file_name: String,
    pub installer_sha256: String,
    pub minimum_database_version: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePackage {
    manifest: UpdateManifest,
    installer_base64: String,
    signature: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub version: String,
    pub published_at: String,
    pub summary: String,
    pub major_upgrade: bool,
    pub license_compatible: bool,
    pub installer_file_name: String,
}

fn epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn password_key(password: &str, salt: &[u8]) -> Result<[u8; 32], ContinuityError> {
    if !(8..=256).contains(&password.chars().count()) {
        return Err(ContinuityError::Invalid(
            "a senha do backup deve possuir entre 8 e 256 caracteres".into(),
        ));
    }
    let mut key = [0_u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|_| ContinuityError::Invalid("não foi possível proteger o backup".into()))?;
    Ok(key)
}

fn encode_backup(
    document: &BackupDocument,
    password: Option<&str>,
) -> Result<Vec<u8>, ContinuityError> {
    let plain = serde_json::to_vec(document)
        .map_err(|error| ContinuityError::Invalid(error.to_string()))?;
    let Some(password) = password.filter(|value| !value.is_empty()) else {
        return Ok(plain);
    };
    let mut salt = [0_u8; 16];
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    let key = password_key(password, &salt)?;
    let encrypted = XChaCha20Poly1305::new((&key).into())
        .encrypt(XNonce::from_slice(&nonce), plain.as_ref())
        .map_err(|_| ContinuityError::Invalid("não foi possível proteger o backup".into()))?;
    serde_json::to_vec(&ProtectedBackup {
        format_version: 2,
        protected: true,
        salt_base64: STANDARD.encode(salt),
        nonce_base64: STANDARD.encode(nonce),
        payload_base64: STANDARD.encode(encrypted),
    })
    .map_err(|error| ContinuityError::Invalid(error.to_string()))
}

fn read_backup(
    path: &Path,
    password: Option<&str>,
) -> Result<(BackupDocument, bool), ContinuityError> {
    let bytes = fs::read(path)?;
    if let Ok(protected) = serde_json::from_slice::<ProtectedBackup>(&bytes) {
        if protected.format_version != 2 || !protected.protected {
            return Err(ContinuityError::Invalid(
                "formato protegido não suportado".into(),
            ));
        }
        let password = password.filter(|value| !value.is_empty()).ok_or_else(|| {
            ContinuityError::Invalid("este backup é protegido; informe a senha".into())
        })?;
        let salt = STANDARD
            .decode(protected.salt_base64)
            .map_err(|_| ContinuityError::Invalid("salt inválido".into()))?;
        let nonce = STANDARD
            .decode(protected.nonce_base64)
            .map_err(|_| ContinuityError::Invalid("nonce inválido".into()))?;
        if salt.len() != 16 || nonce.len() != 24 {
            return Err(ContinuityError::Invalid(
                "metadados de proteção inválidos".into(),
            ));
        }
        let key = password_key(password, &salt)?;
        let cipher = STANDARD
            .decode(protected.payload_base64)
            .map_err(|_| ContinuityError::Invalid("conteúdo protegido inválido".into()))?;
        let plain = XChaCha20Poly1305::new((&key).into())
            .decrypt(XNonce::from_slice(&nonce), cipher.as_ref())
            .map_err(|_| ContinuityError::Invalid("senha incorreta ou backup adulterado".into()))?;
        let document = serde_json::from_slice(&plain)
            .map_err(|_| ContinuityError::Invalid("conteúdo não reconhecido".into()))?;
        return Ok((document, true));
    }
    let document = serde_json::from_slice(&bytes)
        .map_err(|_| ContinuityError::Invalid("conteúdo não reconhecido".into()))?;
    Ok((document, false))
}

fn decode_logo(document: &BackupDocument) -> Result<Option<Vec<u8>>, ContinuityError> {
    match (
        &document.logo_base64,
        &document.manifest.logo_sha256,
        &document.logo_name,
    ) {
        (Some(encoded), Some(expected), Some(_)) => {
            let logo = STANDARD
                .decode(encoded)
                .map_err(|_| ContinuityError::Invalid("logotipo codificado inválido".into()))?;
            if sha(&logo) != *expected {
                return Err(ContinuityError::Invalid(
                    "checksum do logotipo não confere".into(),
                ));
            }
            Ok(Some(logo))
        }
        (None, None, None) => Ok(None),
        _ => Err(ContinuityError::Invalid(
            "metadados do logotipo estão incompletos".into(),
        )),
    }
}

fn decode_database(document: &BackupDocument) -> Result<Vec<u8>, ContinuityError> {
    if document.manifest.format_version != 1 {
        return Err(ContinuityError::Invalid(format!(
            "versão de backup {} não suportada",
            document.manifest.format_version
        )));
    }
    let bytes = STANDARD
        .decode(&document.database_base64)
        .map_err(|_| ContinuityError::Invalid("banco codificado inválido".into()))?;
    if sha(&bytes) != document.manifest.database_sha256 {
        return Err(ContinuityError::Invalid("checksum não confere".into()));
    }
    let _ = decode_logo(document)?;
    Ok(bytes)
}

fn replace_file(temp: &Path, target: &Path, old: &Path) -> Result<(), ContinuityError> {
    if !target.exists() {
        fs::rename(temp, target)?;
        return Ok(());
    }
    if old.exists() {
        fs::remove_file(old)?;
    }
    fs::rename(target, old)?;
    if let Err(error) = fs::rename(temp, target) {
        let _ = fs::rename(old, target);
        return Err(error.into());
    }
    fs::remove_file(old)?;
    Ok(())
}

#[cfg(test)]
fn replace_database(target: &Path, bytes: &[u8]) -> Result<(), ContinuityError> {
    let temp = target.with_extension("restore.tmp");
    fs::write(&temp, bytes)?;
    let check = Connection::open(&temp)?
        .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))?;
    if check != "ok" {
        let _ = fs::remove_file(&temp);
        return Err(ContinuityError::Invalid(
            "o banco restaurado falhou na verificação".into(),
        ));
    }
    let violations: i64 = Connection::open(&temp)?.query_row(
        "SELECT COUNT(*) FROM pragma_foreign_key_check",
        [],
        |row| row.get(0),
    )?;
    if violations != 0 {
        let _ = fs::remove_file(&temp);
        return Err(ContinuityError::Invalid(
            "o banco restaurado possui vínculos inválidos".into(),
        ));
    }
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = target.as_os_str().to_os_string();
        sidecar.push(suffix);
        let sidecar = PathBuf::from(sidecar);
        if sidecar.exists() {
            fs::remove_file(sidecar)?;
        }
    }
    replace_file(&temp, target, &target.with_extension("restore.old"))
}

fn install_database_with_rollback(
    app: &AppHandle,
    target: &Path,
    bytes: &[u8],
) -> Result<(), ContinuityError> {
    let candidate = target.with_extension("restore.candidate");
    fs::write(&candidate, bytes)?;
    let check_connection = Connection::open(&candidate)?;
    let check: String = check_connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    let violations: i64 =
        check_connection.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })?;
    let future_version: u32 = check_connection
        .query_row(
            "SELECT COALESCE(MAX(version),0) FROM app_migrations",
            [],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or_default();
    drop(check_connection);
    if check != "ok" || violations != 0 || future_version > database::supported_version() {
        let _ = fs::remove_file(&candidate);
        return Err(ContinuityError::Invalid("o banco restaurado falhou na integridade, nos vínculos ou pertence a uma versão futura".into()));
    }
    for suffix in ["-wal", "-shm"] {
        let mut value = target.as_os_str().to_os_string();
        value.push(suffix);
        let value = PathBuf::from(value);
        if value.exists() {
            fs::remove_file(value)?;
        }
    }
    let old = target.with_extension("restore.old");
    if old.exists() {
        fs::remove_file(&old)?;
    }
    if target.exists() {
        fs::rename(target, &old)?;
    }
    if let Err(error) = fs::rename(&candidate, target) {
        if old.exists() {
            let _ = fs::rename(&old, target);
        }
        return Err(error.into());
    }
    let validation = (|| -> Result<(), ContinuityError> {
        database::initialize(app)?;
        let connection = database::connection(app)?;
        let quick: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
        let keys: i64 =
            connection.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })?;
        if quick != "ok" || keys != 0 {
            return Err(ContinuityError::Invalid(
                "a validação após as migrações falhou".into(),
            ));
        }
        Ok(())
    })();
    if let Err(error) = validation {
        let _ = fs::remove_file(target);
        if old.exists() {
            let _ = fs::rename(&old, target);
        }
        return Err(error);
    }
    if old.exists() {
        fs::remove_file(old)?;
    }
    Ok(())
}
fn safe_path(path: &str, extension: &str) -> Result<PathBuf, ContinuityError> {
    let value = PathBuf::from(path);
    if value.extension().and_then(|v| v.to_str()) != Some(extension) {
        return Err(ContinuityError::Invalid(format!(
            "use um arquivo .{extension}"
        )));
    }
    Ok(value)
}

pub fn status(app: &AppHandle) -> Result<Phase2Status, ContinuityError> {
    entitlements::reconcile(app).map_err(ContinuityError::Invalid)?;
    let c = database::connection(app)?;
    let installation_id = entitlements::installation_id(app).map_err(ContinuityError::Invalid)?;
    let license = c
        .query_row(
            "SELECT activation_status,edition,COALESCE(json_extract(license_metadata,'$.customerName'),json_extract(license_metadata,'$.customer')),json_extract(license_metadata,'$.authorizedMajorVersion'),trial_ends_at,trial_entry_limit,trial_usage_count,CASE WHEN activation_status='TRIAL' AND trial_usage_count>=COALESCE(trial_entry_limit,50) THEN 1 ELSE 0 END,json_extract(license_metadata,'$.licenseId'),json_extract(license_metadata,'$.issuedAt'),json_extract(license_metadata,'$.product'),json_extract(license_metadata,'$.licenseSchemaVersion') FROM app_license LIMIT 1",
            [],
            |row| Ok(LicenseState {
                status: row.get(0)?,
                edition: row.get(1)?,
                customer: row.get(2)?,
                authorized_major_version: row.get(3)?,
                trial_ends_at: row.get(4)?,
                trial_entry_limit: row.get(5)?,
                trial_usage_count: row.get(6)?,
                trial_expired: row.get(7)?,
                license_id: row.get(8)?,
                issued_at: row.get(9)?,
                product: row.get(10)?,
                schema_version: row.get(11)?,
            }),
        )
        .optional()?
        .unwrap_or(LicenseState {
            status: "UNCONFIGURED".into(),
            edition: None,
            customer: None,
            authorized_major_version: None,
            trial_ends_at: None,
            trial_entry_limit: None,
            trial_usage_count: 0,
            trial_expired: false,
            license_id: None,
            issued_at: None,
            product: None,
            schema_version: None,
        });
    let demo_data_loaded=c.query_row("SELECT EXISTS(SELECT 1 FROM contacts WHERE is_demo=1 UNION ALL SELECT 1 FROM catalog_items WHERE is_demo=1 UNION ALL SELECT 1 FROM financial_entries WHERE is_demo=1 UNION ALL SELECT 1 FROM sales WHERE is_demo=1)",[],|r|r.get(0))?;
    let subscription = commercial::status(app).map_err(ContinuityError::Invalid)?;
    Ok(Phase2Status {
        app_version: env!("CARGO_PKG_VERSION").into(),
        license_status: if license.trial_expired {
            "TRIAL_LIMIT_REACHED".into()
        } else {
            license.status
        },
        license_edition: entitlements::get_current_edition(&c)?.or(license.edition),
        license_customer: license.customer,
        authorized_major_version: license.authorized_major_version,
        installation_id,
        license_id: license.license_id,
        license_issued_at: license.issued_at,
        license_product: license.product,
        license_schema_version: license.schema_version,
        enabled_features: entitlements::enabled_features(&c)?,
        can_create_financial_operation: entitlements::can_create_financial_operation(&c)?,
        demo_data_loaded,
        trial_expired: license.trial_expired,
        trial_ends_at: license.trial_ends_at,
        trial_entry_limit: license.trial_entry_limit,
        trial_usage_count: license.trial_usage_count,
        trial_remaining_entries: license
            .trial_entry_limit
            .map(|limit| (limit - license.trial_usage_count).max(0)),
        subscription_state: subscription.state,
        subscription_plan_code: subscription.plan_code,
        subscription_valid_until: subscription.valid_until,
        subscription_requires_online_validation: subscription.requires_online_validation,
    })
}

pub fn activate_license(app: &AppHandle, path: &str) -> Result<Phase2Status, ContinuityError> {
    let document = fs::read_to_string(safe_path(path, "cnclic")?)?;
    let payload = licensing::verify(&document).map_err(ContinuityError::Invalid)?;
    let c = database::connection(app)?;
    entitlements::reconcile(app).map_err(ContinuityError::Invalid)?;
    let _installation_id = entitlements::installation_id(app).map_err(ContinuityError::Invalid)?;
    entitlements::store_activation(app, &document, &payload).map_err(ContinuityError::Invalid)?;
    let user_id: Option<String> = c
        .query_row("SELECT id FROM local_users LIMIT 1", [], |row| row.get(0))
        .optional()?;
    c.execute(
        "INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,'app_license',?3,'ACTIVATE','Licença offline validada e ativada',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![Uuid::new_v4().to_string(), user_id, payload.license_id],
    )?;
    status(app)
}

pub fn load_demo(app: &AppHandle) -> Result<Phase2Status, ContinuityError> {
    let c = database::connection(app)?;
    let exists: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM financial_entries WHERE is_demo=1)",
        [],
        |r| r.get(0),
    )?;
    if exists {
        return status(app);
    }
    let tx = c.unchecked_transaction()?;
    insert_demo_dataset(&tx)?;
    tx.commit()?;
    status(app)
}

fn insert_demo_dataset(connection: &Connection) -> Result<(), ContinuityError> {
    let actor_id: String = connection
        .query_row(
            "SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| {
            ContinuityError::Invalid("conclua o onboarding antes de carregar a demonstração".into())
        })?;
    let account_id: String = connection
        .query_row(
            "SELECT id FROM financial_accounts WHERE is_active=1 AND deleted_at IS NULL ORDER BY is_default DESC,created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| ContinuityError::Invalid("cadastre uma conta financeira antes de carregar a demonstração".into()))?;
    let payment_id: String = connection
        .query_row(
            "SELECT id FROM payment_methods WHERE is_active=1 ORDER BY is_system DESC,created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| ContinuityError::Invalid("cadastre uma forma de pagamento antes de carregar a demonstração".into()))?;
    let now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

    let revenue_category = Uuid::new_v4().to_string();
    let expense_category = Uuid::new_v4().to_string();
    for (id, name, nature, color, order) in [
        (
            &revenue_category,
            "Receitas demonstrativas",
            "REVENUE",
            "#2563EB",
            900,
        ),
        (
            &expense_category,
            "Despesas demonstrativas",
            "EXPENSE",
            "#DC2626",
            901,
        ),
    ] {
        connection.execute(
            &format!("INSERT INTO categories(id,name,nature,color_reference,is_system,is_active,display_order,is_demo,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,0,1,?5,1,?6,?6,{now},{now})"),
            params![id, name, nature, color, order, actor_id],
        )?;
    }

    let customer_id = Uuid::new_v4().to_string();
    let supplier_id = Uuid::new_v4().to_string();
    connection.execute(
        &format!("INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,trade_name,phone,email,city,state,notes,tags,is_active,is_demo,created_by,updated_by,created_at,updated_at) VALUES(?1,'COMPANY',1,0,'Mercado Horizonte Ltda.','Mercado Horizonte','(11) 99999-1001','cliente.demo@exemplo.local','São Paulo','SP','Cliente criado exclusivamente para a demonstração','[\"demonstração\"]',1,1,?2,?2,{now},{now})"),
        params![customer_id, actor_id],
    )?;
    connection.execute(
        &format!("INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,trade_name,phone,email,city,state,notes,tags,is_active,is_demo,created_by,updated_by,created_at,updated_at) VALUES(?1,'COMPANY',0,1,'Papelaria Central Ltda.','Papelaria Central','(11) 99999-2002','fornecedor.demo@exemplo.local','São Paulo','SP','Fornecedor criado exclusivamente para a demonstração','[\"demonstração\"]',1,1,?2,?2,{now},{now})"),
        params![supplier_id, actor_id],
    )?;

    let service_id = Uuid::new_v4().to_string();
    let product_id = Uuid::new_v4().to_string();
    for (id, item_type, code, name, price, cost) in [
        (
            &service_id,
            "SERVICE",
            "DEMO-SERV",
            "Consultoria demonstrativa",
            24_000_i64,
            0_i64,
        ),
        (
            &product_id,
            "PRODUCT",
            "DEMO-PROD",
            "Kit demonstrativo",
            8_900_i64,
            3_500_i64,
        ),
    ] {
        connection.execute(
            &format!("INSERT INTO catalog_items(id,item_type,code,name,description,category,sale_price_cents,cost_price_cents,unit,is_active,is_demo,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,'Item removível do pacote demonstrativo','Demonstração',?5,?6,'UN',1,1,?7,?7,{now},{now})"),
            params![id, item_type, code, name, price, cost, actor_id],
        )?;
    }

    let entries = [
        (
            "REVENUE",
            "IN",
            1_i64,
            &customer_id,
            &revenue_category,
            "Receita recebida — projeto demonstrativo",
            -4_i64,
            32_000_i64,
            "SETTLED",
        ),
        (
            "EXPENSE",
            "OUT",
            -1_i64,
            &supplier_id,
            &expense_category,
            "Despesa paga — materiais demonstrativos",
            -3_i64,
            7_800_i64,
            "SETTLED",
        ),
        (
            "REVENUE",
            "IN",
            1_i64,
            &customer_id,
            &revenue_category,
            "Conta a receber demonstrativa",
            7_i64,
            18_000_i64,
            "PENDING",
        ),
        (
            "EXPENSE",
            "OUT",
            -1_i64,
            &supplier_id,
            &expense_category,
            "Conta a pagar demonstrativa",
            5_i64,
            5_400_i64,
            "PENDING",
        ),
    ];
    for (
        entry_type,
        direction,
        multiplier,
        contact_id,
        category_id,
        description,
        offset,
        amount,
        status,
    ) in entries
    {
        let entry_id = Uuid::new_v4().to_string();
        connection.execute(
            &format!("INSERT INTO financial_entries(id,entry_type,direction,result_multiplier,origin_type,contact_id,category_id,financial_account_id,payment_method_id,description,issue_date,competence_date,due_date,settlement_date,gross_amount_cents,net_amount_cents,status,notes,is_demo,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,'DEMO',?5,?6,?7,?8,?9,date('now','localtime',printf('%+d days',?10)),date('now','localtime',printf('%+d days',?10)),date('now','localtime',printf('%+d days',?10)),CASE WHEN ?12='SETTLED' THEN date('now','localtime',printf('%+d days',?10)) END,?11,?11,?12,'Removível em Configurações > Dados demonstrativos',1,?13,?13,{now},{now})"),
            params![entry_id, entry_type, direction, multiplier, contact_id, category_id, account_id, payment_id, description, offset, amount, status, actor_id],
        )?;
        if status == "SETTLED" {
            connection.execute(
                &format!("INSERT INTO entry_settlements(id,entry_id,financial_account_id,payment_method_id,settlement_date,principal_amount_cents,net_amount_cents,notes,is_demo,created_by,created_at) VALUES(?1,?2,?3,?4,date('now','localtime',printf('%+d days',?5)),?6,?6,'Liquidação demonstrativa',1,?7,{now})"),
                params![Uuid::new_v4().to_string(), entry_id, account_id, payment_id, offset, amount, actor_id],
            )?;
        }
    }

    let sale_id = Uuid::new_v4().to_string();
    let group_id = Uuid::new_v4().to_string();
    let sale_number = format!("DEMO-{}", sale_id[..8].to_uppercase());
    connection.execute(
        &format!("INSERT INTO entry_groups(id,group_type,description,is_demo,created_by,created_at) VALUES(?1,'SALE','Venda parcelada demonstrativa',1,?2,{now})"),
        params![group_id, actor_id],
    )?;
    connection.execute(
        &format!("INSERT INTO sales(id,number,customer_id,category_id,issue_date,description,gross_amount_cents,discount_amount_cents,fee_amount_cents,net_amount_cents,receipt_mode,payment_method_id,financial_account_id,installment_count,first_due_date,received_now_cents,financial_group_id,status,notes,is_demo,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,date('now','localtime'),'Venda parcelada demonstrativa',32_900,0,0,32_900,'INSTALLMENTS',?5,?6,2,date('now','localtime','+15 days'),0,?7,'CONFIRMED','Exemplo removível; não corresponde a uma venda real',1,?8,?8,{now},{now})"),
        params![sale_id, sale_number, customer_id, revenue_category, payment_id, account_id, group_id, actor_id],
    )?;
    connection.execute(
        &format!("INSERT INTO sale_items(id,sale_id,catalog_item_id,description,quantity_millis,unit,unit_price_cents,discount_cents,total_cents,is_demo,created_at,updated_at) VALUES(?1,?2,?3,'Consultoria demonstrativa',1000,'UN',24000,0,24000,1,{now},{now}), (?4,?2,?5,'Kit demonstrativo',1000,'UN',8900,0,8900,1,{now},{now})"),
        params![Uuid::new_v4().to_string(), sale_id, service_id, Uuid::new_v4().to_string(), product_id],
    )?;
    for installment in 1..=2_i64 {
        let amount = 16_450_i64;
        connection.execute(
            &format!("INSERT INTO financial_entries(id,entry_group_id,entry_type,direction,result_multiplier,origin_type,origin_id,contact_id,category_id,financial_account_id,payment_method_id,description,issue_date,competence_date,due_date,gross_amount_cents,net_amount_cents,installment_number,installment_count,status,notes,is_demo,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,'REVENUE','IN',1,'SALE',?3,?4,?5,?6,?7,'Parcela de venda demonstrativa',date('now','localtime'),date('now','localtime'),date('now','localtime',printf('+%d days',?8)),?9,?9,?10,2,'PENDING','Parcela removível da venda demonstrativa',1,?11,?11,{now},{now})"),
            params![Uuid::new_v4().to_string(), group_id, sale_id, customer_id, revenue_category, account_id, payment_id, installment * 15, amount, installment, actor_id],
        )?;
    }

    connection.execute(
        "INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,'demo_dataset',?3,'CREATE','Pacote demonstrativo carregado',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![Uuid::new_v4().to_string(), actor_id, sale_id],
    )?;
    Ok(())
}

pub fn remove_demo(app: &AppHandle) -> Result<Phase2Status, ContinuityError> {
    let c = database::connection(app)?;
    let tx = c.unchecked_transaction()?;
    remove_demo_dataset(&tx)?;
    tx.commit()?;
    status(app)
}

fn remove_demo_dataset(connection: &Connection) -> Result<(), ContinuityError> {
    let actor_id: Option<String> = connection
        .query_row(
            "SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    connection.execute("DELETE FROM entry_settlements WHERE is_demo=1 OR entry_id IN (SELECT id FROM financial_entries WHERE is_demo=1)", [])?;
    connection.execute("DELETE FROM sale_items WHERE is_demo=1 OR sale_id IN (SELECT id FROM sales WHERE is_demo=1)", [])?;
    connection.execute("DELETE FROM sales WHERE is_demo=1", [])?;
    connection.execute("DELETE FROM financial_entries WHERE is_demo=1", [])?;
    connection.execute("DELETE FROM entry_groups WHERE is_demo=1", [])?;
    connection.execute("DELETE FROM contacts WHERE is_demo=1", [])?;
    connection.execute("DELETE FROM catalog_items WHERE is_demo=1", [])?;
    connection.execute("DELETE FROM categories WHERE is_demo=1", [])?;
    connection.execute(
        "INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,'demo_dataset','distribution-demo','DELETE','Pacote demonstrativo removido',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![Uuid::new_v4().to_string(), actor_id],
    )?;
    Ok(())
}

fn record_backup(
    app: &AppHandle,
    backup_type: &str,
    info: Option<&BackupInfo>,
    path: &Path,
    error: Option<&str>,
) -> Result<(), ContinuityError> {
    let connection = database::connection(app)?;
    connection.execute(
        "INSERT INTO backup_history(id,backup_type,path,protected,status,size_bytes,checksum,error_summary,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![Uuid::new_v4().to_string(), backup_type, path.display().to_string(), info.is_some_and(|value| value.protected), if error.is_some() { "FAILED" } else { "SUCCESS" }, info.map(|value| value.size_bytes as i64), info.map(|value| value.checksum.as_str()), error],
    )?;
    if error.is_none() && backup_type != "PREVENTIVE" {
        connection.execute("UPDATE app_preferences SET last_backup_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')", [])?;
    }
    Ok(())
}

fn make_backup(
    app: &AppHandle,
    target: &Path,
    password: Option<&str>,
    backup_type: &str,
) -> Result<BackupInfo, ContinuityError> {
    let c = database::connection(app)?;
    c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    let profile: Option<(String, Option<String>)> = c
        .query_row(
            "SELECT COALESCE(trade_name,legal_name), logo_path FROM business_profile LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    drop(c);
    let business_name = profile.as_ref().map(|value| value.0.clone());
    let logo_path = profile.and_then(|value| value.1).map(PathBuf::from);
    let logo = match logo_path.filter(|path| path.is_file()) {
        Some(path) => Some((
            path.file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| ContinuityError::Invalid("nome do logotipo inválido".into()))?
                .to_owned(),
            fs::read(path)?,
        )),
        None => None,
    };
    let bytes = fs::read(database::database_path(app)?)?;
    let checksum = sha(&bytes);
    let generated = epoch();
    let document = BackupDocument {
        manifest: BackupManifest {
            format_version: 1,
            app_version: env!("CARGO_PKG_VERSION").into(),
            generated_at_epoch: generated,
            business_name: business_name.clone(),
            database_sha256: checksum.clone(),
            logo_sha256: logo.as_ref().map(|(_, bytes)| sha(bytes)),
        },
        database_base64: STANDARD.encode(bytes),
        logo_name: logo.as_ref().map(|(name, _)| name.clone()),
        logo_base64: logo.as_ref().map(|(_, bytes)| STANDARD.encode(bytes)),
    };
    let temp = target.with_extension("cncbak.tmp");
    let protected = password.is_some_and(|value| !value.is_empty());
    fs::write(&temp, encode_backup(&document, password)?)?;
    replace_file(&temp, target, &target.with_extension("cncbak.old"))?;
    let info = BackupInfo {
        path: target.display().to_string(),
        business_name,
        app_version: env!("CARGO_PKG_VERSION").into(),
        generated_at_epoch: generated,
        checksum,
        protected,
        size_bytes: fs::metadata(target)?.len(),
    };
    record_backup(app, backup_type, Some(&info), target, None)?;
    Ok(info)
}
pub fn create_backup(
    app: &AppHandle,
    path: &str,
    password: Option<&str>,
) -> Result<BackupInfo, ContinuityError> {
    let target = safe_path(path, "cncbak")?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    match make_backup(app, &target, password, "MANUAL") {
        Ok(info) => Ok(info),
        Err(error) => {
            let _ = record_backup(app, "MANUAL", None, &target, Some(&error.to_string()));
            Err(error)
        }
    }
}
pub fn inspect_backup(path: &str, password: Option<&str>) -> Result<BackupInfo, ContinuityError> {
    let target = safe_path(path, "cncbak")?;
    let (document, protected) = read_backup(&target, password)?;
    let _bytes = decode_database(&document)?;
    Ok(BackupInfo {
        path: target.display().to_string(),
        business_name: document.manifest.business_name,
        app_version: document.manifest.app_version,
        generated_at_epoch: document.manifest.generated_at_epoch,
        checksum: document.manifest.database_sha256,
        protected,
        size_bytes: fs::metadata(target)?.len(),
    })
}
pub fn restore_backup(
    app: &AppHandle,
    path: &str,
    password: Option<&str>,
) -> Result<BackupInfo, ContinuityError> {
    let info = inspect_backup(path, password)?;
    let (document, _) = read_backup(Path::new(path), password)?;
    let bytes = decode_database(&document)?;
    let logo = decode_logo(&document)?;
    let data_dir = app.path().app_data_dir()?;
    let preventive = data_dir
        .join("backups")
        .join(format!("preventivo-{}.cncbak", epoch()));
    fs::create_dir_all(preventive.parent().unwrap_or(&data_dir))?;
    make_backup(app, &preventive, None, "PREVENTIVE")?;
    let db = database::database_path(app)?;
    install_database_with_rollback(app, &db, &bytes)?;
    entitlements::reconcile(app).map_err(ContinuityError::Invalid)?;
    let connection = database::connection(app)?;
    if let (Some(logo_bytes), Some(logo_name)) = (logo, document.logo_name) {
        let safe_name = Path::new(&logo_name)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| ContinuityError::Invalid("nome do logotipo inválido".into()))?;
        let logo_dir = data_dir.join("assets").join("logo");
        fs::create_dir_all(&logo_dir)?;
        let logo_path = logo_dir.join(safe_name);
        fs::write(&logo_path, logo_bytes)?;
        connection.execute(
            "UPDATE business_profile SET logo_path=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            [logo_path.display().to_string()],
        )?;
    }
    let user_id: Option<String> = connection
        .query_row("SELECT id FROM local_users LIMIT 1", [], |row| row.get(0))
        .optional()?;
    connection.execute(
        "INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,'database','main','RESTORE',?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![
            Uuid::new_v4().to_string(),
            user_id,
            format!("Backup restaurado de {}", info.path)
        ],
    )?;
    Ok(info)
}

fn backup_settings(connection: &Connection) -> Result<BackupSettings, ContinuityError> {
    connection.query_row(
        "SELECT backup_directory,backup_reminder_enabled,backup_reminder_frequency,backup_retention_count,last_backup_at,
         CASE WHEN backup_reminder_enabled=0 OR backup_directory IS NULL THEN 0 WHEN last_backup_at IS NULL THEN 1
         WHEN backup_reminder_frequency='DAILY' THEN datetime(last_backup_at,'+1 day')<=datetime('now')
         WHEN backup_reminder_frequency='WEEKLY' THEN datetime(last_backup_at,'+7 days')<=datetime('now')
         WHEN backup_reminder_frequency='MONTHLY' THEN datetime(last_backup_at,'+1 month')<=datetime('now') ELSE 0 END
         FROM app_preferences LIMIT 1",
        [],
        |row| Ok(BackupSettings { directory: row.get(0)?, enabled: row.get(1)?, frequency: row.get(2)?, retention_count: row.get(3)?, last_backup_at: row.get(4)?, due: row.get(5)? }),
    ).map_err(Into::into)
}

pub fn save_backup_settings(
    app: &AppHandle,
    input: BackupSettingsInput,
) -> Result<BackupSettings, ContinuityError> {
    if !["DAILY", "WEEKLY", "MONTHLY", "DISABLED"].contains(&input.frequency.as_str())
        || !(1..=120).contains(&input.retention_count)
    {
        return Err(ContinuityError::Invalid(
            "configuração de backup inválida".into(),
        ));
    }
    let directory = input.directory.filter(|value| !value.trim().is_empty());
    if input.enabled {
        let path = directory.as_ref().ok_or_else(|| {
            ContinuityError::Invalid("escolha a pasta dos backups automáticos".into())
        })?;
        let path = Path::new(path);
        fs::create_dir_all(path)?;
        if !path.is_dir() {
            return Err(ContinuityError::Invalid(
                "a pasta de backup é inválida".into(),
            ));
        }
    }
    let connection = database::connection(app)?;
    connection.execute("UPDATE app_preferences SET backup_directory=?1,backup_reminder_enabled=?2,backup_reminder_frequency=?3,backup_retention_count=?4,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')", params![directory, input.enabled && input.frequency != "DISABLED", input.frequency, input.retention_count])?;
    backup_settings(&connection)
}

fn cleanup_automatic_backups(
    connection: &Connection,
    directory: &Path,
    retention: i64,
) -> Result<(), ContinuityError> {
    let mut statement = connection.prepare("SELECT id,path FROM backup_history WHERE backup_type='AUTOMATIC' AND status='SUCCESS' ORDER BY created_at DESC LIMIT -1 OFFSET ?1")?;
    let expired = statement
        .query_map([retention], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let canonical_directory = directory.canonicalize()?;
    for (id, path) in expired {
        let path = PathBuf::from(path);
        if path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                value.starts_with("CaixaSimplesBratec_Automatico_")
                    || value.starts_with("CaixaNoControle_Automatico_")
            })
            && path
                .parent()
                .and_then(|value| value.canonicalize().ok())
                .as_ref()
                == Some(&canonical_directory)
        {
            if path.is_file() {
                fs::remove_file(&path)?;
            }
            connection.execute("DELETE FROM backup_history WHERE id=?1", [id])?;
        }
    }
    Ok(())
}

pub fn run_automatic_backup(app: &AppHandle) -> Result<Option<BackupInfo>, ContinuityError> {
    let connection = database::connection(app)?;
    let settings = backup_settings(&connection)?;
    if !settings.due {
        return Ok(None);
    }
    let directory = PathBuf::from(
        settings
            .directory
            .ok_or_else(|| ContinuityError::Invalid("pasta automática não configurada".into()))?,
    );
    fs::create_dir_all(&directory)?;
    let target = directory.join(format!("CaixaSimplesBratec_Automatico_{}.cncbak", epoch()));
    drop(connection);
    let info = match make_backup(app, &target, None, "AUTOMATIC") {
        Ok(info) => info,
        Err(error) => {
            let _ = record_backup(app, "AUTOMATIC", None, &target, Some(&error.to_string()));
            return Err(error);
        }
    };
    let connection = database::connection(app)?;
    cleanup_automatic_backups(&connection, &directory, settings.retention_count)?;
    Ok(Some(info))
}

pub fn finalize_startup(app: &AppHandle) -> Result<(), ContinuityError> {
    let connection = database::connection(app)?;
    let integrity: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    let keys: i64 =
        connection.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })?;
    if integrity != "ok" || keys != 0 {
        return Err(ContinuityError::Invalid(
            "o banco não passou pela validação de inicialização".into(),
        ));
    }
    connection.execute(
        "UPDATE app_updates SET status='VALIDATED' WHERE status='PREPARED' AND to_version=?1",
        [env!("CARGO_PKG_VERSION")],
    )?;
    drop(connection);
    entitlements::reconcile(app).map_err(ContinuityError::Invalid)?;
    Ok(())
}

pub fn overview(app: &AppHandle) -> Result<ContinuityOverview, ContinuityError> {
    let connection = database::connection(app)?;
    let settings = backup_settings(&connection)?;
    let history = connection.prepare("SELECT id,backup_type,path,protected,status,size_bytes,error_summary,created_at FROM backup_history ORDER BY created_at DESC LIMIT 30")?
        .query_map([], |row| Ok(BackupHistoryItem { id: row.get(0)?, backup_type: row.get(1)?, path: row.get(2)?, protected: row.get(3)?, status: row.get(4)?, size_bytes: row.get(5)?, error_summary: row.get(6)?, created_at: row.get(7)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    let integrity: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    let foreign_key_violations: i64 =
        connection.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })?;
    let log_dir = app.path().app_log_dir()?;
    let logs = fs::read_dir(&log_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|item| item.metadata().ok())
        .collect::<Vec<_>>();
    Ok(ContinuityOverview {
        settings,
        history,
        database_version: database::current_version(app)?,
        database_size_bytes: fs::metadata(database::database_path(app)?)?.len(),
        database_integrity: integrity,
        foreign_key_violations,
        log_file_count: logs.len(),
        log_size_bytes: logs.iter().map(fs::Metadata::len).sum(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        operating_system: std::env::consts::OS.into(),
        architecture: std::env::consts::ARCH.into(),
    })
}

fn write_diagnostic_archive(
    target: &Path,
    diagnostic: &[u8],
    logs: Vec<(String, Vec<u8>)>,
) -> Result<(), ContinuityError> {
    let file = File::create(target)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("diagnostico.json", options)
        .map_err(|error| ContinuityError::Invalid(error.to_string()))?;
    zip.write_all(diagnostic)?;
    for (name, bytes) in logs {
        zip.start_file(format!("logs/{}", name.replace(['/', '\\'], "_")), options)
            .map_err(|error| ContinuityError::Invalid(error.to_string()))?;
        zip.write_all(&bytes)?;
    }
    zip.finish()
        .map_err(|error| ContinuityError::Invalid(error.to_string()))?;
    Ok(())
}

pub fn create_diagnostic_package(app: &AppHandle, path: &str) -> Result<(), ContinuityError> {
    let target = safe_path(path, "cncdiag")?;
    let overview = overview(app)?;
    let log_dir = app.path().app_log_dir()?;
    let mut logs = fs::read_dir(log_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|item| item.path().is_file())
        .collect::<Vec<_>>();
    logs.sort_by_key(|item| item.metadata().and_then(|value| value.modified()).ok());
    logs.reverse();
    let mut selected_logs = Vec::new();
    for item in logs.into_iter().take(3) {
        let mut bytes = fs::read(item.path())?;
        if bytes.len() > 200_000 {
            bytes = bytes.split_off(bytes.len() - 200_000);
        }
        selected_logs.push((item.file_name().to_string_lossy().into_owned(), bytes));
    }
    write_diagnostic_archive(
        &target,
        &serde_json::to_vec_pretty(&overview)
            .map_err(|error| ContinuityError::Invalid(error.to_string()))?,
        selected_logs,
    )?;
    let connection = database::connection(app)?;
    connection.execute("INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,(SELECT id FROM local_users WHERE is_active=1 LIMIT 1),'diagnostic','support','EXPORT','Pacote técnico gerado sem o banco financeiro',strftime('%Y-%m-%dT%H:%M:%fZ','now'))", [Uuid::new_v4().to_string()])?;
    Ok(())
}

fn version_parts(value: &str) -> Result<[u32; 3], ContinuityError> {
    let values = value
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| ContinuityError::Invalid("versão semântica inválida".into()))?;
    if values.len() != 3 {
        return Err(ContinuityError::Invalid("versão semântica inválida".into()));
    }
    Ok([values[0], values[1], values[2]])
}

fn read_update(path: &str) -> Result<UpdatePackage, ContinuityError> {
    read_update_with_public_key(path, licensing::DEVELOPMENT_PUBLIC_KEY_BASE64)
}

fn read_update_with_public_key(
    path: &str,
    public_key: &str,
) -> Result<UpdatePackage, ContinuityError> {
    let path = safe_path(path, "cncupd")?;
    if fs::metadata(&path)?.len() > 1_500_000_000 {
        return Err(ContinuityError::Invalid(
            "o pacote de atualização excede o limite de 1,5 GB".into(),
        ));
    }
    let package: UpdatePackage = serde_json::from_slice(&fs::read(path)?)
        .map_err(|_| ContinuityError::Invalid("pacote de atualização inválido".into()))?;
    if package.manifest.summary.trim().is_empty()
        || package.manifest.summary.chars().count() > 10_000
        || package.manifest.published_at.trim().is_empty()
    {
        return Err(ContinuityError::Invalid(
            "manifesto de atualização incompleto".into(),
        ));
    }
    let key = STANDARD
        .decode(public_key)
        .map_err(|_| ContinuityError::Invalid("chave pública inválida".into()))?;
    let key = VerifyingKey::from_bytes(
        key.as_slice()
            .try_into()
            .map_err(|_| ContinuityError::Invalid("chave pública inválida".into()))?,
    )
    .map_err(|_| ContinuityError::Invalid("chave pública inválida".into()))?;
    let signature = Signature::from_slice(
        &STANDARD
            .decode(&package.signature)
            .map_err(|_| ContinuityError::Invalid("assinatura de atualização inválida".into()))?,
    )
    .map_err(|_| ContinuityError::Invalid("assinatura de atualização inválida".into()))?;
    key.verify(
        serde_json::to_string(&package.manifest)
            .map_err(|error| ContinuityError::Invalid(error.to_string()))?
            .as_bytes(),
        &signature,
    )
    .map_err(|_| ContinuityError::Invalid("a assinatura da atualização não confere".into()))?;
    let installer = STANDARD
        .decode(&package.installer_base64)
        .map_err(|_| ContinuityError::Invalid("instalador inválido".into()))?;
    if installer.is_empty() || installer.len() > 1_073_741_824 {
        return Err(ContinuityError::Invalid(
            "tamanho do instalador inválido".into(),
        ));
    }
    if sha(&installer) != package.manifest.installer_sha256 {
        return Err(ContinuityError::Invalid(
            "checksum do instalador não confere".into(),
        ));
    }
    Ok(package)
}

pub fn inspect_update(app: &AppHandle, path: &str) -> Result<UpdateInfo, ContinuityError> {
    let package = read_update(path)?;
    let current = version_parts(env!("CARGO_PKG_VERSION"))?;
    let next = version_parts(&package.manifest.version)?;
    if next <= current {
        return Err(ContinuityError::Invalid(
            "a atualização deve ser mais nova que a versão instalada".into(),
        ));
    }
    if package.manifest.minimum_database_version > database::current_version(app)? {
        return Err(ContinuityError::Invalid(
            "esta atualização exige uma estrutura de dados ainda não disponível".into(),
        ));
    }
    let authorized: Option<u32> = database::connection(app)?.query_row("SELECT json_extract(license_metadata,'$.authorizedMajorVersion') FROM app_license WHERE activation_status='ACTIVE' LIMIT 1", [], |row| row.get(0)).optional()?.flatten();
    let license_compatible =
        next[0] == current[0] || authorized.is_some_and(|value| value >= next[0]);
    Ok(UpdateInfo {
        current_version: env!("CARGO_PKG_VERSION").into(),
        version: package.manifest.version,
        published_at: package.manifest.published_at,
        summary: package.manifest.summary,
        major_upgrade: next[0] > current[0],
        license_compatible,
        installer_file_name: package.manifest.installer_file_name,
    })
}

pub fn prepare_update(app: &AppHandle, path: &str) -> Result<String, ContinuityError> {
    let info = inspect_update(app, path)?;
    if !info.license_compatible {
        return Err(ContinuityError::Invalid(
            "a licença atual não autoriza esta versão principal".into(),
        ));
    }
    let package = read_update(path)?;
    let name = Path::new(&package.manifest.installer_file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| value.ends_with(".exe") || value.ends_with(".msi"))
        .ok_or_else(|| ContinuityError::Invalid("nome do instalador inválido".into()))?;
    let data_dir = app.path().app_data_dir()?;
    let backup = data_dir
        .join("backups")
        .join(format!("pre-atualizacao-{}.cncbak", epoch()));
    fs::create_dir_all(backup.parent().unwrap())?;
    make_backup(app, &backup, None, "PREVENTIVE")?;
    let update_dir = data_dir.join("updates");
    fs::create_dir_all(&update_dir)?;
    let installer_path = update_dir.join(name);
    fs::write(
        &installer_path,
        STANDARD
            .decode(package.installer_base64)
            .map_err(|_| ContinuityError::Invalid("instalador inválido".into()))?,
    )?;
    let connection = database::connection(app)?;
    connection.execute("INSERT INTO app_updates(id,from_version,to_version,status,summary,backup_path,created_at) VALUES(?1,?2,?3,'PREPARED',?4,?5,strftime('%Y-%m-%dT%H:%M:%fZ','now'))", params![Uuid::new_v4().to_string(), env!("CARGO_PKG_VERSION"), info.version, info.summary, backup.display().to_string()])?;
    Ok(installer_path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        decode_database, encode_backup, insert_demo_dataset, read_backup,
        read_update_with_public_key, remove_demo_dataset, replace_database, sha, version_parts,
        write_diagnostic_archive, BackupDocument, BackupManifest, UpdateManifest,
    };
    use crate::database;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use ed25519_dalek::{Signer, SigningKey};
    use rusqlite::Connection;
    use serde_json::json;
    use std::io::Read;
    fn document(bytes: &[u8]) -> BackupDocument {
        BackupDocument {
            manifest: BackupManifest {
                format_version: 1,
                app_version: "1.0.0".into(),
                generated_at_epoch: 1,
                business_name: Some("Teste".into()),
                database_sha256: sha(bytes),
                logo_sha256: None,
            },
            database_base64: STANDARD.encode(bytes),
            logo_name: None,
            logo_base64: None,
        }
    }
    #[test]
    fn validates_checksum() {
        assert_eq!(decode_database(&document(b"sqlite")).unwrap(), b"sqlite");
    }
    #[test]
    fn rejects_corruption() {
        let mut value = document(b"sqlite");
        value.database_base64 = STANDARD.encode(b"alterado");
        assert!(decode_database(&value).is_err());
    }

    #[test]
    fn rejects_unknown_format_version() {
        let mut value = document(b"sqlite");
        value.manifest.format_version = 2;
        assert!(decode_database(&value).is_err());
    }

    #[test]
    fn demo_dataset_covers_business_flows_and_is_fully_removable() {
        let connection = Connection::open_in_memory().unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute_batch(
            "INSERT INTO local_users(id,name,username,password_hash,role,is_active,created_at,updated_at)
             VALUES('user','Administrador','admin','argon2id','ADMIN',1,'2026-08-06T00:00:00Z','2026-08-06T00:00:00Z');
             INSERT INTO financial_accounts(id,name,account_type,opening_balance_date,is_default,is_active,created_at,updated_at)
             VALUES('account','Conta principal','CASH','2026-08-01',1,1,'2026-08-06T00:00:00Z','2026-08-06T00:00:00Z');
             INSERT INTO payment_methods(id,name,payment_type,is_system,is_active,created_at,updated_at)
             VALUES('payment','Pix','PIX',1,1,'2026-08-06T00:00:00Z','2026-08-06T00:00:00Z');",
        ).unwrap();

        insert_demo_dataset(&connection).unwrap();
        let counts: (i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM contacts WHERE is_demo=1),
                        (SELECT COUNT(*) FROM catalog_items WHERE is_demo=1),
                        (SELECT COUNT(*) FROM financial_entries WHERE is_demo=1),
                        (SELECT COUNT(*) FROM entry_settlements WHERE is_demo=1),
                        (SELECT COUNT(*) FROM sales WHERE is_demo=1)",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(counts, (2, 2, 6, 2, 1));

        remove_demo_dataset(&connection).unwrap();
        let remaining: i64 = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM contacts WHERE is_demo=1) +
                        (SELECT COUNT(*) FROM catalog_items WHERE is_demo=1) +
                        (SELECT COUNT(*) FROM financial_entries WHERE is_demo=1) +
                        (SELECT COUNT(*) FROM entry_settlements WHERE is_demo=1) +
                        (SELECT COUNT(*) FROM sales WHERE is_demo=1)",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn replaces_database_only_after_integrity_check() {
        let directory = tempfile::tempdir().unwrap();
        let current = directory.path().join("main.sqlite3");
        let restored = directory.path().join("restored.sqlite3");
        Connection::open(&current)
            .unwrap()
            .execute("CREATE TABLE original(value TEXT)", [])
            .unwrap();
        Connection::open(&restored)
            .unwrap()
            .execute("CREATE TABLE restored(value TEXT)", [])
            .unwrap();

        replace_database(&current, &std::fs::read(restored).unwrap()).unwrap();

        let connection = Connection::open(current).unwrap();
        let restored_exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='restored')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(restored_exists);
    }

    #[test]
    fn refuses_database_with_broken_foreign_keys_without_replacing_current() {
        let directory = tempfile::tempdir().unwrap();
        let current = directory.path().join("main.sqlite3");
        let invalid = directory.path().join("invalid.sqlite3");
        Connection::open(&current)
            .unwrap()
            .execute("CREATE TABLE preserved(value TEXT)", [])
            .unwrap();
        Connection::open(&invalid).unwrap().execute_batch("PRAGMA foreign_keys=OFF; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(99);").unwrap();
        assert!(replace_database(&current, &std::fs::read(invalid).unwrap()).is_err());
        let exists: bool = Connection::open(current)
            .unwrap()
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='preserved')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(exists);
    }

    #[test]
    fn protects_backup_without_storing_password_and_authenticates_content() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("protected.cncbak");
        let encoded = encode_backup(&document(b"sqlite"), Some("senha-segura-123")).unwrap();
        std::fs::write(&path, &encoded).unwrap();
        let text = String::from_utf8(encoded).unwrap();
        assert!(!text.contains("senha-segura-123"));
        assert!(!text.contains("sqlite"));
        assert!(read_backup(&path, Some("senha-errada")).is_err());
        let (decoded, protected) = read_backup(&path, Some("senha-segura-123")).unwrap();
        assert!(protected);
        assert_eq!(decode_database(&decoded).unwrap(), b"sqlite");
    }

    #[test]
    fn keeps_legacy_unprotected_backup_compatible() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("legacy.cncbak");
        std::fs::write(&path, serde_json::to_vec(&document(b"legacy")).unwrap()).unwrap();
        let (decoded, protected) = read_backup(&path, None).unwrap();
        assert!(!protected);
        assert_eq!(decode_database(&decoded).unwrap(), b"legacy");
    }

    #[test]
    fn validates_semantic_versions_and_signed_update_package() {
        assert!(version_parts("1.2.3").unwrap() < version_parts("1.3.0").unwrap());
        assert!(version_parts("1.2").is_err());
        let installer = b"signed installer";
        let manifest = UpdateManifest {
            version: "1.1.0".into(),
            published_at: "2026-08-05".into(),
            summary: "Correções".into(),
            installer_file_name: "setup.exe".into(),
            installer_sha256: sha(installer),
            minimum_database_version: 10,
        };
        let signing = SigningKey::from_bytes(&[9_u8; 32]);
        let signature = STANDARD.encode(
            signing
                .sign(serde_json::to_string(&manifest).unwrap().as_bytes())
                .to_bytes(),
        );
        let package = json!({"manifest":manifest,"installerBase64":STANDARD.encode(installer),"signature":signature});
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("update.cncupd");
        std::fs::write(&path, package.to_string()).unwrap();
        assert!(read_update_with_public_key(
            path.to_str().unwrap(),
            &STANDARD.encode(signing.verifying_key().to_bytes())
        )
        .is_ok());
        let tampered = package
            .to_string()
            .replace("Correções", "Conteúdo adulterado");
        std::fs::write(&path, tampered).unwrap();
        assert!(read_update_with_public_key(
            path.to_str().unwrap(),
            &STANDARD.encode(signing.verifying_key().to_bytes())
        )
        .is_err());
    }

    #[test]
    fn retention_removes_only_expired_automatic_backups_in_configured_directory() {
        let connection = Connection::open_in_memory().unwrap();
        database::apply_migrations(&connection).unwrap();
        let directory = tempfile::tempdir().unwrap();
        for index in 1..=3 {
            let path = directory
                .path()
                .join(format!("CaixaNoControle_Automatico_{index}.cncbak"));
            std::fs::write(&path, b"backup").unwrap();
            connection.execute("INSERT INTO backup_history(id,backup_type,path,protected,status,created_at) VALUES(?1,'AUTOMATIC',?2,0,'SUCCESS',?3)", rusqlite::params![format!("backup-{index}"), path.display().to_string(), format!("2026-08-0{index}")]).unwrap();
        }
        super::cleanup_automatic_backups(&connection, directory.path(), 1).unwrap();
        assert!(directory
            .path()
            .join("CaixaNoControle_Automatico_3.cncbak")
            .exists());
        assert!(!directory
            .path()
            .join("CaixaNoControle_Automatico_1.cncbak")
            .exists());
        let remaining: i64 = connection
            .query_row("SELECT COUNT(*) FROM backup_history", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 1);
    }

    #[test]
    fn writes_restorable_protected_acceptance_sample_when_requested() {
        let Ok(output) = std::env::var("CNC_PHASE8_SAMPLE_PATH") else {
            return;
        };
        let directory = tempfile::tempdir().unwrap();
        let database_path = directory.path().join("sample.sqlite");
        let connection = Connection::open(&database_path).unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute("INSERT INTO business_profile(id,legal_name,trade_name,business_type,created_at,updated_at) VALUES('sample','Empresa de Aceite','Continuidade Teste','GENERAL','2026-08-05','2026-08-05')", []).unwrap();
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .unwrap();
        drop(connection);
        let bytes = std::fs::read(database_path).unwrap();
        let sample = BackupDocument {
            manifest: BackupManifest {
                format_version: 1,
                app_version: env!("CARGO_PKG_VERSION").into(),
                generated_at_epoch: 1_786_000_000,
                business_name: Some("Continuidade Teste".into()),
                database_sha256: sha(&bytes),
                logo_sha256: None,
            },
            database_base64: STANDARD.encode(bytes),
            logo_name: None,
            logo_base64: None,
        };
        let output = std::path::PathBuf::from(output);
        std::fs::create_dir_all(output.parent().unwrap()).unwrap();
        std::fs::write(
            &output,
            encode_backup(&sample, Some("Aceite-Fase8-2026")).unwrap(),
        )
        .unwrap();
        let (decoded, protected) = read_backup(&output, Some("Aceite-Fase8-2026")).unwrap();
        assert!(protected);
        let restored = directory.path().join("restored.sqlite");
        std::fs::write(&restored, decode_database(&decoded).unwrap()).unwrap();
        assert_eq!(
            Connection::open(restored)
                .unwrap()
                .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
    }

    #[test]
    fn diagnostic_archive_excludes_financial_database() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("diagnostic.cncdiag");
        write_diagnostic_archive(
            &path,
            br#"{"version":"1.0.0"}"#,
            vec![("app.log".into(), b"startup ok".to_vec())],
        )
        .unwrap();
        let mut archive = zip::ZipArchive::new(std::fs::File::open(path).unwrap()).unwrap();
        assert_eq!(archive.len(), 2);
        assert!(archive.by_name("database.sqlite").is_err());
        let mut manifest = String::new();
        archive
            .by_name("diagnostico.json")
            .unwrap()
            .read_to_string(&mut manifest)
            .unwrap();
        assert!(manifest.contains("version"));
    }
}
