use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use chrono::NaiveDate;
use rand_core::OsRng;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use thiserror::Error;
use uuid::Uuid;

use crate::database::{self, DatabaseError};

const BUSINESS_TYPES: &[&str] = &[
    "SERVICE_PROVIDER",
    "RETAIL",
    "BEAUTY",
    "REPAIR",
    "FOOD",
    "SALES",
    "PROFESSIONAL",
    "GENERAL",
];
const SUGGESTED_CATEGORIES: &[(&str, &str)] = &[
    ("Vendas", "REVENUE"),
    ("Serviços", "REVENUE"),
    ("Outras receitas", "REVENUE"),
    ("Aluguel", "EXPENSE"),
    ("Fornecedores", "EXPENSE"),
    ("Utilidades", "EXPENSE"),
    ("Marketing", "EXPENSE"),
    ("Outras despesas", "EXPENSE"),
];
const SUGGESTED_PAYMENT_METHODS: &[(&str, &str)] = &[
    ("Dinheiro", "CASH"),
    ("Pix", "PIX"),
    ("Débito", "DEBIT"),
    ("Crédito", "CREDIT"),
    ("Boleto", "BOLETO"),
    ("Transferência", "TRANSFER"),
    ("Prazo", "TERM"),
    ("Outro", "OTHER"),
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingInput {
    pub business_name: String,
    pub business_type: String,
    pub account_name: String,
    pub opening_balance_cents: i64,
    pub opening_balance_date: String,
    pub admin_name: String,
    pub username: String,
    pub password: String,
    pub categories: Vec<String>,
    pub payment_methods: Vec<String>,
    pub monthly_goal_cents: Option<i64>,
    pub load_demo_data: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingStatus {
    pub is_completed: bool,
    pub license_status: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialConfiguration {
    pub business_name: String,
    pub business_type: String,
    pub account_name: String,
    pub opening_balance_cents: i64,
    pub opening_balance_date: String,
    pub admin_name: String,
    pub username: String,
    pub default_view_regime: String,
    pub theme: String,
    pub category_count: i64,
    pub payment_method_count: i64,
    pub monthly_goal_cents: Option<i64>,
}

#[derive(Debug, Error)]
pub enum OnboardingError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error("a configuração inicial já foi concluída")]
    AlreadyCompleted,
    #[error("{0}")]
    Validation(String),
    #[error("não foi possível proteger a senha local")]
    Password,
}

fn validate(input: &OnboardingInput) -> Result<(), OnboardingError> {
    if input.business_name.trim().chars().count() < 2 {
        return Err(OnboardingError::Validation(
            "Informe o nome do negócio.".into(),
        ));
    }
    if !BUSINESS_TYPES.contains(&input.business_type.as_str()) {
        return Err(OnboardingError::Validation(
            "Tipo de negócio inválido.".into(),
        ));
    }
    if input.account_name.trim().chars().count() < 2 {
        return Err(OnboardingError::Validation(
            "Informe o nome da conta financeira.".into(),
        ));
    }
    if input.opening_balance_cents < 0 {
        return Err(OnboardingError::Validation(
            "O saldo inicial não pode ser negativo.".into(),
        ));
    }
    if !is_iso_date(&input.opening_balance_date) {
        return Err(OnboardingError::Validation(
            "Informe uma data inicial válida.".into(),
        ));
    }
    if input.admin_name.trim().chars().count() < 2 {
        return Err(OnboardingError::Validation(
            "Informe o nome do administrador.".into(),
        ));
    }
    if !(3..=64).contains(&input.username.len())
        || !input.username.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '.'
        })
    {
        return Err(OnboardingError::Validation("Usuário deve ter de 3 a 64 caracteres e usar apenas letras, números, ponto ou sublinhado.".into()));
    }
    if input.password.chars().count() < 12 {
        return Err(OnboardingError::Validation(
            "A senha deve ter pelo menos 12 caracteres.".into(),
        ));
    }
    if input.categories.is_empty()
        || input.categories.iter().any(|selected| {
            !SUGGESTED_CATEGORIES
                .iter()
                .any(|(name, _)| name == selected)
        })
    {
        return Err(OnboardingError::Validation(
            "Selecione ao menos uma categoria sugerida válida.".into(),
        ));
    }
    if input.payment_methods.is_empty()
        || input.payment_methods.iter().any(|selected| {
            !SUGGESTED_PAYMENT_METHODS
                .iter()
                .any(|(name, _)| name == selected)
        })
    {
        return Err(OnboardingError::Validation(
            "Selecione ao menos uma forma de pagamento válida.".into(),
        ));
    }
    if input.monthly_goal_cents.is_some_and(|value| value <= 0) {
        return Err(OnboardingError::Validation(
            "A meta mensal deve ser maior que zero.".into(),
        ));
    }
    Ok(())
}

fn is_iso_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

