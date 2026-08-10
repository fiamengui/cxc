use std::{collections::HashMap, fs, path::PathBuf};

use chrono::NaiveDate;
use csv::{ReaderBuilder, Trim, WriterBuilder};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use thiserror::Error;
use uuid::Uuid;

use crate::database::{self, DatabaseError};

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const MAX_CSV_BYTES: u64 = 10 * 1024 * 1024;
const MAX_CSV_ROWS: usize = 10_000;
type CsvRow = HashMap<String, String>;
type CsvRows = Vec<(usize, CsvRow)>;

#[derive(Debug, Error)]
pub enum MasterError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error("falha ao acessar arquivo: {0}")]
    Io(#[from] std::io::Error),
    #[error("arquivo CSV inválido: {0}")]
    Csv(#[from] csv::Error),
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    pub search: String,
    #[serde(default = "default_filter")]
    pub filter: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_filter() -> String {
    "ALL".into()
}
fn default_status() -> String {
    "ACTIVE".into()
}
fn default_limit() -> i64 {
    25
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput {
    pub id: Option<String>,
    pub name: String,
    pub contact_kind: String,
    pub role_customer: bool,
    pub role_supplier: bool,
    pub trade_name: Option<String>,
    pub document_number: Option<String>,
    pub phone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSummary {
    pub id: String,
    pub name: String,
    pub contact_kind: String,
    pub role_customer: bool,
    pub role_supplier: bool,
    pub document_number: Option<String>,
    pub phone: Option<String>,
    pub city: Option<String>,
    pub is_active: bool,
    pub is_demo: bool,
    pub total_moved_cents: i64,
    pub receivable_cents: i64,
    pub payable_cents: i64,
    pub last_movement_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub action: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactDetail {
    pub id: String,
    pub name: String,
    pub contact_kind: String,
    pub role_customer: bool,
    pub role_supplier: bool,
    pub trade_name: Option<String>,
    pub document_number: Option<String>,
    pub phone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub is_active: bool,
    pub is_demo: bool,
    pub total_moved_cents: i64,
    pub receivable_cents: i64,
    pub payable_cents: i64,
    pub last_movement_at: Option<String>,
    pub history: Vec<AuditEntry>,
    pub financial_entries: Vec<ContactFinancialEntry>,
    pub sales: Vec<ContactSale>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactFinancialEntry {
    pub id: String,
    pub entry_type: String,
    pub description: String,
    pub issue_date: String,
    pub due_date: Option<String>,
    pub gross_amount_cents: i64,
    pub remaining_amount_cents: i64,
    pub display_status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSale {
    pub id: String,
    pub number: String,
    pub issue_date: String,
    pub description: String,
    pub net_amount_cents: i64,
    pub received_amount_cents: i64,
    pub remaining_amount_cents: i64,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCandidate {
    pub id: String,
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    pub id: Option<String>,
    pub name: String,
    pub nature: String,
    pub parent_id: Option<String>,
    pub color_reference: Option<String>,
    pub icon_reference: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub id: Option<String>,
    pub name: String,
    pub account_type: String,
    pub institution: Option<String>,
    pub opening_balance_cents: i64,
    pub opening_balance_date: String,
    pub color_reference: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethodInput {
    pub id: Option<String>,
    pub name: String,
    pub payment_type: String,
    pub default_fee_basis_points: i64,
    pub default_receipt_delay_days: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceItem {
    pub id: String,
    pub name: String,
    pub detail: String,
    pub is_active: bool,
    pub is_system: bool,
    pub parent_id: Option<String>,
    pub institution: Option<String>,
    pub amount_cents: Option<i64>,
    pub date: Option<String>,
    pub color_reference: Option<String>,
    pub is_default: bool,
    pub fee_basis_points: Option<i64>,
    pub receipt_delay_days: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItemInput {
    pub id: Option<String>,
    pub name: String,
    pub item_type: String,
    pub code: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub sale_price_cents: i64,
    pub cost_price_cents: Option<i64>,
    pub unit: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub id: String,
    pub item_type: String,
    pub code: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub sale_price_cents: i64,
    pub cost_price_cents: Option<i64>,
    pub unit: String,
    pub is_active: bool,
    pub is_demo: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvFilePreview {
    pub headers: Vec<String>,
    pub sample_rows: Vec<Vec<String>>,
    pub total_rows: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactCsvMapping {
    pub name: String,
    pub contact_kind: Option<String>,
    pub role_customer: Option<String>,
    pub role_supplier: Option<String>,
    pub trade_name: Option<String>,
    pub document_number: Option<String>,
    pub phone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactImportRow {
    pub line: usize,
    pub name: String,
    pub document_number: Option<String>,
    pub errors: Vec<String>,
    pub possible_duplicates: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactImportPreview {
    pub rows: Vec<ContactImportRow>,
    pub total_rows: usize,
    pub valid_rows: usize,
    pub error_rows: usize,
    pub duplicate_rows: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
}

fn required<'a>(value: &'a str, label: &str) -> Result<&'a str, MasterError> {
    let trimmed = value.trim();
    if trimmed.chars().count() < 2 {
        Err(MasterError::Validation(format!("Informe {label}.")))
    } else {
        Ok(trimmed)
    }
}

fn optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn actor_user_id(connection: &Connection) -> Result<Option<String>, rusqlite::Error> {
    connection
        .query_row(
            "SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
}

fn stamp_actor(
    connection: &Connection,
    table: &str,
    id: &str,
    created: bool,
) -> Result<(), MasterError> {
    let table = match table {
        "contacts" | "catalog_items" | "categories" | "financial_accounts" | "payment_methods" => {
            table
        }
        _ => return Err(MasterError::Validation("Cadastro desconhecido.".into())),
    };
    let actor = actor_user_id(connection)?;
    if created {
        connection.execute(
            &format!("UPDATE {table} SET created_by=?2,updated_by=?2 WHERE id=?1"),
            params![id, actor],
        )?;
    } else {
        connection.execute(
            &format!("UPDATE {table} SET updated_by=?2 WHERE id=?1"),
            params![id, actor],
        )?;
    }
    Ok(())
}

fn audit(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    summary: &str,
) -> Result<(), MasterError> {
    connection.execute(
        &format!("INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,?3,?4,?5,?6,{NOW})"),
        params![Uuid::new_v4().to_string(), actor_user_id(connection)?, entity_type, entity_id, action, summary],
    )?;
    Ok(())
}

fn validate_contact(input: &ContactInput) -> Result<(), MasterError> {
    required(&input.name, "o nome do contato")?;
    if !["PERSON", "COMPANY"].contains(&input.contact_kind.as_str()) {
        return Err(MasterError::Validation("Tipo de contato inválido.".into()));
    }
    if !input.role_customer && !input.role_supplier {
        return Err(MasterError::Validation(
            "O contato deve ser cliente, fornecedor ou ambos.".into(),
        ));
    }
    if optional(&input.email).is_some_and(|value| !value.contains('@')) {
        return Err(MasterError::Validation("E-mail inválido.".into()));
    }
    if optional(&input.state).is_some_and(|value| value.chars().count() > 3) {
        return Err(MasterError::Validation("Estado inválido.".into()));
    }
    Ok(())
}

fn tags_json(tags: &[String]) -> Result<String, MasterError> {
    let normalized = tags
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    serde_json::to_string(&normalized).map_err(|error| MasterError::Validation(error.to_string()))
}

fn parse_tags(value: Option<String>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    serde_json::from_str(&value).unwrap_or_else(|_| {
        value
            .split(',')
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(str::to_owned)
            .collect()
    })
}

fn validate_query(query: &ListQuery) -> Result<(), MasterError> {
    if !(1..=100).contains(&query.limit) || query.offset < 0 {
        return Err(MasterError::Validation("Paginação inválida.".into()));
    }
    Ok(())
}

pub fn list_contacts(
    app: &AppHandle,
    query: ListQuery,
) -> Result<Page<ContactSummary>, MasterError> {
    validate_query(&query)?;
    let connection = database::connection(app)?;
    list_contacts_in_connection(&connection, &query)
}

fn list_contacts_in_connection(
    connection: &Connection,
    query: &ListQuery,
) -> Result<Page<ContactSummary>, MasterError> {
    let search = query.search.trim();
    let role = query.filter.as_str();
    let status = query.status.as_str();
    let where_sql = "deleted_at IS NULL AND (?1='' OR name LIKE '%'||?1||'%' COLLATE NOCASE OR COALESCE(trade_name,'') LIKE '%'||?1||'%' COLLATE NOCASE OR COALESCE(document_number,'') LIKE '%'||?1||'%' OR COALESCE(phone,'') LIKE '%'||?1||'%' OR COALESCE(whatsapp,'') LIKE '%'||?1||'%') AND (?2='ALL' OR (?2='CUSTOMER' AND role_customer=1) OR (?2='SUPPLIER' AND role_supplier=1) OR (?2='BOTH' AND role_customer=1 AND role_supplier=1)) AND (?3='ALL' OR (?3='ACTIVE' AND is_active=1) OR (?3='INACTIVE' AND is_active=0))";
    let total = connection.query_row(
        &format!("SELECT COUNT(*) FROM contacts WHERE {where_sql}"),
        params![search, role, status],
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(&format!("SELECT c.id,c.name,c.contact_kind,c.role_customer,c.role_supplier,c.document_number,c.phone,c.city,c.is_active,c.is_demo,COALESCE((SELECT SUM(s.net_amount_cents) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE e.contact_id=c.id AND e.entry_type NOT IN ('REVERSAL','TRANSFER_IN','TRANSFER_OUT') AND e.reversed_at IS NULL),0),COALESCE((SELECT SUM(e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)) FROM financial_entries e WHERE e.contact_id=c.id AND e.entry_type='REVENUE' AND e.status='PENDING' AND e.reversed_at IS NULL AND e.deleted_at IS NULL),0),COALESCE((SELECT SUM(e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)) FROM financial_entries e WHERE e.contact_id=c.id AND e.entry_type='EXPENSE' AND e.status='PENDING' AND e.reversed_at IS NULL AND e.deleted_at IS NULL),0),(SELECT MAX(e.issue_date) FROM financial_entries e WHERE e.contact_id=c.id AND e.status<>'CANCELED' AND e.deleted_at IS NULL) FROM contacts c WHERE {where_sql} ORDER BY c.name COLLATE NOCASE LIMIT ?4 OFFSET ?5"))?;
    let items = statement
        .query_map(
            params![search, role, status, query.limit, query.offset],
            |row| {
                Ok(ContactSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    contact_kind: row.get(2)?,
                    role_customer: row.get(3)?,
                    role_supplier: row.get(4)?,
                    document_number: row.get(5)?,
                    phone: row.get(6)?,
                    city: row.get(7)?,
                    is_active: row.get(8)?,
                    is_demo: row.get(9)?,
                    total_moved_cents: row.get(10)?,
                    receivable_cents: row.get(11)?,
                    payable_cents: row.get(12)?,
                    last_movement_at: row.get(13)?,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Page { items, total })
}

pub fn contact_duplicates(
    app: &AppHandle,
    input: ContactInput,
) -> Result<Vec<DuplicateCandidate>, MasterError> {
    let connection = database::connection(app)?;
    contact_duplicates_in_connection(&connection, &input)
}

fn contact_duplicates_in_connection(
    connection: &Connection,
    input: &ContactInput,
) -> Result<Vec<DuplicateCandidate>, MasterError> {
    let document = optional(&input.document_number).unwrap_or_default();
    let phone = optional(&input.phone).unwrap_or_default();
    let whatsapp = optional(&input.whatsapp).unwrap_or_default();
    let email = optional(&input.email).unwrap_or_default();
    let excluded = input.id.as_deref().unwrap_or("");
    let mut statement = connection.prepare("SELECT id,name,CASE WHEN ?2<>'' AND document_number=?2 THEN 'Mesmo documento' WHEN (?3<>'' AND (phone=?3 OR whatsapp=?3)) OR (?4<>'' AND (phone=?4 OR whatsapp=?4)) THEN 'Mesmo telefone' WHEN ?5<>'' AND lower(email)=lower(?5) THEN 'Mesmo e-mail' ELSE 'Mesmo nome' END FROM contacts WHERE deleted_at IS NULL AND id<>?1 AND ((?2<>'' AND document_number=?2) OR (?3<>'' AND (phone=?3 OR whatsapp=?3)) OR (?4<>'' AND (phone=?4 OR whatsapp=?4)) OR (?5<>'' AND lower(email)=lower(?5)) OR lower(name)=lower(?6)) ORDER BY name LIMIT 10")?;
    let candidates = statement
        .query_map(
            params![
                excluded,
                document,
                phone,
                whatsapp,
                email,
                input.name.trim()
            ],
            |row| {
                Ok(DuplicateCandidate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    reason: row.get(2)?,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(candidates)
}

pub fn save_contact(app: &AppHandle, input: ContactInput) -> Result<String, MasterError> {
    let connection = database::connection(app)?;
    save_contact_in_connection(&connection, &input)
}

fn save_contact_in_connection(
    connection: &Connection,
    input: &ContactInput,
) -> Result<String, MasterError> {
    validate_contact(input)?;
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM contacts WHERE id=?1 AND deleted_at IS NULL)",
        [&id],
        |row| row.get(0),
    )?;
    let tx = connection.unchecked_transaction()?;
    if input.id.is_some() {
        if !exists {
            return Err(MasterError::Validation("Contato não encontrado.".into()));
        }
        tx.execute(&format!("UPDATE contacts SET contact_kind=?2,role_customer=?3,role_supplier=?4,name=?5,trade_name=?6,document_number=?7,phone=?8,whatsapp=?9,email=?10,address=?11,city=?12,state=?13,postal_code=?14,notes=?15,tags=?16,updated_at={NOW} WHERE id=?1 AND deleted_at IS NULL"),params![id,input.contact_kind,input.role_customer,input.role_supplier,input.name.trim(),optional(&input.trade_name),optional(&input.document_number),optional(&input.phone),optional(&input.whatsapp),optional(&input.email),optional(&input.address),optional(&input.city),optional(&input.state).map(|v|v.to_uppercase()),optional(&input.postal_code),optional(&input.notes),tags_json(&input.tags)?])?;
        stamp_actor(&tx, "contacts", &id, false)?;
        audit(&tx, "contact", &id, "UPDATE", "Contato atualizado")?;
    } else {
        tx.execute(&format!("INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,trade_name,document_number,phone,whatsapp,email,address,city,state,postal_code,notes,tags,is_active,is_demo,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,1,0,{NOW},{NOW})"),params![id,input.contact_kind,input.role_customer,input.role_supplier,input.name.trim(),optional(&input.trade_name),optional(&input.document_number),optional(&input.phone),optional(&input.whatsapp),optional(&input.email),optional(&input.address),optional(&input.city),optional(&input.state).map(|v|v.to_uppercase()),optional(&input.postal_code),optional(&input.notes),tags_json(&input.tags)?])?;
        stamp_actor(&tx, "contacts", &id, true)?;
        audit(&tx, "contact", &id, "CREATE", "Contato criado")?;
    }
    tx.commit()?;
    Ok(id)
}

pub fn get_contact(app: &AppHandle, id: &str) -> Result<ContactDetail, MasterError> {
    let connection = database::connection(app)?;
    let mut detail = connection
        .query_row("SELECT c.id,c.name,c.contact_kind,c.role_customer,c.role_supplier,c.trade_name,c.document_number,c.phone,c.whatsapp,c.email,c.address,c.city,c.state,c.postal_code,c.notes,c.tags,c.is_active,c.is_demo,COALESCE((SELECT SUM(s.net_amount_cents) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE e.contact_id=c.id AND e.entry_type NOT IN ('REVERSAL','TRANSFER_IN','TRANSFER_OUT') AND e.reversed_at IS NULL),0),COALESCE((SELECT SUM(e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)) FROM financial_entries e WHERE e.contact_id=c.id AND e.entry_type='REVENUE' AND e.status='PENDING' AND e.reversed_at IS NULL),0),COALESCE((SELECT SUM(e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)) FROM financial_entries e WHERE e.contact_id=c.id AND e.entry_type='EXPENSE' AND e.status='PENDING' AND e.reversed_at IS NULL),0),(SELECT MAX(e.issue_date) FROM financial_entries e WHERE e.contact_id=c.id AND e.status<>'CANCELED' AND e.deleted_at IS NULL) FROM contacts c WHERE c.id=?1 AND c.deleted_at IS NULL",[id],|row|Ok(ContactDetail{id:row.get(0)?,name:row.get(1)?,contact_kind:row.get(2)?,role_customer:row.get(3)?,role_supplier:row.get(4)?,trade_name:row.get(5)?,document_number:row.get(6)?,phone:row.get(7)?,whatsapp:row.get(8)?,email:row.get(9)?,address:row.get(10)?,city:row.get(11)?,state:row.get(12)?,postal_code:row.get(13)?,notes:row.get(14)?,tags:parse_tags(row.get(15)?),is_active:row.get(16)?,is_demo:row.get(17)?,total_moved_cents:row.get(18)?,receivable_cents:row.get(19)?,payable_cents:row.get(20)?,last_movement_at:row.get(21)?,history:Vec::new(),financial_entries:Vec::new(),sales:Vec::new()}))
        .optional()?
        .ok_or_else(|| MasterError::Validation("Contato não encontrado.".into()))?;
    let mut statement = connection.prepare("SELECT action,summary,created_at FROM audit_logs WHERE entity_type='contact' AND entity_id=?1 ORDER BY created_at DESC LIMIT 100")?;
    detail.history = statement
        .query_map([id], |row| {
            Ok(AuditEntry {
                action: row.get(0)?,
                summary: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut financial_statement = connection.prepare("SELECT e.id,e.entry_type,e.description,e.issue_date,e.due_date,e.gross_amount_cents,CASE WHEN e.status IN ('SETTLED','CANCELED') OR e.reversed_at IS NOT NULL THEN 0 ELSE e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0) END,CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' WHEN e.status='CANCELED' THEN 'CANCELED' WHEN e.status='SETTLED' THEN 'SETTLED' WHEN e.due_date<date('now','localtime') THEN 'OVERDUE' WHEN EXISTS(SELECT 1 FROM entry_settlements s WHERE s.entry_id=e.id) THEN 'PARTIAL' ELSE e.status END FROM financial_entries e WHERE e.contact_id=?1 AND e.deleted_at IS NULL ORDER BY e.issue_date DESC,e.created_at DESC LIMIT 200")?;
    detail.financial_entries = financial_statement
        .query_map([id], |row| {
            Ok(ContactFinancialEntry {
                id: row.get(0)?,
                entry_type: row.get(1)?,
                description: row.get(2)?,
                issue_date: row.get(3)?,
                due_date: row.get(4)?,
                gross_amount_cents: row.get(5)?,
                remaining_amount_cents: row.get(6)?,
                display_status: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut sales_statement = connection.prepare("SELECT s.id,s.number,s.issue_date,s.description,s.net_amount_cents,COALESCE((SELECT SUM(st.net_amount_cents) FROM financial_entries e JOIN entry_settlements st ON st.entry_id=e.id WHERE e.origin_type='SALE' AND e.origin_id=s.id AND e.reversed_at IS NULL),0),COALESCE((SELECT SUM(e.gross_amount_cents-COALESCE((SELECT SUM(st.principal_amount_cents) FROM entry_settlements st WHERE st.entry_id=e.id),0)) FROM financial_entries e WHERE e.origin_type='SALE' AND e.origin_id=s.id AND e.status='PENDING' AND e.reversed_at IS NULL),0),s.status FROM sales s WHERE s.customer_id=?1 AND s.deleted_at IS NULL ORDER BY s.issue_date DESC,s.number DESC LIMIT 200")?;
    detail.sales = sales_statement
        .query_map([id], |row| {
            Ok(ContactSale {
                id: row.get(0)?,
                number: row.get(1)?,
                issue_date: row.get(2)?,
                description: row.get(3)?,
                net_amount_cents: row.get(4)?,
                received_amount_cents: row.get(5)?,
                remaining_amount_cents: row.get(6)?,
                status: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(detail)
}

pub fn list_reference_data(
    app: &AppHandle,
    resource: &str,
) -> Result<Vec<ReferenceItem>, MasterError> {
    let connection = database::connection(app)?;
    let sql = match resource {
        "categories" => "SELECT c.id,c.name,CASE c.nature WHEN 'REVENUE' THEN 'REVENUE' ELSE 'EXPENSE' END,c.is_active,c.is_system,c.parent_id,NULL,NULL,NULL,c.color_reference,0,NULL,NULL FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.nature,c.display_order,c.name",
        "accounts" => "SELECT id,name,account_type,is_active,0,NULL,institution,opening_balance_cents,opening_balance_date,color_reference,is_default,NULL,NULL FROM financial_accounts WHERE deleted_at IS NULL ORDER BY is_default DESC,name",
        "paymentMethods" => "SELECT id,name,payment_type,is_active,is_system,NULL,NULL,NULL,NULL,NULL,0,default_fee_basis_points,default_receipt_delay_days FROM payment_methods ORDER BY is_system DESC,name",
        _ => return Err(MasterError::Validation("Cadastro desconhecido.".into())),
    };
    let mut statement = connection.prepare(sql)?;
    let items = statement
        .query_map([], reference_item)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

fn reference_item(row: &Row<'_>) -> rusqlite::Result<ReferenceItem> {
    Ok(ReferenceItem {
        id: row.get(0)?,
        name: row.get(1)?,
        detail: row.get(2)?,
        is_active: row.get(3)?,
        is_system: row.get(4)?,
        parent_id: row.get(5)?,
        institution: row.get(6)?,
        amount_cents: row.get(7)?,
        date: row.get(8)?,
        color_reference: row.get(9)?,
        is_default: row.get(10)?,
        fee_basis_points: row.get(11)?,
        receipt_delay_days: row.get(12)?,
    })
}

pub fn save_category(app: &AppHandle, input: CategoryInput) -> Result<String, MasterError> {
    let connection = database::connection(app)?;
    save_category_in_connection(&connection, &input)
}

fn save_category_in_connection(
    connection: &Connection,
    input: &CategoryInput,
) -> Result<String, MasterError> {
    let name = required(&input.name, "o nome da categoria")?;
    if !["REVENUE", "EXPENSE"].contains(&input.nature.as_str()) {
        return Err(MasterError::Validation("Natureza inválida.".into()));
    }
    if input.id.is_some() && input.id.as_ref() == input.parent_id.as_ref() {
        return Err(MasterError::Validation(
            "Uma categoria não pode ser filha dela mesma.".into(),
        ));
    }
    if let Some(parent) = input.parent_id.as_deref() {
        let valid_parent: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM categories WHERE id=?1 AND nature=?2 AND deleted_at IS NULL)",params![parent,input.nature],|row|row.get(0))?;
        if !valid_parent {
            return Err(MasterError::Validation(
                "A categoria-pai deve ter a mesma natureza.".into(),
            ));
        }
        if let Some(current_id) = input.id.as_deref() {
            let creates_cycle: bool = connection.query_row(
                "WITH RECURSIVE descendants(id) AS (SELECT id FROM categories WHERE parent_id=?1 AND deleted_at IS NULL UNION SELECT c.id FROM categories c JOIN descendants d ON c.parent_id=d.id WHERE c.deleted_at IS NULL) SELECT EXISTS(SELECT 1 FROM descendants WHERE id=?2)",
                params![current_id, parent],
                |row| row.get(0),
            )?;
            if creates_cycle {
                return Err(MasterError::Validation(
                    "A categoria-pai não pode ser uma subcategoria deste cadastro.".into(),
                ));
            }
        }
    }
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let duplicate: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM categories WHERE lower(name)=lower(?1) AND nature=?2 AND COALESCE(parent_id,'')=COALESCE(?3,'') AND deleted_at IS NULL AND id<>?4)",
        params![name, input.nature, input.parent_id, id],
        |row| row.get(0),
    )?;
    if duplicate {
        return Err(MasterError::Validation(
            "Já existe uma categoria com esse nome e nível.".into(),
        ));
    }
    let tx = connection.unchecked_transaction()?;
    if input.id.is_some() {
        let changed = tx.execute(&format!("UPDATE categories SET name=?2,nature=?3,parent_id=?4,color_reference=?5,icon_reference=?6,updated_at={NOW} WHERE id=?1 AND deleted_at IS NULL"),params![id,name,input.nature,input.parent_id,optional(&input.color_reference),optional(&input.icon_reference)])?;
        if changed == 0 {
            return Err(MasterError::Validation("Categoria não encontrada.".into()));
        }
        stamp_actor(&tx, "categories", &id, false)?;
        audit(&tx, "category", &id, "UPDATE", "Categoria atualizada")?;
    } else {
        tx.execute(&format!("INSERT INTO categories(id,name,nature,parent_id,color_reference,icon_reference,is_system,is_active,display_order,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,0,1,999,{NOW},{NOW})"),params![id,name,input.nature,input.parent_id,optional(&input.color_reference),optional(&input.icon_reference)])?;
        stamp_actor(&tx, "categories", &id, true)?;
        audit(&tx, "category", &id, "CREATE", "Categoria criada")?;
    }
    tx.commit()?;
    Ok(id)
}

pub fn save_account(app: &AppHandle, input: AccountInput) -> Result<String, MasterError> {
    let connection = database::connection(app)?;
    save_account_in_connection(&connection, &input)
}

fn save_account_in_connection(
    connection: &Connection,
    input: &AccountInput,
) -> Result<String, MasterError> {
    let name = required(&input.name, "o nome da conta")?;
    if !["CASH", "BANK", "DIGITAL", "WALLET", "RESERVE", "OTHER"]
        .contains(&input.account_type.as_str())
        || input.opening_balance_cents < 0
        || NaiveDate::parse_from_str(&input.opening_balance_date, "%Y-%m-%d").is_err()
    {
        return Err(MasterError::Validation(
            "Revise tipo, saldo e data da conta.".into(),
        ));
    }
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let duplicate: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM financial_accounts WHERE lower(name)=lower(?1) AND deleted_at IS NULL AND id<>?2)",
        params![name, id],
        |row| row.get(0),
    )?;
    if duplicate {
        return Err(MasterError::Validation(
            "Já existe uma conta financeira com esse nome.".into(),
        ));
    }
    if input.id.is_some() && !input.is_default {
        let was_default: bool = connection
            .query_row(
                "SELECT is_default FROM financial_accounts WHERE id=?1 AND deleted_at IS NULL",
                [&id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| MasterError::Validation("Conta não encontrada.".into()))?;
        if was_default {
            return Err(MasterError::Validation(
                "Defina outra conta como padrão antes de remover esta seleção.".into(),
            ));
        }
    }
    let tx = connection.unchecked_transaction()?;
    if input.is_default {
        tx.execute(
            "UPDATE financial_accounts SET is_default=0 WHERE deleted_at IS NULL",
            [],
        )?;
    }
    if input.id.is_some() {
        let changed=tx.execute(&format!("UPDATE financial_accounts SET name=?2,account_type=?3,institution=?4,opening_balance_cents=?5,opening_balance_date=?6,color_reference=?7,is_default=?8,updated_at={NOW} WHERE id=?1 AND deleted_at IS NULL"),params![id,name,input.account_type,optional(&input.institution),input.opening_balance_cents,input.opening_balance_date,optional(&input.color_reference),input.is_default])?;
        if changed == 0 {
            return Err(MasterError::Validation("Conta não encontrada.".into()));
        }
        stamp_actor(&tx, "financial_accounts", &id, false)?;
        audit(
            &tx,
            "financial_account",
            &id,
            "UPDATE",
            "Conta financeira atualizada",
        )?;
    } else {
        tx.execute(&format!("INSERT INTO financial_accounts(id,name,account_type,institution,opening_balance_cents,opening_balance_date,color_reference,is_default,is_active,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,1,{NOW},{NOW})"),params![id,name,input.account_type,optional(&input.institution),input.opening_balance_cents,input.opening_balance_date,optional(&input.color_reference),input.is_default])?;
        stamp_actor(&tx, "financial_accounts", &id, true)?;
        audit(
            &tx,
            "financial_account",
            &id,
            "CREATE",
            "Conta financeira criada",
        )?;
    }
    if input.is_default {
        tx.execute(
            &format!("UPDATE app_preferences SET default_financial_account_id=?1,updated_at={NOW}"),
            [&id],
        )?;
    }
    tx.commit()?;
    Ok(id)
}

pub fn save_payment_method(
    app: &AppHandle,
    input: PaymentMethodInput,
) -> Result<String, MasterError> {
    let connection = database::connection(app)?;
    save_payment_method_in_connection(&connection, &input)
}

fn save_payment_method_in_connection(
    connection: &Connection,
    input: &PaymentMethodInput,
) -> Result<String, MasterError> {
    let name = required(&input.name, "o nome da forma de pagamento")?;
    if ![
        "CASH", "PIX", "DEBIT", "CREDIT", "BOLETO", "TRANSFER", "TERM", "OTHER",
    ]
    .contains(&input.payment_type.as_str())
        || !(0..=10000).contains(&input.default_fee_basis_points)
        || !(0..=3650).contains(&input.default_receipt_delay_days)
    {
        return Err(MasterError::Validation(
            "Revise tipo, taxa e prazo da forma de pagamento.".into(),
        ));
    }
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let duplicate: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM payment_methods WHERE lower(name)=lower(?1) AND id<>?2)",
        params![name, id],
        |row| row.get(0),
    )?;
    if duplicate {
        return Err(MasterError::Validation(
            "Já existe uma forma de pagamento com esse nome.".into(),
        ));
    }
    let tx = connection.unchecked_transaction()?;
    if input.id.is_some() {
        let changed=tx.execute(&format!("UPDATE payment_methods SET name=?2,payment_type=?3,default_fee_basis_points=?4,default_receipt_delay_days=?5,updated_at={NOW} WHERE id=?1"),params![id,name,input.payment_type,input.default_fee_basis_points,input.default_receipt_delay_days])?;
        if changed == 0 {
            return Err(MasterError::Validation(
                "Forma de pagamento não encontrada.".into(),
            ));
        }
        stamp_actor(&tx, "payment_methods", &id, false)?;
        audit(
            &tx,
            "payment_method",
            &id,
            "UPDATE",
            "Forma de pagamento atualizada",
        )?;
    } else {
        tx.execute(&format!("INSERT INTO payment_methods(id,name,payment_type,default_fee_basis_points,default_receipt_delay_days,is_system,is_active,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,0,1,{NOW},{NOW})"),params![id,name,input.payment_type,input.default_fee_basis_points,input.default_receipt_delay_days])?;
        stamp_actor(&tx, "payment_methods", &id, true)?;
        audit(
            &tx,
            "payment_method",
            &id,
            "CREATE",
            "Forma de pagamento criada",
        )?;
    }
    tx.commit()?;
    Ok(id)
}

pub fn list_catalog(app: &AppHandle, query: ListQuery) -> Result<Page<CatalogItem>, MasterError> {
    validate_query(&query)?;
    let connection = database::connection(app)?;
    list_catalog_in_connection(&connection, &query)
}

fn list_catalog_in_connection(
    connection: &Connection,
    query: &ListQuery,
) -> Result<Page<CatalogItem>, MasterError> {
    let search = query.search.trim();
    let where_sql="deleted_at IS NULL AND (?1='' OR name LIKE '%'||?1||'%' COLLATE NOCASE OR COALESCE(code,'') LIKE '%'||?1||'%' OR COALESCE(category,'') LIKE '%'||?1||'%' COLLATE NOCASE) AND (?2='ALL' OR item_type=?2) AND (?3='ALL' OR (?3='ACTIVE' AND is_active=1) OR (?3='INACTIVE' AND is_active=0))";
    let total = connection.query_row(
        &format!("SELECT COUNT(*) FROM catalog_items WHERE {where_sql}"),
        params![search, query.filter, query.status],
        |row| row.get(0),
    )?;
    let mut statement=connection.prepare(&format!("SELECT id,item_type,code,name,description,category,sale_price_cents,cost_price_cents,unit,is_active,is_demo FROM catalog_items WHERE {where_sql} ORDER BY name COLLATE NOCASE LIMIT ?4 OFFSET ?5"))?;
    let items = statement
        .query_map(
            params![
                search,
                query.filter,
                query.status,
                query.limit,
                query.offset
            ],
            |row| {
                Ok(CatalogItem {
                    id: row.get(0)?,
                    item_type: row.get(1)?,
                    code: row.get(2)?,
                    name: row.get(3)?,
                    description: row.get(4)?,
                    category: row.get(5)?,
                    sale_price_cents: row.get(6)?,
                    cost_price_cents: row.get(7)?,
                    unit: row.get(8)?,
                    is_active: row.get(9)?,
                    is_demo: row.get(10)?,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Page { items, total })
}

pub fn save_catalog_item(app: &AppHandle, input: CatalogItemInput) -> Result<String, MasterError> {
    let connection = database::connection(app)?;
    save_catalog_item_in_connection(&connection, &input)
}

fn save_catalog_item_in_connection(
    connection: &Connection,
    input: &CatalogItemInput,
) -> Result<String, MasterError> {
    let name = required(&input.name, "o nome do produto ou serviço")?;
    if !["PRODUCT", "SERVICE"].contains(&input.item_type.as_str())
        || input.sale_price_cents < 0
        || input.cost_price_cents.is_some_and(|value| value < 0)
        || input.unit.trim().is_empty()
    {
        return Err(MasterError::Validation(
            "Revise tipo, valores e unidade.".into(),
        ));
    }
    let code = optional(&input.code);
    if let Some(value) = code.as_deref() {
        let duplicate:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM catalog_items WHERE lower(code)=lower(?1) AND deleted_at IS NULL AND id<>COALESCE(?2,''))",params![value,input.id],|row|row.get(0))?;
        if duplicate {
            return Err(MasterError::Validation(
                "Já existe um item ativo com esse código.".into(),
            ));
        }
    }
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let tx = connection.unchecked_transaction()?;
    if input.id.is_some() {
        let changed=tx.execute(&format!("UPDATE catalog_items SET item_type=?2,code=?3,name=?4,description=?5,category=?6,sale_price_cents=?7,cost_price_cents=?8,unit=?9,updated_at={NOW} WHERE id=?1 AND deleted_at IS NULL"),params![id,input.item_type,code,name,optional(&input.description),optional(&input.category),input.sale_price_cents,input.cost_price_cents,input.unit.trim().to_uppercase()])?;
        if changed == 0 {
            return Err(MasterError::Validation("Item não encontrado.".into()));
        }
        stamp_actor(&tx, "catalog_items", &id, false)?;
        audit(
            &tx,
            "catalog_item",
            &id,
            "UPDATE",
            "Produto ou serviço atualizado",
        )?;
    } else {
        tx.execute(&format!("INSERT INTO catalog_items(id,item_type,code,name,description,category,sale_price_cents,cost_price_cents,unit,is_active,is_demo,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,1,0,{NOW},{NOW})"),params![id,input.item_type,code,name,optional(&input.description),optional(&input.category),input.sale_price_cents,input.cost_price_cents,input.unit.trim().to_uppercase()])?;
        stamp_actor(&tx, "catalog_items", &id, true)?;
        audit(
            &tx,
            "catalog_item",
            &id,
            "CREATE",
            "Produto ou serviço criado",
        )?;
    }
    tx.commit()?;
    Ok(id)
}

pub fn set_active(
    app: &AppHandle,
    resource: &str,
    id: &str,
    active: bool,
) -> Result<(), MasterError> {
    let connection = database::connection(app)?;
    set_active_in_connection(&connection, resource, id, active)
}

fn set_active_in_connection(
    connection: &Connection,
    resource: &str,
    id: &str,
    active: bool,
) -> Result<(), MasterError> {
    let (table, entity, has_deleted) = match resource {
        "contacts" => ("contacts", "contact", true),
        "categories" => ("categories", "category", true),
        "accounts" => ("financial_accounts", "financial_account", true),
        "paymentMethods" => ("payment_methods", "payment_method", false),
        "catalog" => ("catalog_items", "catalog_item", true),
        _ => return Err(MasterError::Validation("Cadastro desconhecido.".into())),
    };
    if resource == "accounts" && !active {
        let is_default: bool = connection
            .query_row(
                "SELECT is_default FROM financial_accounts WHERE id=?1",
                [&id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| MasterError::Validation("Conta não encontrada.".into()))?;
        if is_default {
            return Err(MasterError::Validation(
                "Defina outra conta como padrão antes de inativar esta conta.".into(),
            ));
        }
    }
    let deleted_clause = if has_deleted {
        " AND deleted_at IS NULL"
    } else {
        ""
    };
    let tx = connection.unchecked_transaction()?;
    let changed = tx.execute(
        &format!("UPDATE {table} SET is_active=?2,updated_at={NOW} WHERE id=?1{deleted_clause}"),
        params![id, active],
    )?;
    if changed == 0 {
        return Err(MasterError::Validation("Registro não encontrado.".into()));
    }
    stamp_actor(&tx, table, id, false)?;
    audit(
        &tx,
        entity,
        id,
        if active { "ACTIVATE" } else { "DEACTIVATE" },
        if active {
            "Cadastro reativado"
        } else {
            "Cadastro inativado"
        },
    )?;
    tx.commit()?;
    Ok(())
}

pub fn delete_master(app: &AppHandle, resource: &str, id: &str) -> Result<(), MasterError> {
    let connection = database::connection(app)?;
    delete_master_in_connection(&connection, resource, id)
}

fn delete_master_in_connection(
    connection: &Connection,
    resource: &str,
    id: &str,
) -> Result<(), MasterError> {
    let tx = connection.unchecked_transaction()?;
    match resource {
        "contacts" => {
            let changed=tx.execute(&format!("UPDATE contacts SET deleted_at={NOW},is_active=0,updated_at={NOW} WHERE id=?1 AND deleted_at IS NULL"),[id])?;
            if changed == 0 {
                return Err(MasterError::Validation("Contato não encontrado.".into()));
            }
            stamp_actor(&tx, "contacts", id, false)?;
            audit(&tx, "contact", id, "DELETE", "Contato excluído")?;
        }
        "catalog" => {
            let changed=tx.execute(&format!("UPDATE catalog_items SET deleted_at={NOW},is_active=0,updated_at={NOW} WHERE id=?1 AND deleted_at IS NULL"),[id])?;
            if changed == 0 {
                return Err(MasterError::Validation("Item não encontrado.".into()));
            }
            stamp_actor(&tx, "catalog_items", id, false)?;
            audit(
                &tx,
                "catalog_item",
                id,
                "DELETE",
                "Produto ou serviço excluído",
            )?;
        }
        "categories" => {
            let system: bool = tx
                .query_row(
                    "SELECT is_system FROM categories WHERE id=?1 AND deleted_at IS NULL",
                    [id],
                    |row| row.get(0),
                )
                .optional()?
                .ok_or_else(|| MasterError::Validation("Categoria não encontrada.".into()))?;
            let has_children: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM categories WHERE parent_id=?1 AND deleted_at IS NULL)",
                [&id],
                |row| row.get(0),
            )?;
            let in_use: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM financial_entries WHERE category_id=?1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM sales WHERE category_id=?1 AND deleted_at IS NULL)",
                [id],
                |row| row.get(0),
            )?;
            if system || has_children || in_use {
                return Err(MasterError::Validation(
                    "Categorias do sistema ou com subcategorias devem ser apenas inativadas."
                        .into(),
                ));
            }
            tx.execute(&format!("UPDATE categories SET deleted_at={NOW},is_active=0,updated_at={NOW} WHERE id=?1"),[id])?;
            stamp_actor(&tx, "categories", id, false)?;
            audit(&tx, "category", id, "DELETE", "Categoria excluída")?;
        }
        "accounts" => {
            let default: bool = tx
                .query_row(
                    "SELECT is_default FROM financial_accounts WHERE id=?1 AND deleted_at IS NULL",
                    [id],
                    |row| row.get(0),
                )
                .optional()?
                .ok_or_else(|| MasterError::Validation("Conta não encontrada.".into()))?;
            if default {
                return Err(MasterError::Validation(
                    "A conta padrão não pode ser excluída.".into(),
                ));
            }
            let in_use: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM financial_entries WHERE financial_account_id=?1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM entry_settlements WHERE financial_account_id=?1 UNION ALL SELECT 1 FROM sales WHERE financial_account_id=?1 AND deleted_at IS NULL)",
                [id],
                |row| row.get(0),
            )?;
            if in_use {
                return Err(MasterError::Validation(
                    "Contas com movimentações devem ser apenas inativadas.".into(),
                ));
            }
            tx.execute(&format!("UPDATE financial_accounts SET deleted_at={NOW},is_active=0,updated_at={NOW} WHERE id=?1"),[id])?;
            stamp_actor(&tx, "financial_accounts", id, false)?;
            audit(
                &tx,
                "financial_account",
                id,
                "DELETE",
                "Conta financeira excluída",
            )?;
        }
        "paymentMethods" => {
            let system: bool = tx
                .query_row(
                    "SELECT is_system FROM payment_methods WHERE id=?1",
                    [id],
                    |row| row.get(0),
                )
                .optional()?
                .ok_or_else(|| {
                    MasterError::Validation("Forma de pagamento não encontrada.".into())
                })?;
            if system {
                return Err(MasterError::Validation(
                    "Formas do sistema devem ser apenas inativadas.".into(),
                ));
            }
            let in_use: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM financial_entries WHERE payment_method_id=?1 AND deleted_at IS NULL UNION ALL SELECT 1 FROM entry_settlements WHERE payment_method_id=?1 UNION ALL SELECT 1 FROM sales WHERE payment_method_id=?1 AND deleted_at IS NULL)",
                [id],
                |row| row.get(0),
            )?;
            if in_use {
                return Err(MasterError::Validation(
                    "Formas de pagamento utilizadas devem ser apenas inativadas.".into(),
                ));
            }
            tx.execute("DELETE FROM payment_methods WHERE id=?1", [id])?;
            audit(
                &tx,
                "payment_method",
                id,
                "DELETE",
                "Forma de pagamento excluída",
            )?;
        }
        _ => return Err(MasterError::Validation("Cadastro desconhecido.".into())),
    }
    tx.commit()?;
    Ok(())
}

fn csv_path(path: &str) -> Result<PathBuf, MasterError> {
    let path = PathBuf::from(path);
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase)
        .as_deref()
        != Some("csv")
    {
        return Err(MasterError::Validation("Use um arquivo .csv.".into()));
    }
    Ok(path)
}

fn csv_records(path: &str) -> Result<(Vec<String>, CsvRows), MasterError> {
    let path = csv_path(path)?;
    if fs::metadata(&path)?.len() > MAX_CSV_BYTES {
        return Err(MasterError::Validation("O CSV excede 10 MB.".into()));
    }
    let bytes = fs::read(&path)?;
    let first_line = String::from_utf8_lossy(&bytes)
        .lines()
        .next()
        .unwrap_or_default()
        .to_owned();
    let delimiter = if first_line.matches(';').count() >= first_line.matches(',').count() {
        b';'
    } else {
        b','
    };
    let mut reader = ReaderBuilder::new()
        .delimiter(delimiter)
        .trim(Trim::All)
        .flexible(true)
        .from_reader(bytes.as_slice());
    let headers = reader
        .headers()?
        .iter()
        .map(|value| value.trim_start_matches('\u{feff}').trim().to_owned())
        .collect::<Vec<_>>();
    if headers.is_empty() {
        return Err(MasterError::Validation(
            "O CSV não possui cabeçalho.".into(),
        ));
    }
    let mut rows = Vec::new();
    for (index, record) in reader.records().enumerate() {
        if rows.len() >= MAX_CSV_ROWS {
            return Err(MasterError::Validation(
                "O CSV excede 10.000 registros.".into(),
            ));
        }
        let record = record?;
        let values = headers
            .iter()
            .enumerate()
            .map(|(column, header)| {
                (
                    header.clone(),
                    record.get(column).unwrap_or_default().trim().to_owned(),
                )
            })
            .collect();
        rows.push((index + 2, values));
    }
    Ok((headers, rows))
}

pub fn read_contact_csv(path: &str) -> Result<CsvFilePreview, MasterError> {
    let (headers, rows) = csv_records(path)?;
    let sample_rows = rows
        .iter()
        .take(5)
        .map(|(_, row)| {
            headers
                .iter()
                .map(|header| row.get(header).cloned().unwrap_or_default())
                .collect()
        })
        .collect();
    Ok(CsvFilePreview {
        headers,
        sample_rows,
        total_rows: rows.len(),
    })
}

fn mapped(row: &HashMap<String, String>, column: &Option<String>) -> Option<String> {
    column
        .as_ref()
        .and_then(|name| row.get(name))
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
fn mapped_required(row: &HashMap<String, String>, column: &str) -> String {
    row.get(column)
        .map(String::as_str)
        .unwrap_or_default()
        .trim()
        .to_owned()
}
fn parse_bool(value: Option<String>, default: bool) -> bool {
    value
        .map(|value| {
            matches!(
                value.to_lowercase().as_str(),
                "1" | "true" | "sim" | "s" | "yes" | "cliente" | "fornecedor"
            )
        })
        .unwrap_or(default)
}
fn mapped_contact(row: &HashMap<String, String>, mapping: &ContactCsvMapping) -> ContactInput {
    let kind = mapped(row, &mapping.contact_kind)
        .map(|value| {
            if matches!(
                value.to_uppercase().as_str(),
                "PJ" | "COMPANY" | "EMPRESA" | "JURIDICA" | "JURÍDICA"
            ) {
                "COMPANY".into()
            } else {
                "PERSON".into()
            }
        })
        .unwrap_or_else(|| "PERSON".into());
    ContactInput {
        id: None,
        name: mapped_required(row, &mapping.name),
        contact_kind: kind,
        role_customer: parse_bool(
            mapped(row, &mapping.role_customer),
            mapping.role_customer.is_none(),
        ),
        role_supplier: parse_bool(mapped(row, &mapping.role_supplier), false),
        trade_name: mapped(row, &mapping.trade_name),
        document_number: mapped(row, &mapping.document_number),
        phone: mapped(row, &mapping.phone),
        whatsapp: mapped(row, &mapping.whatsapp),
        email: mapped(row, &mapping.email),
        address: mapped(row, &mapping.address),
        city: mapped(row, &mapping.city),
        state: mapped(row, &mapping.state),
        postal_code: mapped(row, &mapping.postal_code),
        notes: mapped(row, &mapping.notes),
        tags: mapped(row, &mapping.tags)
            .map(|value| {
                value
                    .split([',', ';'])
                    .map(str::trim)
                    .filter(|tag| !tag.is_empty())
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn validate_mapping(headers: &[String], mapping: &ContactCsvMapping) -> Result<(), MasterError> {
    if !headers.contains(&mapping.name) {
        return Err(MasterError::Validation(
            "Mapeie a coluna obrigatória Nome.".into(),
        ));
    }
    let mapped = [
        &mapping.contact_kind,
        &mapping.role_customer,
        &mapping.role_supplier,
        &mapping.trade_name,
        &mapping.document_number,
        &mapping.phone,
        &mapping.whatsapp,
        &mapping.email,
        &mapping.address,
        &mapping.city,
        &mapping.state,
        &mapping.postal_code,
        &mapping.notes,
        &mapping.tags,
    ];
    if mapped
        .iter()
        .filter_map(|value| value.as_ref())
        .any(|column| !headers.contains(column))
    {
        return Err(MasterError::Validation(
            "O mapeamento contém uma coluna inexistente.".into(),
        ));
    }
    Ok(())
}

pub fn preview_contact_import(
    app: &AppHandle,
    path: &str,
    mapping: ContactCsvMapping,
) -> Result<ContactImportPreview, MasterError> {
    let connection = database::connection(app)?;
    preview_contact_import_in_connection(&connection, path, &mapping)
}

fn preview_contact_import_in_connection(
    connection: &Connection,
    path: &str,
    mapping: &ContactCsvMapping,
) -> Result<ContactImportPreview, MasterError> {
    let (headers, rows) = csv_records(path)?;
    validate_mapping(&headers, mapping)?;
    let mut preview = Vec::new();
    let mut valid_rows = 0;
    let mut error_rows = 0;
    let mut duplicate_rows = 0;
    let mut seen = HashMap::<String, usize>::new();
    for (line, row) in &rows {
        let input = mapped_contact(row, mapping);
        let errors = validate_contact(&input)
            .err()
            .map(|error| vec![error.to_string()])
            .unwrap_or_default();
        let mut duplicates = if errors.is_empty() {
            contact_duplicates_in_connection(connection, &input)?
                .into_iter()
                .map(|item| format!("{} ({})", item.name, item.reason))
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        if errors.is_empty() {
            for (key, label) in contact_duplicate_keys(&input) {
                if let Some(first_line) = seen.get(&key) {
                    let reason = format!("Linha {first_line} ({label})");
                    if !duplicates.contains(&reason) {
                        duplicates.push(reason);
                    }
                } else {
                    seen.insert(key, *line);
                }
            }
        }
        if errors.is_empty() {
            valid_rows += 1
        } else {
            error_rows += 1
        }
        if !duplicates.is_empty() {
            duplicate_rows += 1
        }
        if preview.len() < 200 {
            preview.push(ContactImportRow {
                line: *line,
                name: input.name,
                document_number: input.document_number,
                errors,
                possible_duplicates: duplicates,
            });
        }
    }
    Ok(ContactImportPreview {
        rows: preview,
        total_rows: rows.len(),
        valid_rows,
        error_rows,
        duplicate_rows,
    })
}

pub fn import_contacts(
    app: &AppHandle,
    path: &str,
    mapping: ContactCsvMapping,
    allow_duplicates: bool,
) -> Result<ImportResult, MasterError> {
    let connection = database::connection(app)?;
    import_contacts_in_connection(&connection, path, &mapping, allow_duplicates)
}

fn import_contacts_in_connection(
    connection: &Connection,
    path: &str,
    mapping: &ContactCsvMapping,
    allow_duplicates: bool,
) -> Result<ImportResult, MasterError> {
    let (headers, rows) = csv_records(path)?;
    validate_mapping(&headers, mapping)?;
    let tx = connection.unchecked_transaction()?;
    let mut imported = 0;
    for (line, row) in rows {
        let input = mapped_contact(&row, mapping);
        validate_contact(&input)
            .map_err(|error| MasterError::Validation(format!("Linha {line}: {error}")))?;
        if !allow_duplicates && !contact_duplicates_in_connection(&tx, &input)?.is_empty() {
            return Err(MasterError::Validation(format!(
                "Linha {line}: possível duplicidade; confirme a importação de duplicados."
            )));
        }
        let id = Uuid::new_v4().to_string();
        tx.execute(&format!("INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,trade_name,document_number,phone,whatsapp,email,address,city,state,postal_code,notes,tags,is_active,is_demo,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,1,0,{NOW},{NOW})"),params![id,input.contact_kind,input.role_customer,input.role_supplier,input.name.trim(),optional(&input.trade_name),optional(&input.document_number),optional(&input.phone),optional(&input.whatsapp),optional(&input.email),optional(&input.address),optional(&input.city),optional(&input.state).map(|value|value.to_uppercase()),optional(&input.postal_code),optional(&input.notes),tags_json(&input.tags)?])?;
        stamp_actor(&tx, "contacts", &id, true)?;
        imported += 1;
    }
    audit(
        &tx,
        "contacts",
        "import",
        "IMPORT",
        &format!("{imported} contatos importados de CSV"),
    )?;
    tx.commit()?;
    Ok(ImportResult { imported })
}

fn contact_duplicate_keys(input: &ContactInput) -> Vec<(String, &'static str)> {
    let mut keys = Vec::new();
    if let Some(value) = optional(&input.document_number) {
        keys.push((
            format!("document:{}", value.to_lowercase()),
            "mesmo documento",
        ));
    }
    if let Some(value) = optional(&input.phone) {
        keys.push((format!("phone:{}", value.to_lowercase()), "mesmo telefone"));
    }
    if let Some(value) = optional(&input.whatsapp) {
        keys.push((format!("phone:{}", value.to_lowercase()), "mesmo telefone"));
    }
    if let Some(value) = optional(&input.email) {
        keys.push((format!("email:{}", value.to_lowercase()), "mesmo e-mail"));
    }
    keys.push((
        format!("name:{}", input.name.trim().to_lowercase()),
        "mesmo nome",
    ));
    keys
}

fn safe_csv_cell(value: &str) -> String {
    if value.starts_with(['=', '+', '-', '@']) {
        format!("'{value}")
    } else {
        value.to_owned()
    }
}
pub fn create_contact_csv_template(path: &str) -> Result<(), MasterError> {
    let path = csv_path(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut writer = WriterBuilder::new().delimiter(b';').from_writer(Vec::new());
    writer.write_record([
        "nome",
        "tipo",
        "cliente",
        "fornecedor",
        "nome_fantasia",
        "documento",
        "telefone",
        "whatsapp",
        "email",
        "endereco",
        "cidade",
        "estado",
        "cep",
        "observacoes",
        "tags",
    ])?;
    writer.write_record([
        "Maria Exemplo",
        "PF",
        "sim",
        "não",
        "",
        "",
        "11999999999",
        "11999999999",
        "maria@exemplo.com",
        "",
        "São Paulo",
        "SP",
        "",
        "",
        "vip,indicação",
    ])?;
    let mut bytes = b"\xEF\xBB\xBF".to_vec();
    bytes.extend(
        writer
            .into_inner()
            .map_err(|error| MasterError::Io(error.into_error()))?,
    );
    fs::write(path, bytes)?;
    Ok(())
}
pub fn export_contacts(
    app: &AppHandle,
    path: &str,
    query: ListQuery,
) -> Result<usize, MasterError> {
    let path = csv_path(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let connection = database::connection(app)?;
    let search = query.search.trim();
    let role = query.filter.as_str();
    let status = query.status.as_str();
    let mut statement=connection.prepare("SELECT name,contact_kind,role_customer,role_supplier,trade_name,document_number,phone,whatsapp,email,address,city,state,postal_code,notes,tags,is_active FROM contacts WHERE deleted_at IS NULL AND (?1='' OR name LIKE '%'||?1||'%' COLLATE NOCASE OR COALESCE(document_number,'') LIKE '%'||?1||'%' OR COALESCE(phone,'') LIKE '%'||?1||'%') AND (?2='ALL' OR (?2='CUSTOMER' AND role_customer=1) OR (?2='SUPPLIER' AND role_supplier=1) OR (?2='BOTH' AND role_customer=1 AND role_supplier=1)) AND (?3='ALL' OR (?3='ACTIVE' AND is_active=1) OR (?3='INACTIVE' AND is_active=0)) ORDER BY name COLLATE NOCASE")?;
    let rows = statement
        .query_map(params![search, role, status], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, bool>(2)?,
                row.get::<_, bool>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, Option<String>>(13)?,
                row.get::<_, Option<String>>(14)?,
                row.get::<_, bool>(15)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut writer = WriterBuilder::new().delimiter(b';').from_writer(Vec::new());
    writer.write_record([
        "nome",
        "tipo",
        "cliente",
        "fornecedor",
        "nome_fantasia",
        "documento",
        "telefone",
        "whatsapp",
        "email",
        "endereco",
        "cidade",
        "estado",
        "cep",
        "observacoes",
        "tags",
        "situacao",
    ])?;
    for row in &rows {
        writer.write_record([
            safe_csv_cell(&row.0),
            row.1.clone(),
            if row.2 { "sim".into() } else { "não".into() },
            if row.3 { "sim".into() } else { "não".into() },
            safe_csv_cell(row.4.as_deref().unwrap_or("")),
            safe_csv_cell(row.5.as_deref().unwrap_or("")),
            safe_csv_cell(row.6.as_deref().unwrap_or("")),
            safe_csv_cell(row.7.as_deref().unwrap_or("")),
            safe_csv_cell(row.8.as_deref().unwrap_or("")),
            safe_csv_cell(row.9.as_deref().unwrap_or("")),
            safe_csv_cell(row.10.as_deref().unwrap_or("")),
            safe_csv_cell(row.11.as_deref().unwrap_or("")),
            safe_csv_cell(row.12.as_deref().unwrap_or("")),
            safe_csv_cell(row.13.as_deref().unwrap_or("")),
            safe_csv_cell(&parse_tags(row.14.clone()).join(",")),
            if row.15 {
                "ativo".into()
            } else {
                "inativo".into()
            },
        ])?;
    }
    let mut bytes = b"\xEF\xBB\xBF".to_vec();
    bytes.extend(
        writer
            .into_inner()
            .map_err(|error| MasterError::Io(error.into_error()))?,
    );
    fs::write(path, bytes)?;
    Ok(rows.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute("INSERT INTO local_users(id,name,username,password_hash,role,is_active,created_at,updated_at) VALUES('actor-test','Administrador','admin','$argon2id$test','ADMIN',1,'2026-08-04T00:00:00Z','2026-08-04T00:00:00Z')", []).unwrap();
        connection
    }
    fn contact(name: &str) -> ContactInput {
        ContactInput {
            id: None,
            name: name.into(),
            contact_kind: "PERSON".into(),
            role_customer: true,
            role_supplier: false,
            trade_name: None,
            document_number: None,
            phone: None,
            whatsapp: None,
            email: None,
            address: None,
            city: Some("São Paulo".into()),
            state: Some("SP".into()),
            postal_code: None,
            notes: None,
            tags: vec!["vip".into()],
        }
    }
    #[test]
    fn creates_updates_lists_and_audits_contact() {
        let connection = database();
        let mut input = contact("Maria Silva");
        let id = save_contact_in_connection(&connection, &input).unwrap();
        input.id = Some(id.clone());
        input.phone = Some("11999999999".into());
        save_contact_in_connection(&connection, &input).unwrap();
        let page = list_contacts_in_connection(
            &connection,
            &ListQuery {
                search: "11999".into(),
                filter: "CUSTOMER".into(),
                status: "ACTIVE".into(),
                limit: 25,
                offset: 0,
            },
        )
        .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].name, "Maria Silva");
        let audits: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM audit_logs WHERE entity_id=?1",
                [&id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(audits, 2);
        let authors: (String, String) = connection
            .query_row(
                "SELECT created_by,updated_by FROM contacts WHERE id=?1",
                [&id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(authors, ("actor-test".into(), "actor-test".into()));
    }
    #[test]
    fn detects_duplicate_by_document() {
        let connection = database();
        let mut first = contact("Empresa Um");
        first.document_number = Some("123".into());
        save_contact_in_connection(&connection, &first).unwrap();
        let mut second = contact("Empresa Dois");
        second.document_number = Some("123".into());
        let duplicates = contact_duplicates_in_connection(&connection, &second).unwrap();
        assert_eq!(duplicates.len(), 1);
        assert_eq!(duplicates[0].reason, "Mesmo documento");
    }
    #[test]
    fn rejects_invalid_contact() {
        let mut input = contact("A");
        input.role_customer = false;
        assert!(validate_contact(&input).is_err());
    }

    #[test]
    fn manages_categories_accounts_and_payment_methods() {
        let connection = database();
        let revenue = save_category_in_connection(
            &connection,
            &CategoryInput {
                id: None,
                name: "Consultoria".into(),
                nature: "REVENUE".into(),
                parent_id: None,
                color_reference: Some("#2563EB".into()),
                icon_reference: None,
            },
        )
        .unwrap();
        let child = save_category_in_connection(
            &connection,
            &CategoryInput {
                id: None,
                name: "Consultoria mensal".into(),
                nature: "REVENUE".into(),
                parent_id: Some(revenue.clone()),
                color_reference: None,
                icon_reference: None,
            },
        )
        .unwrap();
        assert!(save_category_in_connection(
            &connection,
            &CategoryInput {
                id: Some(revenue.clone()),
                name: "Consultoria".into(),
                nature: "REVENUE".into(),
                parent_id: Some(child.clone()),
                color_reference: None,
                icon_reference: None,
            },
        )
        .is_err());
        assert!(save_category_in_connection(
            &connection,
            &CategoryInput {
                id: None,
                name: "CONSULTORIA".into(),
                nature: "REVENUE".into(),
                parent_id: None,
                color_reference: None,
                icon_reference: None,
            },
        )
        .is_err());
        assert!(delete_master_in_connection(&connection, "categories", &revenue).is_err());
        assert!(delete_master_in_connection(&connection, "categories", &child).is_ok());

        let first = save_account_in_connection(
            &connection,
            &AccountInput {
                id: None,
                name: "Banco A".into(),
                account_type: "BANK".into(),
                institution: Some("Banco A".into()),
                opening_balance_cents: 10_000,
                opening_balance_date: "2026-08-04".into(),
                color_reference: None,
                is_default: true,
            },
        )
        .unwrap();
        let second = save_account_in_connection(
            &connection,
            &AccountInput {
                id: None,
                name: "Carteira".into(),
                account_type: "WALLET".into(),
                institution: None,
                opening_balance_cents: 0,
                opening_balance_date: "2026-08-04".into(),
                color_reference: None,
                is_default: true,
            },
        )
        .unwrap();
        assert!(save_account_in_connection(
            &connection,
            &AccountInput {
                id: Some(second.clone()),
                name: "Carteira".into(),
                account_type: "WALLET".into(),
                institution: None,
                opening_balance_cents: 0,
                opening_balance_date: "2026-08-04".into(),
                color_reference: None,
                is_default: false,
            },
        )
        .is_err());
        assert!(set_active_in_connection(&connection, "accounts", &second, false).is_err());
        assert!(set_active_in_connection(&connection, "accounts", &first, false).is_ok());

        let payment = save_payment_method_in_connection(
            &connection,
            &PaymentMethodInput {
                id: None,
                name: "Link de pagamento".into(),
                payment_type: "CREDIT".into(),
                default_fee_basis_points: 299,
                default_receipt_delay_days: 30,
            },
        )
        .unwrap();
        let stored: (i64, i64) = connection
            .query_row(
                "SELECT default_fee_basis_points,default_receipt_delay_days FROM payment_methods WHERE id=?1",
                [payment],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(stored, (299, 30));
        assert!(save_payment_method_in_connection(
            &connection,
            &PaymentMethodInput {
                id: None,
                name: "LINK DE PAGAMENTO".into(),
                payment_type: "CREDIT".into(),
                default_fee_basis_points: 0,
                default_receipt_delay_days: 0,
            },
        )
        .is_err());
    }

    #[test]
    fn manages_catalog_and_prevents_duplicate_code() {
        let connection = database();
        let input = CatalogItemInput {
            id: None,
            name: "Revisão completa".into(),
            item_type: "SERVICE".into(),
            code: Some("SRV-01".into()),
            description: Some("Serviço técnico".into()),
            category: Some("Serviços".into()),
            sale_price_cents: 25_000,
            cost_price_cents: None,
            unit: "UN".into(),
        };
        let id = save_catalog_item_in_connection(&connection, &input).unwrap();
        let mut duplicate = input.clone();
        duplicate.name = "Outro serviço".into();
        duplicate.code = Some("srv-01".into());
        assert!(save_catalog_item_in_connection(&connection, &duplicate).is_err());
        let page = list_catalog_in_connection(
            &connection,
            &ListQuery {
                search: "SRV-01".into(),
                filter: "SERVICE".into(),
                status: "ACTIVE".into(),
                limit: 25,
                offset: 0,
            },
        )
        .unwrap();
        assert_eq!(page.total, 1);
        assert!(set_active_in_connection(&connection, "catalog", &id, false).is_ok());
        assert!(delete_master_in_connection(&connection, "catalog", &id).is_ok());
    }

    #[test]
    fn previews_and_imports_csv_atomically() {
        let connection = database();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("contatos.csv");
        fs::write(
            &path,
            "nome;tipo;cliente;fornecedor;documento;telefone\nMaria Silva;PF;sim;não;123;11999999999\nEmpresa Dois;PJ;não;sim;456;1133334444\n",
        )
        .unwrap();
        let mapping = ContactCsvMapping {
            name: "nome".into(),
            contact_kind: Some("tipo".into()),
            role_customer: Some("cliente".into()),
            role_supplier: Some("fornecedor".into()),
            trade_name: None,
            document_number: Some("documento".into()),
            phone: Some("telefone".into()),
            whatsapp: None,
            email: None,
            address: None,
            city: None,
            state: None,
            postal_code: None,
            notes: None,
            tags: None,
        };
        let preview =
            preview_contact_import_in_connection(&connection, path.to_str().unwrap(), &mapping)
                .unwrap();
        assert_eq!(
            (preview.total_rows, preview.valid_rows, preview.error_rows),
            (2, 2, 0)
        );
        let result =
            import_contacts_in_connection(&connection, path.to_str().unwrap(), &mapping, false)
                .unwrap();
        assert_eq!(result.imported, 2);
        let imported: i64 = connection
            .query_row("SELECT COUNT(*) FROM contacts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(imported, 2);
    }

    #[test]
    fn protects_exported_csv_against_formula_injection() {
        assert_eq!(safe_csv_cell("=2+2"), "'=2+2");
        assert_eq!(safe_csv_cell("Cliente"), "Cliente");
    }

    #[test]
    fn detects_duplicates_inside_csv_and_rolls_back_import() {
        let connection = database();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("duplicados.csv");
        fs::write(
            &path,
            "nome;tipo;cliente;fornecedor;documento\nMaria Um;PF;sim;não;123\nMaria Dois;PF;sim;não;123\n",
        )
        .unwrap();
        let mapping = ContactCsvMapping {
            name: "nome".into(),
            contact_kind: Some("tipo".into()),
            role_customer: Some("cliente".into()),
            role_supplier: Some("fornecedor".into()),
            trade_name: None,
            document_number: Some("documento".into()),
            phone: None,
            whatsapp: None,
            email: None,
            address: None,
            city: None,
            state: None,
            postal_code: None,
            notes: None,
            tags: None,
        };
        let preview =
            preview_contact_import_in_connection(&connection, path.to_str().unwrap(), &mapping)
                .unwrap();
        assert_eq!(preview.duplicate_rows, 1);
        assert!(import_contacts_in_connection(
            &connection,
            path.to_str().unwrap(),
            &mapping,
            false,
        )
        .is_err());
        let imported: i64 = connection
            .query_row("SELECT COUNT(*) FROM contacts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(imported, 0);
    }
}
