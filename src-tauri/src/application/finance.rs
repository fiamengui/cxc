use std::collections::HashMap;

use chrono::{Datelike, Duration, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use thiserror::Error;
use uuid::Uuid;

use crate::{
    application::entitlements,
    database::{self, DatabaseError},
};

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const SUMMARY_SELECT: &str = "SELECT e.id,e.entry_group_id,e.entry_type,e.direction,e.origin_type,e.origin_id,e.contact_id,ct.name,e.category_id,cat.name,e.financial_account_id,acc.name,e.payment_method_id,pm.name,e.description,e.document_reference,e.issue_date,e.competence_date,e.due_date,e.settlement_date,e.gross_amount_cents,e.net_amount_cents,e.installment_number,e.installment_count,e.status,e.is_recurring,e.recurrence_id,e.notes,e.cancel_reason,e.reversed_at,e.reversal_reason,COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0),CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' WHEN e.status='CANCELED' THEN 'CANCELED' WHEN e.status='SETTLED' THEN 'SETTLED' WHEN e.status='DRAFT' THEN 'DRAFT' WHEN e.due_date<date('now','localtime') THEN 'OVERDUE' WHEN COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)>0 THEN 'PARTIAL' ELSE 'PENDING' END FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories cat ON cat.id=e.category_id LEFT JOIN financial_accounts acc ON acc.id=e.financial_account_id LEFT JOIN payment_methods pm ON pm.id=e.payment_method_id";

#[derive(Debug, Error)]
pub enum FinanceError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error("{0}")]
    Validation(String),
    #[error("falha ao processar os dados financeiros: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceInput {
    pub frequency: String,
    pub interval_value: i64,
    pub start_date: String,
    pub end_date: Option<String>,
    pub maximum_occurrences: Option<i64>,
}

