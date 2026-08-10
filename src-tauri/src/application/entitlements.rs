use std::{fs, path::PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{commercial, database, licensing};

pub const TRIAL_OPERATION_LIMIT: i64 = 50;
pub const TRIAL_LIMIT_MESSAGE: &str =
    "Você já utilizou as 50 movimentações gratuitas. Ative sua licença para continuar registrando novas movimentações.";

pub const FEATURE_FINANCIAL_CORE: &str = "financial_core";
pub const FEATURE_CONTACTS: &str = "contacts";
pub const FEATURE_CATALOG: &str = "catalog";
pub const FEATURE_SALES: &str = "sales";
pub const FEATURE_REPORTS: &str = "reports";
pub const FEATURE_BACKUP: &str = "backup";
pub const FEATURE_GOALS: &str = "goals";
pub const FEATURE_PROFESSIONAL: &str = "professional_features";
pub const FEATURE_INVENTORY: &str = "inventory";
pub const FEATURE_MULTI_USER: &str = "multi_user";
pub const ESSENTIAL_FEATURES: &[&str] = &[
    FEATURE_FINANCIAL_CORE,
    FEATURE_CONTACTS,
    FEATURE_CATALOG,
    FEATURE_SALES,
    FEATURE_REPORTS,
    FEATURE_BACKUP,
    FEATURE_GOALS,
];
pub const ALL_FEATURES: &[&str] = &[
    FEATURE_FINANCIAL_CORE,
    FEATURE_CONTACTS,
    FEATURE_CATALOG,
    FEATURE_SALES,
    FEATURE_REPORTS,
    FEATURE_BACKUP,
    FEATURE_GOALS,
    FEATURE_PROFESSIONAL,
    FEATURE_INVENTORY,
    FEATURE_MULTI_USER,
];

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalEntitlementState {
    schema_version: u32,
    internal_installation_id: String,
    display_installation_id: String,
    trial_usage_high_water: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    signed_license_document: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    legacy_license_metadata: Option<String>,
    updated_at: String,
    checksum: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StateIntegrity<'a> {
    schema_version: u32,
    internal_installation_id: &'a str,
    display_installation_id: &'a str,
    trial_usage_high_water: i64,
    signed_license_document: &'a Option<String>,
    legacy_license_metadata: &'a Option<String>,
    updated_at: &'a str,
    product_marker: &'static str,
}

fn state_checksum(state: &LocalEntitlementState) -> Result<String, String> {
    let canonical = serde_json::to_vec(&StateIntegrity {
        schema_version: state.schema_version,
        internal_installation_id: &state.internal_installation_id,
        display_installation_id: &state.display_installation_id,
        trial_usage_high_water: state.trial_usage_high_water,
        signed_license_document: &state.signed_license_document,
        legacy_license_metadata: &state.legacy_license_metadata,
        updated_at: &state.updated_at,
        product_marker: "BRATECINFO-CNC-ENTITLEMENT-V1",
    })
    .map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(canonical)))
}

fn now(connection: &Connection) -> Result<String, String> {
    connection
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())
}

fn entitlement_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .local_data_dir()
        .map_err(|error| error.to_string())?
        .join("BratecInfo")
        .join("CaixaNoControle")
        .join("entitlement-state.json"))
}

fn display_installation_id(internal_id: &str) -> String {
    let digest = format!("{:X}", Sha256::digest(internal_id.as_bytes()));
    format!("CNC-{}-{}-{}", &digest[0..4], &digest[4..8], &digest[8..12])
}

fn read_state(app: &AppHandle) -> Result<Option<LocalEntitlementState>, String> {
    let path = entitlement_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let state: LocalEntitlementState = serde_json::from_slice(
        &fs::read(path).map_err(|error| error.to_string())?,
    )
    .map_err(|_| {
        "O estado local da licença está corrompido. Contate o suporte BratecInfo.".to_owned()
    })?;
    if state.schema_version != 1 || state.checksum != state_checksum(&state)? {
        return Err(
            "O estado local da licença está corrompido. Contate o suporte BratecInfo.".into(),
        );
    }
    Ok(Some(state))
}

