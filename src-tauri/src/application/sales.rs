use std::{fs::File, io::BufWriter, path::Path};

use chrono::{Datelike, NaiveDate};
use printpdf::{BuiltinFont, Mm, PdfDocument, PdfDocumentReference, PdfLayerReference};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use thiserror::Error;
use uuid::Uuid;

use crate::{
    application::finance::{
        self, EntrySummary, FinanceError, SaleReceivablePlan, SaveEntriesResult,
    },
    database::{self, DatabaseError},
};

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const SALE_SELECT: &str = "SELECT s.id,s.number,s.customer_id,c.name,s.category_id,cat.name,s.issue_date,s.description,s.gross_amount_cents,s.discount_amount_cents,s.fee_amount_cents,s.net_amount_cents,s.receipt_mode,s.payment_method_id,pm.name,s.financial_account_id,a.name,s.installment_count,s.first_due_date,s.received_now_cents,s.financial_group_id,s.status,s.notes,s.cancel_reason,s.confirmed_at,s.canceled_at,COALESCE((SELECT SUM(st.net_amount_cents) FROM financial_entries e JOIN entry_settlements st ON st.entry_id=e.id WHERE e.origin_type='SALE' AND e.origin_id=s.id AND e.reversed_at IS NULL),0),COALESCE((SELECT SUM(e.gross_amount_cents-COALESCE((SELECT SUM(st.principal_amount_cents) FROM entry_settlements st WHERE st.entry_id=e.id),0)) FROM financial_entries e WHERE e.origin_type='SALE' AND e.origin_id=s.id AND e.status='PENDING' AND e.reversed_at IS NULL),0) FROM sales s JOIN contacts c ON c.id=s.customer_id JOIN categories cat ON cat.id=s.category_id JOIN payment_methods pm ON pm.id=s.payment_method_id LEFT JOIN financial_accounts a ON a.id=s.financial_account_id";

