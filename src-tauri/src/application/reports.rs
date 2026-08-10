use std::{
    cmp::Ordering,
    fs::File,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

use chrono::{Duration, NaiveDate};
use printpdf::{
    BuiltinFont, Image, ImageTransform, Mm, PdfDocument, PdfDocumentReference, PdfLayerReference,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use thiserror::Error;

use crate::database::{self, DatabaseError};

const REPORT_TYPES: &[&str] = &[
    "MONTHLY_SUMMARY",
    "INFLOWS",
    "EXPENSES",
    "EXPENSES_BY_CATEGORY",
    "INFLOWS_BY_CATEGORY",
    "MOVEMENTS_BY_ACCOUNT",
    "MOVEMENTS_BY_PAYMENT_METHOD",
    "RECEIVABLES",
    "OVERDUE",
    "PAYABLES",
    "CASH_FLOW",
    "RESULT",
    "CUSTOMER_HISTORY",
    "SUPPLIER_HISTORY",
    "SALES",
    "SOLD_ITEMS",
    "MONTHLY_COMPARISON",
];

#[derive(Debug, Error)]
pub enum ReportError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error(transparent)]
    Csv(#[from] csv::Error),
    #[error("não foi possível gravar o relatório: {0}")]
    Io(#[from] std::io::Error),
    #[error("não foi possível gerar o PDF: {0}")]
    Pdf(String),
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportQuery {
    pub report_type: String,
    pub start_date: String,
    pub end_date: String,
    pub regime: String,
    pub contact_id: Option<String>,
    pub category_id: Option<String>,
    pub financial_account_id: Option<String>,
    pub payment_method_id: Option<String>,
    pub status: String,
    pub sort_by: String,
    pub sort_direction: String,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportOption {
    pub id: String,
    pub name: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportOptions {
    pub business_name: String,
    pub default_regime: String,
    pub has_logo: bool,
    pub contacts: Vec<ReportOption>,
    pub categories: Vec<ReportOption>,
    pub accounts: Vec<ReportOption>,
    pub payment_methods: Vec<ReportOption>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportColumn {
    pub key: String,
    pub label: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportCell {
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRow {
    pub id: Option<String>,
    pub cells: Vec<ReportCell>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportTotal {
    pub label: String,
    pub kind: String,
    pub raw: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportResult {
    pub report_type: String,
    pub title: String,
    pub business_name: String,
    pub generated_at: String,
    pub start_date: String,
    pub end_date: String,
    pub regime: String,
    pub filters_summary: String,
    pub columns: Vec<ReportColumn>,
    pub rows: Vec<ReportRow>,
    pub totals: Vec<ReportTotal>,
    pub total_rows: i64,
    pub layout_notice: String,
}

struct ReportData {
    title: &'static str,
    columns: Vec<ReportColumn>,
    rows: Vec<ReportRow>,
    totals: Vec<ReportTotal>,
}

fn date(value: &str, label: &str) -> Result<NaiveDate, ReportError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| ReportError::Validation(format!("Informe {label} válida.")))
}

fn validate_query(query: &ReportQuery, export: bool) -> Result<(), ReportError> {
    let start = date(&query.start_date, "uma data inicial")?;
    let end = date(&query.end_date, "uma data final")?;
    if end < start || (end - start).num_days() > 3_660 {
        return Err(ReportError::Validation(
            "O período do relatório deve ter até dez anos e terminar após o início.".into(),
        ));
    }
    if !REPORT_TYPES.contains(&query.report_type.as_str()) {
        return Err(ReportError::Validation("Relatório inválido.".into()));
    }
    if !["CASH", "ACCRUAL"].contains(&query.regime.as_str()) {
        return Err(ReportError::Validation("Regime inválido.".into()));
    }
    if ![
        "ALL",
        "DRAFT",
        "PENDING",
        "SETTLED",
        "OVERDUE",
        "CANCELED",
        "CONFIRMED",
        "PARTIALLY_RECEIVED",
        "RECEIVED",
    ]
    .contains(&query.status.as_str())
    {
        return Err(ReportError::Validation("Situação inválida.".into()));
    }
    if !["ASC", "DESC"].contains(&query.sort_direction.as_str()) {
        return Err(ReportError::Validation("Ordenação inválida.".into()));
    }
    if !export && (!(1..=100).contains(&query.limit) || query.offset < 0) {
        return Err(ReportError::Validation("Paginação inválida.".into()));
    }
    Ok(())
}

fn option_rows(connection: &Connection, sql: &str) -> Result<Vec<ReportOption>, ReportError> {
    Ok(connection
        .prepare(sql)?
        .query_map([], |row| {
            Ok(ReportOption {
                id: row.get(0)?,
                name: row.get(1)?,
                detail: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?)
}

fn options_in_connection(connection: &Connection) -> Result<ReportOptions, ReportError> {
    let (business_name, default_regime, logo_path): (String, String, Option<String>) = connection
        .query_row(
            "SELECT COALESCE(b.trade_name,b.legal_name),p.default_view_regime,b.logo_path FROM business_profile b JOIN app_preferences p ON p.business_id=b.id LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or_else(|| ReportError::Validation("Conclua a configuração inicial.".into()))?;
    Ok(ReportOptions {
        business_name,
        default_regime,
        has_logo: logo_path.as_deref().is_some_and(|value| Path::new(value).is_file()),
        contacts: option_rows(connection, "SELECT id,name,CASE WHEN role_customer=1 AND role_supplier=1 THEN 'BOTH' WHEN role_customer=1 THEN 'CUSTOMER' ELSE 'SUPPLIER' END FROM contacts WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE")?,
        categories: option_rows(connection, "SELECT id,name,nature FROM categories WHERE deleted_at IS NULL ORDER BY nature,name COLLATE NOCASE")?,
        accounts: option_rows(connection, "SELECT id,name,account_type FROM financial_accounts WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE")?,
        payment_methods: option_rows(connection, "SELECT id,name,payment_type FROM payment_methods ORDER BY name COLLATE NOCASE")?,
    })
}

fn column(key: &str, label: &str, kind: &str) -> ReportColumn {
    ReportColumn {
        key: key.into(),
        label: label.into(),
        kind: kind.into(),
    }
}

fn cell(value: impl ToString) -> ReportCell {
    ReportCell {
        raw: value.to_string(),
    }
}

fn row(id: Option<String>, values: Vec<ReportCell>) -> ReportRow {
    ReportRow { id, cells: values }
}

fn total(label: &str, kind: &str, value: impl ToString) -> ReportTotal {
    ReportTotal {
        label: label.into(),
        kind: kind.into(),
        raw: value.to_string(),
    }
}

fn optional(value: Option<String>) -> String {
    value.unwrap_or_else(|| "—".into())
}

fn filters(query: &ReportQuery, connection: &Connection) -> Result<String, ReportError> {
    let mut values = vec![format!("Período {} a {}", query.start_date, query.end_date)];
    let named = [
        ("Contato", query.contact_id.as_deref(), "contacts"),
        ("Categoria", query.category_id.as_deref(), "categories"),
        (
            "Conta",
            query.financial_account_id.as_deref(),
            "financial_accounts",
        ),
        (
            "Forma",
            query.payment_method_id.as_deref(),
            "payment_methods",
        ),
    ];
    for (label, id, table) in named {
        if let Some(id) = id {
            let name: Option<String> = connection
                .query_row(
                    &format!("SELECT name FROM {table} WHERE id=?1"),
                    [id],
                    |row| row.get(0),
                )
                .optional()?;
            values.push(format!(
                "{label}: {}",
                name.unwrap_or_else(|| "removido".into())
            ));
        }
    }
    if query.status != "ALL" {
        values.push(format!("Situação: {}", query.status));
    }
    Ok(values.join(" | "))
}

fn compare_cells(left: &ReportCell, right: &ReportCell, kind: &str) -> Ordering {
    match kind {
        "MONEY" | "NUMBER" | "PERCENT" => left
            .raw
            .parse::<i64>()
            .unwrap_or_default()
            .cmp(&right.raw.parse::<i64>().unwrap_or_default()),
        _ => left.raw.to_lowercase().cmp(&right.raw.to_lowercase()),
    }
}

fn sort_rows(data: &mut ReportData, query: &ReportQuery) -> Result<(), ReportError> {
    if query.sort_by.is_empty() {
        return Ok(());
    }
    let index = data
        .columns
        .iter()
        .position(|item| item.key == query.sort_by)
        .ok_or_else(|| ReportError::Validation("Coluna de ordenação inválida.".into()))?;
    let kind = data.columns[index].kind.clone();
    data.rows.sort_by(|left, right| {
        let ordering = compare_cells(&left.cells[index], &right.cells[index], &kind);
        if query.sort_direction == "DESC" {
            ordering.reverse()
        } else {
            ordering
        }
    });
    Ok(())
}

fn status_filter(query: &ReportQuery) -> &str {
    if query.status == "OVERDUE" {
        "PENDING"
    } else {
        query.status.as_str()
    }
}

fn monthly_summary(
    connection: &Connection,
    query: &ReportQuery,
) -> Result<ReportData, ReportError> {
    use std::collections::BTreeMap;
    let mut months: BTreeMap<String, [i64; 5]> = BTreeMap::new();
    {
        let mut statement = connection.prepare(
            "SELECT substr(e.competence_date,1,7),
             COALESCE(SUM(CASE WHEN e.entry_type='REVENUE' THEN e.net_amount_cents WHEN e.entry_type='REVERSAL' AND e.result_multiplier=-1 THEN -e.net_amount_cents ELSE 0 END),0),
             COALESCE(SUM(CASE WHEN e.entry_type='EXPENSE' THEN e.net_amount_cents WHEN e.entry_type='REVERSAL' AND e.result_multiplier=1 THEN -e.net_amount_cents ELSE 0 END),0),
             COALESCE(SUM(e.net_amount_cents*e.result_multiplier),0)
             FROM financial_entries e WHERE e.deleted_at IS NULL AND e.status NOT IN ('DRAFT','CANCELED')
             AND e.competence_date>=?1 AND e.competence_date<=?2
             AND (?3='' OR e.contact_id=?3) AND (?4='' OR e.category_id=?4)
             AND (?5='' OR e.financial_account_id=?5) AND (?6='' OR e.payment_method_id=?6)
             GROUP BY substr(e.competence_date,1,7) ORDER BY 1",
        )?;
        for value in statement.query_map(
            params![
                query.start_date,
                query.end_date,
                query.contact_id.as_deref().unwrap_or(""),
                query.category_id.as_deref().unwrap_or(""),
                query.financial_account_id.as_deref().unwrap_or(""),
                query.payment_method_id.as_deref().unwrap_or("")
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )? {
            let (month, revenue, expense, result) = value?;
            let values = months.entry(month).or_default();
            values[0] = revenue;
            values[1] = expense;
            values[2] = result;
        }
    }
    {
        let mut statement = connection.prepare(
            "SELECT substr(s.settlement_date,1,7),
             COALESCE(SUM(CASE WHEN e.direction='IN' THEN s.net_amount_cents ELSE 0 END),0),
             COALESCE(SUM(CASE WHEN e.direction='OUT' THEN s.net_amount_cents ELSE 0 END),0)
             FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id
             WHERE s.settlement_date>=?1 AND s.settlement_date<=?2
             AND (?3='' OR e.contact_id=?3) AND (?4='' OR e.category_id=?4)
             AND (?5='' OR s.financial_account_id=?5) AND (?6='' OR s.payment_method_id=?6)
             GROUP BY substr(s.settlement_date,1,7) ORDER BY 1",
        )?;
        for value in statement.query_map(
            params![
                query.start_date,
                query.end_date,
                query.contact_id.as_deref().unwrap_or(""),
                query.category_id.as_deref().unwrap_or(""),
                query.financial_account_id.as_deref().unwrap_or(""),
                query.payment_method_id.as_deref().unwrap_or("")
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )? {
            let (month, inflow, outflow) = value?;
            let values = months.entry(month).or_default();
            values[3] = inflow;
            values[4] = outflow;
        }
    }
    let rows = months
        .into_iter()
        .map(|(month, values)| {
            row(
                None,
                vec![
                    cell(month),
                    cell(values[0]),
                    cell(values[1]),
                    cell(values[2]),
                    cell(values[3]),
                    cell(values[4]),
                    cell(values[3] - values[4]),
                ],
            )
        })
        .collect::<Vec<_>>();
    let sums = |index: usize| {
        rows.iter()
            .map(|item| item.cells[index].raw.parse::<i64>().unwrap_or_default())
            .sum::<i64>()
    };
    Ok(ReportData {
        title: "Resumo financeiro mensal",
        columns: vec![
            column("month", "Mês", "MONTH"),
            column("revenue", "Faturamento", "MONEY"),
            column("expense", "Despesas", "MONEY"),
            column("result", "Resultado", "MONEY"),
            column("inflow", "Entradas", "MONEY"),
            column("outflow", "Saídas", "MONEY"),
            column("cash_result", "Resultado caixa", "MONEY"),
        ],
        totals: vec![
            total("Faturamento", "MONEY", sums(1)),
            total("Despesas", "MONEY", sums(2)),
            total("Resultado", "MONEY", sums(3)),
            total("Resultado de caixa", "MONEY", sums(6)),
        ],
        rows,
    })
}

fn category_report(
    connection: &Connection,
    query: &ReportQuery,
    expenses: bool,
) -> Result<ReportData, ReportError> {
    let multiplier = if expenses { -1 } else { 1 };
    let result_multiplier = if expenses { 1 } else { -1 };
    let entry_type = if expenses { "EXPENSE" } else { "REVENUE" };
    let mut rows: Vec<ReportRow>;
    if query.regime == "CASH" {
        let mut statement = connection.prepare(
            "SELECT e.category_id,COALESCE(c.name,'Sem categoria'),SUM(s.net_amount_cents*e.result_multiplier*?7)
             FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id LEFT JOIN categories c ON c.id=e.category_id
             WHERE s.settlement_date>=?1 AND s.settlement_date<=?2
             AND (e.entry_type=?3 OR (e.entry_type='REVERSAL' AND e.result_multiplier=?4))
             AND (?5='' OR e.category_id=?5) AND (?6='' OR e.contact_id=?6)
             GROUP BY e.category_id,c.name HAVING SUM(s.net_amount_cents*e.result_multiplier*?7)<>0 ORDER BY 3 DESC",
        )?;
        rows = statement
            .query_map(
                params![
                    query.start_date,
                    query.end_date,
                    entry_type,
                    result_multiplier,
                    query.category_id.as_deref().unwrap_or(""),
                    query.contact_id.as_deref().unwrap_or(""),
                    multiplier
                ],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )?
            .map(|value| {
                let (id, name, amount) = value?;
                Ok(row(id, vec![cell(name), cell(amount), cell(0)]))
            })
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    } else {
        let mut statement = connection.prepare(
            "SELECT e.category_id,COALESCE(c.name,'Sem categoria'),SUM(e.net_amount_cents*e.result_multiplier*?7)
             FROM financial_entries e LEFT JOIN categories c ON c.id=e.category_id
             WHERE e.deleted_at IS NULL AND e.status NOT IN ('DRAFT','CANCELED') AND e.competence_date>=?1 AND e.competence_date<=?2
             AND (e.entry_type=?3 OR (e.entry_type='REVERSAL' AND e.result_multiplier=?4))
             AND (?5='' OR e.category_id=?5) AND (?6='' OR e.contact_id=?6)
             GROUP BY e.category_id,c.name HAVING SUM(e.net_amount_cents*e.result_multiplier*?7)<>0 ORDER BY 3 DESC",
        )?;
        rows = statement
            .query_map(
                params![
                    query.start_date,
                    query.end_date,
                    entry_type,
                    result_multiplier,
                    query.category_id.as_deref().unwrap_or(""),
                    query.contact_id.as_deref().unwrap_or(""),
                    multiplier
                ],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )?
            .map(|value| {
                let (id, name, amount) = value?;
                Ok(row(id, vec![cell(name), cell(amount), cell(0)]))
            })
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    }
    let grand_total: i64 = rows
        .iter()
        .map(|item| item.cells[1].raw.parse::<i64>().unwrap_or_default())
        .sum();
    for item in &mut rows {
        let amount = item.cells[1].raw.parse::<i64>().unwrap_or_default();
        item.cells[2] = cell(if grand_total == 0 {
            0
        } else {
            amount.saturating_mul(10_000) / grand_total
        });
    }
    Ok(ReportData {
        title: if expenses {
            "Despesas por categoria"
        } else {
            "Entradas por categoria"
        },
        columns: vec![
            column("category", "Categoria", "TEXT"),
            column("amount", "Valor", "MONEY"),
            column("percentage", "Participação", "PERCENT"),
        ],
        rows,
        totals: vec![total("Total", "MONEY", grand_total)],
    })
}

fn movement_group_report(
    connection: &Connection,
    query: &ReportQuery,
    by_account: bool,
) -> Result<ReportData, ReportError> {
    let (group_field, group_join, selected_filter) = if by_account {
        (
            "s.financial_account_id,a.name",
            "JOIN financial_accounts a ON a.id=s.financial_account_id",
            query.financial_account_id.as_deref().unwrap_or(""),
        )
    } else {
        (
            "s.payment_method_id,p.name",
            "JOIN payment_methods p ON p.id=s.payment_method_id",
            query.payment_method_id.as_deref().unwrap_or(""),
        )
    };
    let sql = format!(
        "SELECT {group_field},
         SUM(CASE WHEN e.direction='IN' THEN s.net_amount_cents ELSE 0 END),
         SUM(CASE WHEN e.direction='OUT' THEN s.net_amount_cents ELSE 0 END)
         FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id {group_join}
         WHERE s.settlement_date>=?1 AND s.settlement_date<=?2
         AND (?3='' OR {}=?3) AND (?4='' OR e.category_id=?4) AND (?5='' OR e.contact_id=?5)
         GROUP BY {group_field} ORDER BY 2 DESC",
        if by_account {
            "s.financial_account_id"
        } else {
            "s.payment_method_id"
        }
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement
        .query_map(
            params![
                query.start_date,
                query.end_date,
                selected_filter,
                query.category_id.as_deref().unwrap_or(""),
                query.contact_id.as_deref().unwrap_or("")
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )?
        .map(|value| {
            let (id, name, inflow, outflow) = value?;
            Ok(row(
                Some(id),
                vec![
                    cell(name),
                    cell(inflow),
                    cell(outflow),
                    cell(inflow - outflow),
                ],
            ))
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    let sum = |index: usize| {
        rows.iter()
            .map(|item| item.cells[index].raw.parse::<i64>().unwrap_or_default())
            .sum::<i64>()
    };
    Ok(ReportData {
        title: if by_account {
            "Movimentação por conta"
        } else {
            "Movimentação por forma de pagamento"
        },
        columns: vec![
            column(
                if by_account {
                    "account"
                } else {
                    "payment_method"
                },
                if by_account {
                    "Conta"
                } else {
                    "Forma de pagamento"
                },
                "TEXT",
            ),
            column("inflow", "Entradas", "MONEY"),
            column("outflow", "Saídas", "MONEY"),
            column("balance", "Líquido", "MONEY"),
        ],
        totals: vec![
            total("Entradas", "MONEY", sum(1)),
            total("Saídas", "MONEY", sum(2)),
            total("Líquido", "MONEY", sum(3)),
        ],
        rows,
    })
}

fn obligations_report(
    connection: &Connection,
    query: &ReportQuery,
    entry_type: Option<&str>,
    overdue_only: bool,
) -> Result<ReportData, ReportError> {
    let requested_type = entry_type.unwrap_or("");
    let mut statement = connection.prepare(
        "SELECT e.id,COALESCE(ct.name,'Sem contato'),e.description,COALESCE(c.name,'Sem categoria'),e.issue_date,e.due_date,
         e.installment_number||'/'||e.installment_count,e.gross_amount_cents,
         e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0),
         CAST(julianday(date('now','localtime'))-julianday(e.due_date) AS INTEGER),
         CASE WHEN e.due_date<date('now','localtime') THEN 'OVERDUE' WHEN COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)>0 THEN 'PARTIAL' ELSE e.status END,
         e.entry_type
         FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories c ON c.id=e.category_id
         WHERE e.deleted_at IS NULL AND e.status='PENDING' AND e.reversed_at IS NULL
         AND e.entry_type IN ('REVENUE','EXPENSE') AND (?1='' OR e.entry_type=?1)
         AND e.due_date>=?2 AND e.due_date<=?3 AND (?4='' OR e.contact_id=?4) AND (?5='' OR e.category_id=?5)
         AND (?6=0 OR e.due_date<date('now','localtime'))
         AND (?7='ALL' OR (?7='OVERDUE' AND e.due_date<date('now','localtime')) OR (?7='PENDING' AND e.due_date>=date('now','localtime')) OR (?7='SETTLED' AND 0) OR (?7='CANCELED' AND 0))
         ORDER BY e.due_date,e.created_at",
    )?;
    let rows = statement
        .query_map(
            params![
                requested_type,
                query.start_date,
                query.end_date,
                query.contact_id.as_deref().unwrap_or(""),
                query.category_id.as_deref().unwrap_or(""),
                overdue_only,
                query.status
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                ))
            },
        )?
        .map(|value| {
            let (
                id,
                contact,
                description,
                category,
                issue,
                due,
                installment,
                original,
                remaining,
                late_days,
                status,
                kind,
            ) = value?;
            Ok(row(
                Some(id),
                vec![
                    cell(if kind == "REVENUE" {
                        "A receber"
                    } else {
                        "A pagar"
                    }),
                    cell(contact),
                    cell(description),
                    cell(category),
                    cell(installment),
                    cell(issue),
                    cell(due),
                    cell(original),
                    cell(remaining),
                    cell(late_days.max(0)),
                    cell(status),
                ],
            ))
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    let pending: i64 = rows
        .iter()
        .map(|item| item.cells[8].raw.parse::<i64>().unwrap_or_default())
        .sum();
    Ok(ReportData {
        title: if overdue_only {
            "Contas vencidas"
        } else if entry_type == Some("REVENUE") {
            "Contas a receber"
        } else {
            "Contas a pagar"
        },
        columns: vec![
            column("nature", "Tipo", "TEXT"),
            column("contact", "Contato", "TEXT"),
            column("description", "Descrição", "TEXT"),
            column("category", "Categoria", "TEXT"),
            column("installment", "Parcela", "TEXT"),
            column("issue_date", "Emissão", "DATE"),
            column("due_date", "Vencimento", "DATE"),
            column("original", "Original", "MONEY"),
            column("remaining", "Pendente", "MONEY"),
            column("late_days", "Atraso", "NUMBER"),
            column("status", "Situação", "STATUS"),
        ],
        totals: vec![total("Saldo pendente", "MONEY", pending)],
        rows,
    })
}

fn entries_report(
    connection: &Connection,
    query: &ReportQuery,
    expenses: bool,
) -> Result<ReportData, ReportError> {
    let contact = query.contact_id.as_deref().unwrap_or("");
    let category = query.category_id.as_deref().unwrap_or("");
    let account = query.financial_account_id.as_deref().unwrap_or("");
    let payment = query.payment_method_id.as_deref().unwrap_or("");
    let status = status_filter(query);
    let rows: Vec<ReportRow> = if query.regime == "CASH" {
        let type_filter = if expenses {
            "(e.entry_type='EXPENSE' OR (e.entry_type='REVERSAL' AND e.result_multiplier=1))"
        } else {
            "e.direction='IN'"
        };
        let amount = if expenses {
            "s.net_amount_cents*e.result_multiplier*-1"
        } else {
            "s.net_amount_cents"
        };
        let sql = format!(
            "SELECT s.id,s.settlement_date,e.description,ct.name,c.name,a.name,p.name,e.entry_type,{amount},
             CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' ELSE e.status END
             FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id
             LEFT JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories c ON c.id=e.category_id
             JOIN financial_accounts a ON a.id=s.financial_account_id JOIN payment_methods p ON p.id=s.payment_method_id
             WHERE s.settlement_date>=?1 AND s.settlement_date<=?2 AND {type_filter}
             AND (?3='' OR e.contact_id=?3) AND (?4='' OR e.category_id=?4)
             AND (?5='' OR s.financial_account_id=?5) AND (?6='' OR s.payment_method_id=?6)
             AND (?7='ALL' OR e.status=?7) ORDER BY s.settlement_date,e.created_at"
        );
        let mut statement = connection.prepare(&sql)?;
        let mapped = statement
            .query_map(
                params![
                    query.start_date,
                    query.end_date,
                    contact,
                    category,
                    account,
                    payment,
                    status
                ],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )?
            .map(|value| {
                let (
                    id,
                    date,
                    description,
                    contact,
                    category,
                    account,
                    payment,
                    kind,
                    amount,
                    status,
                ) = value?;
                Ok(row(
                    Some(id),
                    vec![
                        cell(date),
                        cell(description),
                        cell(optional(contact)),
                        cell(optional(category)),
                        cell(account),
                        cell(payment),
                        cell(kind),
                        cell(amount),
                        cell(status),
                    ],
                ))
            })
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;
        mapped
    } else {
        let type_filter = if expenses {
            "(e.entry_type='EXPENSE' OR (e.entry_type='REVERSAL' AND e.result_multiplier=1))"
        } else {
            "e.direction='IN'"
        };
        let amount = if expenses {
            "e.net_amount_cents*e.result_multiplier*-1"
        } else {
            "e.net_amount_cents"
        };
        let sql = format!(
            "SELECT e.id,e.competence_date,e.description,ct.name,c.name,a.name,p.name,e.entry_type,{amount},
             CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' WHEN e.status='PENDING' AND e.due_date<date('now','localtime') THEN 'OVERDUE' ELSE e.status END
             FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories c ON c.id=e.category_id
             LEFT JOIN financial_accounts a ON a.id=e.financial_account_id LEFT JOIN payment_methods p ON p.id=e.payment_method_id
             WHERE e.deleted_at IS NULL AND e.status NOT IN ('DRAFT','CANCELED') AND e.competence_date>=?1 AND e.competence_date<=?2 AND {type_filter}
             AND (?3='' OR e.contact_id=?3) AND (?4='' OR e.category_id=?4)
             AND (?5='' OR e.financial_account_id=?5) AND (?6='' OR e.payment_method_id=?6)
             AND (?7='ALL' OR e.status=?7) ORDER BY e.competence_date,e.created_at"
        );
        let mut statement = connection.prepare(&sql)?;
        let mapped = statement
            .query_map(
                params![
                    query.start_date,
                    query.end_date,
                    contact,
                    category,
                    account,
                    payment,
                    status
                ],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )?
            .map(|value| {
                let (
                    id,
                    date,
                    description,
                    contact,
                    category,
                    account,
                    payment,
                    kind,
                    amount,
                    status,
                ) = value?;
                Ok(row(
                    Some(id),
                    vec![
                        cell(date),
                        cell(description),
                        cell(optional(contact)),
                        cell(optional(category)),
                        cell(optional(account)),
                        cell(optional(payment)),
                        cell(kind),
                        cell(amount),
                        cell(status),
                    ],
                ))
            })
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;
        mapped
    };
    let amount: i64 = rows
        .iter()
        .map(|item| item.cells[7].raw.parse::<i64>().unwrap_or_default())
        .sum();
    Ok(ReportData {
        title: if expenses {
            "Despesas por período"
        } else {
            "Entradas por período"
        },
        columns: vec![
            column("date", "Data", "DATE"),
            column("description", "Descrição", "TEXT"),
            column("contact", "Contato", "TEXT"),
            column("category", "Categoria", "TEXT"),
            column("account", "Conta", "TEXT"),
            column("payment", "Forma", "TEXT"),
            column("type", "Tipo", "STATUS"),
            column("amount", "Valor", "MONEY"),
            column("status", "Situação", "STATUS"),
        ],
        totals: vec![total("Total", "MONEY", amount)],
        rows,
    })
}

fn cash_flow_report(
    connection: &Connection,
    query: &ReportQuery,
) -> Result<ReportData, ReportError> {
    use std::collections::HashMap;
    let start = date(&query.start_date, "uma data inicial")?;
    let end = date(&query.end_date, "uma data final")?;
    let account = query.financial_account_id.as_deref().unwrap_or("");
    let category = query.category_id.as_deref().unwrap_or("");
    let opening_accounts: i64 = if category.is_empty() {
        connection.query_row(
            "SELECT COALESCE(SUM(opening_balance_cents),0) FROM financial_accounts WHERE deleted_at IS NULL AND opening_balance_date<=?1 AND (?2='' OR id=?2)",
            params![query.start_date, account],
            |row| row.get(0),
        )?
    } else {
        0
    };
    let previous: i64 = connection.query_row(
        "SELECT COALESCE(SUM(CASE e.direction WHEN 'IN' THEN s.net_amount_cents ELSE -s.net_amount_cents END),0) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE s.settlement_date<?1 AND (?2='' OR s.financial_account_id=?2) AND (?3='' OR e.category_id=?3)",
        params![query.start_date, account, category],
        |row| row.get(0),
    )?;
    let opening_events: HashMap<String, i64> = if category.is_empty() {
        connection.prepare("SELECT opening_balance_date,SUM(opening_balance_cents) FROM financial_accounts WHERE deleted_at IS NULL AND opening_balance_date>?1 AND opening_balance_date<=?2 AND (?3='' OR id=?3) GROUP BY opening_balance_date")?
            .query_map(params![query.start_date,query.end_date,account], |row| Ok((row.get(0)?,row.get(1)?)))?
            .collect::<Result<HashMap<_,_>,_>>()?
    } else {
        HashMap::new()
    };
    let movements: HashMap<String, (i64, i64)> = connection.prepare(
        "SELECT s.settlement_date,SUM(CASE WHEN e.direction='IN' THEN s.net_amount_cents ELSE 0 END),SUM(CASE WHEN e.direction='OUT' THEN s.net_amount_cents ELSE 0 END) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE s.settlement_date>=?1 AND s.settlement_date<=?2 AND (?3='' OR s.financial_account_id=?3) AND (?4='' OR e.category_id=?4) AND (?5='' OR s.payment_method_id=?5) GROUP BY s.settlement_date"
    )?.query_map(params![query.start_date,query.end_date,account,category,query.payment_method_id.as_deref().unwrap_or("")],|row|Ok((row.get(0)?,(row.get(1)?,row.get(2)?))))?.collect::<Result<HashMap<_,_>,_>>()?;
    let mut running = opening_accounts + previous;
    let initial = running;
    let mut cursor = start;
    let mut rows = Vec::new();
    while cursor <= end {
        let key = cursor.format("%Y-%m-%d").to_string();
        running += opening_events.get(&key).copied().unwrap_or_default();
        let opening = running;
        let (inflow, outflow) = movements.get(&key).copied().unwrap_or_default();
        running += inflow - outflow;
        rows.push(row(
            None,
            vec![
                cell(key),
                cell(opening),
                cell(inflow),
                cell(outflow),
                cell(inflow - outflow),
                cell(running),
            ],
        ));
        cursor += Duration::days(1);
    }
    Ok(ReportData {
        title: "Fluxo de caixa",
        columns: vec![
            column("date", "Data", "DATE"),
            column("opening", "Saldo inicial", "MONEY"),
            column("inflow", "Entradas", "MONEY"),
            column("outflow", "Saídas", "MONEY"),
            column("result", "Resultado", "MONEY"),
            column("closing", "Saldo final", "MONEY"),
        ],
        totals: vec![
            total("Saldo inicial", "MONEY", initial),
            total(
                "Entradas",
                "MONEY",
                rows.iter()
                    .map(|r| r.cells[2].raw.parse::<i64>().unwrap_or_default())
                    .sum::<i64>(),
            ),
            total(
                "Saídas",
                "MONEY",
                rows.iter()
                    .map(|r| r.cells[3].raw.parse::<i64>().unwrap_or_default())
                    .sum::<i64>(),
            ),
            total("Saldo final", "MONEY", running),
        ],
        rows,
    })
}

fn result_report(connection: &Connection, query: &ReportQuery) -> Result<ReportData, ReportError> {
    let rows = if query.regime == "CASH" {
        let mut statement = connection.prepare(
            "SELECT substr(s.settlement_date,1,7),
             COALESCE(SUM(CASE WHEN e.entry_type='REVENUE' THEN s.net_amount_cents WHEN e.entry_type='REVERSAL' AND e.result_multiplier=-1 THEN -s.net_amount_cents ELSE 0 END),0),
             COALESCE(SUM(CASE WHEN e.entry_type='EXPENSE' THEN s.net_amount_cents WHEN e.entry_type='REVERSAL' AND e.result_multiplier=1 THEN -s.net_amount_cents ELSE 0 END),0),
             COALESCE(SUM(s.net_amount_cents*e.result_multiplier),0)
             FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id
             WHERE s.settlement_date>=?1 AND s.settlement_date<=?2
             AND (?3='' OR e.contact_id=?3) AND (?4='' OR e.category_id=?4)
             AND (?5='' OR s.financial_account_id=?5) AND (?6='' OR s.payment_method_id=?6)
             GROUP BY substr(s.settlement_date,1,7) ORDER BY 1",
        )?;
        let mapped = statement
            .query_map(
                params![
                    query.start_date,
                    query.end_date,
                    query.contact_id.as_deref().unwrap_or(""),
                    query.category_id.as_deref().unwrap_or(""),
                    query.financial_account_id.as_deref().unwrap_or(""),
                    query.payment_method_id.as_deref().unwrap_or("")
                ],
                |item| {
                    Ok(row(
                        None,
                        vec![
                            cell(item.get::<_, String>(0)?),
                            cell(item.get::<_, i64>(1)?),
                            cell(item.get::<_, i64>(2)?),
                            cell(item.get::<_, i64>(3)?),
                        ],
                    ))
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;
        mapped
    } else {
        let summary = monthly_summary(connection, query)?;
        summary
            .rows
            .into_iter()
            .map(|item| {
                row(
                    None,
                    vec![
                        item.cells[0].clone(),
                        item.cells[1].clone(),
                        item.cells[2].clone(),
                        item.cells[3].clone(),
                    ],
                )
            })
            .collect::<Vec<_>>()
    };
    let sum = |index: usize| {
        rows.iter()
            .map(|item| item.cells[index].raw.parse::<i64>().unwrap_or_default())
            .sum::<i64>()
    };
    Ok(ReportData {
        title: "Resultado por período",
        columns: vec![
            column("month", "Mês", "MONTH"),
            column("revenue", "Receitas", "MONEY"),
            column("expenses", "Despesas", "MONEY"),
            column("result", "Resultado", "MONEY"),
        ],
        totals: vec![
            total("Receitas", "MONEY", sum(1)),
            total("Despesas", "MONEY", sum(2)),
            total("Resultado", "MONEY", sum(3)),
        ],
        rows,
    })
}

fn contact_history_report(
    connection: &Connection,
    query: &ReportQuery,
    customer: bool,
) -> Result<ReportData, ReportError> {
    let role = if customer {
        "ct.role_customer=1"
    } else {
        "ct.role_supplier=1"
    };
    let cash = query.regime == "CASH";
    let sql = if cash {
        format!(
            "SELECT s.id,s.settlement_date,ct.name,e.description,COALESCE(c.name,'Sem categoria'),e.entry_type,s.net_amount_cents*e.result_multiplier,
             CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' ELSE e.status END
             FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id JOIN contacts ct ON ct.id=e.contact_id
             LEFT JOIN categories c ON c.id=e.category_id WHERE {role} AND s.settlement_date>=?1 AND s.settlement_date<=?2
             AND (?3='' OR e.contact_id=?3) AND (?4='' OR e.category_id=?4) AND (?5='ALL' OR e.status=?5)
             AND (?6='' OR s.financial_account_id=?6) AND (?7='' OR s.payment_method_id=?7)
             ORDER BY s.settlement_date,e.created_at"
        )
    } else {
        format!(
            "SELECT e.id,e.competence_date,ct.name,e.description,COALESCE(c.name,'Sem categoria'),e.entry_type,e.net_amount_cents*e.result_multiplier,
             CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' WHEN e.status='PENDING' AND e.due_date<date('now','localtime') THEN 'OVERDUE' ELSE e.status END
             FROM financial_entries e JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories c ON c.id=e.category_id
             WHERE e.deleted_at IS NULL AND {role} AND e.competence_date>=?1 AND e.competence_date<=?2 AND (?3='' OR e.contact_id=?3)
             AND (?4='' OR e.category_id=?4) AND (?5='ALL' OR e.status=?5)
             AND (?6='' OR e.financial_account_id=?6) AND (?7='' OR e.payment_method_id=?7)
             ORDER BY e.competence_date,e.created_at"
        )
    };
    let mut statement = connection.prepare(&sql)?;
    let rows = statement
        .query_map(
            params![
                query.start_date,
                query.end_date,
                query.contact_id.as_deref().unwrap_or(""),
                query.category_id.as_deref().unwrap_or(""),
                status_filter(query),
                query.financial_account_id.as_deref().unwrap_or(""),
                query.payment_method_id.as_deref().unwrap_or("")
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )?
        .map(|value| {
            let (id, date, contact, description, category, kind, amount, status) = value?;
            Ok(row(
                Some(id),
                vec![
                    cell(date),
                    cell(contact),
                    cell(description),
                    cell(category),
                    cell(kind),
                    cell(amount),
                    cell(status),
                ],
            ))
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    let result = rows
        .iter()
        .map(|r| r.cells[5].raw.parse::<i64>().unwrap_or_default())
        .sum::<i64>();
    Ok(ReportData {
        title: if customer {
            "Histórico por cliente"
        } else {
            "Histórico por fornecedor"
        },
        columns: vec![
            column("date", "Data", "DATE"),
            column("contact", "Contato", "TEXT"),
            column("description", "Descrição", "TEXT"),
            column("category", "Categoria", "TEXT"),
            column("type", "Tipo", "STATUS"),
            column("result", "Efeito no resultado", "MONEY"),
            column("status", "Situação", "STATUS"),
        ],
        totals: vec![total("Resultado", "MONEY", result)],
        rows,
    })
}

fn sales_report(connection: &Connection, query: &ReportQuery) -> Result<ReportData, ReportError> {
    let status = query.status.as_str();
    let mut statement = connection.prepare(
        "SELECT s.id,s.issue_date,s.number,c.name,s.description,s.gross_amount_cents,s.discount_amount_cents+s.fee_amount_cents,s.net_amount_cents,s.receipt_mode,s.status
         FROM sales s JOIN contacts c ON c.id=s.customer_id WHERE s.deleted_at IS NULL AND s.issue_date>=?1 AND s.issue_date<=?2
         AND (?3='' OR s.customer_id=?3) AND (?4='ALL' OR s.status=?4) ORDER BY s.issue_date,s.number"
    )?;
    let rows = statement
        .query_map(
            params![
                query.start_date,
                query.end_date,
                query.contact_id.as_deref().unwrap_or(""),
                status
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                ))
            },
        )?
        .map(|value| {
            let (id, date, number, customer, description, gross, deductions, net, mode, status) =
                value?;
            Ok(row(
                Some(id),
                vec![
                    cell(date),
                    cell(number),
                    cell(customer),
                    cell(description),
                    cell(gross),
                    cell(deductions),
                    cell(net),
                    cell(mode),
                    cell(status),
                ],
            ))
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    let sum = |index: usize| {
        rows.iter()
            .map(|r| r.cells[index].raw.parse::<i64>().unwrap_or_default())
            .sum::<i64>()
    };
    Ok(ReportData {
        title: "Vendas por período",
        columns: vec![
            column("date", "Data", "DATE"),
            column("number", "Venda", "TEXT"),
            column("customer", "Cliente", "TEXT"),
            column("description", "Descrição", "TEXT"),
            column("gross", "Bruto", "MONEY"),
            column("deductions", "Descontos/taxas", "MONEY"),
            column("net", "Líquido", "MONEY"),
            column("mode", "Recebimento", "STATUS"),
            column("status", "Situação", "STATUS"),
        ],
        totals: vec![
            total("Vendas", "NUMBER", rows.len()),
            total("Total bruto", "MONEY", sum(4)),
            total("Total líquido", "MONEY", sum(6)),
        ],
        rows,
    })
}

fn sold_items_report(
    connection: &Connection,
    query: &ReportQuery,
) -> Result<ReportData, ReportError> {
    let mut statement = connection.prepare(
        "SELECT si.catalog_item_id,si.description,si.unit,SUM(si.quantity_millis),SUM(si.total_cents),COUNT(DISTINCT si.sale_id)
         FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.deleted_at IS NULL AND s.status NOT IN ('DRAFT','CANCELED')
         AND s.issue_date>=?1 AND s.issue_date<=?2 AND (?3='' OR s.customer_id=?3)
         GROUP BY si.catalog_item_id,si.description,si.unit ORDER BY SUM(si.total_cents) DESC"
    )?;
    let rows = statement
        .query_map(
            params![
                query.start_date,
                query.end_date,
                query.contact_id.as_deref().unwrap_or("")
            ],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            },
        )?
        .map(|value| {
            let (id, description, unit, quantity, total_value, sales) = value?;
            Ok(row(
                id,
                vec![
                    cell(description),
                    cell(unit),
                    cell(quantity),
                    cell(sales),
                    cell(total_value),
                ],
            ))
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    Ok(ReportData {
        title: "Produtos e serviços vendidos",
        columns: vec![
            column("item", "Item", "TEXT"),
            column("unit", "Unidade", "TEXT"),
            column("quantity", "Quantidade (milésimos)", "QUANTITY"),
            column("sales", "Vendas", "NUMBER"),
            column("amount", "Valor líquido", "MONEY"),
        ],
        totals: vec![
            total(
                "Quantidade",
                "QUANTITY",
                rows.iter()
                    .map(|r| r.cells[2].raw.parse::<i64>().unwrap_or_default())
                    .sum::<i64>(),
            ),
            total(
                "Valor",
                "MONEY",
                rows.iter()
                    .map(|r| r.cells[4].raw.parse::<i64>().unwrap_or_default())
                    .sum::<i64>(),
            ),
        ],
        rows,
    })
}

fn monthly_comparison(
    connection: &Connection,
    query: &ReportQuery,
) -> Result<ReportData, ReportError> {
    let summary = result_report(connection, query)?;
    let mut previous: Option<i64> = None;
    let mut rows = Vec::new();
    for item in summary.rows {
        let result = item.cells[3].raw.parse::<i64>().unwrap_or_default();
        let variance = previous.map(|value| result - value).unwrap_or_default();
        let percentage = previous
            .and_then(|value| {
                if value == 0 {
                    None
                } else {
                    Some(variance.saturating_mul(10_000) / value.abs())
                }
            })
            .unwrap_or_default();
        rows.push(row(
            None,
            vec![
                item.cells[0].clone(),
                item.cells[1].clone(),
                item.cells[2].clone(),
                item.cells[3].clone(),
                cell(previous.unwrap_or_default()),
                cell(variance),
                cell(percentage),
            ],
        ));
        previous = Some(result);
    }
    Ok(ReportData {
        title: "Comparativo mensal",
        columns: vec![
            column("month", "Mês", "MONTH"),
            column("revenue", "Receitas", "MONEY"),
            column("expenses", "Despesas", "MONEY"),
            column("result", "Resultado", "MONEY"),
            column("previous", "Resultado anterior", "MONEY"),
            column("variance", "Variação", "MONEY"),
            column("percentage", "Variação %", "PERCENT"),
        ],
        totals: summary.totals,
        rows,
    })
}

fn data_in_connection(
    connection: &Connection,
    query: &ReportQuery,
) -> Result<ReportData, ReportError> {
    match query.report_type.as_str() {
        "MONTHLY_SUMMARY" => monthly_summary(connection, query),
        "INFLOWS" => entries_report(connection, query, false),
        "EXPENSES" => entries_report(connection, query, true),
        "EXPENSES_BY_CATEGORY" => category_report(connection, query, true),
        "INFLOWS_BY_CATEGORY" => category_report(connection, query, false),
        "MOVEMENTS_BY_ACCOUNT" => movement_group_report(connection, query, true),
        "MOVEMENTS_BY_PAYMENT_METHOD" => movement_group_report(connection, query, false),
        "RECEIVABLES" => obligations_report(connection, query, Some("REVENUE"), false),
        "OVERDUE" => obligations_report(connection, query, None, true),
        "PAYABLES" => obligations_report(connection, query, Some("EXPENSE"), false),
        "CASH_FLOW" => cash_flow_report(connection, query),
        "RESULT" => result_report(connection, query),
        "CUSTOMER_HISTORY" => contact_history_report(connection, query, true),
        "SUPPLIER_HISTORY" => contact_history_report(connection, query, false),
        "SALES" => sales_report(connection, query),
        "SOLD_ITEMS" => sold_items_report(connection, query),
        "MONTHLY_COMPARISON" => monthly_comparison(connection, query),
        _ => Err(ReportError::Validation("Relatório inválido.".into())),
    }
}

fn forced_cash(report_type: &str) -> bool {
    [
        "MOVEMENTS_BY_ACCOUNT",
        "MOVEMENTS_BY_PAYMENT_METHOD",
        "RECEIVABLES",
        "OVERDUE",
        "PAYABLES",
        "CASH_FLOW",
        "SALES",
        "SOLD_ITEMS",
    ]
    .contains(&report_type)
}

fn result_in_connection(
    connection: &Connection,
    query: &ReportQuery,
    export: bool,
) -> Result<ReportResult, ReportError> {
    validate_query(query, export)?;
    let mut effective = query.clone();
    if forced_cash(&effective.report_type) {
        effective.regime = "CASH".into();
    }
    let mut data = data_in_connection(connection, &effective)?;
    sort_rows(&mut data, &effective)?;
    let total_rows = i64::try_from(data.rows.len())
        .map_err(|_| ReportError::Validation("Relatório grande demais.".into()))?;
    if export && total_rows > 50_000 {
        return Err(ReportError::Validation(
            "O relatório excede 50 mil linhas. Reduza o período ou aplique filtros.".into(),
        ));
    }
    let rows = if export {
        data.rows
    } else {
        data.rows
            .into_iter()
            .skip(effective.offset as usize)
            .take(effective.limit as usize)
            .collect()
    };
    let generated_at: String = connection.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M:%S','now','localtime')",
        [],
        |row| row.get(0),
    )?;
    let business_name: String = connection
        .query_row(
            "SELECT COALESCE(trade_name,legal_name) FROM business_profile LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| ReportError::Validation("Conclua a configuração inicial.".into()))?;
    let layout_notice = if data.columns.len() > 6 {
        "Na exportação A4, todas as colunas são mantidas em orientação paisagem; textos longos recebem reticências, sem ocultar colunas."
    } else {
        "Na exportação A4, todas as colunas são mantidas em orientação retrato."
    };
    let filters_summary = filters(&effective, connection)?;
    Ok(ReportResult {
        report_type: effective.report_type.clone(),
        title: data.title.into(),
        business_name,
        generated_at,
        start_date: effective.start_date.clone(),
        end_date: effective.end_date.clone(),
        regime: effective.regime,
        filters_summary,
        columns: data.columns,
        rows,
        totals: data.totals,
        total_rows,
        layout_notice: layout_notice.into(),
    })
}

fn output_path(path: &str, extension: &str) -> Result<PathBuf, ReportError> {
    let target = Path::new(path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some(extension)
        || target.file_name().is_none()
        || !target.parent().is_some_and(Path::is_dir)
    {
        return Err(ReportError::Validation(format!(
            "Escolha um arquivo .{extension} em uma pasta válida."
        )));
    }
    Ok(target.to_path_buf())
}

fn status_label(value: &str) -> &str {
    match value {
        "DRAFT" => "Rascunho",
        "PENDING" => "Pendente",
        "PARTIAL" => "Parcial",
        "SETTLED" => "Liquidada",
        "OVERDUE" => "Atrasada",
        "CANCELED" => "Cancelada",
        "REVERSED" => "Estornada",
        "REVENUE" => "Receita",
        "EXPENSE" => "Despesa",
        "REVERSAL" => "Estorno",
        "TRANSFER_IN" => "Transferência recebida",
        "TRANSFER_OUT" => "Transferência enviada",
        "OWNER_CONTRIBUTION" => "Aporte",
        "OWNER_WITHDRAWAL" => "Retirada",
        "IMMEDIATE" => "Imediato",
        "FUTURE" => "Futuro",
        "INSTALLMENTS" => "Parcelado",
        "MIXED" => "Misto",
        "CONFIRMED" => "Confirmada",
        "PARTIALLY_RECEIVED" => "Parcialmente recebida",
        "RECEIVED" => "Recebida",
        _ => value,
    }
}

fn brl(cents: i64, symbol: bool) -> String {
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
    let whole: String = grouped.chars().rev().collect();
    format!(
        "{}{}{whole},{decimal:02}",
        if cents < 0 { "-" } else { "" },
        if symbol { "R$ " } else { "" }
    )
}

fn formatted(raw: &str, kind: &str, csv: bool) -> String {
    match kind {
        "MONEY" => brl(raw.parse().unwrap_or_default(), !csv),
        "PERCENT" => format!(
            "{:.1}%",
            raw.parse::<i64>().unwrap_or_default() as f64 / 100.0
        )
        .replace('.', ","),
        "QUANTITY" => format!(
            "{:.3}",
            raw.parse::<i64>().unwrap_or_default() as f64 / 1000.0
        )
        .replace('.', ","),
        "MONTH" if raw.len() == 7 => format!("{}/{}", &raw[5..7], &raw[..4]),
        "STATUS" => status_label(raw).into(),
        _ => raw.into(),
    }
}

fn safe_csv(value: String) -> String {
    if value
        .trim_start()
        .starts_with(['=', '+', '-', '@', '\t', '\r'])
    {
        format!("'{value}")
    } else {
        value
    }
}

fn audit_export(
    connection: &Connection,
    report_type: &str,
    format: &str,
) -> Result<(), ReportError> {
    let user: Option<String> = connection
        .query_row(
            "SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    connection.execute(
        "INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(lower(hex(randomblob(16))),?1,'report',?2,'EXPORT',?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![user, report_type, format!("Relatório exportado em {format}")],
    )?;
    Ok(())
}

fn export_csv_in_connection(
    connection: &Connection,
    query: &ReportQuery,
    path: &str,
) -> Result<(), ReportError> {
    let target = output_path(path, "csv")?;
    let report = result_in_connection(connection, query, true)?;
    let mut file = BufWriter::new(File::create(target)?);
    file.write_all(&[0xEF, 0xBB, 0xBF])?;
    let mut writer = csv::WriterBuilder::new()
        .delimiter(b';')
        .flexible(true)
        .from_writer(file);
    writer.write_record(["Relatório", &report.title])?;
    writer.write_record(["Empresa", &safe_csv(report.business_name.clone())])?;
    writer.write_record(["Gerado em", &report.generated_at])?;
    writer.write_record([
        "Regime",
        if report.regime == "CASH" {
            "Caixa"
        } else {
            "Competência"
        },
    ])?;
    writer.write_record(["Filtros", &safe_csv(report.filters_summary.clone())])?;
    writer.write_record(std::iter::empty::<&str>())?;
    writer.write_record(report.columns.iter().map(|item| item.label.as_str()))?;
    for item in &report.rows {
        writer.write_record(
            item.cells
                .iter()
                .zip(&report.columns)
                .map(|(cell, column)| {
                    let value = formatted(&cell.raw, &column.kind, true);
                    if matches!(column.kind.as_str(), "TEXT" | "STATUS") {
                        safe_csv(value)
                    } else {
                        value
                    }
                }),
        )?;
    }
    writer.write_record(std::iter::empty::<&str>())?;
    for item in &report.totals {
        writer.write_record([item.label.clone(), formatted(&item.raw, &item.kind, true)])?;
    }
    writer.flush()?;
    audit_export(connection, &report.report_type, "CSV")?;
    Ok(())
}

fn pdf_text(
    layer: &PdfLayerReference,
    font: &printpdf::IndirectFontRef,
    value: &str,
    size: f32,
    x: f32,
    y: f32,
) {
    layer.use_text(value, size, Mm(x), Mm(y), font);
}

fn truncated(value: &str, maximum: usize) -> String {
    let count = value.chars().count();
    if count <= maximum {
        value.into()
    } else {
        format!(
            "{}...",
            value
                .chars()
                .take(maximum.saturating_sub(3))
                .collect::<String>()
        )
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_pdf_header(
    doc: &PdfDocumentReference,
    layer: &PdfLayerReference,
    regular: &printpdf::IndirectFontRef,
    bold: &printpdf::IndirectFontRef,
    report: &ReportResult,
    logo_path: Option<&str>,
    page_height: f32,
    page_width: f32,
    font_size: f32,
) -> f32 {
    let mut title_x = 12.0;
    if let Some(path) = logo_path.filter(|value| Path::new(value).is_file()) {
        if let Ok(image) = printpdf::image_crate::open(path) {
            Image::from_dynamic_image(&image).add_to_layer(
                layer.clone(),
                ImageTransform {
                    translate_x: Some(Mm(12.0)),
                    translate_y: Some(Mm(page_height - 22.0)),
                    scale_x: Some(0.16),
                    scale_y: Some(0.16),
                    dpi: Some(300.0),
                    ..Default::default()
                },
            );
            title_x = 35.0;
        }
    }
    pdf_text(
        layer,
        bold,
        "CAIXA NO CONTROLE",
        11.0,
        title_x,
        page_height - 12.0,
    );
    pdf_text(
        layer,
        bold,
        &truncated(&report.business_name, 70),
        10.0,
        title_x,
        page_height - 18.0,
    );
    pdf_text(layer, bold, &report.title, 14.0, 12.0, page_height - 30.0);
    pdf_text(
        layer,
        regular,
        &format!(
            "Período: {} a {}  |  Regime: {}",
            report.start_date,
            report.end_date,
            if report.regime == "CASH" {
                "Caixa"
            } else {
                "Competência"
            }
        ),
        7.5,
        12.0,
        page_height - 36.0,
    );
    pdf_text(
        layer,
        regular,
        &format!("Gerado em: {}", report.generated_at.replace('T', " ")),
        7.5,
        page_width - 70.0,
        page_height - 36.0,
    );
    pdf_text(
        layer,
        regular,
        &truncated(
            &report.filters_summary,
            if page_width > 210.0 { 170 } else { 115 },
        ),
        7.0,
        12.0,
        page_height - 42.0,
    );
    let columns = report.columns.len().max(1) as f32;
    let width = (page_width - 24.0) / columns;
    for (index, column) in report.columns.iter().enumerate() {
        pdf_text(
            layer,
            bold,
            &truncated(
                &column.label,
                ((width / (font_size * 0.48)) as usize).max(5),
            ),
            font_size,
            12.0 + index as f32 * width,
            page_height - 50.0,
        );
    }
    let _ = doc;
    page_height - 56.0
}

fn export_pdf_in_connection(
    connection: &Connection,
    query: &ReportQuery,
    path: &str,
) -> Result<(), ReportError> {
    let target = output_path(path, "pdf")?;
    let report = result_in_connection(connection, query, true)?;
    if report.total_rows > 5_000 {
        return Err(ReportError::Validation(
            "O PDF excederia 5 mil linhas. Reduza o período ou exporte em CSV.".into(),
        ));
    }
    let landscape = report.columns.len() > 6;
    let (page_width, page_height) = if landscape {
        (297.0, 210.0)
    } else {
        (210.0, 297.0)
    };
    let (doc, first_page, first_layer) =
        PdfDocument::new(&report.title, Mm(page_width), Mm(page_height), "Relatório");
    let regular = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|error| ReportError::Pdf(error.to_string()))?;
    let bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|error| ReportError::Pdf(error.to_string()))?;
    let logo_path: Option<String> = connection
        .query_row(
            "SELECT logo_path FROM business_profile LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    let font_size = if report.columns.len() >= 9 {
        5.6
    } else if report.columns.len() >= 7 {
        6.4
    } else {
        7.5
    };
    let row_height = if landscape { 6.3 } else { 7.0 };
    let mut pages = vec![(first_page, first_layer)];
    let mut y = {
        let layer = doc.get_page(first_page).get_layer(first_layer);
        draw_pdf_header(
            &doc,
            &layer,
            &regular,
            &bold,
            &report,
            logo_path.as_deref(),
            page_height,
            page_width,
            font_size,
        )
    };
    let column_width = (page_width - 24.0) / report.columns.len().max(1) as f32;
    for item in &report.rows {
        if y < 18.0 {
            let created = doc.add_page(Mm(page_width), Mm(page_height), "Continuação");
            pages.push(created);
            let layer = doc.get_page(created.0).get_layer(created.1);
            y = draw_pdf_header(
                &doc,
                &layer,
                &regular,
                &bold,
                &report,
                logo_path.as_deref(),
                page_height,
                page_width,
                font_size,
            );
        }
        let layer = doc
            .get_page(pages.last().unwrap().0)
            .get_layer(pages.last().unwrap().1);
        for (index, (value, column)) in item.cells.iter().zip(&report.columns).enumerate() {
            let formatted = formatted(&value.raw, &column.kind, false);
            let maximum = ((column_width / (font_size * 0.43)) as usize).max(4);
            pdf_text(
                &layer,
                &regular,
                &truncated(&formatted, maximum),
                font_size,
                12.0 + index as f32 * column_width,
                y,
            );
        }
        y -= row_height;
    }
    if y < 24.0 && !report.totals.is_empty() {
        let created = doc.add_page(Mm(page_width), Mm(page_height), "Totais");
        pages.push(created);
        let layer = doc.get_page(created.0).get_layer(created.1);
        y = draw_pdf_header(
            &doc,
            &layer,
            &regular,
            &bold,
            &report,
            logo_path.as_deref(),
            page_height,
            page_width,
            font_size,
        );
    }
    if !report.totals.is_empty() {
        let layer = doc
            .get_page(pages.last().unwrap().0)
            .get_layer(pages.last().unwrap().1);
        y -= 3.0;
        pdf_text(&layer, &bold, "TOTAIS", 8.0, 12.0, y);
        y -= 6.0;
        for item in &report.totals {
            pdf_text(
                &layer,
                &regular,
                &format!(
                    "{}: {}",
                    item.label,
                    formatted(&item.raw, &item.kind, false)
                ),
                8.0,
                12.0,
                y,
            );
            y -= 5.5;
        }
    }
    let page_count = pages.len();
    for (index, (page, layer_index)) in pages.iter().enumerate() {
        let layer = doc.get_page(*page).get_layer(*layer_index);
        pdf_text(
            &layer,
            &regular,
            &format!(
                "Página {} de {}  |  {} registro(s)",
                index + 1,
                page_count,
                report.total_rows
            ),
            6.8,
            12.0,
            8.0,
        );
        pdf_text(
            &layer,
            &regular,
            "Caixa no Controle - BratecInfo",
            6.8,
            page_width - 70.0,
            8.0,
        );
    }
    doc.save(&mut BufWriter::new(File::create(target)?))
        .map_err(|error| ReportError::Pdf(error.to_string()))?;
    audit_export(connection, &report.report_type, "PDF")?;
    Ok(())
}

pub fn options(app: &AppHandle) -> Result<ReportOptions, ReportError> {
    options_in_connection(&database::connection(app)?)
}

pub fn preview(app: &AppHandle, query: ReportQuery) -> Result<ReportResult, ReportError> {
    result_in_connection(&database::connection(app)?, &query, false)
}

pub fn export_csv(app: &AppHandle, query: ReportQuery, path: &str) -> Result<(), ReportError> {
    export_csv_in_connection(&database::connection(app)?, &query, path)
}

pub fn export_pdf(app: &AppHandle, query: ReportQuery, path: &str) -> Result<(), ReportError> {
    export_pdf_in_connection(&database::connection(app)?, &query, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        database::apply_migrations(&connection).unwrap();
        connection.execute_batch(
            "INSERT INTO business_profile(id,legal_name,trade_name,business_type,created_at,updated_at) VALUES('business','Empresa Teste','Loja Teste','GENERAL','2099-01-01','2099-01-01');
             INSERT INTO local_users(id,name,username,password_hash,role,is_active,created_at,updated_at) VALUES('user','Maria','maria','hash','ADMIN',1,'2099-01-01','2099-01-01');
             INSERT INTO categories(id,name,nature,is_system,is_active,display_order,created_at,updated_at,created_by,updated_by) VALUES('revenue','Serviços','REVENUE',0,1,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO categories(id,name,nature,is_system,is_active,display_order,created_at,updated_at,created_by,updated_by) VALUES('expense','Operação','EXPENSE',0,1,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO financial_accounts(id,name,account_type,opening_balance_cents,opening_balance_date,is_default,is_active,created_at,updated_at,created_by,updated_by) VALUES('account','Conta principal','BANK',100000,'2099-01-01',1,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO payment_methods(id,name,payment_type,is_system,is_active,created_at,updated_at,created_by,updated_by) VALUES('pix','Pix','PIX',0,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES('contact','PERSON',1,1,'Cliente e Fornecedor',1,0,'2099-01-01','2099-01-01','user','user');
             INSERT INTO app_preferences(id,business_id,default_financial_account_id,default_payment_method_id,default_view_regime,theme,created_at,updated_at) VALUES('preferences','business','account','pix','CASH','LIGHT','2099-01-01','2099-01-01');
             INSERT INTO catalog_items(id,item_type,name,sale_price_cents,unit,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES('item','SERVICE','Consultoria',20000,'UN',1,0,'2099-01-01','2099-01-01','user','user');
             INSERT INTO sales(id,number,customer_id,category_id,issue_date,description,gross_amount_cents,discount_amount_cents,fee_amount_cents,net_amount_cents,receipt_mode,payment_method_id,financial_account_id,installment_count,first_due_date,received_now_cents,status,created_by,updated_by,created_at,updated_at) VALUES('sale','V2099-000001','contact','revenue','2099-08-05','Venda consultoria',20000,0,0,20000,'IMMEDIATE','pix','account',1,'2099-08-05',20000,'RECEIVED','user','user','2099-08-05','2099-08-05');
             INSERT INTO sale_items(id,sale_id,catalog_item_id,description,quantity_millis,unit,unit_price_cents,discount_cents,total_cents,created_at,updated_at) VALUES('sale-item','sale','item','Consultoria',1000,'UN',20000,0,20000,'2099-08-05','2099-08-05');",
        ).unwrap();
        entry(
            &connection,
            "revenue-entry",
            "REVENUE",
            "IN",
            1,
            "revenue",
            20_000,
            "SETTLED",
        );
        entry(
            &connection,
            "expense-entry",
            "EXPENSE",
            "OUT",
            -1,
            "expense",
            5_000,
            "SETTLED",
        );
        entry(
            &connection,
            "pending-entry",
            "REVENUE",
            "IN",
            1,
            "revenue",
            12_000,
            "PENDING",
        );
        connection.execute("INSERT INTO entry_settlements(id,entry_id,financial_account_id,payment_method_id,settlement_date,principal_amount_cents,net_amount_cents,created_by,created_at) VALUES('partial','pending-entry','account','pix','2099-08-10',4000,4000,'user','2099-08-10')", []).unwrap();
        connection
    }

    #[allow(clippy::too_many_arguments)]
    fn entry(
        connection: &Connection,
        id: &str,
        entry_type: &str,
        direction: &str,
        multiplier: i64,
        category: &str,
        amount: i64,
        status: &str,
    ) {
        connection.execute("INSERT INTO financial_entries(id,entry_type,direction,result_multiplier,origin_type,contact_id,category_id,financial_account_id,payment_method_id,description,issue_date,competence_date,due_date,gross_amount_cents,net_amount_cents,status,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,'MANUAL','contact',?5,'account','pix',?1,'2099-08-05','2099-08-05','2099-08-20',?6,?6,?7,'user','user','2099-08-05','2099-08-05')", params![id,entry_type,direction,multiplier,category,amount,status]).unwrap();
        if status == "SETTLED" {
            connection.execute("INSERT INTO entry_settlements(id,entry_id,financial_account_id,payment_method_id,settlement_date,principal_amount_cents,net_amount_cents,created_by,created_at) VALUES(?1||'-settlement',?1,'account','pix','2099-08-05',?2,?2,'user','2099-08-05')", params![id,amount]).unwrap();
        }
    }

    fn query(report_type: &str, regime: &str) -> ReportQuery {
        ReportQuery {
            report_type: report_type.into(),
            start_date: "2099-08-01".into(),
            end_date: "2099-08-31".into(),
            regime: regime.into(),
            contact_id: None,
            category_id: None,
            financial_account_id: None,
            payment_method_id: None,
            status: "ALL".into(),
            sort_by: String::new(),
            sort_direction: "ASC".into(),
            limit: 25,
            offset: 0,
        }
    }

    #[test]
    fn generates_the_complete_catalog_of_seventeen_reports() {
        let connection = database();
        for report_type in REPORT_TYPES {
            let report =
                result_in_connection(&connection, &query(report_type, "ACCRUAL"), false).unwrap();
            assert!(!report.title.is_empty(), "{report_type}");
            assert!(!report.columns.is_empty(), "{report_type}");
            assert!(
                report
                    .rows
                    .iter()
                    .all(|row| row.cells.len() == report.columns.len()),
                "{report_type}"
            );
        }
    }

    #[test]
    fn reconciles_cash_accrual_and_partial_balances() {
        let connection = database();
        let cash = result_in_connection(&connection, &query("RESULT", "CASH"), false).unwrap();
        let accrual =
            result_in_connection(&connection, &query("RESULT", "ACCRUAL"), false).unwrap();
        assert_eq!(cash.totals[2].raw, "19000");
        assert_eq!(accrual.totals[2].raw, "27000");
        let receivables =
            result_in_connection(&connection, &query("RECEIVABLES", "ACCRUAL"), false).unwrap();
        assert_eq!(receivables.totals[0].raw, "8000");
        let history =
            result_in_connection(&connection, &query("CUSTOMER_HISTORY", "CASH"), false).unwrap();
        assert_eq!(history.totals[0].raw, "19000");
    }

    #[test]
    fn sorts_paginates_and_rejects_invalid_queries() {
        let connection = database();
        let mut sorted = query("INFLOWS", "CASH");
        sorted.sort_by = "amount".into();
        sorted.sort_direction = "DESC".into();
        sorted.limit = 1;
        let report = result_in_connection(&connection, &sorted, false).unwrap();
        assert_eq!(report.total_rows, 2);
        assert_eq!(report.rows.len(), 1);
        assert_eq!(report.rows[0].cells[7].raw, "20000");
        sorted.report_type = "UNKNOWN".into();
        assert!(result_in_connection(&connection, &sorted, false).is_err());
    }

    #[test]
    fn exports_utf8_csv_and_valid_a4_pdf_with_audit() {
        let connection = database();
        let directory = tempfile::tempdir().unwrap();
        let csv_path = directory.path().join("report.csv");
        export_csv_in_connection(
            &connection,
            &query("SALES", "ACCRUAL"),
            csv_path.to_str().unwrap(),
        )
        .unwrap();
        let bytes = std::fs::read(&csv_path).unwrap();
        assert!(bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert!(String::from_utf8_lossy(&bytes).contains("Loja Teste"));
        let pdf_path = std::env::var("CNC_REPORT_SAMPLE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| directory.path().join("report.pdf"));
        if let Some(parent) = pdf_path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        export_pdf_in_connection(
            &connection,
            &query("SALES", "ACCRUAL"),
            pdf_path.to_str().unwrap(),
        )
        .unwrap();
        assert!(std::fs::read(&pdf_path).unwrap().starts_with(b"%PDF"));
        let audits: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM audit_logs WHERE entity_type='report' AND action='EXPORT'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(audits, 2);
    }
}