fn one() -> i64 {
    1
}
fn manual() -> String {
    "MANUAL".into()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryInput {
    pub id: Option<String>,
    pub entry_type: String,
    #[serde(default = "manual")]
    pub origin_type: String,
    pub origin_id: Option<String>,
    pub contact_id: Option<String>,
    pub category_id: Option<String>,
    pub financial_account_id: Option<String>,
    pub payment_method_id: Option<String>,
    pub description: String,
    pub document_reference: Option<String>,
    pub issue_date: String,
    pub competence_date: Option<String>,
    pub due_date: Option<String>,
    pub gross_amount_cents: i64,
    pub status: String,
    #[serde(default = "one")]
    pub installment_count: i64,
    #[serde(default)]
    pub installment_due_dates: Vec<String>,
    pub recurrence: Option<RecurrenceInput>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInput {
    pub description: String,
    pub amount_cents: i64,
    pub date: String,
    pub source_account_id: String,
    pub destination_account_id: String,
    pub payment_method_id: String,
    pub document_reference: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementInput {
    pub entry_id: String,
    pub settlement_date: String,
    pub financial_account_id: String,
    pub payment_method_id: String,
    pub amount_cents: i64,
    #[serde(default)]
    pub discount_amount_cents: i64,
    #[serde(default)]
    pub fee_amount_cents: i64,
    #[serde(default)]
    pub interest_amount_cents: i64,
    #[serde(default)]
    pub penalty_amount_cents: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEntriesResult {
    pub entry_ids: Vec<String>,
    pub group_id: Option<String>,
    pub recurrence_id: Option<String>,
}

pub(crate) struct SaleReceivablePlan<'a> {
    pub sale_id: &'a str,
    pub sale_number: &'a str,
    pub customer_id: &'a str,
    pub category_id: &'a str,
    pub issue_date: &'a str,
    pub payment_method_id: &'a str,
    pub financial_account_id: Option<&'a str>,
    pub immediate_amount_cents: i64,
    pub pending_amount_cents: i64,
    pub pending_due_dates: &'a [String],
    pub notes: Option<&'a str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementResult {
    pub entry_id: String,
    pub settlement_id: String,
    pub status: String,
    pub remaining_amount_cents: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryListQuery {
    #[serde(default)]
    pub tab: String,
    #[serde(default)]
    pub status: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub category_id: Option<String>,
    pub financial_account_id: Option<String>,
    pub payment_method_id: Option<String>,
    pub contact_id: Option<String>,
    pub minimum_amount_cents: Option<i64>,
    pub maximum_amount_cents: Option<i64>,
    #[serde(default)]
    pub search: String,
    #[serde(default)]
    pub origin_type: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    25
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntrySummary {
    pub id: String,
    pub entry_group_id: Option<String>,
    pub entry_type: String,
    pub direction: String,
    pub origin_type: String,
    pub origin_id: Option<String>,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub financial_account_id: Option<String>,
    pub financial_account_name: Option<String>,
    pub payment_method_id: Option<String>,
    pub payment_method_name: Option<String>,
    pub description: String,
    pub document_reference: Option<String>,
    pub issue_date: String,
    pub competence_date: String,
    pub due_date: Option<String>,
    pub settlement_date: Option<String>,
    pub gross_amount_cents: i64,
    pub net_amount_cents: i64,
    pub installment_number: i64,
    pub installment_count: i64,
    pub persisted_status: String,
    pub display_status: String,
    pub is_recurring: bool,
    pub recurrence_id: Option<String>,
    pub notes: Option<String>,
    pub cancel_reason: Option<String>,
    pub reversed_at: Option<String>,
    pub reversal_reason: Option<String>,
    pub settled_principal_cents: i64,
    pub remaining_amount_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementItem {
    pub id: String,
    pub settlement_date: String,
    pub financial_account_id: String,
    pub financial_account_name: String,
    pub payment_method_id: String,
    pub payment_method_name: String,
    pub principal_amount_cents: i64,
    pub discount_amount_cents: i64,
    pub fee_amount_cents: i64,
    pub interest_amount_cents: i64,
    pub penalty_amount_cents: i64,
    pub net_amount_cents: i64,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub action: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryDetail {
    #[serde(flatten)]
    pub entry: EntrySummary,
    pub settlements: Vec<SettlementItem>,
    pub history: Vec<HistoryItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceOption {
    pub id: String,
    pub name: String,
    pub detail: Option<String>,
    pub current_balance_cents: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceOptions {
    pub business_name: String,
    pub default_financial_account_id: Option<String>,
    pub default_payment_method_id: Option<String>,
    pub default_view_regime: String,
    pub contacts: Vec<FinanceOption>,
    pub categories: Vec<FinanceOption>,
    pub accounts: Vec<FinanceOption>,
    pub payment_methods: Vec<FinanceOption>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceSummary {
    pub id: String,
    pub description: String,
    pub frequency: String,
    pub interval_value: i64,
    pub start_date: String,
    pub end_date: Option<String>,
    pub next_generation_date: Option<String>,
    pub maximum_occurrences: Option<i64>,
    pub generated_occurrences: i64,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObligationQuery {
    pub kind: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub search: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObligationIndicators {
    pub total_pending_cents: i64,
    pub overdue_cents: i64,
    pub due_today_cents: i64,
    pub next_seven_days_cents: i64,
    pub settled_this_month_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObligationPage {
    pub items: Vec<EntrySummary>,
    pub total: i64,
    pub indicators: ObligationIndicators,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashFlowQuery {
    pub start_date: String,
    pub end_date: String,
    pub financial_account_id: Option<String>,
    pub category_id: Option<String>,
    pub regime: String,
    #[serde(default)]
    pub status: String,
    pub projection_until: Option<String>,
    #[serde(default)]
    pub include_pending_projection: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashFlowDay {
    pub date: String,
    pub opening_balance_cents: i64,
    pub inflow_cents: i64,
    pub outflow_cents: i64,
    pub daily_result_cents: i64,
    pub closing_balance_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashFlowResult {
    pub opening_balance_cents: i64,
    pub inflow_cents: i64,
    pub outflow_cents: i64,
    pub result_cents: i64,
    pub closing_balance_cents: i64,
    pub projected_balance_cents: i64,
    pub projected_inflow_cents: i64,
    pub projected_outflow_cents: i64,
    pub regime: String,
    pub days: Vec<CashFlowDay>,
}

fn actor(connection: &Connection) -> Result<Option<String>, rusqlite::Error> {
    connection
        .query_row(
            "SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
}

fn audit(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    summary: &str,
) -> Result<(), FinanceError> {
    connection.execute(
        &format!("INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,?3,?4,?5,?6,{NOW})"),
        params![Uuid::new_v4().to_string(),actor(connection)?,entity_type,entity_id,action,summary],
    )?;
    Ok(())
}

fn optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn date(value: &str, label: &str) -> Result<NaiveDate, FinanceError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| FinanceError::Validation(format!("Informe {label} válida.")))
}

fn direction_and_result(entry_type: &str) -> Option<(&'static str, i64)> {
    match entry_type {
        "REVENUE" => Some(("IN", 1)),
        "EXPENSE" => Some(("OUT", -1)),
        "OWNER_CONTRIBUTION" | "ADJUSTMENT_POSITIVE" => Some(("IN", 0)),
        "OWNER_WITHDRAWAL" | "ADJUSTMENT_NEGATIVE" => Some(("OUT", 0)),
        _ => None,
    }
}

fn required_nature(entry_type: &str) -> &'static str {
    match direction_and_result(entry_type) {
        Some(("IN", _)) => "REVENUE",
        _ => "EXPENSE",
    }
}

fn active_exists(connection: &Connection, table: &str, id: &str) -> Result<bool, FinanceError> {
    let table = match table {
        "contacts" | "categories" | "financial_accounts" | "payment_methods" => table,
        _ => return Err(FinanceError::Validation("Referência desconhecida.".into())),
    };
    let deleted = if table == "payment_methods" {
        ""
    } else {
        " AND deleted_at IS NULL"
    };
    Ok(connection.query_row(
        &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1 AND is_active=1{deleted})"),
        [id],
        |row| row.get(0),
    )?)
}

fn trial_allows(connection: &Connection) -> Result<bool, FinanceError> {
    entitlements::can_create_financial_operation(connection).map_err(Into::into)
}

fn consume_trial(connection: &Connection) -> Result<(), FinanceError> {
    if entitlements::consume_financial_operation(connection)? {
        Ok(())
    } else {
        Err(FinanceError::Validation(
            entitlements::TRIAL_LIMIT_MESSAGE.into(),
        ))
    }
}

fn validate_references(connection: &Connection, input: &EntryInput) -> Result<(), FinanceError> {
    if let Some(contact_id) = input.contact_id.as_deref() {
        if !active_exists(connection, "contacts", contact_id)? {
            return Err(FinanceError::Validation(
                "Contato inválido ou inativo.".into(),
            ));
        }
    }
    let category_id = input
        .category_id
        .as_deref()
        .ok_or_else(|| FinanceError::Validation("Selecione uma categoria.".into()))?;
    let category_valid: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM categories WHERE id=?1 AND nature=?2 AND is_active=1 AND deleted_at IS NULL)",
        params![category_id, required_nature(&input.entry_type)],
        |row| row.get(0),
    )?;
    if !category_valid {
        return Err(FinanceError::Validation(
            "A categoria deve estar ativa e ter a natureza compatível com o lançamento.".into(),
        ));
    }
    if let Some(account_id) = input.financial_account_id.as_deref() {
        if !active_exists(connection, "financial_accounts", account_id)? {
            return Err(FinanceError::Validation(
                "Conta financeira inválida ou inativa.".into(),
            ));
        }
    }
    if let Some(payment_id) = input.payment_method_id.as_deref() {
        if !active_exists(connection, "payment_methods", payment_id)? {
            return Err(FinanceError::Validation(
                "Forma de pagamento inválida ou inativa.".into(),
            ));
        }
    }
    Ok(())
}

fn validate_entry(connection: &Connection, input: &EntryInput) -> Result<(), FinanceError> {
    if direction_and_result(&input.entry_type).is_none() {
        return Err(FinanceError::Validation(
            "Tipo de lançamento inválido.".into(),
        ));
    }
    if input.description.trim().chars().count() < 2 || input.gross_amount_cents <= 0 {
        return Err(FinanceError::Validation(
            "Informe descrição e valor maior que zero.".into(),
        ));
    }
    date(&input.issue_date, "uma data de emissão")?;
    if let Some(value) = input.competence_date.as_deref() {
        date(value, "uma data de competência")?;
    }
    if let Some(value) = input.due_date.as_deref() {
        date(value, "uma data de vencimento")?;
    }
    if !["DRAFT", "PENDING", "SETTLED"].contains(&input.status.as_str()) {
        return Err(FinanceError::Validation(
            "Situação inicial inválida.".into(),
        ));
    }
    if input.status == "PENDING" && input.due_date.is_none() {
        return Err(FinanceError::Validation(
            "Lançamentos pendentes exigem vencimento.".into(),
        ));
    }
    if input.status == "SETTLED"
        && (input.financial_account_id.is_none() || input.payment_method_id.is_none())
    {
        return Err(FinanceError::Validation(
            "Lançamentos liquidados exigem conta e forma de pagamento.".into(),
        ));
    }
    if !(1..=120).contains(&input.installment_count)
        || input.gross_amount_cents < input.installment_count
    {
        return Err(FinanceError::Validation(
            "O parcelamento deve ter de 1 a 120 parcelas com valor mínimo de um centavo.".into(),
        ));
    }
    if input.installment_count > 1 {
        if input.status == "SETTLED" || input.recurrence.is_some() {
            return Err(FinanceError::Validation(
                "Parcelamentos devem iniciar pendentes e não podem ser recorrentes.".into(),
            ));
        }
        if input.installment_due_dates.len() as i64 != input.installment_count
            || input
                .installment_due_dates
                .iter()
                .any(|value| date(value, "uma data de parcela").is_err())
        {
            return Err(FinanceError::Validation(
                "Informe uma data válida para cada parcela.".into(),
            ));
        }
    }
    if let Some(recurrence) = &input.recurrence {
        validate_recurrence(recurrence)?;
        if input.status != "PENDING" {
            return Err(FinanceError::Validation(
                "Lançamentos recorrentes devem iniciar pendentes.".into(),
            ));
        }
    }
    validate_references(connection, input)
}

fn validate_recurrence(input: &RecurrenceInput) -> Result<(), FinanceError> {
    if ![
        "WEEKLY",
        "MONTHLY",
        "BIMONTHLY",
        "QUARTERLY",
        "SEMIANNUAL",
        "ANNUAL",
    ]
    .contains(&input.frequency.as_str())
        || !(1..=120).contains(&input.interval_value)
        || input
            .maximum_occurrences
            .is_some_and(|value| !(1..=10_000).contains(&value))
    {
        return Err(FinanceError::Validation("Recorrência inválida.".into()));
    }
    let start = date(&input.start_date, "uma data inicial")?;
    if let Some(end) = input.end_date.as_deref() {
        if date(end, "uma data final")? < start {
            return Err(FinanceError::Validation(
                "A data final da recorrência deve ser posterior à inicial.".into(),
            ));
        }
    }
    Ok(())
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    (NaiveDate::from_ymd_opt(next_year, next_month, 1).unwrap() - Duration::days(1)).day()
}

fn add_months_clamped(value: NaiveDate, months: i64) -> Result<NaiveDate, FinanceError> {
    let base = i64::from(value.year()) * 12 + i64::from(value.month0());
    let target = base
        .checked_add(months)
        .ok_or_else(|| FinanceError::Validation("Data de recorrência fora do limite.".into()))?;
    let year = i32::try_from(target.div_euclid(12))
        .map_err(|_| FinanceError::Validation("Data de recorrência fora do limite.".into()))?;
    let month = u32::try_from(target.rem_euclid(12) + 1)
        .map_err(|_| FinanceError::Validation("Data de recorrência fora do limite.".into()))?;
    NaiveDate::from_ymd_opt(year, month, value.day().min(days_in_month(year, month)))
        .ok_or_else(|| FinanceError::Validation("Data de recorrência inválida.".into()))
}

fn next_recurrence_date(
    value: NaiveDate,
    frequency: &str,
    interval: i64,
) -> Result<NaiveDate, FinanceError> {
    match frequency {
        "WEEKLY" => value
            .checked_add_signed(Duration::days(interval * 7))
            .ok_or_else(|| FinanceError::Validation("Data de recorrência fora do limite.".into())),
        "MONTHLY" => add_months_clamped(value, interval),
        "BIMONTHLY" => add_months_clamped(value, interval * 2),
        "QUARTERLY" => add_months_clamped(value, interval * 3),
        "SEMIANNUAL" => add_months_clamped(value, interval * 6),
        "ANNUAL" => add_months_clamped(value, interval * 12),
        _ => Err(FinanceError::Validation("Frequência inválida.".into())),
    }
}

fn insert_group(
    connection: &Connection,
    group_type: &str,
    description: &str,
) -> Result<String, FinanceError> {
    let id = Uuid::new_v4().to_string();
    connection.execute(
        &format!("INSERT INTO entry_groups(id,group_type,description,created_by,created_at) VALUES(?1,?2,?3,?4,{NOW})"),
        params![id, group_type, description.trim(), actor(connection)?],
    )?;
    Ok(id)
}

struct InsertEntry<'a> {
    id: &'a str,
    group_id: Option<&'a str>,
    recurrence_id: Option<&'a str>,
    input: &'a EntryInput,
    amount_cents: i64,
    due_date: Option<&'a str>,
    installment_number: i64,
    installment_count: i64,
}

fn insert_entry(connection: &Connection, value: InsertEntry<'_>) -> Result<(), FinanceError> {
    let (direction, result_multiplier) = direction_and_result(&value.input.entry_type)
        .ok_or_else(|| FinanceError::Validation("Tipo inválido.".into()))?;
    let competence = value
        .input
        .competence_date
        .as_deref()
        .unwrap_or(&value.input.issue_date);
    let initial_status = if value.input.status == "SETTLED" {
        "PENDING"
    } else {
        value.input.status.as_str()
    };
    connection.execute(
        &format!("INSERT INTO financial_entries(id,entry_group_id,entry_type,direction,result_multiplier,origin_type,origin_id,contact_id,category_id,financial_account_id,payment_method_id,description,document_reference,issue_date,competence_date,due_date,gross_amount_cents,net_amount_cents,installment_number,installment_count,status,is_recurring,recurrence_id,notes,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17,?18,?19,?20,?21,?22,?23,?24,?24,{NOW},{NOW})"),
        params![value.id,value.group_id,value.input.entry_type,direction,result_multiplier,value.input.origin_type.trim(),optional(&value.input.origin_id),optional(&value.input.contact_id),optional(&value.input.category_id),optional(&value.input.financial_account_id),optional(&value.input.payment_method_id),value.input.description.trim(),optional(&value.input.document_reference),value.input.issue_date,competence,value.due_date,value.amount_cents,value.installment_number,value.installment_count,initial_status,value.recurrence_id.is_some(),value.recurrence_id,optional(&value.input.notes),actor(connection)?],
    )?;
    audit(
        connection,
        "financial_entry",
        value.id,
        "CREATE",
        "Movimentação criada",
    )?;
    Ok(())
}

pub(crate) fn create_sale_receivables_in_connection(
    connection: &Connection,
    plan: SaleReceivablePlan<'_>,
) -> Result<SaveEntriesResult, FinanceError> {
    date(plan.issue_date, "uma data da venda")?;
    if plan.immediate_amount_cents < 0
        || plan.pending_amount_cents < 0
        || plan.immediate_amount_cents + plan.pending_amount_cents <= 0
        || (plan.pending_amount_cents > 0 && plan.pending_due_dates.is_empty())
        || (plan.pending_amount_cents == 0 && !plan.pending_due_dates.is_empty())
    {
        return Err(FinanceError::Validation(
            "Plano de recebimento da venda inválido.".into(),
        ));
    }
    if !active_exists(connection, "contacts", plan.customer_id)?
        || !active_exists(connection, "categories", plan.category_id)?
        || !active_exists(connection, "payment_methods", plan.payment_method_id)?
    {
        return Err(FinanceError::Validation(
            "Cliente, categoria ou forma de recebimento inválida/inativa.".into(),
        ));
    }
    if let Some(account_id) = plan.financial_account_id {
        if !active_exists(connection, "financial_accounts", account_id)? {
            return Err(FinanceError::Validation(
                "Conta financeira inválida ou inativa.".into(),
            ));
        }
    }
    if plan.immediate_amount_cents > 0 && plan.financial_account_id.is_none() {
        return Err(FinanceError::Validation(
            "O recebimento imediato exige uma conta financeira.".into(),
        ));
    }
    for due_date in plan.pending_due_dates {
        date(due_date, "um vencimento da venda")?;
    }
    let entry_count = i64::from(plan.immediate_amount_cents > 0)
        + i64::try_from(plan.pending_due_dates.len())
            .map_err(|_| FinanceError::Validation("Parcelamento fora do limite.".into()))?;
    if !(1..=120).contains(&entry_count) || plan.pending_amount_cents < entry_count - 1 {
        return Err(FinanceError::Validation(
            "O parcelamento deve manter ao menos um centavo por conta.".into(),
        ));
    }
    consume_trial(connection)?;
    let group_id = insert_group(
        connection,
        "SALE",
        &format!("Recebimentos da venda {}", plan.sale_number),
    )?;
    let description = format!("Venda {}", plan.sale_number);
    let document_reference = Some(plan.sale_number.to_owned());
    let contact_id = Some(plan.customer_id.to_owned());
    let category_id = Some(plan.category_id.to_owned());
    let payment_method_id = Some(plan.payment_method_id.to_owned());
    let account_id = plan.financial_account_id.map(str::to_owned);
    let notes = plan.notes.map(str::to_owned);
    let mut entry_ids = Vec::new();
    let mut installment_number = 1;

    if plan.immediate_amount_cents > 0 {
        let id = Uuid::new_v4().to_string();
        let input = EntryInput {
            id: None,
            entry_type: "REVENUE".into(),
            origin_type: "SALE".into(),
            origin_id: Some(plan.sale_id.to_owned()),
            contact_id: contact_id.clone(),
            category_id: category_id.clone(),
            financial_account_id: account_id.clone(),
            payment_method_id: payment_method_id.clone(),
            description: description.clone(),
            document_reference: document_reference.clone(),
            issue_date: plan.issue_date.to_owned(),
            competence_date: Some(plan.issue_date.to_owned()),
            due_date: Some(plan.issue_date.to_owned()),
            gross_amount_cents: plan.immediate_amount_cents,
            status: "SETTLED".into(),
            installment_count: 1,
            installment_due_dates: Vec::new(),
            recurrence: None,
            notes: notes.clone(),
        };
        insert_entry(
            connection,
            InsertEntry {
                id: &id,
                group_id: Some(&group_id),
                recurrence_id: None,
                input: &input,
                amount_cents: plan.immediate_amount_cents,
                due_date: Some(plan.issue_date),
                installment_number,
                installment_count: entry_count,
            },
        )?;
        settle_in_connection(
            connection,
            &SettlementInput {
                entry_id: id.clone(),
                settlement_date: plan.issue_date.to_owned(),
                financial_account_id: account_id.clone().unwrap(),
                payment_method_id: plan.payment_method_id.to_owned(),
                amount_cents: plan.immediate_amount_cents,
                discount_amount_cents: 0,
                fee_amount_cents: 0,
                interest_amount_cents: 0,
                penalty_amount_cents: 0,
                notes: notes.clone(),
            },
        )?;
        entry_ids.push(id);
        installment_number += 1;
    }

    if plan.pending_amount_cents > 0 {
        let pending_count = i64::try_from(plan.pending_due_dates.len())
            .map_err(|_| FinanceError::Validation("Parcelamento fora do limite.".into()))?;
        if plan.pending_amount_cents < pending_count {
            return Err(FinanceError::Validation(
                "Cada parcela pendente deve ter ao menos um centavo.".into(),
            ));
        }
        let base = plan.pending_amount_cents / pending_count;
        let remainder = plan.pending_amount_cents % pending_count;
        for (index, due_date) in plan.pending_due_dates.iter().enumerate() {
            let amount = base
                + if index + 1 == plan.pending_due_dates.len() {
                    remainder
                } else {
                    0
                };
            let id = Uuid::new_v4().to_string();
            let input = EntryInput {
                id: None,
                entry_type: "REVENUE".into(),
                origin_type: "SALE".into(),
                origin_id: Some(plan.sale_id.to_owned()),
                contact_id: contact_id.clone(),
                category_id: category_id.clone(),
                financial_account_id: account_id.clone(),
                payment_method_id: payment_method_id.clone(),
                description: description.clone(),
                document_reference: document_reference.clone(),
                issue_date: plan.issue_date.to_owned(),
                competence_date: Some(plan.issue_date.to_owned()),
                due_date: Some(due_date.clone()),
                gross_amount_cents: amount,
                status: "PENDING".into(),
                installment_count: 1,
                installment_due_dates: Vec::new(),
                recurrence: None,
                notes: notes.clone(),
            };
            insert_entry(
                connection,
                InsertEntry {
                    id: &id,
                    group_id: Some(&group_id),
                    recurrence_id: None,
                    input: &input,
                    amount_cents: amount,
                    due_date: Some(due_date),
                    installment_number,
                    installment_count: entry_count,
                },
            )?;
            entry_ids.push(id);
            installment_number += 1;
        }
    }
    audit(
        connection,
        "entry_group",
        &group_id,
        "CREATE_SALE_RECEIVABLES",
        "Contas a receber da venda criadas",
    )?;
    sync_sale_status(connection, plan.sale_id)?;
    Ok(SaveEntriesResult {
        entry_ids,
        group_id: Some(group_id),
        recurrence_id: None,
    })
}

fn sync_sale_status(connection: &Connection, sale_id: &str) -> Result<(), FinanceError> {
    let current: Option<String> = connection
        .query_row(
            "SELECT status FROM sales WHERE id=?1 AND deleted_at IS NULL",
            [sale_id],
            |row| row.get(0),
        )
        .optional()?;
    if matches!(current.as_deref(), None | Some("DRAFT" | "CANCELED")) {
        return Ok(());
    }
    let (active_entries, remaining, settled): (i64, i64, i64) = connection.query_row(
        "SELECT COUNT(*),COALESCE(SUM(CASE WHEN e.status='PENDING' THEN e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0) ELSE 0 END),0),COALESCE(SUM((SELECT COALESCE(SUM(s.principal_amount_cents),0) FROM entry_settlements s WHERE s.entry_id=e.id)),0) FROM financial_entries e WHERE e.origin_type='SALE' AND e.origin_id=?1 AND e.status<>'CANCELED' AND e.reversed_at IS NULL AND e.deleted_at IS NULL",
        [sale_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let status = if active_entries > 0 && remaining == 0 {
        "RECEIVED"
    } else if settled > 0 {
        "PARTIALLY_RECEIVED"
    } else {
        "CONFIRMED"
    };
    connection.execute(
        &format!("UPDATE sales SET status=?2,updated_at={NOW} WHERE id=?1 AND status<>'CANCELED'"),
        params![sale_id, status],
    )?;
    Ok(())
}

fn principal_from_settlement(
    entry_type: &str,
    input: &SettlementInput,
) -> Result<i64, FinanceError> {
    let adjustments = [
        input.discount_amount_cents,
        input.fee_amount_cents,
        input.interest_amount_cents,
        input.penalty_amount_cents,
    ];
    if input.amount_cents < 0 || adjustments.iter().any(|value| *value < 0) {
        return Err(FinanceError::Validation(
            "Valores da liquidação não podem ser negativos.".into(),
        ));
    }
    let principal = match entry_type {
        "REVENUE" => {
            input.amount_cents + input.discount_amount_cents + input.fee_amount_cents
                - input.interest_amount_cents
                - input.penalty_amount_cents
        }
        "EXPENSE" => {
            input.amount_cents + input.discount_amount_cents
                - input.fee_amount_cents
                - input.interest_amount_cents
                - input.penalty_amount_cents
        }
        _ if adjustments.iter().all(|value| *value == 0) => input.amount_cents,
        _ => {
            return Err(FinanceError::Validation(
                "Ajustes de liquidação são permitidos apenas em receitas e despesas.".into(),
            ))
        }
    };
    if principal <= 0 {
        return Err(FinanceError::Validation(
            "A liquidação deve reduzir o saldo pendente.".into(),
        ));
    }
    Ok(principal)
}

pub(crate) fn settle_in_connection(
    connection: &Connection,
    input: &SettlementInput,
) -> Result<SettlementResult, FinanceError> {
    date(&input.settlement_date, "uma data de liquidação")?;
    if !active_exists(
        connection,
        "financial_accounts",
        &input.financial_account_id,
    )? || !active_exists(connection, "payment_methods", &input.payment_method_id)?
    {
        return Err(FinanceError::Validation(
            "Conta ou forma de pagamento inválida/inativa.".into(),
        ));
    }
    let (entry_type, status, gross, reversed_at, origin_type, origin_id): (
        String,
        String,
        i64,
        Option<String>,
        String,
        Option<String>,
    ) =
        connection
            .query_row(
                "SELECT entry_type,status,gross_amount_cents,reversed_at,origin_type,origin_id FROM financial_entries WHERE id=?1 AND deleted_at IS NULL",
                [&input.entry_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .optional()?
            .ok_or_else(|| FinanceError::Validation("Movimentação não encontrada.".into()))?;
    if status != "PENDING"
        || reversed_at.is_some()
        || entry_type.starts_with("TRANSFER_")
        || entry_type == "REVERSAL"
    {
        return Err(FinanceError::Validation(
            "Somente movimentações pendentes podem ser liquidadas.".into(),
        ));
    }
    let settled: i64 = connection.query_row(
        "SELECT COALESCE(SUM(principal_amount_cents),0) FROM entry_settlements WHERE entry_id=?1",
        [&input.entry_id],
        |row| row.get(0),
    )?;
    let remaining = gross - settled;
    let principal = principal_from_settlement(&entry_type, input)?;
    if principal > remaining {
        return Err(FinanceError::Validation(format!(
            "A liquidação excede o saldo pendente de {remaining} centavos."
        )));
    }
    let settlement_id = Uuid::new_v4().to_string();
    connection.execute(
        &format!("INSERT INTO entry_settlements(id,entry_id,financial_account_id,payment_method_id,settlement_date,principal_amount_cents,discount_amount_cents,fee_amount_cents,interest_amount_cents,penalty_amount_cents,net_amount_cents,notes,created_by,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,{NOW})"),
        params![settlement_id,input.entry_id,input.financial_account_id,input.payment_method_id,input.settlement_date,principal,input.discount_amount_cents,input.fee_amount_cents,input.interest_amount_cents,input.penalty_amount_cents,input.amount_cents,optional(&input.notes),actor(connection)?],
    )?;
    let (principal_total, discount, fee, interest, penalty, cash):
        (i64, i64, i64, i64, i64, i64) = connection.query_row(
        "SELECT COALESCE(SUM(principal_amount_cents),0),COALESCE(SUM(discount_amount_cents),0),COALESCE(SUM(fee_amount_cents),0),COALESCE(SUM(interest_amount_cents),0),COALESCE(SUM(penalty_amount_cents),0),COALESCE(SUM(net_amount_cents),0) FROM entry_settlements WHERE entry_id=?1",
        [&input.entry_id],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?)),
    )?;
    let new_remaining = gross - principal_total;
    let new_status = if new_remaining == 0 {
        "SETTLED"
    } else {
        "PENDING"
    };
    let economic_net = match entry_type.as_str() {
        "REVENUE" => cash + new_remaining,
        "EXPENSE" => cash + new_remaining,
        _ => gross,
    };
    connection.execute(
        &format!("UPDATE financial_entries SET financial_account_id=COALESCE(financial_account_id,?2),payment_method_id=COALESCE(payment_method_id,?3),settlement_date=(SELECT MAX(settlement_date) FROM entry_settlements WHERE entry_id=?1),discount_amount_cents=?4,fee_amount_cents=?5,interest_amount_cents=?6,penalty_amount_cents=?7,net_amount_cents=?8,status=?9,updated_by=?10,updated_at={NOW} WHERE id=?1"),
        params![input.entry_id,input.financial_account_id,input.payment_method_id,discount,fee,interest,penalty,economic_net,new_status,actor(connection)?],
    )?;
    audit(
        connection,
        "financial_entry",
        &input.entry_id,
        if new_remaining == 0 {
            "SETTLE"
        } else {
            "PARTIAL_SETTLE"
        },
        if new_remaining == 0 {
            "Movimentação liquidada"
        } else {
            "Liquidação parcial registrada"
        },
    )?;
    if origin_type == "SALE" {
        if let Some(sale_id) = origin_id.as_deref() {
            sync_sale_status(connection, sale_id)?;
        }
    }
    Ok(SettlementResult {
        entry_id: input.entry_id.clone(),
        settlement_id,
        status: new_status.into(),
        remaining_amount_cents: new_remaining,
    })
}

fn update_entry_in_connection(
    connection: &Connection,
    input: &EntryInput,
) -> Result<SaveEntriesResult, FinanceError> {
    validate_entry(connection, input)?;
    if input.installment_count != 1 || input.recurrence.is_some() {
        return Err(FinanceError::Validation(
            "Edite parcelas e recorrências individualmente sem recriar o grupo.".into(),
        ));
    }
    let id = input
        .id
        .as_deref()
        .ok_or_else(|| FinanceError::Validation("Movimentação inválida.".into()))?;
    let (current_type, status, group_id, current_gross, settlement_count, reversed, origin_type):
        (String, String, Option<String>, i64, i64, Option<String>, String) = connection
        .query_row(
            "SELECT entry_type,status,entry_group_id,gross_amount_cents,(SELECT COUNT(*) FROM entry_settlements WHERE entry_id=e.id),reversed_at,origin_type FROM financial_entries e WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?)),
        )
        .optional()?
        .ok_or_else(|| FinanceError::Validation("Movimentação não encontrada.".into()))?;
    if !["DRAFT", "PENDING"].contains(&status.as_str())
        || settlement_count > 0
        || reversed.is_some()
        || origin_type == "SALE"
    {
        return Err(FinanceError::Validation(
            "Movimentações usadas ou liquidadas não podem ser editadas.".into(),
        ));
    }
    if current_type != input.entry_type
        || (group_id.is_some() && current_gross != input.gross_amount_cents)
    {
        return Err(FinanceError::Validation(
            "O tipo e o valor de uma parcela agrupada não podem ser alterados.".into(),
        ));
    }
    let (direction, result_multiplier) = direction_and_result(&input.entry_type).unwrap();
    let competence = input
        .competence_date
        .as_deref()
        .unwrap_or(&input.issue_date);
    let changed = connection.execute(
        &format!("UPDATE financial_entries SET direction=?2,result_multiplier=?3,origin_type=?4,origin_id=?5,contact_id=?6,category_id=?7,financial_account_id=?8,payment_method_id=?9,description=?10,document_reference=?11,issue_date=?12,competence_date=?13,due_date=?14,gross_amount_cents=?15,net_amount_cents=?15,status=?16,notes=?17,updated_by=?18,updated_at={NOW} WHERE id=?1"),
        params![id,direction,result_multiplier,input.origin_type.trim(),optional(&input.origin_id),optional(&input.contact_id),optional(&input.category_id),optional(&input.financial_account_id),optional(&input.payment_method_id),input.description.trim(),optional(&input.document_reference),input.issue_date,competence,optional(&input.due_date),input.gross_amount_cents,input.status,optional(&input.notes),actor(connection)?],
    )?;
    if changed == 0 {
        return Err(FinanceError::Validation(
            "Movimentação não encontrada.".into(),
        ));
    }
    audit(
        connection,
        "financial_entry",
        id,
        "UPDATE",
        "Movimentação atualizada",
    )?;
    Ok(SaveEntriesResult {
        entry_ids: vec![id.to_owned()],
        group_id,
        recurrence_id: None,
    })
}

fn split_installment_amounts(total_cents: i64, count: i64) -> Result<Vec<i64>, FinanceError> {
    if total_cents <= 0 || !(1..=120).contains(&count) || total_cents < count {
        return Err(FinanceError::Validation(
            "O total deve permitir parcelas de pelo menos um centavo.".into(),
        ));
    }
    let base = total_cents / count;
    let remainder = total_cents % count;
    Ok((0..count)
        .map(|index| base + if index == count - 1 { remainder } else { 0 })
        .collect())
}

fn create_entries_in_connection(
    connection: &Connection,
    input: &EntryInput,
) -> Result<SaveEntriesResult, FinanceError> {
    validate_entry(connection, input)?;
    let tx = connection.unchecked_transaction()?;
    consume_trial(&tx)?;
    let mut group_id = None;
    let mut recurrence_id = None;
    if input.installment_count > 1 {
        group_id = Some(insert_group(&tx, "INSTALLMENT", &input.description)?);
    } else if let Some(recurrence) = &input.recurrence {
        let created_group = insert_group(&tx, "RECURRENCE", &input.description)?;
        let created_recurrence = Uuid::new_v4().to_string();
        let start = date(&recurrence.start_date, "uma data inicial")?;
        let next = next_recurrence_date(start, &recurrence.frequency, recurrence.interval_value)?;
        let recurrence_finished = recurrence.maximum_occurrences == Some(1)
            || recurrence
                .end_date
                .as_deref()
                .map(|value| date(value, "uma data final"))
                .transpose()?
                .is_some_and(|end| next > end);
        let mut template = input.clone();
        template.id = None;
        template.recurrence = None;
        template.installment_count = 1;
        template.installment_due_dates.clear();
        template.status = "PENDING".into();
        tx.execute(
            &format!("INSERT INTO recurrences(id,entry_group_id,entry_template,frequency,interval_value,start_date,end_date,next_generation_date,maximum_occurrences,generated_occurrences,is_active,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?11,?11,{NOW},{NOW})"),
            params![created_recurrence,created_group,serde_json::to_string(&template)?,recurrence.frequency,recurrence.interval_value,recurrence.start_date,optional(&recurrence.end_date),if recurrence_finished { None } else { Some(next.format("%Y-%m-%d").to_string()) },recurrence.maximum_occurrences,!recurrence_finished,actor(&tx)?],
        )?;
        group_id = Some(created_group);
        recurrence_id = Some(created_recurrence);
    }
    let installment_amounts =
        split_installment_amounts(input.gross_amount_cents, input.installment_count)?;
    let mut ids = Vec::new();
    for (index, amount) in installment_amounts.into_iter().enumerate() {
        let id = Uuid::new_v4().to_string();
        let due = if input.installment_count > 1 {
            input.installment_due_dates.get(index).map(String::as_str)
        } else {
            input.due_date.as_deref()
        };
        insert_entry(
            &tx,
            InsertEntry {
                id: &id,
                group_id: group_id.as_deref(),
                recurrence_id: recurrence_id.as_deref(),
                input,
                amount_cents: amount,
                due_date: due,
                installment_number: index as i64 + 1,
                installment_count: input.installment_count,
            },
        )?;
        ids.push(id);
    }
    if input.status == "SETTLED" {
        settle_in_connection(
            &tx,
            &SettlementInput {
                entry_id: ids[0].clone(),
                settlement_date: input.issue_date.clone(),
                financial_account_id: input.financial_account_id.clone().unwrap(),
                payment_method_id: input.payment_method_id.clone().unwrap(),
                amount_cents: input.gross_amount_cents,
                discount_amount_cents: 0,
                fee_amount_cents: 0,
                interest_amount_cents: 0,
                penalty_amount_cents: 0,
                notes: input.notes.clone(),
            },
        )?;
    }
    if let Some(group) = &group_id {
        audit(
            &tx,
            "entry_group",
            group,
            "CREATE",
            if input.installment_count > 1 {
                "Parcelamento criado"
            } else {
                "Recorrência criada"
            },
        )?;
    }
    tx.commit()?;
    Ok(SaveEntriesResult {
        entry_ids: ids,
        group_id,
        recurrence_id,
    })
}

pub fn save_entry(app: &AppHandle, input: EntryInput) -> Result<SaveEntriesResult, FinanceError> {
    let connection = database::connection(app)?;
    if input.id.is_some() {
        let tx = connection.unchecked_transaction()?;
        let result = update_entry_in_connection(&tx, &input)?;
        tx.commit()?;
        Ok(result)
    } else {
        create_entries_in_connection(&connection, &input)
    }
}

pub fn settle_entry(
    app: &AppHandle,
    input: SettlementInput,
) -> Result<SettlementResult, FinanceError> {
    let connection = database::connection(app)?;
    let tx = connection.unchecked_transaction()?;
    let result = settle_in_connection(&tx, &input)?;
    tx.commit()?;
    Ok(result)
}

fn create_transfer_in_connection(
    connection: &Connection,
    input: &TransferInput,
) -> Result<SaveEntriesResult, FinanceError> {
    if input.description.trim().chars().count() < 2
        || input.amount_cents <= 0
        || input.source_account_id == input.destination_account_id
    {
        return Err(FinanceError::Validation(
            "Informe descrição, valor e duas contas diferentes.".into(),
        ));
    }
    date(&input.date, "uma data de transferência")?;
    for account in [&input.source_account_id, &input.destination_account_id] {
        if !active_exists(connection, "financial_accounts", account)? {
            return Err(FinanceError::Validation(
                "As contas da transferência devem estar ativas.".into(),
            ));
        }
    }
    if !active_exists(connection, "payment_methods", &input.payment_method_id)? {
        return Err(FinanceError::Validation(
            "Forma de pagamento inválida ou inativa.".into(),
        ));
    }
    let tx = connection.unchecked_transaction()?;
    consume_trial(&tx)?;
    let group_id = insert_group(&tx, "TRANSFER", &input.description)?;
    let actor_id = actor(&tx)?;
    let mut ids = Vec::new();
    for (entry_type, direction, account_id) in [
        ("TRANSFER_OUT", "OUT", &input.source_account_id),
        ("TRANSFER_IN", "IN", &input.destination_account_id),
    ] {
        let id = Uuid::new_v4().to_string();
        tx.execute(
            &format!("INSERT INTO financial_entries(id,entry_group_id,entry_type,direction,result_multiplier,origin_type,financial_account_id,payment_method_id,description,document_reference,issue_date,competence_date,due_date,settlement_date,gross_amount_cents,net_amount_cents,status,notes,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,0,'MANUAL',?5,?6,?7,?8,?9,?9,?9,?9,?10,?10,'SETTLED',?11,?12,?12,{NOW},{NOW})"),
            params![id,group_id,entry_type,direction,account_id,input.payment_method_id,input.description.trim(),optional(&input.document_reference),input.date,input.amount_cents,optional(&input.notes),actor_id],
        )?;
        tx.execute(
            &format!("INSERT INTO entry_settlements(id,entry_id,financial_account_id,payment_method_id,settlement_date,principal_amount_cents,net_amount_cents,notes,created_by,created_at) VALUES(?1,?2,?3,?4,?5,?6,?6,?7,?8,{NOW})"),
            params![Uuid::new_v4().to_string(),id,account_id,input.payment_method_id,input.date,input.amount_cents,optional(&input.notes),actor_id],
        )?;
        audit(
            &tx,
            "financial_entry",
            &id,
            "CREATE",
            "Ponta da transferência criada e liquidada",
        )?;
        ids.push(id);
    }
    audit(
        &tx,
        "entry_group",
        &group_id,
        "TRANSFER",
        "Transferência entre contas registrada",
    )?;
    tx.commit()?;
    Ok(SaveEntriesResult {
        entry_ids: ids,
        group_id: Some(group_id),
        recurrence_id: None,
    })
}

pub fn create_transfer(
    app: &AppHandle,
    input: TransferInput,
) -> Result<SaveEntriesResult, FinanceError> {
    let connection = database::connection(app)?;
    create_transfer_in_connection(&connection, &input)
}

fn entry_summary(row: &Row<'_>) -> rusqlite::Result<EntrySummary> {
    let gross_amount_cents: i64 = row.get(20)?;
    let settled_principal_cents: i64 = row.get(31)?;
    let display_status: String = row.get(32)?;
    let remaining_amount_cents =
        if ["SETTLED", "CANCELED", "REVERSED"].contains(&display_status.as_str()) {
            0
        } else {
            (gross_amount_cents - settled_principal_cents).max(0)
        };
    Ok(EntrySummary {
        id: row.get(0)?,
        entry_group_id: row.get(1)?,
        entry_type: row.get(2)?,
        direction: row.get(3)?,
        origin_type: row.get(4)?,
        origin_id: row.get(5)?,
        contact_id: row.get(6)?,
        contact_name: row.get(7)?,
        category_id: row.get(8)?,
        category_name: row.get(9)?,
        financial_account_id: row.get(10)?,
        financial_account_name: row.get(11)?,
        payment_method_id: row.get(12)?,
        payment_method_name: row.get(13)?,
        description: row.get(14)?,
        document_reference: row.get(15)?,
        issue_date: row.get(16)?,
        competence_date: row.get(17)?,
        due_date: row.get(18)?,
        settlement_date: row.get(19)?,
        gross_amount_cents,
        net_amount_cents: row.get(21)?,
        installment_number: row.get(22)?,
        installment_count: row.get(23)?,
        persisted_status: row.get(24)?,
        is_recurring: row.get(25)?,
        recurrence_id: row.get(26)?,
        notes: row.get(27)?,
        cancel_reason: row.get(28)?,
        reversed_at: row.get(29)?,
        reversal_reason: row.get(30)?,
        settled_principal_cents,
        remaining_amount_cents,
        display_status,
    })
}

fn normalize_list_query(query: &EntryListQuery) -> Result<(), FinanceError> {
    if !(1..=100).contains(&query.limit)
        || query.offset < 0
        || query.minimum_amount_cents.is_some_and(|value| value < 0)
        || query.maximum_amount_cents.is_some_and(|value| value < 0)
        || query
            .minimum_amount_cents
            .zip(query.maximum_amount_cents)
            .is_some_and(|(minimum, maximum)| minimum > maximum)
    {
        return Err(FinanceError::Validation("Filtros inválidos.".into()));
    }
    if let Some(value) = query.start_date.as_deref() {
        date(value, "uma data inicial")?;
    }
    if let Some(value) = query.end_date.as_deref() {
        date(value, "uma data final")?;
    }
    Ok(())
}

fn list_entries_in_connection(
    connection: &Connection,
    query: &EntryListQuery,
) -> Result<Page<EntrySummary>, FinanceError> {
    normalize_list_query(query)?;
    let display_status = "CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' WHEN e.status='CANCELED' THEN 'CANCELED' WHEN e.status='SETTLED' THEN 'SETTLED' WHEN e.status='DRAFT' THEN 'DRAFT' WHEN e.due_date<date('now','localtime') THEN 'OVERDUE' WHEN COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)>0 THEN 'PARTIAL' ELSE 'PENDING' END";
    let where_sql = format!(
        "e.deleted_at IS NULL
         AND (?1='' OR e.issue_date>=?1)
         AND (?2='' OR e.issue_date<=?2)
         AND (?3='' OR e.category_id=?3)
         AND (?4='' OR e.financial_account_id=?4 OR EXISTS(SELECT 1 FROM entry_settlements sx WHERE sx.entry_id=e.id AND sx.financial_account_id=?4))
         AND (?5='' OR e.payment_method_id=?5 OR EXISTS(SELECT 1 FROM entry_settlements sx WHERE sx.entry_id=e.id AND sx.payment_method_id=?5))
         AND (?6='' OR e.contact_id=?6)
         AND (?7 IS NULL OR e.gross_amount_cents>=?7)
         AND (?8 IS NULL OR e.gross_amount_cents<=?8)
         AND (?9='' OR e.description LIKE '%'||?9||'%' COLLATE NOCASE OR COALESCE(e.document_reference,'') LIKE '%'||?9||'%' COLLATE NOCASE OR COALESCE(ct.name,'') LIKE '%'||?9||'%' COLLATE NOCASE)
         AND (?10='' OR e.origin_type=?10)
         AND (?11='ALL' OR (?11='REVENUE' AND e.entry_type='REVENUE') OR (?11='EXPENSE' AND e.entry_type='EXPENSE') OR (?11='TRANSFER' AND e.entry_type IN ('TRANSFER_IN','TRANSFER_OUT')) OR (?11='OWNER' AND e.entry_type IN ('OWNER_CONTRIBUTION','OWNER_WITHDRAWAL')) OR (?11='CANCELED' AND e.status='CANCELED'))
         AND (?12='ALL' OR {display_status}=?12)"
    );
    let start = query.start_date.as_deref().unwrap_or("");
    let end = query.end_date.as_deref().unwrap_or("");
    let category = query.category_id.as_deref().unwrap_or("");
    let account = query.financial_account_id.as_deref().unwrap_or("");
    let payment = query.payment_method_id.as_deref().unwrap_or("");
    let contact = query.contact_id.as_deref().unwrap_or("");
    let origin = query.origin_type.trim();
    let tab = if query.tab.is_empty() {
        "ALL"
    } else {
        query.tab.as_str()
    };
    let status = if query.status.is_empty() {
        "ALL"
    } else {
        query.status.as_str()
    };
    let total = connection.query_row(
        &format!("SELECT COUNT(*) FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id WHERE {where_sql}"),
        params![start,end,category,account,payment,contact,query.minimum_amount_cents,query.maximum_amount_cents,query.search.trim(),origin,tab,status],
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(&format!(
        "{SUMMARY_SELECT} WHERE {where_sql} ORDER BY e.issue_date DESC,e.created_at DESC LIMIT ?13 OFFSET ?14"
    ))?;
    let items = statement
        .query_map(
            params![
                start,
                end,
                category,
                account,
                payment,
                contact,
                query.minimum_amount_cents,
                query.maximum_amount_cents,
                query.search.trim(),
                origin,
                tab,
                status,
                query.limit,
                query.offset
            ],
            entry_summary,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Page { items, total })
}

pub fn list_entries(
    app: &AppHandle,
    query: EntryListQuery,
) -> Result<Page<EntrySummary>, FinanceError> {
    let connection = database::connection(app)?;
    let _ = generate_recurrences_in_connection(&connection, &today(&connection)?)?;
    list_entries_in_connection(&connection, &query)
}

fn entry_by_id(connection: &Connection, id: &str) -> Result<EntrySummary, FinanceError> {
    connection
        .query_row(
            &format!("{SUMMARY_SELECT} WHERE e.id=?1 AND e.deleted_at IS NULL"),
            [id],
            entry_summary,
        )
        .optional()?
        .ok_or_else(|| FinanceError::Validation("Movimentação não encontrada.".into()))
}

pub fn get_entry(app: &AppHandle, id: &str) -> Result<EntryDetail, FinanceError> {
    let connection = database::connection(app)?;
    get_entry_in_connection(&connection, id)
}

fn get_entry_in_connection(connection: &Connection, id: &str) -> Result<EntryDetail, FinanceError> {
    let entry = entry_by_id(connection, id)?;
    let mut settlements_statement = connection.prepare(
        "SELECT s.id,s.settlement_date,s.financial_account_id,a.name,s.payment_method_id,p.name,s.principal_amount_cents,s.discount_amount_cents,s.fee_amount_cents,s.interest_amount_cents,s.penalty_amount_cents,s.net_amount_cents,s.notes,s.created_at FROM entry_settlements s JOIN financial_accounts a ON a.id=s.financial_account_id JOIN payment_methods p ON p.id=s.payment_method_id WHERE s.entry_id=?1 ORDER BY s.settlement_date,s.created_at",
    )?;
    let settlements = settlements_statement
        .query_map([id], |row| {
            Ok(SettlementItem {
                id: row.get(0)?,
                settlement_date: row.get(1)?,
                financial_account_id: row.get(2)?,
                financial_account_name: row.get(3)?,
                payment_method_id: row.get(4)?,
                payment_method_name: row.get(5)?,
                principal_amount_cents: row.get(6)?,
                discount_amount_cents: row.get(7)?,
                fee_amount_cents: row.get(8)?,
                interest_amount_cents: row.get(9)?,
                penalty_amount_cents: row.get(10)?,
                net_amount_cents: row.get(11)?,
                notes: row.get(12)?,
                created_at: row.get(13)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut history_statement = connection.prepare("SELECT action,summary,created_at FROM audit_logs WHERE entity_type='financial_entry' AND entity_id=?1 ORDER BY created_at DESC")?;
    let history = history_statement
        .query_map([id], |row| {
            Ok(HistoryItem {
                action: row.get(0)?,
                summary: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(EntryDetail {
        entry,
        settlements,
        history,
    })
}

fn cancel_entry_in_connection(
    connection: &Connection,
    id: &str,
    reason: &str,
) -> Result<(), FinanceError> {
    if reason.trim().chars().count() < 3 {
        return Err(FinanceError::Validation(
            "Informe o motivo do cancelamento.".into(),
        ));
    }
    let (status, settled, reversed, origin_type, origin_id): (
        String,
        i64,
        Option<String>,
        String,
        Option<String>,
    ) = connection
        .query_row(
            "SELECT status,(SELECT COUNT(*) FROM entry_settlements WHERE entry_id=e.id),reversed_at,origin_type,origin_id FROM financial_entries e WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .optional()?
        .ok_or_else(|| FinanceError::Validation("Movimentação não encontrada.".into()))?;
    if origin_type == "SALE" {
        return Err(FinanceError::Validation(
            "Cancele a venda de origem para preservar todas as parcelas vinculadas.".into(),
        ));
    }
    if !["DRAFT", "PENDING"].contains(&status.as_str()) || settled > 0 || reversed.is_some() {
        return Err(FinanceError::Validation(
            "Movimentações com liquidação devem ser estornadas, não canceladas.".into(),
        ));
    }
    connection.execute(
        &format!("UPDATE financial_entries SET status='CANCELED',cancel_reason=?2,updated_by=?3,updated_at={NOW} WHERE id=?1"),
        params![id, reason.trim(), actor(connection)?],
    )?;
    audit(
        connection,
        "financial_entry",
        id,
        "CANCEL",
        "Movimentação pendente cancelada",
    )?;
    if origin_type == "SALE" {
        if let Some(sale_id) = origin_id.as_deref() {
            sync_sale_status(connection, sale_id)?;
        }
    }
    Ok(())
}

pub fn cancel_entry(app: &AppHandle, id: &str, reason: &str) -> Result<(), FinanceError> {
    let connection = database::connection(app)?;
    let tx = connection.unchecked_transaction()?;
    cancel_entry_in_connection(&tx, id, reason)?;
    tx.commit()?;
    Ok(())
}

pub fn reschedule_entry(app: &AppHandle, id: &str, due_date: &str) -> Result<(), FinanceError> {
    date(due_date, "uma data de vencimento")?;
    let connection = database::connection(app)?;
    let tx = connection.unchecked_transaction()?;
    let changed = tx.execute(
        &format!("UPDATE financial_entries SET due_date=?2,updated_by=?3,updated_at={NOW} WHERE id=?1 AND status='PENDING' AND reversed_at IS NULL AND deleted_at IS NULL"),
        params![id, due_date, actor(&tx)?],
    )?;
    if changed == 0 {
        return Err(FinanceError::Validation(
            "Somente movimentações pendentes podem ser reagendadas.".into(),
        ));
    }
    audit(
        &tx,
        "financial_entry",
        id,
        "RESCHEDULE",
        "Vencimento reagendado",
    )?;
    tx.commit()?;
    Ok(())
}

#[derive(Debug)]
struct ReverseSource {
    id: String,
    direction: String,
    result_multiplier: i64,
    contact_id: Option<String>,
    category_id: Option<String>,
    description: String,
    status: String,
    reversed_at: Option<String>,
    origin_type: String,
    origin_id: Option<String>,
}

fn reverse_sources(connection: &Connection, id: &str) -> Result<Vec<ReverseSource>, FinanceError> {
    let (group_id, entry_type): (Option<String>, String) = connection
        .query_row(
            "SELECT entry_group_id,entry_type FROM financial_entries WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| FinanceError::Validation("Movimentação não encontrada.".into()))?;
    if entry_type == "REVERSAL" {
        return Err(FinanceError::Validation(
            "Um estorno não pode ser estornado.".into(),
        ));
    }
    let (sql, parameter) = if entry_type.starts_with("TRANSFER_") {
        (
            "SELECT id,direction,result_multiplier,contact_id,category_id,description,status,reversed_at,origin_type,origin_id FROM financial_entries WHERE entry_group_id=?1 AND entry_type IN ('TRANSFER_IN','TRANSFER_OUT') ORDER BY entry_type",
            group_id.ok_or_else(|| FinanceError::Validation("Transferência sem vínculo.".into()))?,
        )
    } else {
        (
            "SELECT id,direction,result_multiplier,contact_id,category_id,description,status,reversed_at,origin_type,origin_id FROM financial_entries WHERE id=?1",
            id.to_owned(),
        )
    };
    let mut statement = connection.prepare(sql)?;
    let sources = statement
        .query_map([parameter], |row| {
            Ok(ReverseSource {
                id: row.get(0)?,
                direction: row.get(1)?,
                result_multiplier: row.get(2)?,
                contact_id: row.get(3)?,
                category_id: row.get(4)?,
                description: row.get(5)?,
                status: row.get(6)?,
                reversed_at: row.get(7)?,
                origin_type: row.get(8)?,
                origin_id: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(sources)
}

pub(crate) fn reverse_entry_in_connection(
    connection: &Connection,
    id: &str,
    reversal_date: &str,
    reason: &str,
) -> Result<SaveEntriesResult, FinanceError> {
    date(reversal_date, "uma data de estorno")?;
    if reason.trim().chars().count() < 3 {
        return Err(FinanceError::Validation(
            "Informe o motivo do estorno.".into(),
        ));
    }
    let sources = reverse_sources(connection, id)?;
    if sources.is_empty() {
        return Err(FinanceError::Validation(
            "Movimentação não encontrada.".into(),
        ));
    }
    for source in &sources {
        let settlement_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM entry_settlements WHERE entry_id=?1",
            [&source.id],
            |row| row.get(0),
        )?;
        if settlement_count == 0 || source.reversed_at.is_some() || source.status == "CANCELED" {
            return Err(FinanceError::Validation(
                "A movimentação não possui liquidação estornável ou já foi estornada.".into(),
            ));
        }
    }
    let group_id = insert_group(connection, "REVERSAL", reason)?;
    let actor_id = actor(connection)?;
    let mut reversal_ids = Vec::new();
    for source in &sources {
        let settlements = {
            let mut statement = connection.prepare("SELECT financial_account_id,payment_method_id,principal_amount_cents,net_amount_cents FROM entry_settlements WHERE entry_id=?1 ORDER BY settlement_date,created_at")?;
            let rows = statement
                .query_map([&source.id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        let principal_total: i64 = settlements.iter().map(|value| value.2).sum();
        let net_total: i64 = settlements.iter().map(|value| value.3).sum();
        let reversal_id = Uuid::new_v4().to_string();
        let opposite = if source.direction == "IN" {
            "OUT"
        } else {
            "IN"
        };
        connection.execute(
            &format!("INSERT INTO financial_entries(id,entry_group_id,entry_type,direction,result_multiplier,origin_type,origin_id,contact_id,category_id,description,issue_date,competence_date,due_date,settlement_date,gross_amount_cents,net_amount_cents,status,notes,reversed_entry_id,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,'REVERSAL',?3,?4,'REVERSAL',?5,?6,?7,?8,?9,?9,?9,?9,?10,?11,'SETTLED',?12,?5,?13,?13,{NOW},{NOW})"),
            params![reversal_id,group_id,opposite,-source.result_multiplier,source.id,source.contact_id,source.category_id,format!("Estorno: {}",source.description),reversal_date,principal_total,net_total,reason.trim(),actor_id],
        )?;
        for (account_id, payment_id, principal, net) in settlements {
            connection.execute(
                &format!("INSERT INTO entry_settlements(id,entry_id,financial_account_id,payment_method_id,settlement_date,principal_amount_cents,net_amount_cents,notes,created_by,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,{NOW})"),
                params![Uuid::new_v4().to_string(),reversal_id,account_id,payment_id,reversal_date,principal,net,reason.trim(),actor_id],
            )?;
        }
        connection.execute(
            &format!("UPDATE financial_entries SET status='SETTLED',net_amount_cents=?2,reversed_at={NOW},reversal_reason=?3,updated_by=?4,updated_at={NOW} WHERE id=?1"),
            params![source.id, net_total, reason.trim(), actor_id],
        )?;
        audit(
            connection,
            "financial_entry",
            &source.id,
            "REVERSE",
            "Movimentação estornada sem exclusão do histórico",
        )?;
        audit(
            connection,
            "financial_entry",
            &reversal_id,
            "CREATE_REVERSAL",
            "Lançamento de estorno criado",
        )?;
        if source.origin_type == "SALE" {
            if let Some(sale_id) = source.origin_id.as_deref() {
                sync_sale_status(connection, sale_id)?;
            }
        }
        reversal_ids.push(reversal_id);
    }
    audit(
        connection,
        "entry_group",
        &group_id,
        "REVERSE",
        "Grupo de estorno criado",
    )?;
    Ok(SaveEntriesResult {
        entry_ids: reversal_ids,
        group_id: Some(group_id),
        recurrence_id: None,
    })
}

pub fn reverse_entry(
    app: &AppHandle,
    id: &str,
    reversal_date: &str,
    reason: &str,
) -> Result<SaveEntriesResult, FinanceError> {
    let connection = database::connection(app)?;
    let tx = connection.unchecked_transaction()?;
    let result = reverse_entry_in_connection(&tx, id, reversal_date, reason)?;
    tx.commit()?;
    Ok(result)
}

fn today(connection: &Connection) -> Result<String, FinanceError> {
    Ok(connection.query_row("SELECT date('now','localtime')", [], |row| row.get(0))?)
}

fn shift_recurrence_iso(
    value: &str,
    frequency: &str,
    interval: i64,
    occurrence_index: i64,
) -> Result<String, FinanceError> {
    let cumulative_interval = interval.checked_mul(occurrence_index).ok_or_else(|| {
        FinanceError::Validation("Intervalo de recorrência fora do limite.".into())
    })?;
    Ok(next_recurrence_date(
        date(value, "uma data do modelo")?,
        frequency,
        cumulative_interval,
    )?
    .format("%Y-%m-%d")
    .to_string())
}

#[derive(Debug)]
struct DueRecurrence {
    id: String,
    group_id: String,
    template: String,
    frequency: String,
    interval_value: i64,
    start_date: String,
    end_date: Option<String>,
    next_generation_date: String,
    maximum_occurrences: Option<i64>,
    generated_occurrences: i64,
}

fn generate_recurrences_in_connection(
    connection: &Connection,
    through_date: &str,
) -> Result<usize, FinanceError> {
    let through = date(through_date, "uma data limite")?;
    let due = {
        let mut statement = connection.prepare("SELECT id,entry_group_id,entry_template,frequency,interval_value,start_date,end_date,next_generation_date,maximum_occurrences,generated_occurrences FROM recurrences WHERE is_active=1 AND next_generation_date IS NOT NULL AND next_generation_date<=?1 ORDER BY next_generation_date")?;
        let rows = statement
            .query_map([through_date], |row| {
                Ok(DueRecurrence {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    template: row.get(2)?,
                    frequency: row.get(3)?,
                    interval_value: row.get(4)?,
                    start_date: row.get(5)?,
                    end_date: row.get(6)?,
                    next_generation_date: row.get(7)?,
                    maximum_occurrences: row.get(8)?,
                    generated_occurrences: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    if due.is_empty() {
        return Ok(0);
    }
    let tx = connection.unchecked_transaction()?;
    let actor_id = actor(&tx)?;
    let mut total_generated = 0;
    for recurrence in due {
        let start = date(&recurrence.start_date, "uma data inicial")?;
        let end = recurrence
            .end_date
            .as_deref()
            .map(|value| date(value, "uma data final"))
            .transpose()?;
        let mut next = date(&recurrence.next_generation_date, "uma próxima data")?;
        let mut generated = recurrence.generated_occurrences;
        while next <= through {
            if recurrence
                .maximum_occurrences
                .is_some_and(|maximum| generated >= maximum)
                || end.is_some_and(|value| next > value)
            {
                tx.execute(
                    &format!("UPDATE recurrences SET is_active=0,next_generation_date=NULL,updated_by=?2,updated_at={NOW} WHERE id=?1"),
                    params![recurrence.id, actor_id],
                )?;
                break;
            }
            let mut input: EntryInput = serde_json::from_str(&recurrence.template)?;
            input.id = None;
            input.issue_date = shift_recurrence_iso(
                &input.issue_date,
                &recurrence.frequency,
                recurrence.interval_value,
                generated,
            )?;
            input.competence_date = input
                .competence_date
                .as_deref()
                .map(|value| {
                    shift_recurrence_iso(
                        value,
                        &recurrence.frequency,
                        recurrence.interval_value,
                        generated,
                    )
                })
                .transpose()?;
            input.due_date = input
                .due_date
                .as_deref()
                .map(|value| {
                    shift_recurrence_iso(
                        value,
                        &recurrence.frequency,
                        recurrence.interval_value,
                        generated,
                    )
                })
                .transpose()?;
            if validate_entry(&tx, &input).is_err() {
                tx.execute(
                    &format!("UPDATE recurrences SET is_active=0,next_generation_date=NULL,updated_by=?2,updated_at={NOW} WHERE id=?1"),
                    params![recurrence.id, actor_id],
                )?;
                audit(
                    &tx,
                    "recurrence",
                    &recurrence.id,
                    "PAUSE_INVALID_TEMPLATE",
                    "Recorrência pausada porque seu modelo deixou de ser válido",
                )?;
                break;
            }
            if !trial_allows(&tx)? {
                tx.commit()?;
                return Ok(total_generated);
            }
            consume_trial(&tx)?;
            let id = Uuid::new_v4().to_string();
            insert_entry(
                &tx,
                InsertEntry {
                    id: &id,
                    group_id: Some(&recurrence.group_id),
                    recurrence_id: Some(&recurrence.id),
                    amount_cents: input.gross_amount_cents,
                    due_date: input.due_date.as_deref(),
                    installment_number: 1,
                    installment_count: 1,
                    input: &input,
                },
            )?;
            generated += 1;
            total_generated += 1;
            next = next_recurrence_date(
                start,
                &recurrence.frequency,
                recurrence
                    .interval_value
                    .checked_mul(generated)
                    .ok_or_else(|| {
                        FinanceError::Validation("Intervalo de recorrência fora do limite.".into())
                    })?,
            )?;
            let finished = recurrence
                .maximum_occurrences
                .is_some_and(|maximum| generated >= maximum)
                || end.is_some_and(|value| next > value);
            tx.execute(
                &format!("UPDATE recurrences SET generated_occurrences=?2,next_generation_date=?3,is_active=?4,updated_by=?5,updated_at={NOW} WHERE id=?1"),
                params![recurrence.id,generated,if finished { None } else { Some(next.format("%Y-%m-%d").to_string()) },!finished,actor_id],
            )?;
            audit(
                &tx,
                "recurrence",
                &recurrence.id,
                "GENERATE",
                "Ocorrência recorrente gerada",
            )?;
            if finished {
                break;
            }
        }
    }
    tx.commit()?;
    Ok(total_generated)
}

pub fn generate_recurrences(app: &AppHandle, through_date: &str) -> Result<usize, FinanceError> {
    let connection = database::connection(app)?;
    generate_recurrences_in_connection(&connection, through_date)
}

pub fn list_recurrences(app: &AppHandle) -> Result<Vec<RecurrenceSummary>, FinanceError> {
    let connection = database::connection(app)?;
    let _ = generate_recurrences_in_connection(&connection, &today(&connection)?)?;
    let mut statement = connection.prepare("SELECT id,COALESCE(json_extract(entry_template,'$.description'),'Recorrência'),frequency,interval_value,start_date,end_date,next_generation_date,maximum_occurrences,generated_occurrences,is_active FROM recurrences ORDER BY is_active DESC,next_generation_date,created_at DESC")?;
    let recurrences = statement
        .query_map([], |row| {
            Ok(RecurrenceSummary {
                id: row.get(0)?,
                description: row.get(1)?,
                frequency: row.get(2)?,
                interval_value: row.get(3)?,
                start_date: row.get(4)?,
                end_date: row.get(5)?,
                next_generation_date: row.get(6)?,
                maximum_occurrences: row.get(7)?,
                generated_occurrences: row.get(8)?,
                is_active: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(recurrences)
}

pub fn set_recurrence_active(app: &AppHandle, id: &str, active: bool) -> Result<(), FinanceError> {
    let connection = database::connection(app)?;
    let tx = connection.unchecked_transaction()?;
    if active {
        let resumable: bool = tx
            .query_row(
                "SELECT next_generation_date IS NOT NULL AND (maximum_occurrences IS NULL OR generated_occurrences<maximum_occurrences) FROM recurrences WHERE id=?1",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| FinanceError::Validation("Recorrência não encontrada.".into()))?;
        if !resumable {
            return Err(FinanceError::Validation(
                "A recorrência terminou e não pode ser reativada.".into(),
            ));
        }
    }
    let changed = tx.execute(
        &format!("UPDATE recurrences SET is_active=?2,updated_by=?3,updated_at={NOW} WHERE id=?1"),
        params![id, active, actor(&tx)?],
    )?;
    if changed == 0 {
        return Err(FinanceError::Validation(
            "Recorrência não encontrada.".into(),
        ));
    }
    audit(
        &tx,
        "recurrence",
        id,
        if active { "ACTIVATE" } else { "DEACTIVATE" },
        if active {
            "Recorrência reativada"
        } else {
            "Recorrência pausada"
        },
    )?;
    tx.commit()?;
    Ok(())
}

fn option_rows(connection: &Connection, sql: &str) -> Result<Vec<FinanceOption>, FinanceError> {
    let mut statement = connection.prepare(sql)?;
    let options = statement
        .query_map([], |row| {
            Ok(FinanceOption {
                id: row.get(0)?,
                name: row.get(1)?,
                detail: row.get(2)?,
                current_balance_cents: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(options)
}

pub fn finance_options(app: &AppHandle) -> Result<FinanceOptions, FinanceError> {
    let connection = database::connection(app)?;
    finance_options_in_connection(&connection)
}

fn finance_options_in_connection(connection: &Connection) -> Result<FinanceOptions, FinanceError> {
    let (business_name, default_account, default_payment, regime):
        (String, Option<String>, Option<String>, String) = connection
        .query_row("SELECT COALESCE(b.trade_name,b.legal_name),p.default_financial_account_id,p.default_payment_method_id,p.default_view_regime FROM business_profile b JOIN app_preferences p ON p.business_id=b.id LIMIT 1",[],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)))
        .optional()?
        .ok_or_else(|| FinanceError::Validation("Conclua a configuração inicial.".into()))?;
    let contacts = option_rows(connection, "SELECT id,name,CASE WHEN role_customer=1 AND role_supplier=1 THEN 'BOTH' WHEN role_supplier=1 THEN 'SUPPLIER' ELSE 'CUSTOMER' END,NULL FROM contacts WHERE is_active=1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE")?;
    let categories = option_rows(connection, "SELECT id,name,nature,NULL FROM categories WHERE is_active=1 AND deleted_at IS NULL ORDER BY nature,name COLLATE NOCASE")?;
    let accounts = option_rows(connection, "SELECT a.id,a.name,a.account_type,CASE WHEN a.opening_balance_date<=date('now','localtime') THEN a.opening_balance_cents ELSE 0 END+COALESCE((SELECT SUM(CASE e.direction WHEN 'IN' THEN s.net_amount_cents ELSE -s.net_amount_cents END) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE s.financial_account_id=a.id AND s.settlement_date<=date('now','localtime')),0) FROM financial_accounts a WHERE a.is_active=1 AND a.deleted_at IS NULL ORDER BY a.is_default DESC,a.name COLLATE NOCASE")?;
    let payment_methods = option_rows(connection, "SELECT id,name,payment_type,NULL FROM payment_methods WHERE is_active=1 ORDER BY is_system DESC,name COLLATE NOCASE")?;
    Ok(FinanceOptions {
        business_name,
        default_financial_account_id: default_account,
        default_payment_method_id: default_payment,
        default_view_regime: regime,
        contacts,
        categories,
        accounts,
        payment_methods,
    })
}

fn obligation_page_in_connection(
    connection: &Connection,
    query: &ObligationQuery,
) -> Result<ObligationPage, FinanceError> {
    if !["RECEIVABLE", "PAYABLE"].contains(&query.kind.as_str())
        || !(1..=100).contains(&query.limit)
        || query.offset < 0
    {
        return Err(FinanceError::Validation("Consulta inválida.".into()));
    }
    let entry_type = if query.kind == "RECEIVABLE" {
        "REVENUE"
    } else {
        "EXPENSE"
    };
    let remaining = "e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)";
    let status = if query.status.is_empty() {
        "ALL"
    } else {
        query.status.as_str()
    };
    if !["ALL", "OVERDUE", "TODAY", "NEXT7", "PARTIAL", "PENDING"].contains(&status) {
        return Err(FinanceError::Validation(
            "Situação da conta inválida.".into(),
        ));
    }
    let start = query.start_date.as_deref().unwrap_or("");
    let end = query.end_date.as_deref().unwrap_or("");
    if !start.is_empty() {
        date(start, "uma data inicial")?;
    }
    if !end.is_empty() {
        date(end, "uma data final")?;
    }
    if !start.is_empty() && !end.is_empty() && end < start {
        return Err(FinanceError::Validation(
            "A data final não pode ser anterior à inicial.".into(),
        ));
    }
    let where_sql = format!(
        "e.deleted_at IS NULL AND e.entry_type=?1 AND e.status='PENDING' AND e.reversed_at IS NULL AND {remaining}>0
         AND (?2='' OR e.due_date>=?2) AND (?3='' OR e.due_date<=?3)
         AND (?4='' OR e.description LIKE '%'||?4||'%' COLLATE NOCASE OR COALESCE(ct.name,'') LIKE '%'||?4||'%' COLLATE NOCASE)
         AND (?5='ALL' OR (?5='OVERDUE' AND e.due_date<date('now','localtime')) OR (?5='TODAY' AND e.due_date=date('now','localtime')) OR (?5='NEXT7' AND e.due_date>date('now','localtime') AND e.due_date<=date('now','localtime','+7 days')) OR (?5='PARTIAL' AND COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)>0) OR (?5='PENDING' AND e.due_date>=date('now','localtime') AND COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)=0))"
    );
    let total = connection.query_row(
        &format!("SELECT COUNT(*) FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id WHERE {where_sql}"),
        params![entry_type,start,end,query.search.trim(),status],
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(&format!(
        "{SUMMARY_SELECT} WHERE {where_sql} ORDER BY e.due_date,e.created_at LIMIT ?6 OFFSET ?7"
    ))?;
    let items = statement
        .query_map(
            params![
                entry_type,
                start,
                end,
                query.search.trim(),
                status,
                query.limit,
                query.offset
            ],
            entry_summary,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let (total_pending_cents, overdue_cents, due_today_cents, next_seven_days_cents):
        (i64, i64, i64, i64) = connection.query_row(
        &format!("SELECT COALESCE(SUM({remaining}),0),COALESCE(SUM(CASE WHEN e.due_date<date('now','localtime') THEN {remaining} ELSE 0 END),0),COALESCE(SUM(CASE WHEN e.due_date=date('now','localtime') THEN {remaining} ELSE 0 END),0),COALESCE(SUM(CASE WHEN e.due_date>date('now','localtime') AND e.due_date<=date('now','localtime','+7 days') THEN {remaining} ELSE 0 END),0) FROM financial_entries e WHERE e.deleted_at IS NULL AND e.entry_type=?1 AND e.status='PENDING' AND e.reversed_at IS NULL"),
        [entry_type],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)),
    )?;
    let settled_this_month_cents = connection.query_row(
        "SELECT COALESCE(SUM(s.net_amount_cents),0) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE e.entry_type=?1 AND e.reversed_at IS NULL AND s.settlement_date>=date('now','start of month','localtime') AND s.settlement_date<date('now','start of month','+1 month','localtime')",
        [entry_type],
        |row| row.get(0),
    )?;
    Ok(ObligationPage {
        items,
        total,
        indicators: ObligationIndicators {
            total_pending_cents,
            overdue_cents,
            due_today_cents,
            next_seven_days_cents,
            settled_this_month_cents,
        },
    })
}

pub fn list_obligations(
    app: &AppHandle,
    query: ObligationQuery,
) -> Result<ObligationPage, FinanceError> {
    let connection = database::connection(app)?;
    let _ = generate_recurrences_in_connection(&connection, &today(&connection)?)?;
    obligation_page_in_connection(&connection, &query)
}

fn cash_flow_in_connection(
    connection: &Connection,
    query: &CashFlowQuery,
) -> Result<CashFlowResult, FinanceError> {
    let start = date(&query.start_date, "uma data inicial")?;
    let end = date(&query.end_date, "uma data final")?;
    if end < start || (end - start).num_days() > 3660 {
        return Err(FinanceError::Validation(
            "O período do fluxo deve ter até dez anos.".into(),
        ));
    }
    if !["CASH", "ACCRUAL"].contains(&query.regime.as_str()) {
        return Err(FinanceError::Validation("Regime inválido.".into()));
    }
    let account = query.financial_account_id.as_deref().unwrap_or("");
    let category = query.category_id.as_deref().unwrap_or("");
    let status = if query.status.is_empty() {
        "ALL"
    } else {
        query.status.as_str()
    };
    if !["ALL", "SETTLED", "PENDING"].contains(&status) {
        return Err(FinanceError::Validation(
            "Situação do fluxo de caixa inválida.".into(),
        ));
    }
    let account_opening: i64 = if category.is_empty() {
        connection.query_row(
            "SELECT COALESCE(SUM(opening_balance_cents),0) FROM financial_accounts WHERE deleted_at IS NULL AND opening_balance_date<=?1 AND (?2='' OR id=?2)",
            params![query.start_date, account],
            |row| row.get(0),
        )?
    } else {
        0
    };
    let prior_movements: i64 = connection.query_row(
        "SELECT COALESCE(SUM(CASE e.direction WHEN 'IN' THEN s.net_amount_cents ELSE -s.net_amount_cents END),0) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE s.settlement_date<?1 AND (?2='' OR s.financial_account_id=?2) AND (?3='' OR e.category_id=?3)",
        params![query.start_date, account, category],
        |row| row.get(0),
    )?;
    let opening_balance_cents = account_opening + prior_movements;
    let opening_events = if category.is_empty() {
        let mut statement = connection.prepare(
            "SELECT opening_balance_date,COALESCE(SUM(opening_balance_cents),0) FROM financial_accounts WHERE deleted_at IS NULL AND opening_balance_date>?1 AND opening_balance_date<=?2 AND (?3='' OR id=?3) GROUP BY opening_balance_date",
        )?;
        let events = statement
            .query_map(params![query.start_date, query.end_date, account], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<HashMap<_, _>, _>>()?;
        events
    } else {
        HashMap::new()
    };
    let rows = {
        let mut statement = connection.prepare("SELECT s.settlement_date,COALESCE(SUM(CASE WHEN e.direction='IN' THEN s.net_amount_cents ELSE 0 END),0),COALESCE(SUM(CASE WHEN e.direction='OUT' THEN s.net_amount_cents ELSE 0 END),0) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE s.settlement_date>=?1 AND s.settlement_date<=?2 AND (?3='' OR s.financial_account_id=?3) AND (?4='' OR e.category_id=?4) AND (?5='ALL' OR e.status=?5) GROUP BY s.settlement_date ORDER BY s.settlement_date")?;
        let values = statement
            .query_map(
                params![query.start_date, query.end_date, account, category, status],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        (row.get::<_, i64>(1)?, row.get::<_, i64>(2)?),
                    ))
                },
            )?
            .collect::<Result<HashMap<_, _>, _>>()?;
        values
    };
    let mut days = Vec::new();
    let mut cursor = start;
    let mut running = opening_balance_cents;
    let mut inflow_cents = 0;
    let mut outflow_cents = 0;
    while cursor <= end {
        let key = cursor.format("%Y-%m-%d").to_string();
        let (inflow, outflow) = rows.get(&key).copied().unwrap_or((0, 0));
        running += opening_events.get(&key).copied().unwrap_or(0);
        let opening = running;
        running += inflow - outflow;
        inflow_cents += inflow;
        outflow_cents += outflow;
        days.push(CashFlowDay {
            date: key,
            opening_balance_cents: opening,
            inflow_cents: inflow,
            outflow_cents: outflow,
            daily_result_cents: inflow - outflow,
            closing_balance_cents: running,
        });
        cursor += Duration::days(1);
    }
    let result_cents: i64 = if query.regime == "CASH" {
        connection.query_row(
            "SELECT COALESCE(SUM(s.net_amount_cents*e.result_multiplier),0) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE s.settlement_date>=?1 AND s.settlement_date<=?2 AND (?3='' OR s.financial_account_id=?3) AND (?4='' OR e.category_id=?4) AND (?5='ALL' OR e.status=?5)",
            params![query.start_date,query.end_date,account,category,status],
            |row| row.get(0),
        )?
    } else {
        connection.query_row(
            "SELECT COALESCE(SUM(e.net_amount_cents*e.result_multiplier),0) FROM financial_entries e WHERE e.deleted_at IS NULL AND e.status NOT IN ('DRAFT','CANCELED') AND e.competence_date>=?1 AND e.competence_date<=?2 AND (?3='' OR e.financial_account_id=?3) AND (?4='' OR e.category_id=?4) AND (?5='ALL' OR e.status=?5)",
            params![query.start_date,query.end_date,account,category,status],
            |row| row.get(0),
        )?
    };
    let (projected_inflow_cents, projected_outflow_cents) = if query.include_pending_projection {
        let projection_until = query
            .projection_until
            .as_deref()
            .ok_or_else(|| FinanceError::Validation("Informe a data final da projeção.".into()))?;
        let projection_date = date(projection_until, "uma data de projeção")?;
        let end_date = date(&query.end_date, "uma data final")?;
        if projection_date < end_date {
            return Err(FinanceError::Validation(
                "A projeção não pode terminar antes do período consultado.".into(),
            ));
        }
        connection.query_row(
            "SELECT COALESCE(SUM(CASE WHEN e.direction='IN' THEN e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0) ELSE 0 END),0),COALESCE(SUM(CASE WHEN e.direction='OUT' THEN e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0) ELSE 0 END),0) FROM financial_entries e WHERE e.deleted_at IS NULL AND e.status='PENDING' AND e.reversed_at IS NULL AND e.due_date<=?1 AND (?2='' OR e.financial_account_id=?2) AND (?3='' OR e.category_id=?3) AND ?4 IN ('ALL','PENDING')",
            params![projection_until,account,category,status],
            |row| Ok((row.get(0)?,row.get(1)?)),
        )?
    } else {
        (0, 0)
    };
    let closing_balance_cents = running;
    Ok(CashFlowResult {
        opening_balance_cents,
        inflow_cents,
        outflow_cents,
        result_cents,
        closing_balance_cents,
        projected_balance_cents: closing_balance_cents + projected_inflow_cents
            - projected_outflow_cents,
        projected_inflow_cents,
        projected_outflow_cents,
        regime: query.regime.clone(),
        days,
    })
}

pub fn cash_flow(app: &AppHandle, query: CashFlowQuery) -> Result<CashFlowResult, FinanceError> {
    let connection = database::connection(app)?;
    cash_flow_in_connection(&connection, &query)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute_batch(
            "INSERT INTO business_profile(id,legal_name,business_type,created_at,updated_at) VALUES('business','Empresa Teste','GENERAL','2026-01-01','2026-01-01');
             INSERT INTO local_users(id,name,username,password_hash,role,is_active,created_at,updated_at) VALUES('user','Admin','admin','$argon2id$test','ADMIN',1,'2026-01-01','2026-01-01');
             INSERT INTO financial_accounts(id,name,account_type,opening_balance_cents,opening_balance_date,is_default,is_active,created_at,updated_at,created_by,updated_by) VALUES('account-a','Caixa','CASH',100000,'2026-01-01',1,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO financial_accounts(id,name,account_type,opening_balance_cents,opening_balance_date,is_default,is_active,created_at,updated_at,created_by,updated_by) VALUES('account-b','Banco','BANK',50000,'2026-01-01',0,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO categories(id,name,nature,is_system,is_active,display_order,created_at,updated_at,created_by,updated_by) VALUES('revenue','Receitas','REVENUE',0,1,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO categories(id,name,nature,is_system,is_active,display_order,created_at,updated_at,created_by,updated_by) VALUES('expense','Despesas','EXPENSE',0,1,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO payment_methods(id,name,payment_type,is_system,is_active,created_at,updated_at,created_by,updated_by) VALUES('pix','Pix','PIX',0,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES('contact','PERSON',1,1,'Contato Teste',1,0,'2026-01-01','2026-01-01','user','user');
             INSERT INTO app_preferences(id,business_id,default_financial_account_id,default_payment_method_id,default_view_regime,theme,created_at,updated_at) VALUES('preferences','business','account-a','pix','CASH','LIGHT','2026-01-01','2026-01-01');
             INSERT INTO app_license(id,edition,activation_status,trial_usage_count,created_at,updated_at) VALUES('license','ESSENTIAL','ACTIVE',0,'2026-01-01','2026-01-01');",
        ).unwrap();
        connection
    }

    fn input(entry_type: &str, amount: i64, status: &str) -> EntryInput {
        EntryInput {
            id: None,
            entry_type: entry_type.into(),
            origin_type: "MANUAL".into(),
            origin_id: None,
            contact_id: Some("contact".into()),
            category_id: Some(
                if entry_type == "EXPENSE" || entry_type.ends_with("WITHDRAWAL") {
                    "expense".into()
                } else {
                    "revenue".into()
                },
            ),
            financial_account_id: if status == "SETTLED" {
                Some("account-a".into())
            } else {
                None
            },
            payment_method_id: if status == "SETTLED" {
                Some("pix".into())
            } else {
                None
            },
            description: "Lançamento de teste".into(),
            document_reference: None,
            issue_date: "2026-02-01".into(),
            competence_date: Some("2026-02-01".into()),
            due_date: if status == "DRAFT" {
                None
            } else {
                Some("2026-02-10".into())
            },
            gross_amount_cents: amount,
            status: status.into(),
            installment_count: 1,
            installment_due_dates: Vec::new(),
            recurrence: None,
            notes: None,
        }
    }

    fn flow(connection: &Connection, regime: &str) -> CashFlowResult {
        cash_flow_in_connection(
            connection,
            &CashFlowQuery {
                start_date: "2026-02-01".into(),
                end_date: "2026-02-28".into(),
                financial_account_id: None,
                category_id: None,
                regime: regime.into(),
                status: "ALL".into(),
                projection_until: None,
                include_pending_projection: false,
            },
        )
        .unwrap()
    }

    fn account_balances(connection: &Connection) -> HashMap<String, i64> {
        finance_options_in_connection(connection)
            .unwrap()
            .accounts
            .into_iter()
            .map(|account| (account.id, account.current_balance_cents.unwrap()))
            .collect()
    }

    #[test]
    fn creates_pending_and_calculates_overdue_without_persisting_it() {
        let connection = database();
        let result =
            create_entries_in_connection(&connection, &input("REVENUE", 10_000, "PENDING"))
                .unwrap();
        let entry = entry_by_id(&connection, &result.entry_ids[0]).unwrap();
        assert_eq!(entry.persisted_status, "PENDING");
        assert_eq!(entry.display_status, "OVERDUE");
        assert_eq!(entry.remaining_amount_cents, 10_000);
    }

    #[test]
    fn settles_partially_and_preserves_original_value() {
        let connection = database();
        let id = create_entries_in_connection(&connection, &input("REVENUE", 10_000, "PENDING"))
            .unwrap()
            .entry_ids[0]
            .clone();
        let partial = settle_in_connection(
            &connection,
            &SettlementInput {
                entry_id: id.clone(),
                settlement_date: "2026-02-05".into(),
                financial_account_id: "account-a".into(),
                payment_method_id: "pix".into(),
                amount_cents: 4_000,
                discount_amount_cents: 0,
                fee_amount_cents: 0,
                interest_amount_cents: 0,
                penalty_amount_cents: 0,
                notes: Some("Primeira baixa".into()),
            },
        )
        .unwrap();
        assert_eq!(partial.remaining_amount_cents, 6_000);
        let final_settlement = settle_in_connection(
            &connection,
            &SettlementInput {
                entry_id: id.clone(),
                settlement_date: "2026-02-06".into(),
                financial_account_id: "account-a".into(),
                payment_method_id: "pix".into(),
                amount_cents: 5_500,
                discount_amount_cents: 500,
                fee_amount_cents: 0,
                interest_amount_cents: 0,
                penalty_amount_cents: 0,
                notes: None,
            },
        )
        .unwrap();
        assert_eq!(final_settlement.status, "SETTLED");
        let detail = get_entry_in_connection(&connection, &id).unwrap();
        assert_eq!(detail.entry.gross_amount_cents, 10_000);
        assert_eq!(detail.entry.net_amount_cents, 9_500);
        assert_eq!(detail.settlements.len(), 2);
    }

    #[test]
    fn reconciles_discount_fee_interest_and_penalty_with_principal() {
        let connection = database();
        let revenue_id =
            create_entries_in_connection(&connection, &input("REVENUE", 10_000, "PENDING"))
                .unwrap()
                .entry_ids[0]
                .clone();
        settle_in_connection(
            &connection,
            &SettlementInput {
                entry_id: revenue_id.clone(),
                settlement_date: "2026-02-05".into(),
                financial_account_id: "account-a".into(),
                payment_method_id: "pix".into(),
                amount_cents: 10_100,
                discount_amount_cents: 200,
                fee_amount_cents: 100,
                interest_amount_cents: 300,
                penalty_amount_cents: 100,
                notes: None,
            },
        )
        .unwrap();
        let detail = get_entry_in_connection(&connection, &revenue_id).unwrap();
        assert_eq!(detail.entry.persisted_status, "SETTLED");
        assert_eq!(detail.entry.net_amount_cents, 10_100);
        assert_eq!(detail.settlements[0].principal_amount_cents, 10_000);
        assert_eq!(flow(&connection, "CASH").result_cents, 10_100);

        let expense_id =
            create_entries_in_connection(&connection, &input("EXPENSE", 10_000, "PENDING"))
                .unwrap()
                .entry_ids[0]
                .clone();
        settle_in_connection(
            &connection,
            &SettlementInput {
                entry_id: expense_id.clone(),
                settlement_date: "2026-02-06".into(),
                financial_account_id: "account-a".into(),
                payment_method_id: "pix".into(),
                amount_cents: 10_200,
                discount_amount_cents: 300,
                fee_amount_cents: 100,
                interest_amount_cents: 200,
                penalty_amount_cents: 200,
                notes: None,
            },
        )
        .unwrap();
        let detail = get_entry_in_connection(&connection, &expense_id).unwrap();
        assert_eq!(detail.entry.persisted_status, "SETTLED");
        assert_eq!(detail.settlements[0].principal_amount_cents, 10_000);
        assert_eq!(flow(&connection, "CASH").result_cents, -100);
    }

    #[test]
    fn splits_rounding_difference_into_last_installment() {
        let connection = database();
        let mut value = input("EXPENSE", 10_000, "PENDING");
        value.installment_count = 3;
        value.installment_due_dates = vec![
            "2026-02-10".into(),
            "2026-03-10".into(),
            "2026-04-10".into(),
        ];
        let result = create_entries_in_connection(&connection, &value).unwrap();
        let amounts = result
            .entry_ids
            .iter()
            .map(|id| entry_by_id(&connection, id).unwrap().gross_amount_cents)
            .collect::<Vec<_>>();
        assert_eq!(amounts, vec![3_333, 3_333, 3_334]);
        assert_eq!(amounts.iter().sum::<i64>(), 10_000);
    }

    #[test]
    fn reconciles_every_supported_installment_count() {
        for count in 1..=120 {
            let total = 1_234_567 + count;
            let amounts = split_installment_amounts(total, count).unwrap();
            assert_eq!(amounts.len(), count as usize);
            assert!(amounts.iter().all(|amount| *amount > 0));
            assert_eq!(amounts.iter().sum::<i64>(), total);
            let base = total / count;
            assert!(amounts[..amounts.len() - 1]
                .iter()
                .all(|amount| *amount == base));
            assert_eq!(*amounts.last().unwrap(), base + total % count);
        }
        assert!(split_installment_amounts(2, 3).is_err());
        assert!(split_installment_amounts(i64::MAX, 120).is_ok());
    }

    #[test]
    fn transfer_moves_balance_without_changing_result() {
        let connection = database();
        connection.execute("UPDATE app_license SET activation_status='TRIAL',trial_ends_at=NULL,trial_entry_limit=50,trial_usage_count=0", []).unwrap();
        let result = create_transfer_in_connection(
            &connection,
            &TransferInput {
                description: "Transferência para banco".into(),
                amount_cents: 20_000,
                date: "2026-02-02".into(),
                source_account_id: "account-a".into(),
                destination_account_id: "account-b".into(),
                payment_method_id: "pix".into(),
                document_reference: None,
                notes: None,
            },
        )
        .unwrap();
        assert_eq!(result.entry_ids.len(), 2);
        let balances = account_balances(&connection);
        assert_eq!(balances["account-a"], 80_000);
        assert_eq!(balances["account-b"], 70_000);
        assert_eq!(flow(&connection, "CASH").result_cents, 0);
        assert_eq!(
            connection
                .query_row("SELECT trial_usage_count FROM app_license", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            1
        );
    }

    #[test]
    fn reverses_settled_entry_and_restores_balance_and_result() {
        let connection = database();
        let id = create_entries_in_connection(&connection, &input("REVENUE", 15_000, "SETTLED"))
            .unwrap()
            .entry_ids[0]
            .clone();
        assert_eq!(flow(&connection, "CASH").result_cents, 15_000);
        let reversal =
            reverse_entry_in_connection(&connection, &id, "2026-02-08", "Pagamento devolvido")
                .unwrap();
        assert_eq!(reversal.entry_ids.len(), 1);
        assert_eq!(flow(&connection, "CASH").result_cents, 0);
        assert_eq!(account_balances(&connection)["account-a"], 100_000);
        assert_eq!(
            entry_by_id(&connection, &id).unwrap().display_status,
            "REVERSED"
        );
        assert!(reverse_entry_in_connection(&connection, &id, "2026-02-09", "Outra vez").is_err());
    }

    #[test]
    fn reverses_both_transfer_sides_and_restores_both_accounts() {
        let connection = database();
        let transfer = create_transfer_in_connection(
            &connection,
            &TransferInput {
                description: "Transferência para banco".into(),
                amount_cents: 20_000,
                date: "2026-02-02".into(),
                source_account_id: "account-a".into(),
                destination_account_id: "account-b".into(),
                payment_method_id: "pix".into(),
                document_reference: None,
                notes: None,
            },
        )
        .unwrap();
        let reversal = reverse_entry_in_connection(
            &connection,
            &transfer.entry_ids[0],
            "2026-02-03",
            "Transferência desfeita",
        )
        .unwrap();

        assert_eq!(reversal.entry_ids.len(), 2);
        let balances = account_balances(&connection);
        assert_eq!(balances["account-a"], 100_000);
        assert_eq!(balances["account-b"], 50_000);
        assert_eq!(flow(&connection, "CASH").result_cents, 0);
        for id in transfer.entry_ids {
            assert_eq!(
                entry_by_id(&connection, &id).unwrap().display_status,
                "REVERSED"
            );
        }
    }

    #[test]
    fn cancels_only_entries_without_settlements() {
        let connection = database();
        let pending =
            create_entries_in_connection(&connection, &input("EXPENSE", 5_000, "PENDING"))
                .unwrap()
                .entry_ids[0]
                .clone();
        cancel_entry_in_connection(&connection, &pending, "Compra cancelada").unwrap();
        assert_eq!(
            entry_by_id(&connection, &pending).unwrap().display_status,
            "CANCELED"
        );
        let settled =
            create_entries_in_connection(&connection, &input("EXPENSE", 5_000, "SETTLED"))
                .unwrap()
                .entry_ids[0]
                .clone();
        assert!(cancel_entry_in_connection(&connection, &settled, "Não pode").is_err());
    }

    #[test]
    fn generates_recurrences_until_maximum_occurrences() {
        let connection = database();
        let mut value = input("EXPENSE", 3_000, "PENDING");
        value.issue_date = "2026-01-01".into();
        value.competence_date = Some("2026-01-01".into());
        value.due_date = Some("2026-01-10".into());
        value.recurrence = Some(RecurrenceInput {
            frequency: "MONTHLY".into(),
            interval_value: 1,
            start_date: "2026-01-01".into(),
            end_date: None,
            maximum_occurrences: Some(3),
        });
        let recurrence_id = create_entries_in_connection(&connection, &value)
            .unwrap()
            .recurrence_id
            .unwrap();
        assert_eq!(
            generate_recurrences_in_connection(&connection, "2026-03-01").unwrap(),
            2
        );
        let stored: (i64, bool, Option<String>) = connection
            .query_row(
                "SELECT generated_occurrences,is_active,next_generation_date FROM recurrences WHERE id=?1",
                [recurrence_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(stored, (3, false, None));
        let dates = connection
            .prepare("SELECT due_date FROM financial_entries WHERE recurrence_id IS NOT NULL ORDER BY due_date")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(dates, vec!["2026-01-10", "2026-02-10", "2026-03-10"]);
    }

    #[test]
    fn keeps_monthly_recurrence_anchored_across_short_months() {
        let connection = database();
        let mut value = input("EXPENSE", 3_000, "PENDING");
        value.issue_date = "2026-01-31".into();
        value.competence_date = Some("2026-01-31".into());
        value.due_date = Some("2026-01-30".into());
        value.recurrence = Some(RecurrenceInput {
            frequency: "MONTHLY".into(),
            interval_value: 1,
            start_date: "2026-01-31".into(),
            end_date: None,
            maximum_occurrences: Some(3),
        });
        let recurrence_id = create_entries_in_connection(&connection, &value)
            .unwrap()
            .recurrence_id
            .unwrap();

        assert_eq!(
            generate_recurrences_in_connection(&connection, "2026-03-31").unwrap(),
            2
        );
        let dates = connection
            .prepare("SELECT issue_date,due_date FROM financial_entries WHERE recurrence_id=?1 ORDER BY issue_date")
            .unwrap()
            .query_map([recurrence_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            dates,
            vec![
                ("2026-01-31".into(), "2026-01-30".into()),
                ("2026-02-28".into(), "2026-02-28".into()),
                ("2026-03-31".into(), "2026-03-30".into()),
            ]
        );
    }

    #[test]
    fn pauses_invalid_recurrence_without_blocking_other_financial_reads() {
        let connection = database();
        let mut value = input("EXPENSE", 3_000, "PENDING");
        value.issue_date = "2026-01-01".into();
        value.competence_date = Some("2026-01-01".into());
        value.due_date = Some("2026-01-10".into());
        value.recurrence = Some(RecurrenceInput {
            frequency: "MONTHLY".into(),
            interval_value: 1,
            start_date: "2026-01-01".into(),
            end_date: None,
            maximum_occurrences: Some(3),
        });
        let recurrence_id = create_entries_in_connection(&connection, &value)
            .unwrap()
            .recurrence_id
            .unwrap();
        connection
            .execute("UPDATE categories SET is_active=0 WHERE id='expense'", [])
            .unwrap();
        connection.execute("UPDATE app_license SET activation_status='TRIAL',trial_ends_at='2099-01-01',trial_entry_limit=50,trial_usage_count=0", []).unwrap();

        assert_eq!(
            generate_recurrences_in_connection(&connection, "2026-03-01").unwrap(),
            0
        );
        let state: (bool, Option<String>) = connection
            .query_row(
                "SELECT is_active,next_generation_date FROM recurrences WHERE id=?1",
                [&recurrence_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(state, (false, None));
        assert_eq!(
            connection
                .query_row("SELECT trial_usage_count FROM app_license", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM audit_logs WHERE entity_id=?1 AND action='PAUSE_INVALID_TEMPLATE'",
                    [&recurrence_id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            1
        );
        assert!(finance_options_in_connection(&connection).is_ok());
    }

    #[test]
    fn installment_group_consumes_one_trial_operation_and_next_is_blocked() {
        let connection = database();
        connection.execute("UPDATE app_license SET activation_status='TRIAL',trial_ends_at=NULL,trial_entry_limit=50,trial_usage_count=49", []).unwrap();
        let mut value = input("REVENUE", 2_000, "PENDING");
        value.installment_count = 2;
        value.installment_due_dates = vec!["2026-02-10".into(), "2026-03-10".into()];
        assert!(create_entries_in_connection(&connection, &value).is_ok());
        assert!(create_entries_in_connection(&connection, &value).is_err());
        let stored: (i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM financial_entries),trial_usage_count FROM app_license",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(stored, (2, 50));
    }

    #[test]
    fn distinguishes_cash_and_accrual_regimes() {
        let connection = database();
        create_entries_in_connection(&connection, &input("REVENUE", 12_000, "PENDING")).unwrap();
        assert_eq!(flow(&connection, "CASH").result_cents, 0);
        assert_eq!(flow(&connection, "ACCRUAL").result_cents, 12_000);
    }

    #[test]
    fn reports_obligations_and_pending_projection_from_remaining_values() {
        let connection = database();
        let revenue_id =
            create_entries_in_connection(&connection, &input("REVENUE", 12_000, "PENDING"))
                .unwrap()
                .entry_ids[0]
                .clone();
        create_entries_in_connection(&connection, &input("EXPENSE", 5_000, "PENDING")).unwrap();
        settle_in_connection(
            &connection,
            &SettlementInput {
                entry_id: revenue_id,
                settlement_date: "2026-02-05".into(),
                financial_account_id: "account-a".into(),
                payment_method_id: "pix".into(),
                amount_cents: 2_000,
                discount_amount_cents: 0,
                fee_amount_cents: 0,
                interest_amount_cents: 0,
                penalty_amount_cents: 0,
                notes: None,
            },
        )
        .unwrap();

        let receivables = obligation_page_in_connection(
            &connection,
            &ObligationQuery {
                kind: "RECEIVABLE".into(),
                status: "ALL".into(),
                search: String::new(),
                start_date: None,
                end_date: None,
                limit: 20,
                offset: 0,
            },
        )
        .unwrap();
        assert_eq!(receivables.total, 1);
        assert_eq!(receivables.indicators.total_pending_cents, 10_000);
        assert_eq!(receivables.items[0].remaining_amount_cents, 10_000);

        let projection = cash_flow_in_connection(
            &connection,
            &CashFlowQuery {
                start_date: "2026-02-01".into(),
                end_date: "2026-02-28".into(),
                financial_account_id: None,
                category_id: None,
                regime: "CASH".into(),
                status: "ALL".into(),
                projection_until: Some("2026-12-31".into()),
                include_pending_projection: true,
            },
        )
        .unwrap();
        assert_eq!(projection.projected_inflow_cents, 10_000);
        assert_eq!(projection.projected_outflow_cents, 5_000);
        assert_eq!(projection.closing_balance_cents, 152_000);
        assert_eq!(projection.projected_balance_cents, 157_000);

        let invalid_projection = cash_flow_in_connection(
            &connection,
            &CashFlowQuery {
                start_date: "2026-02-01".into(),
                end_date: "2026-02-28".into(),
                financial_account_id: None,
                category_id: None,
                regime: "CASH".into(),
                status: "ALL".into(),
                projection_until: Some("2026-02-01".into()),
                include_pending_projection: true,
            },
        );
        assert!(invalid_projection.is_err());

        let settled_only_projection = cash_flow_in_connection(
            &connection,
            &CashFlowQuery {
                start_date: "2026-02-01".into(),
                end_date: "2026-02-28".into(),
                financial_account_id: None,
                category_id: None,
                regime: "CASH".into(),
                status: "SETTLED".into(),
                projection_until: Some("2026-12-31".into()),
                include_pending_projection: true,
            },
        )
        .unwrap();
        assert_eq!(settled_only_projection.projected_inflow_cents, 0);
        assert_eq!(settled_only_projection.projected_outflow_cents, 0);
    }

    #[test]
    fn includes_account_openings_that_happen_inside_cash_flow_period() {
        let connection = database();
        connection
            .execute(
                "INSERT INTO financial_accounts(id,name,account_type,opening_balance_cents,opening_balance_date,is_default,is_active,created_at,updated_at,created_by,updated_by) VALUES('future-account','Conta futura','CASH',25000,'2026-02-15',0,1,'2026-01-01','2026-01-01','user','user')",
                [],
            )
            .unwrap();

        let cash_flow = flow(&connection, "CASH");
        assert_eq!(cash_flow.opening_balance_cents, 150_000);
        assert_eq!(cash_flow.closing_balance_cents, 175_000);
        let opening_day = cash_flow
            .days
            .iter()
            .find(|day| day.date == "2026-02-15")
            .unwrap();
        assert_eq!(opening_day.opening_balance_cents, 175_000);
        assert_eq!(opening_day.daily_result_cents, 0);
    }
}