#[derive(Debug, Error)]
pub enum SalesError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error(transparent)]
    Finance(#[from] FinanceError),
    #[error("falha ao gravar o comprovante: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Validation(String),
    #[error("não foi possível gerar o PDF: {0}")]
    Pdf(String),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemInput {
    pub catalog_item_id: Option<String>,
    pub description: String,
    pub quantity_millis: i64,
    pub unit: String,
    pub unit_price_cents: i64,
    pub discount_cents: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleInput {
    pub id: Option<String>,
    pub customer_id: String,
    pub category_id: String,
    pub issue_date: String,
    pub description: String,
    pub discount_amount_cents: i64,
    pub fee_amount_cents: i64,
    pub receipt_mode: String,
    pub payment_method_id: String,
    pub financial_account_id: Option<String>,
    pub installment_count: i64,
    pub first_due_date: String,
    pub received_now_cents: i64,
    pub status: String,
    pub notes: Option<String>,
    pub items: Vec<SaleItemInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleSaveResult {
    pub id: String,
    pub number: String,
    pub status: String,
    pub financial_entry_ids: Vec<String>,
    pub idempotent_replay: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleSummary {
    pub id: String,
    pub number: String,
    pub customer_id: String,
    pub customer_name: String,
    pub category_id: String,
    pub category_name: String,
    pub issue_date: String,
    pub description: String,
    pub gross_amount_cents: i64,
    pub discount_amount_cents: i64,
    pub fee_amount_cents: i64,
    pub net_amount_cents: i64,
    pub receipt_mode: String,
    pub payment_method_id: String,
    pub payment_method_name: String,
    pub financial_account_id: Option<String>,
    pub financial_account_name: Option<String>,
    pub installment_count: i64,
    pub first_due_date: String,
    pub received_now_cents: i64,
    pub financial_group_id: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub cancel_reason: Option<String>,
    pub confirmed_at: Option<String>,
    pub canceled_at: Option<String>,
    pub received_amount_cents: i64,
    pub remaining_amount_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItem {
    pub id: String,
    pub catalog_item_id: Option<String>,
    pub description: String,
    pub quantity_millis: i64,
    pub unit: String,
    pub unit_price_cents: i64,
    pub discount_cents: i64,
    pub total_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleHistory {
    pub action: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptBusiness {
    pub name: String,
    pub document_number: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub logo_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleDetail {
    #[serde(flatten)]
    pub sale: SaleSummary,
    pub items: Vec<SaleItem>,
    pub receivables: Vec<EntrySummary>,
    pub history: Vec<SaleHistory>,
    pub business: ReceiptBusiness,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleListQuery {
    #[serde(default)]
    pub search: String,
    #[serde(default)]
    pub status: String,
    pub customer_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesOption {
    pub id: String,
    pub name: String,
    pub detail: Option<String>,
    pub amount_cents: Option<i64>,
    pub fee_basis_points: Option<i64>,
    pub receipt_delay_days: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesOptions {
    pub customers: Vec<SalesOption>,
    pub catalog_items: Vec<SalesOption>,
    pub categories: Vec<SalesOption>,
    pub accounts: Vec<SalesOption>,
    pub payment_methods: Vec<SalesOption>,
    pub default_financial_account_id: Option<String>,
    pub default_payment_method_id: Option<String>,
}

struct CalculatedItem {
    input: SaleItemInput,
    total_cents: i64,
}

struct Calculation {
    items: Vec<CalculatedItem>,
    gross_cents: i64,
    total_discount_cents: i64,
    net_cents: i64,
    immediate_cents: i64,
    pending_cents: i64,
    due_dates: Vec<String>,
}

fn date(value: &str, label: &str) -> Result<NaiveDate, SalesError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| SalesError::Validation(format!("Informe {label} válida.")))
}

fn optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn truncate_chars(value: &str, limit: usize) -> String {
    let mut chars = value.chars();
    let shortened = chars.by_ref().take(limit).collect::<String>();
    if chars.next().is_some() {
        format!("{shortened}…")
    } else {
        shortened
    }
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
    entity_id: &str,
    action: &str,
    summary: &str,
) -> Result<(), SalesError> {
    connection.execute(
        &format!("INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,'sale',?3,?4,?5,{NOW})"),
        params![Uuid::new_v4().to_string(), actor(connection)?, entity_id, action, summary],
    )?;
    Ok(())
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .unwrap()
        .pred_opt()
        .unwrap()
        .day()
}

fn add_months(value: NaiveDate, months: i64) -> Result<NaiveDate, SalesError> {
    let base = i64::from(value.year()) * 12 + i64::from(value.month0());
    let target = base
        .checked_add(months)
        .ok_or_else(|| SalesError::Validation("Data de parcela fora do limite.".into()))?;
    let year = i32::try_from(target.div_euclid(12))
        .map_err(|_| SalesError::Validation("Data de parcela fora do limite.".into()))?;
    let month = u32::try_from(target.rem_euclid(12) + 1)
        .map_err(|_| SalesError::Validation("Data de parcela fora do limite.".into()))?;
    NaiveDate::from_ymd_opt(year, month, value.day().min(days_in_month(year, month)))
        .ok_or_else(|| SalesError::Validation("Data de parcela inválida.".into()))
}

fn calculate(input: &SaleInput) -> Result<Calculation, SalesError> {
    date(&input.issue_date, "uma data da venda")?;
    let first_due = date(&input.first_due_date, "uma data de primeiro vencimento")?;
    if !["DRAFT", "CONFIRMED"].contains(&input.status.as_str())
        || !["IMMEDIATE", "FUTURE", "INSTALLMENTS", "MIXED"].contains(&input.receipt_mode.as_str())
        || !(2..=200).contains(&input.description.trim().chars().count())
        || input.items.is_empty()
        || input.items.len() > 200
        || input.discount_amount_cents < 0
        || input.fee_amount_cents < 0
        || input
            .notes
            .as_deref()
            .is_some_and(|notes| notes.trim().chars().count() > 2_000)
    {
        return Err(SalesError::Validation(
            "Revise a situação, descrição, itens, descontos e taxas da venda.".into(),
        ));
    }
    let mut calculated = Vec::with_capacity(input.items.len());
    let mut gross_cents = 0_i64;
    let mut item_discounts = 0_i64;
    for item in &input.items {
        if !(2..=200).contains(&item.description.trim().chars().count())
            || item.quantity_millis <= 0
            || item.quantity_millis > 1_000_000_000
            || item.unit_price_cents < 0
            || item.discount_cents < 0
            || !(1..=12).contains(&item.unit.trim().chars().count())
        {
            return Err(SalesError::Validation(
                "Revise descrição, quantidade, unidade, preço e desconto dos itens.".into(),
            ));
        }
        let multiplied = item
            .unit_price_cents
            .checked_mul(item.quantity_millis)
            .and_then(|value| value.checked_add(500))
            .ok_or_else(|| SalesError::Validation("Valor do item fora do limite.".into()))?;
        let line_gross = multiplied / 1_000;
        if item.discount_cents > line_gross {
            return Err(SalesError::Validation(
                "O desconto de um item não pode superar seu valor.".into(),
            ));
        }
        let total = line_gross - item.discount_cents;
        gross_cents = gross_cents
            .checked_add(line_gross)
            .ok_or_else(|| SalesError::Validation("Total da venda fora do limite.".into()))?;
        item_discounts = item_discounts
            .checked_add(item.discount_cents)
            .ok_or_else(|| SalesError::Validation("Desconto fora do limite.".into()))?;
        calculated.push(CalculatedItem {
            input: item.clone(),
            total_cents: total,
        });
    }
    let total_discount = item_discounts
        .checked_add(input.discount_amount_cents)
        .ok_or_else(|| SalesError::Validation("Desconto fora do limite.".into()))?;
    let net_cents = gross_cents
        .checked_sub(total_discount)
        .and_then(|value| value.checked_sub(input.fee_amount_cents))
        .filter(|value| *value > 0)
        .ok_or_else(|| {
            SalesError::Validation(
                "Descontos e taxas não podem consumir todo o valor da venda.".into(),
            )
        })?;

    let (immediate_cents, pending_cents, pending_count) = match input.receipt_mode.as_str() {
        "IMMEDIATE" => {
            if input.received_now_cents != net_cents || input.financial_account_id.is_none() {
                return Err(SalesError::Validation(
                    "Recebimento imediato exige o total líquido e uma conta financeira.".into(),
                ));
            }
            (net_cents, 0, 0)
        }
        "FUTURE" => {
            if input.received_now_cents != 0 || input.installment_count != 1 {
                return Err(SalesError::Validation(
                    "Recebimento futuro deve possuir uma conta pendente.".into(),
                ));
            }
            (0, net_cents, 1)
        }
        "INSTALLMENTS" => {
            if input.received_now_cents != 0 || !(2..=120).contains(&input.installment_count) {
                return Err(SalesError::Validation(
                    "Venda parcelada deve possuir entre 2 e 120 parcelas.".into(),
                ));
            }
            (0, net_cents, input.installment_count)
        }
        "MIXED" => {
            if input.received_now_cents <= 0
                || input.received_now_cents >= net_cents
                || input.financial_account_id.is_none()
                || !(1..=119).contains(&input.installment_count)
            {
                return Err(SalesError::Validation(
                    "Informe uma parte recebida, uma conta e de 1 a 119 parcelas pendentes.".into(),
                ));
            }
            (
                input.received_now_cents,
                net_cents - input.received_now_cents,
                input.installment_count,
            )
        }
        _ => unreachable!(),
    };
    if pending_count > 0 && pending_cents < pending_count {
        return Err(SalesError::Validation(
            "Cada parcela deve ter valor mínimo de um centavo.".into(),
        ));
    }
    let due_dates = (0..pending_count)
        .map(|index| add_months(first_due, index).map(|value| value.format("%Y-%m-%d").to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Calculation {
        items: calculated,
        gross_cents,
        total_discount_cents: total_discount,
        net_cents,
        immediate_cents,
        pending_cents,
        due_dates,
    })
}

fn validate_references(connection: &Connection, input: &SaleInput) -> Result<(), SalesError> {
    let valid_customer: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM contacts WHERE id=?1 AND role_customer=1 AND is_active=1 AND deleted_at IS NULL)",
        [&input.customer_id],
        |row| row.get(0),
    )?;
    let valid_category: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM categories WHERE id=?1 AND nature='REVENUE' AND is_active=1 AND deleted_at IS NULL)",
        [&input.category_id],
        |row| row.get(0),
    )?;
    let valid_payment: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM payment_methods WHERE id=?1 AND is_active=1)",
        [&input.payment_method_id],
        |row| row.get(0),
    )?;
    if !valid_customer || !valid_category || !valid_payment {
        return Err(SalesError::Validation(
            "Cliente, categoria ou forma de recebimento inválida/inativa.".into(),
        ));
    }
    if let Some(account_id) = input.financial_account_id.as_deref() {
        let valid_account: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM financial_accounts WHERE id=?1 AND is_active=1 AND deleted_at IS NULL)",
            [account_id],
            |row| row.get(0),
        )?;
        if !valid_account {
            return Err(SalesError::Validation(
                "Conta financeira inválida ou inativa.".into(),
            ));
        }
    }
    for item in &input.items {
        if let Some(catalog_id) = item.catalog_item_id.as_deref() {
            let valid: bool = connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM catalog_items WHERE id=?1 AND deleted_at IS NULL)",
                [catalog_id],
                |row| row.get(0),
            )?;
            if !valid {
                return Err(SalesError::Validation(
                    "Um item do catálogo não está mais disponível.".into(),
                ));
            }
        }
    }
    Ok(())
}