fn write_state(app: &AppHandle, state: &mut LocalEntitlementState) -> Result<(), String> {
    state.checksum = state_checksum(state)?;
    let path = entitlement_path(app)?;
    fs::create_dir_all(path.parent().ok_or("diretório de licença inválido")?)
        .map_err(|error| error.to_string())?;
    fs::write(
        path,
        serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn db_installation_id(connection: &Connection) -> Result<String, String> {
    if let Some(id) = connection
        .query_row("SELECT id FROM app_installation LIMIT 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())?
    {
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO app_installation(id,created_at) VALUES(?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            [&id],
        )
        .map_err(|error| error.to_string())?;
    Ok(id)
}

fn initial_state(connection: &Connection) -> Result<LocalEntitlementState, String> {
    let internal_id = db_installation_id(connection)?;
    let usage: i64 = connection
        .query_row(
            "SELECT trial_usage_count FROM app_license LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(0);
    Ok(LocalEntitlementState {
        schema_version: 1,
        display_installation_id: display_installation_id(&internal_id),
        internal_installation_id: internal_id,
        trial_usage_high_water: usage.clamp(0, TRIAL_OPERATION_LIMIT),
        signed_license_document: None,
        legacy_license_metadata: None,
        updated_at: now(connection)?,
        checksum: String::new(),
    })
}

fn license_for_state(state: &LocalEntitlementState) -> Option<licensing::LicensePayload> {
    state
        .signed_license_document
        .as_deref()
        .and_then(|document| licensing::verify(document).ok())
        .filter(|payload| {
            payload.installation_id == state.display_installation_id
                || payload.installation_id == state.internal_installation_id
        })
}

fn apply_state(connection: &Connection, state: &LocalEntitlementState) -> Result<(), String> {
    connection
        .execute("DELETE FROM app_installation", [])
        .map_err(|error| error.to_string())?;
    connection.execute(
        "INSERT INTO app_installation(id,created_at) VALUES(?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        [&state.internal_installation_id],
    ).map_err(|error| error.to_string())?;
    if let Some(payload) = license_for_state(state) {
        let metadata = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
        connection.execute("UPDATE app_license SET edition=?1,activation_status='ACTIVE',license_metadata=?2,trial_ends_at=NULL,trial_entry_limit=?3,trial_usage_count=?4,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')", params![payload.edition,metadata,TRIAL_OPERATION_LIMIT,state.trial_usage_high_water]).map_err(|error| error.to_string())?;
    } else {
        connection.execute("UPDATE app_license SET edition='ESSENTIAL',activation_status='TRIAL',license_metadata=NULL,trial_ends_at=NULL,trial_entry_limit=?1,trial_usage_count=?2,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')", params![TRIAL_OPERATION_LIMIT,state.trial_usage_high_water]).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Reconcilia banco restaurável com o registro comercial externo ao backup.
/// O maior consumo já observado sempre prevalece; uma restauração nunca reduz o teste.
pub fn reconcile(app: &AppHandle) -> Result<(), String> {
    let connection = database::connection(app).map_err(|error| error.to_string())?;
    let existing = read_state(app)?;
    let mut state = match existing {
        Some(state) => state,
        None => initial_state(&connection)?,
    };
    connection.execute(
        "INSERT INTO app_license(id,edition,activation_status,trial_started_at,trial_ends_at,trial_entry_limit,trial_usage_count,created_at,updated_at) VALUES(?1,'ESSENTIAL','TRIAL',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,?2,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT DO NOTHING",
        params![Uuid::new_v4().to_string(), TRIAL_OPERATION_LIMIT],
    ).map_err(|error| error.to_string())?;
    let db_usage: i64 = connection
        .query_row(
            "SELECT COALESCE(trial_usage_count,0) FROM app_license LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(0);
    state.trial_usage_high_water = state
        .trial_usage_high_water
        .max(db_usage)
        .max(commercial::protected_trial_high_water(app))
        .clamp(0, TRIAL_OPERATION_LIMIT);
    state.updated_at = now(&connection)?;

    apply_state(&connection, &state)?;
    if let Some(payload) = commercial::active_payload(app) {
        let metadata = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
        connection.execute("UPDATE app_license SET edition='ESSENTIAL',activation_status='ACTIVE',license_metadata=?1,trial_ends_at=NULL,trial_entry_limit=?2,trial_usage_count=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')", params![metadata,TRIAL_OPERATION_LIMIT,state.trial_usage_high_water]).map_err(|error| error.to_string())?;
    }
    write_state(app, &mut state)?;
    commercial::record_trial_high_water_if_initialized(app, state.trial_usage_high_water)
}

pub fn installation_id(app: &AppHandle) -> Result<String, String> {
    reconcile(app)?;
    read_state(app)?
        .map(|state| state.display_installation_id)
        .ok_or_else(|| "Não foi possível identificar esta instalação.".into())
}

pub fn store_activation(
    app: &AppHandle,
    document: &str,
    payload: &licensing::LicensePayload,
) -> Result<(), String> {
    let mut state = read_state(app)?.ok_or("estado comercial não inicializado")?;
    if payload.installation_id != state.display_installation_id
        && payload.installation_id != state.internal_installation_id
    {
        return Err(licensing::INVALID_LICENSE_MESSAGE.into());
    }
    state.signed_license_document = Some(document.to_owned());
    state.legacy_license_metadata = None;
    let connection = database::connection(app).map_err(|error| error.to_string())?;
    state.updated_at = now(&connection)?;
    write_state(app, &mut state)?;
    reconcile(app)
}

pub fn sync_trial_high_water(app: &AppHandle) -> Result<(), String> {
    let connection = database::connection(app).map_err(|error| error.to_string())?;
    let usage: i64 = connection
        .query_row(
            "SELECT COALESCE(trial_usage_count,0) FROM app_license LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let mut state = read_state(app)?.unwrap_or(initial_state(&connection)?);
    if usage > state.trial_usage_high_water {
        state.trial_usage_high_water = usage.clamp(0, TRIAL_OPERATION_LIMIT);
        state.updated_at = now(&connection)?;
        write_state(app, &mut state)?;
    }
    commercial::record_trial_high_water(app, usage)?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntitlementSnapshot {
    pub activation_status: String,
    pub edition: String,
    pub trial_usage_count: i64,
    pub trial_limit: i64,
}

pub fn snapshot(connection: &Connection) -> Result<Option<EntitlementSnapshot>, rusqlite::Error> {
    connection
        .query_row(
            "SELECT activation_status,edition,trial_usage_count,COALESCE(trial_entry_limit,?1) FROM app_license LIMIT 1",
            [TRIAL_OPERATION_LIMIT],
            |row| {
                Ok(EntitlementSnapshot {
                    activation_status: row.get(0)?,
                    edition: row.get(1)?,
                    trial_usage_count: row.get(2)?,
                    trial_limit: row.get(3)?,
                })
            },
        )
        .optional()
}

/// Guarda central para qualquer comando que crie uma operação financeira de alto nível.
/// Parcelas e os dois lados de uma transferência pertencem à mesma operação e contam uma vez.
pub fn can_create_financial_operation(connection: &Connection) -> Result<bool, rusqlite::Error> {
    let entitled = snapshot(connection)?.is_some_and(|state| {
        state.activation_status == "ACTIVE"
            || (state.activation_status == "TRIAL" && state.trial_usage_count < state.trial_limit)
    });
    Ok(entitled && can_use_feature(connection, FEATURE_FINANCIAL_CORE)?)
}

pub fn consume_financial_operation(connection: &Connection) -> Result<bool, rusqlite::Error> {
    if !can_create_financial_operation(connection)? {
        return Ok(false);
    }
    connection.execute(
        "UPDATE app_license SET trial_usage_count=trial_usage_count+1,trial_entry_limit=?1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE activation_status='TRIAL'",
        [TRIAL_OPERATION_LIMIT],
    )?;
    Ok(true)
}

pub fn enabled_features(connection: &Connection) -> Result<Vec<String>, rusqlite::Error> {
    let Some(state) = snapshot(connection)? else {
        return Ok(Vec::new());
    };
    if state.activation_status == "TRIAL" || state.edition == "ESSENTIAL" {
        return Ok(ESSENTIAL_FEATURES
            .iter()
            .map(|feature| (*feature).to_owned())
            .collect());
    }
    let metadata: Option<String> = connection
        .query_row(
            "SELECT license_metadata FROM app_license LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    Ok(metadata
        .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
        .and_then(|value| {
            value
                .get("features")
                .and_then(|features| features.as_array())
                .cloned()
        })
        .unwrap_or_default()
        .into_iter()
        .filter_map(|feature| feature.as_str().map(str::to_owned))
        .filter(|feature| ALL_FEATURES.contains(&feature.as_str()))
        .collect())
}

pub fn can_use_feature(connection: &Connection, feature: &str) -> Result<bool, rusqlite::Error> {
    Ok(enabled_features(connection)?
        .iter()
        .any(|enabled| enabled == feature))
}

pub fn get_current_edition(connection: &Connection) -> Result<Option<String>, rusqlite::Error> {
    Ok(snapshot(connection)?.map(|state| state.edition))
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{
        apply_state, can_create_financial_operation, can_use_feature, consume_financial_operation,
        display_installation_id, LocalEntitlementState,
    };
    use crate::database;

    fn connection(usage: i64) -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE app_license(activation_status TEXT,edition TEXT,trial_usage_count INTEGER,trial_entry_limit INTEGER,license_metadata TEXT,updated_at TEXT); INSERT INTO app_license VALUES('TRIAL','ESSENTIAL',0,50,NULL,'now');").unwrap();
        connection
            .execute("UPDATE app_license SET trial_usage_count=?1", [usage])
            .unwrap();
        connection
    }

    #[test]
    fn fiftieth_operation_is_allowed_and_fifty_first_is_blocked() {
        let connection = connection(49);
        assert!(consume_financial_operation(&connection).unwrap());
        assert!(!can_create_financial_operation(&connection).unwrap());
        assert!(!consume_financial_operation(&connection).unwrap());
    }

    #[test]
    fn essential_features_are_centralized() {
        let connection = connection(50);
        assert!(can_use_feature(&connection, "financial_core").unwrap());
        assert!(!can_use_feature(&connection, "multi_user").unwrap());
    }

    #[test]
    fn external_trial_state_prevents_license_clone_and_counter_rollback() {
        let connection = Connection::open_in_memory().unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute("INSERT INTO app_license(id,edition,activation_status,trial_started_at,trial_entry_limit,trial_usage_count,license_metadata,created_at,updated_at) VALUES('from-backup','ESSENTIAL','ACTIVE','now',50,12,'{\"edition\":\"ESSENTIAL\"}','now','now')", []).unwrap();
        connection
            .execute(
                "INSERT INTO app_installation(id,created_at) VALUES('computer-a','now')",
                [],
            )
            .unwrap();
        let state = LocalEntitlementState {
            schema_version: 1,
            internal_installation_id: "computer-b".into(),
            display_installation_id: display_installation_id("computer-b"),
            trial_usage_high_water: 50,
            signed_license_document: None,
            legacy_license_metadata: None,
            updated_at: "now".into(),
            checksum: String::new(),
        };
        apply_state(&connection, &state).unwrap();
        let result: (String, i64, Option<String>, String) = connection.query_row(
            "SELECT activation_status,trial_usage_count,license_metadata,(SELECT id FROM app_installation) FROM app_license",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).unwrap();
        assert_eq!(result, ("TRIAL".into(), 50, None, "computer-b".into()));
    }
}