pub fn status(app: &AppHandle) -> Result<OnboardingStatus, OnboardingError> {
    let connection = database::connection(app)?;
    let is_completed: bool =
        connection.query_row("SELECT EXISTS(SELECT 1 FROM business_profile)", [], |row| {
            row.get(0)
        })?;
    let license_status = connection
        .query_row(
            "SELECT activation_status FROM app_license LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(OnboardingStatus {
        is_completed,
        license_status,
    })
}

pub fn configuration(app: &AppHandle) -> Result<InitialConfiguration, OnboardingError> {
    let connection = database::connection(app)?;
    Ok(connection.query_row(
        "SELECT COALESCE(b.trade_name,b.legal_name),b.business_type,a.name,a.opening_balance_cents,a.opening_balance_date,u.name,u.username,p.default_view_regime,p.theme,(SELECT COUNT(*) FROM categories WHERE deleted_at IS NULL),(SELECT COUNT(*) FROM payment_methods WHERE is_active=1),(SELECT revenue_goal_cents FROM goals ORDER BY reference_month DESC LIMIT 1) FROM business_profile b JOIN app_preferences p ON p.business_id=b.id JOIN financial_accounts a ON a.id=p.default_financial_account_id CROSS JOIN local_users u WHERE u.role='ADMIN' LIMIT 1",
        [],
        |row| Ok(InitialConfiguration {
            business_name: row.get(0)?,
            business_type: row.get(1)?,
            account_name: row.get(2)?,
            opening_balance_cents: row.get(3)?,
            opening_balance_date: row.get(4)?,
            admin_name: row.get(5)?,
            username: row.get(6)?,
            default_view_regime: row.get(7)?,
            theme: row.get(8)?,
            category_count: row.get(9)?,
            payment_method_count: row.get(10)?,
            monthly_goal_cents: row.get(11)?,
        }),
    )?)
}

fn persist_initial_configuration(
    connection: &rusqlite::Connection,
    input: &OnboardingInput,
    password_hash: &str,
) -> Result<String, OnboardingError> {
    let already_completed: bool =
        connection.query_row("SELECT EXISTS(SELECT 1 FROM business_profile)", [], |row| {
            row.get(0)
        })?;
    if already_completed {
        return Err(OnboardingError::AlreadyCompleted);
    }

    let now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    let business_id = Uuid::new_v4().to_string();
    let user_id = Uuid::new_v4().to_string();
    let account_id = Uuid::new_v4().to_string();
    let preferences_id = Uuid::new_v4().to_string();
    let license_id = Uuid::new_v4().to_string();
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(&format!("INSERT INTO business_profile (id, legal_name, trade_name, business_type, currency, timezone, created_at, updated_at) VALUES (?1, ?2, ?2, ?3, 'BRL', 'America/Sao_Paulo', {now}, {now})"), params![business_id, input.business_name.trim(), input.business_type])?;
    transaction.execute(&format!("INSERT INTO local_users (id, name, username, password_hash, role, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'ADMIN', 1, {now}, {now})"), params![user_id, input.admin_name.trim(), input.username.trim().to_lowercase(), password_hash])?;
    transaction.execute(&format!("INSERT INTO financial_accounts (id, name, account_type, opening_balance_cents, opening_balance_date, is_default, is_active, created_at, updated_at, created_by, updated_by) VALUES (?1, ?2, 'CASH', ?3, ?4, 1, 1, {now}, {now}, ?5, ?5)"), params![account_id, input.account_name.trim(), input.opening_balance_cents, input.opening_balance_date, user_id])?;
    transaction.execute(&format!("INSERT INTO app_preferences (id, business_id, default_financial_account_id, default_view_regime, theme, created_at, updated_at) VALUES (?1, ?2, ?3, 'CASH', 'LIGHT', {now}, {now})"), params![preferences_id, business_id, account_id])?;
    for (order, (name, nature)) in SUGGESTED_CATEGORIES.iter().enumerate() {
        if input.categories.iter().any(|selected| selected == name) {
            transaction.execute(&format!("INSERT INTO categories (id, name, nature, is_system, is_active, display_order, created_at, updated_at, created_by, updated_by) VALUES (?1, ?2, ?3, 1, 1, ?4, {now}, {now}, ?5, ?5)"), params![Uuid::new_v4().to_string(), name, nature, order + 1, user_id])?;
        }
    }
    let mut default_payment_method_id = None;
    for (name, payment_type) in SUGGESTED_PAYMENT_METHODS {
        if input
            .payment_methods
            .iter()
            .any(|selected| selected == name)
        {
            let payment_method_id = Uuid::new_v4().to_string();
            transaction.execute(&format!("INSERT INTO payment_methods (id, name, payment_type, is_system, is_active, created_at, updated_at, created_by, updated_by) VALUES (?1, ?2, ?3, 1, 1, {now}, {now}, ?4, ?4)"), params![payment_method_id, name, payment_type, user_id])?;
            default_payment_method_id.get_or_insert(payment_method_id);
        }
    }
    transaction.execute(
        &format!(
            "UPDATE app_preferences SET default_payment_method_id=?1, updated_at={now} WHERE id=?2"
        ),
        params![default_payment_method_id, preferences_id],
    )?;
    if let Some(goal) = input.monthly_goal_cents {
        transaction.execute(&format!("INSERT INTO goals(id,reference_month,revenue_goal_cents,created_at,updated_at) VALUES(?1,strftime('%Y-%m','now','localtime'),?2,{now},{now})"),params![Uuid::new_v4().to_string(),goal])?;
    }
    if input.load_demo_data {
        transaction.execute(&format!("INSERT INTO contacts (id,contact_kind,role_customer,role_supplier,name,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES (?1,'PERSON',1,0,'Cliente Exemplo',1,1,{now},{now},?2,?2)"), params![Uuid::new_v4().to_string(), user_id])?;
        transaction.execute(&format!("INSERT INTO catalog_items (id,item_type,name,sale_price_cents,unit,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES (?1,'SERVICE','Serviço demonstrativo',15000,'UN',1,1,{now},{now},?2,?2)"), params![Uuid::new_v4().to_string(), user_id])?;
    }
    transaction.execute(&format!("INSERT INTO app_license (id, edition, activation_status, trial_started_at, trial_ends_at, trial_entry_limit, created_at, updated_at) VALUES (?1, 'ESSENTIAL', 'TRIAL', {now}, NULL, 50, {now}, {now}) ON CONFLICT DO NOTHING"), [license_id])?;
    transaction.execute(&format!("INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, summary, created_at) VALUES (?1, ?2, 'business_profile', ?3, 'CREATE', 'Configuração inicial concluída', {now})"), params![Uuid::new_v4().to_string(), user_id, business_id])?;
    transaction.commit()?;
    Ok(business_id)
}