fn next_number(connection: &Connection, issue_date: &str) -> Result<String, SalesError> {
    let year = date(issue_date, "uma data da venda")?.year();
    let prefix = format!("V{year}-");
    let sequence: i64 = connection.query_row(
        "SELECT COALESCE(MAX(CAST(substr(number,7) AS INTEGER)),0)+1 FROM sales WHERE number LIKE ?1||'%'",
        [&prefix],
        |row| row.get(0),
    )?;
    Ok(format!("{prefix}{sequence:06}"))
}

fn insert_items(
    connection: &Connection,
    sale_id: &str,
    items: &[CalculatedItem],
) -> Result<(), SalesError> {
    for item in items {
        connection.execute(
            &format!("INSERT INTO sale_items(id,sale_id,catalog_item_id,description,quantity_millis,unit,unit_price_cents,discount_cents,total_cents,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,{NOW},{NOW})"),
            params![Uuid::new_v4().to_string(),sale_id,optional(&item.input.catalog_item_id),item.input.description.trim(),item.input.quantity_millis,item.input.unit.trim().to_uppercase(),item.input.unit_price_cents,item.input.discount_cents,item.total_cents],
        )?;
    }
    Ok(())
}

fn financial_ids(connection: &Connection, sale_id: &str) -> Result<Vec<String>, SalesError> {
    let mut statement = connection.prepare(
        "SELECT id FROM financial_entries WHERE origin_type='SALE' AND origin_id=?1 ORDER BY installment_number",
    )?;
    let ids = statement
        .query_map([sale_id], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

fn save_in_connection(
    connection: &Connection,
    input: &SaleInput,
) -> Result<SaleSaveResult, SalesError> {
    let tx = connection.unchecked_transaction()?;
    let actor_id = actor(&tx)?;
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<(String, String, Option<String>)> = tx
        .query_row(
            "SELECT number,status,financial_group_id FROM sales WHERE id=?1 AND deleted_at IS NULL",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    if let Some((number, status, financial_group_id)) = &existing {
        if status != "DRAFT" {
            if input.status == "CONFIRMED" && financial_group_id.is_some() {
                let entry_ids = financial_ids(&tx, &id)?;
                tx.commit()?;
                return Ok(SaleSaveResult {
                    id,
                    number: number.clone(),
                    status: status.clone(),
                    financial_entry_ids: entry_ids,
                    idempotent_replay: true,
                });
            }
            return Err(SalesError::Validation(
                "Somente vendas em rascunho podem ser alteradas.".into(),
            ));
        }
    }
    let calculation = calculate(input)?;
    validate_references(&tx, input)?;
    let number = match &existing {
        Some((number, _, _)) => number.clone(),
        None => next_number(&tx, &input.issue_date)?,
    };
    let stored_status = if input.status == "DRAFT" {
        "DRAFT"
    } else {
        "CONFIRMED"
    };
    if existing.is_some() {
        tx.execute("DELETE FROM sale_items WHERE sale_id=?1", [&id])?;
        tx.execute(
            &format!("UPDATE sales SET customer_id=?2,category_id=?3,issue_date=?4,description=?5,gross_amount_cents=?6,discount_amount_cents=?7,fee_amount_cents=?8,net_amount_cents=?9,receipt_mode=?10,payment_method_id=?11,financial_account_id=?12,installment_count=?13,first_due_date=?14,received_now_cents=?15,status=?16,notes=?17,updated_by=?18,updated_at={NOW} WHERE id=?1 AND status='DRAFT'"),
            params![id,input.customer_id,input.category_id,input.issue_date,input.description.trim(),calculation.gross_cents,calculation.total_discount_cents,input.fee_amount_cents,calculation.net_cents,input.receipt_mode,input.payment_method_id,optional(&input.financial_account_id),input.installment_count,input.first_due_date,calculation.immediate_cents,stored_status,optional(&input.notes),actor_id],
        )?;
        audit(&tx, &id, "UPDATE", "Rascunho de venda atualizado")?;
    } else {
        tx.execute(
            &format!("INSERT INTO sales(id,number,customer_id,category_id,issue_date,description,gross_amount_cents,discount_amount_cents,fee_amount_cents,net_amount_cents,receipt_mode,payment_method_id,financial_account_id,installment_count,first_due_date,received_now_cents,status,notes,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?19,{NOW},{NOW})"),
            params![id,number,input.customer_id,input.category_id,input.issue_date,input.description.trim(),calculation.gross_cents,calculation.total_discount_cents,input.fee_amount_cents,calculation.net_cents,input.receipt_mode,input.payment_method_id,optional(&input.financial_account_id),input.installment_count,input.first_due_date,calculation.immediate_cents,stored_status,optional(&input.notes),actor_id],
        )?;
        audit(&tx, &id, "CREATE", "Venda criada")?;
    }
    insert_items(&tx, &id, &calculation.items)?;
    let financial = if input.status == "CONFIRMED" {
        let SaveEntriesResult {
            entry_ids,
            group_id,
            ..
        } = finance::create_sale_receivables_in_connection(
            &tx,
            SaleReceivablePlan {
                sale_id: &id,
                sale_number: &number,
                customer_id: &input.customer_id,
                category_id: &input.category_id,
                issue_date: &input.issue_date,
                payment_method_id: &input.payment_method_id,
                financial_account_id: input.financial_account_id.as_deref(),
                immediate_amount_cents: calculation.immediate_cents,
                pending_amount_cents: calculation.pending_cents,
                pending_due_dates: &calculation.due_dates,
                notes: input.notes.as_deref(),
            },
        )?;
        tx.execute(
            &format!("UPDATE sales SET financial_group_id=?2,confirmed_at={NOW},updated_at={NOW} WHERE id=?1"),
            params![id, group_id],
        )?;
        audit(
            &tx,
            &id,
            "CONFIRM",
            "Venda confirmada e contas a receber geradas",
        )?;
        entry_ids
    } else {
        Vec::new()
    };
    let final_status: String =
        tx.query_row("SELECT status FROM sales WHERE id=?1", [&id], |row| {
            row.get(0)
        })?;
    tx.commit()?;
    Ok(SaleSaveResult {
        id,
        number,
        status: final_status,
        financial_entry_ids: financial,
        idempotent_replay: false,
    })
}

pub fn save(app: &AppHandle, input: SaleInput) -> Result<SaleSaveResult, SalesError> {
    let connection = database::connection(app)?;
    save_in_connection(&connection, &input)
}

fn sale_summary(row: &Row<'_>) -> rusqlite::Result<SaleSummary> {
    Ok(SaleSummary {
        id: row.get(0)?,
        number: row.get(1)?,
        customer_id: row.get(2)?,
        customer_name: row.get(3)?,
        category_id: row.get(4)?,
        category_name: row.get(5)?,
        issue_date: row.get(6)?,
        description: row.get(7)?,
        gross_amount_cents: row.get(8)?,
        discount_amount_cents: row.get(9)?,
        fee_amount_cents: row.get(10)?,
        net_amount_cents: row.get(11)?,
        receipt_mode: row.get(12)?,
        payment_method_id: row.get(13)?,
        payment_method_name: row.get(14)?,
        financial_account_id: row.get(15)?,
        financial_account_name: row.get(16)?,
        installment_count: row.get(17)?,
        first_due_date: row.get(18)?,
        received_now_cents: row.get(19)?,
        financial_group_id: row.get(20)?,
        status: row.get(21)?,
        notes: row.get(22)?,
        cancel_reason: row.get(23)?,
        confirmed_at: row.get(24)?,
        canceled_at: row.get(25)?,
        received_amount_cents: row.get(26)?,
        remaining_amount_cents: row.get(27)?,
    })
}

fn get_in_connection(connection: &Connection, id: &str) -> Result<SaleDetail, SalesError> {
    let sale = connection
        .query_row(
            &format!("{SALE_SELECT} WHERE s.id=?1 AND s.deleted_at IS NULL"),
            [id],
            sale_summary,
        )
        .optional()?
        .ok_or_else(|| SalesError::Validation("Venda não encontrada.".into()))?;
    let mut item_statement = connection.prepare("SELECT id,catalog_item_id,description,quantity_millis,unit,unit_price_cents,discount_cents,total_cents FROM sale_items WHERE sale_id=?1 ORDER BY created_at,id")?;
    let items = item_statement
        .query_map([id], |row| {
            Ok(SaleItem {
                id: row.get(0)?,
                catalog_item_id: row.get(1)?,
                description: row.get(2)?,
                quantity_millis: row.get(3)?,
                unit: row.get(4)?,
                unit_price_cents: row.get(5)?,
                discount_cents: row.get(6)?,
                total_cents: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut receivable_statement = connection.prepare(&format!("{} WHERE e.origin_type='SALE' AND e.origin_id=?1 AND e.deleted_at IS NULL ORDER BY e.installment_number", finance_summary_select()))?;
    let receivables = receivable_statement
        .query_map([id], finance_entry_summary)?
        .collect::<Result<Vec<_>, _>>()?;
    let mut history_statement = connection.prepare("SELECT action,summary,created_at FROM audit_logs WHERE entity_type='sale' AND entity_id=?1 ORDER BY created_at DESC")?;
    let history = history_statement
        .query_map([id], |row| {
            Ok(SaleHistory {
                action: row.get(0)?,
                summary: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let business = connection.query_row("SELECT COALESCE(trade_name,legal_name),document_number,phone,email,address,city,state,logo_path FROM business_profile LIMIT 1",[],|row|Ok(ReceiptBusiness{name:row.get(0)?,document_number:row.get(1)?,phone:row.get(2)?,email:row.get(3)?,address:row.get(4)?,city:row.get(5)?,state:row.get(6)?,logo_path:row.get(7)?}))?;
    Ok(SaleDetail {
        sale,
        items,
        receivables,
        history,
        business,
    })
}

fn finance_summary_select() -> &'static str {
    "SELECT e.id,e.entry_group_id,e.entry_type,e.direction,e.origin_type,e.origin_id,e.contact_id,ct.name,e.category_id,cat.name,e.financial_account_id,acc.name,e.payment_method_id,pm.name,e.description,e.document_reference,e.issue_date,e.competence_date,e.due_date,e.settlement_date,e.gross_amount_cents,e.net_amount_cents,e.installment_number,e.installment_count,e.status,e.is_recurring,e.recurrence_id,e.notes,e.cancel_reason,e.reversed_at,e.reversal_reason,COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0),CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' WHEN e.status='CANCELED' THEN 'CANCELED' WHEN e.status='SETTLED' THEN 'SETTLED' WHEN e.status='DRAFT' THEN 'DRAFT' WHEN e.due_date<date('now','localtime') THEN 'OVERDUE' WHEN COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)>0 THEN 'PARTIAL' ELSE 'PENDING' END FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories cat ON cat.id=e.category_id LEFT JOIN financial_accounts acc ON acc.id=e.financial_account_id LEFT JOIN payment_methods pm ON pm.id=e.payment_method_id"
}

fn finance_entry_summary(row: &Row<'_>) -> rusqlite::Result<EntrySummary> {
    let gross: i64 = row.get(20)?;
    let settled: i64 = row.get(31)?;
    let display: String = row.get(32)?;
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
        gross_amount_cents: gross,
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
        settled_principal_cents: settled,
        remaining_amount_cents: if ["SETTLED", "CANCELED", "REVERSED"].contains(&display.as_str()) {
            0
        } else {
            (gross - settled).max(0)
        },
        display_status: display,
    })
}

pub fn get(app: &AppHandle, id: &str) -> Result<SaleDetail, SalesError> {
    let connection = database::connection(app)?;
    get_in_connection(&connection, id)
}

pub fn list(app: &AppHandle, query: SaleListQuery) -> Result<Page<SaleSummary>, SalesError> {
    if !(1..=100).contains(&query.limit) || query.offset < 0 {
        return Err(SalesError::Validation("Paginação inválida.".into()));
    }
    if let Some(value) = query.start_date.as_deref() {
        date(value, "uma data inicial")?;
    }
    if let Some(value) = query.end_date.as_deref() {
        date(value, "uma data final")?;
    }
    let connection = database::connection(app)?;
    let start = query.start_date.as_deref().unwrap_or("");
    let end = query.end_date.as_deref().unwrap_or("");
    let customer = query.customer_id.as_deref().unwrap_or("");
    let status = if query.status.is_empty() {
        "ALL"
    } else {
        &query.status
    };
    let where_sql = "s.deleted_at IS NULL AND (?1='' OR s.issue_date>=?1) AND (?2='' OR s.issue_date<=?2) AND (?3='' OR s.customer_id=?3) AND (?4='ALL' OR s.status=?4) AND (?5='' OR s.number LIKE '%'||?5||'%' COLLATE NOCASE OR s.description LIKE '%'||?5||'%' COLLATE NOCASE OR c.name LIKE '%'||?5||'%' COLLATE NOCASE)";
    let total = connection.query_row(
        &format!(
            "SELECT COUNT(*) FROM sales s JOIN contacts c ON c.id=s.customer_id WHERE {where_sql}"
        ),
        params![start, end, customer, status, query.search.trim()],
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(&format!("{SALE_SELECT} WHERE {where_sql} ORDER BY s.issue_date DESC,s.number DESC LIMIT ?6 OFFSET ?7"))?;
    let items = statement
        .query_map(
            params![
                start,
                end,
                customer,
                status,
                query.search.trim(),
                query.limit,
                query.offset
            ],
            sale_summary,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Page { items, total })
}

pub fn options(app: &AppHandle) -> Result<SalesOptions, SalesError> {
    let connection = database::connection(app)?;
    fn rows(connection: &Connection, sql: &str) -> Result<Vec<SalesOption>, rusqlite::Error> {
        let mut statement = connection.prepare(sql)?;
        let values = statement
            .query_map([], |row| {
                Ok(SalesOption {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    detail: row.get(2)?,
                    amount_cents: row.get(3)?,
                    fee_basis_points: row.get(4)?,
                    receipt_delay_days: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }
    let customers = rows(&connection,"SELECT id,name,CASE contact_kind WHEN 'PERSON' THEN 'Pessoa' ELSE 'Empresa' END,NULL,NULL,NULL FROM contacts WHERE role_customer=1 AND is_active=1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE")?;
    let catalog_items = rows(&connection,"SELECT id,name,unit,sale_price_cents,NULL,NULL FROM catalog_items WHERE is_active=1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE")?;
    let categories = rows(&connection,"SELECT id,name,'REVENUE',NULL,NULL,NULL FROM categories WHERE nature='REVENUE' AND is_active=1 AND deleted_at IS NULL ORDER BY display_order,name COLLATE NOCASE")?;
    let accounts = rows(&connection,"SELECT id,name,account_type,NULL,NULL,NULL FROM financial_accounts WHERE is_active=1 AND deleted_at IS NULL ORDER BY is_default DESC,name COLLATE NOCASE")?;
    let payment_methods = rows(&connection,"SELECT id,name,payment_type,NULL,default_fee_basis_points,default_receipt_delay_days FROM payment_methods WHERE is_active=1 ORDER BY is_system DESC,name COLLATE NOCASE")?;
    let defaults = connection.query_row("SELECT default_financial_account_id,default_payment_method_id FROM app_preferences LIMIT 1",[],|row|Ok((row.get(0)?,row.get(1)?)))?;
    Ok(SalesOptions {
        customers,
        catalog_items,
        categories,
        accounts,
        payment_methods,
        default_financial_account_id: defaults.0,
        default_payment_method_id: defaults.1,
    })
}

fn cancel_in_connection(connection: &Connection, id: &str, reason: &str) -> Result<(), SalesError> {
    if reason.trim().chars().count() < 3 {
        return Err(SalesError::Validation(
            "Informe o motivo do cancelamento.".into(),
        ));
    }
    let status: String = connection
        .query_row(
            "SELECT status FROM sales WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| SalesError::Validation("Venda não encontrada.".into()))?;
    if status == "CANCELED" {
        return Ok(());
    }
    let active_settlements: i64 = connection.query_row("SELECT COUNT(*) FROM financial_entries e JOIN entry_settlements st ON st.entry_id=e.id WHERE e.origin_type='SALE' AND e.origin_id=?1 AND e.reversed_at IS NULL",[id],|row|row.get(0))?;
    if active_settlements > 0 {
        return Err(SalesError::Validation(
            "A venda possui recebimentos. Estorne cada recebimento antes de cancelar.".into(),
        ));
    }
    let tx = connection.unchecked_transaction()?;
    let actor_id = actor(&tx)?;
    tx.execute(
        &format!("UPDATE financial_entries SET status='CANCELED',cancel_reason=?2,updated_by=?3,updated_at={NOW} WHERE origin_type='SALE' AND origin_id=?1 AND status IN ('DRAFT','PENDING') AND reversed_at IS NULL"),
        params![id, reason.trim(), actor_id],
    )?;
    tx.execute(
        &format!("UPDATE sales SET status='CANCELED',cancel_reason=?2,canceled_at={NOW},updated_by=?3,updated_at={NOW} WHERE id=?1"),
        params![id, reason.trim(), actor_id],
    )?;
    audit(
        &tx,
        id,
        "CANCEL",
        "Venda cancelada; recebíveis pendentes cancelados",
    )?;
    tx.commit()?;
    Ok(())
}

pub fn cancel(app: &AppHandle, id: &str, reason: &str) -> Result<(), SalesError> {
    let connection = database::connection(app)?;
    cancel_in_connection(&connection, id, reason)
}

fn brl(cents: i64) -> String {
    let absolute = cents.abs();
    let whole = absolute / 100;
    let decimal = absolute % 100;
    let digits = whole.to_string();
    let mut grouped = String::new();
    for (index, character) in digits.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(character);
    }
    let whole_grouped: String = grouped.chars().rev().collect();
    format!(
        "{}R$ {whole_grouped},{decimal:02}",
        if cents < 0 { "-" } else { "" }
    )
}

fn pdf_text(
    layer: &PdfLayerReference,
    font: &printpdf::IndirectFontRef,
    text: &str,
    size: f32,
    x: f32,
    y: f32,
) {
    layer.use_text(text, size, Mm(x), Mm(y), font);
}

fn receipt_page(
    doc: &PdfDocumentReference,
    title: &str,
) -> (printpdf::PdfPageIndex, printpdf::PdfLayerIndex) {
    doc.add_page(Mm(210.0), Mm(297.0), title)
}

fn export_pdf_in_connection(
    connection: &Connection,
    id: &str,
    path: &str,
) -> Result<(), SalesError> {
    let target = Path::new(path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("pdf")
        || target.file_name().is_none()
        || !target.parent().is_some_and(Path::is_dir)
    {
        return Err(SalesError::Validation(
            "Escolha um arquivo PDF em uma pasta válida.".into(),
        ));
    }
    let detail = get_in_connection(connection, id)?;
    if detail.sale.status == "DRAFT" {
        return Err(SalesError::Validation(
            "Confirme a venda antes de emitir o comprovante.".into(),
        ));
    }
    let (doc, page, layer_index) = PdfDocument::new(
        "Comprovante não fiscal",
        Mm(210.0),
        Mm(297.0),
        "Comprovante",
    );
    let regular = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|error| SalesError::Pdf(error.to_string()))?;
    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|error| SalesError::Pdf(error.to_string()))?;
    let mut page_index = page;
    let mut current_layer_index = layer_index;
    let mut y = 282.0_f32;
    let draw_header = |layer: &PdfLayerReference, y: &mut f32| {
        pdf_text(layer, &bold, "CAIXA NO CONTROLE", 15.0, 15.0, *y);
        *y -= 8.0;
        pdf_text(layer, &bold, &detail.business.name, 13.0, 15.0, *y);
        *y -= 6.0;
        let business_line = [
            detail.business.document_number.as_deref(),
            detail.business.phone.as_deref(),
            detail.business.email.as_deref(),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("  |  ");
        pdf_text(layer, &regular, &business_line, 8.5, 15.0, *y);
        *y -= 10.0;
        pdf_text(
            layer,
            &bold,
            "COMPROVANTE DE VENDA - DOCUMENTO SEM VALOR FISCAL",
            11.0,
            15.0,
            *y,
        );
        *y -= 9.0;
    };
    {
        let layer = doc.get_page(page_index).get_layer(current_layer_index);
        draw_header(&layer, &mut y);
        pdf_text(
            &layer,
            &regular,
            &format!("Venda: {}", detail.sale.number),
            10.0,
            15.0,
            y,
        );
        y -= 6.0;
        pdf_text(
            &layer,
            &regular,
            &format!("Data: {}", detail.sale.issue_date),
            10.0,
            15.0,
            y,
        );
        y -= 6.0;
        pdf_text(
            &layer,
            &regular,
            &format!("Cliente: {}", detail.sale.customer_name),
            10.0,
            15.0,
            y,
        );
        y -= 6.0;
        pdf_text(
            &layer,
            &regular,
            &format!("Forma de pagamento: {}", detail.sale.payment_method_name),
            10.0,
            15.0,
            y,
        );
        y -= 10.0;
        pdf_text(&layer, &bold, "Itens", 10.5, 15.0, y);
        y -= 7.0;
    }
    for (index, item) in detail.items.iter().enumerate() {
        if y < 35.0 {
            (page_index, current_layer_index) = receipt_page(&doc, "Continuação");
            y = 282.0;
            let layer = doc.get_page(page_index).get_layer(current_layer_index);
            draw_header(&layer, &mut y);
            pdf_text(&layer, &bold, "Itens (continuação)", 10.5, 15.0, y);
            y -= 7.0;
        }
        let layer = doc.get_page(page_index).get_layer(current_layer_index);
        let quantity = format!("{:.3}", item.quantity_millis as f64 / 1000.0).replace('.', ",");
        pdf_text(
            &layer,
            &regular,
            &format!("{}. {}", index + 1, truncate_chars(&item.description, 80)),
            9.0,
            15.0,
            y,
        );
        pdf_text(
            &layer,
            &regular,
            &format!("{quantity} {} x {}", item.unit, brl(item.unit_price_cents)),
            8.0,
            20.0,
            y - 4.5,
        );
        pdf_text(&layer, &bold, &brl(item.total_cents), 8.5, 165.0, y - 4.5);
        y -= 12.0;
    }
    if y < 75.0 {
        (page_index, current_layer_index) = receipt_page(&doc, "Totais");
        y = 282.0;
        let layer = doc.get_page(page_index).get_layer(current_layer_index);
        draw_header(&layer, &mut y);
    }
    let layer = doc.get_page(page_index).get_layer(current_layer_index);
    pdf_text(
        &layer,
        &regular,
        &format!("Total bruto: {}", brl(detail.sale.gross_amount_cents)),
        10.0,
        120.0,
        y,
    );
    y -= 6.0;
    pdf_text(
        &layer,
        &regular,
        &format!("Descontos: {}", brl(detail.sale.discount_amount_cents)),
        10.0,
        120.0,
        y,
    );
    y -= 6.0;
    pdf_text(
        &layer,
        &regular,
        &format!("Taxas: {}", brl(detail.sale.fee_amount_cents)),
        10.0,
        120.0,
        y,
    );
    y -= 7.0;
    pdf_text(
        &layer,
        &bold,
        &format!("TOTAL LÍQUIDO: {}", brl(detail.sale.net_amount_cents)),
        12.0,
        105.0,
        y,
    );
    y -= 12.0;
    if let Some(notes) = detail.sale.notes.as_deref() {
        pdf_text(&layer, &bold, "Observações:", 9.0, 15.0, y);
        y -= 5.0;
        for line in notes
            .chars()
            .collect::<Vec<_>>()
            .chunks(90)
            .map(|chunk| chunk.iter().collect::<String>())
            .take(5)
        {
            pdf_text(&layer, &regular, &line, 8.5, 15.0, y);
            y -= 5.0;
        }
    }
    pdf_text(&layer, &bold, "DOCUMENTO SEM VALOR FISCAL", 9.0, 68.0, 15.0);
    let mut writer = BufWriter::new(File::create(target)?);
    doc.save(&mut writer)
        .map_err(|error| SalesError::Pdf(error.to_string()))?;
    Ok(())
}

pub fn export_receipt_pdf(app: &AppHandle, id: &str, path: &str) -> Result<(), SalesError> {
    let connection = database::connection(app)?;
    export_pdf_in_connection(&connection, id, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute_batch(
            "INSERT INTO business_profile(id,legal_name,trade_name,business_type,created_at,updated_at) VALUES('business','Empresa Teste','Loja Teste','GENERAL','2026-01-01','2026-01-01');
             INSERT INTO local_users(id,name,username,password_hash,role,is_active,created_at,updated_at) VALUES('user','Admin','admin','$argon2id$test','ADMIN',1,'2026-01-01','2026-01-01');
             INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES('customer','PERSON',1,0,'Maria Cliente',1,0,'2026-01-01','2026-01-01','user','user');
             INSERT INTO categories(id,name,nature,is_system,is_active,display_order,created_at,updated_at,created_by,updated_by) VALUES('revenue','Vendas','REVENUE',0,1,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO financial_accounts(id,name,account_type,opening_balance_cents,opening_balance_date,is_default,is_active,created_at,updated_at,created_by,updated_by) VALUES('account','Caixa','CASH',100000,'2026-01-01',1,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO payment_methods(id,name,payment_type,is_system,is_active,created_at,updated_at,created_by,updated_by) VALUES('pix','Pix','PIX',0,1,'2026-01-01','2026-01-01','user','user');
             INSERT INTO catalog_items(id,item_type,name,sale_price_cents,unit,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES('item','PRODUCT','Produto teste',10000,'UN',1,0,'2026-01-01','2026-01-01','user','user');
             INSERT INTO app_preferences(id,business_id,default_financial_account_id,default_payment_method_id,default_view_regime,theme,created_at,updated_at) VALUES('preferences','business','account','pix','CASH','LIGHT','2026-01-01','2026-01-01');
             INSERT INTO app_license(id,edition,activation_status,trial_usage_count,created_at,updated_at) VALUES('license','ESSENTIAL','ACTIVE',0,'2026-01-01','2026-01-01');",
        ).unwrap();
        connection
    }

    fn input(mode: &str, status: &str) -> SaleInput {
        SaleInput {
            id: None,
            customer_id: "customer".into(),
            category_id: "revenue".into(),
            issue_date: "2026-02-01".into(),
            description: "Venda de produtos".into(),
            discount_amount_cents: 500,
            fee_amount_cents: 200,
            receipt_mode: mode.into(),
            payment_method_id: "pix".into(),
            financial_account_id: Some("account".into()),
            installment_count: if mode == "INSTALLMENTS" { 3 } else { 1 },
            first_due_date: "2026-02-10".into(),
            received_now_cents: if mode == "IMMEDIATE" {
                18_800
            } else if mode == "MIXED" {
                8_800
            } else {
                0
            },
            status: status.into(),
            notes: Some("Obrigado pela preferência".into()),
            items: vec![SaleItemInput {
                catalog_item_id: Some("item".into()),
                description: "Produto teste".into(),
                quantity_millis: 2_000,
                unit: "UN".into(),
                unit_price_cents: 10_000,
                discount_cents: 500,
            }],
        }
    }

    #[test]
    fn calculates_and_freezes_sale_item_values() {
        let connection = database();
        let result = save_in_connection(&connection, &input("FUTURE", "DRAFT")).unwrap();
        let detail = get_in_connection(&connection, &result.id).unwrap();
        assert_eq!(detail.sale.gross_amount_cents, 20_000);
        assert_eq!(detail.sale.discount_amount_cents, 1_000);
        assert_eq!(detail.sale.fee_amount_cents, 200);
        assert_eq!(detail.sale.net_amount_cents, 18_800);
        connection
            .execute(
                "UPDATE catalog_items SET sale_price_cents=99999,name='Alterado' WHERE id='item'",
                [],
            )
            .unwrap();
        let frozen = get_in_connection(&connection, &result.id).unwrap();
        assert_eq!(frozen.items[0].unit_price_cents, 10_000);
        assert_eq!(frozen.items[0].description, "Produto teste");
    }

    #[test]
    fn confirms_installments_once_with_exact_rounding() {
        let connection = database();
        let result = save_in_connection(&connection, &input("INSTALLMENTS", "CONFIRMED")).unwrap();
        assert_eq!(result.financial_entry_ids.len(), 3);
        let amounts = connection.prepare("SELECT gross_amount_cents FROM financial_entries WHERE origin_id=?1 ORDER BY installment_number").unwrap().query_map([&result.id], |row| row.get::<_, i64>(0)).unwrap().collect::<Result<Vec<_>,_>>().unwrap();
        assert_eq!(amounts, vec![6_266, 6_266, 6_268]);
        connection
            .execute("UPDATE catalog_items SET is_active=0 WHERE id='item'", [])
            .unwrap();
        let mut replay = input("INSTALLMENTS", "CONFIRMED");
        replay.id = Some(result.id.clone());
        let second = save_in_connection(&connection, &replay).unwrap();
        assert!(second.idempotent_replay);
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM financial_entries WHERE origin_id=?1",
                    [&result.id],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            3
        );
    }

    #[test]
    fn installment_sale_consumes_one_trial_operation_and_next_is_blocked() {
        let connection = database();
        connection
            .execute(
                "UPDATE app_license SET activation_status='TRIAL',trial_ends_at=NULL,trial_entry_limit=50,trial_usage_count=49",
                [],
            )
            .unwrap();
        assert!(save_in_connection(&connection, &input("INSTALLMENTS", "CONFIRMED")).is_ok());
        let counts_before = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM sales),(SELECT COUNT(*) FROM sale_items),(SELECT COUNT(*) FROM financial_entries),trial_usage_count FROM app_license",
                [],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?)),
            )
            .unwrap();
        assert_eq!(counts_before.3, 50);
        assert!(save_in_connection(&connection, &input("INSTALLMENTS", "CONFIRMED")).is_err());
        let counts_after = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM sales),(SELECT COUNT(*) FROM sale_items),(SELECT COUNT(*) FROM financial_entries),trial_usage_count FROM app_license",
                [],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?)),
            )
            .unwrap();
        assert_eq!(counts_after, counts_before);
    }

    #[test]
    fn creates_mixed_receipt_and_tracks_sale_status_after_settlement() {
        let connection = database();
        let result = save_in_connection(&connection, &input("MIXED", "CONFIRMED")).unwrap();
        let detail = get_in_connection(&connection, &result.id).unwrap();
        assert_eq!(detail.sale.status, "PARTIALLY_RECEIVED");
        assert_eq!(detail.sale.received_amount_cents, 8_800);
        assert_eq!(detail.sale.remaining_amount_cents, 10_000);
        let pending = detail
            .receivables
            .iter()
            .find(|entry| entry.persisted_status == "PENDING")
            .unwrap();
        finance::settle_in_connection(
            &connection,
            &finance::SettlementInput {
                entry_id: pending.id.clone(),
                settlement_date: "2026-02-10".into(),
                financial_account_id: "account".into(),
                payment_method_id: "pix".into(),
                amount_cents: 10_000,
                discount_amount_cents: 0,
                fee_amount_cents: 0,
                interest_amount_cents: 0,
                penalty_amount_cents: 0,
                notes: None,
            },
        )
        .unwrap();
        assert_eq!(
            get_in_connection(&connection, &result.id)
                .unwrap()
                .sale
                .status,
            "RECEIVED"
        );
    }

    #[test]
    fn refuses_cancel_until_receipt_is_reversed_then_cancels_pending() {
        let connection = database();
        let result = save_in_connection(&connection, &input("MIXED", "CONFIRMED")).unwrap();
        assert!(cancel_in_connection(&connection, &result.id, "Cliente desistiu").is_err());
        let settled: String = connection
            .query_row(
                "SELECT id FROM financial_entries WHERE origin_id=?1 AND status='SETTLED'",
                [&result.id],
                |row| row.get(0),
            )
            .unwrap();
        finance::reverse_entry_in_connection(
            &connection,
            &settled,
            "2026-02-02",
            "Recebimento devolvido",
        )
        .unwrap();
        cancel_in_connection(&connection, &result.id, "Cliente desistiu").unwrap();
        let detail = get_in_connection(&connection, &result.id).unwrap();
        assert_eq!(detail.sale.status, "CANCELED");
        assert!(detail
            .receivables
            .iter()
            .any(|entry| entry.display_status == "CANCELED"));
        assert!(detail
            .receivables
            .iter()
            .any(|entry| entry.display_status == "REVERSED"));
    }

    #[test]
    fn writes_a_real_non_fiscal_pdf() {
        let connection = database();
        let result = save_in_connection(&connection, &input("IMMEDIATE", "CONFIRMED")).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("comprovante.pdf");
        export_pdf_in_connection(&connection, &result.id, path.to_str().unwrap()).unwrap();
        let bytes = std::fs::read(path).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        assert!(bytes.len() > 1_000);
    }
}