pub fn complete(
    app: &AppHandle,
    input: OnboardingInput,
) -> Result<OnboardingStatus, OnboardingError> {
    validate(&input)?;
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(input.password.as_bytes(), &salt)
        .map_err(|_| OnboardingError::Password)?
        .to_string();
    let connection = database::connection(app)?;
    let business_id = persist_initial_configuration(&connection, &input, &password_hash)?;
    tracing::info!(business_id = %business_id, "Onboarding concluído");
    status(app)
}

#[cfg(test)]
mod tests {
    use super::{is_iso_date, persist_initial_configuration, validate, OnboardingInput};
    use crate::database;
    use rusqlite::Connection;

    fn valid_input() -> OnboardingInput {
        OnboardingInput {
            business_name: "Oficina Central".into(),
            business_type: "REPAIR".into(),
            account_name: "Caixa".into(),
            opening_balance_cents: 12_990,
            opening_balance_date: "2026-08-03".into(),
            admin_name: "Maria Silva".into(),
            username: "maria.silva".into(),
            password: "senha-segura-123".into(),
            categories: vec!["Vendas".into(), "Aluguel".into()],
            payment_methods: vec!["Dinheiro".into(), "Pix".into()],
            monthly_goal_cents: Some(100_000),
            load_demo_data: true,
        }
    }

    #[test]
    fn aceita_configuracao_inicial_valida() {
        assert!(validate(&valid_input()).is_ok());
    }

    #[test]
    fn recusa_senha_curta_e_saldo_negativo() {
        let mut input = valid_input();
        input.password = "curta".into();
        assert!(validate(&input).is_err());
        input.password = "senha-segura-123".into();
        input.opening_balance_cents = -1;
        assert!(validate(&input).is_err());
    }

    #[test]
    fn valida_data_iso_basica() {
        assert!(is_iso_date("2026-08-03"));
        assert!(!is_iso_date("03/08/2026"));
        assert!(!is_iso_date("2026-99-99"));
    }

    #[test]
    fn persists_all_nine_step_outputs_atomically() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        database::apply_migrations(&connection).unwrap();

        persist_initial_configuration(&connection, &valid_input(), "argon2-test-hash").unwrap();

        for (table, expected) in [
            ("business_profile", 1),
            ("app_preferences", 1),
            ("local_users", 1),
            ("financial_accounts", 1),
            ("categories", 2),
            ("payment_methods", 2),
            ("goals", 1),
            ("contacts", 1),
            ("catalog_items", 1),
            ("audit_logs", 1),
        ] {
            let count: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, expected, "quantidade incorreta em {table}");
        }
        let stored: (String, String, i64) = connection
            .query_row(
                "SELECT u.password_hash,l.activation_status,g.revenue_goal_cents FROM local_users u CROSS JOIN app_license l CROSS JOIN goals g",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(stored, ("argon2-test-hash".into(), "TRIAL".into(), 100_000));
    }

    #[test]
    fn preserves_license_activated_before_onboarding() {
        let connection = Connection::open_in_memory().unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute("INSERT INTO app_license(id,edition,activation_status,created_at,updated_at) VALUES('licensed','ESSENTIAL','ACTIVE','now','now')", []).unwrap();

        persist_initial_configuration(&connection, &valid_input(), "argon2-test-hash").unwrap();

        let state: (i64, String) = connection
            .query_row(
                "SELECT COUNT(*),activation_status FROM app_license",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(state, (1, "ACTIVE".into()));
    }
}
