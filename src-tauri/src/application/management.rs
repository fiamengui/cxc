use std::collections::HashMap;

use chrono::{Datelike, Duration, NaiveDate, Weekday};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use thiserror::Error;
use uuid::Uuid;

use crate::database::{self, DatabaseError};

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

#[derive(Debug, Error)]
pub enum ManagementError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardQuery {
    pub start_date: String,
    pub end_date: String,
    pub grouping: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardIndicator {
    pub current_cents: i64,
    pub previous_cents: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardPoint {
    pub key: String,
    pub start_date: String,
    pub end_date: String,
    pub opening_balance_cents: i64,
    pub inflow_cents: i64,
    pub outflow_cents: i64,
    pub closing_balance_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseCategory {
    pub category_id: Option<String>,
    pub name: String,
    pub amount_cents: i64,
    pub percentage_basis_points: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardListItem {
    pub id: String,
    pub list_kind: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub date: Option<String>,
    pub due_date: Option<String>,
    pub amount_cents: i64,
    pub status: String,
    pub origin_type: String,
    pub origin_id: Option<String>,
    pub contact_id: Option<String>,
    pub recurrence_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardResult {
    pub business_name: String,
    pub user_name: String,
    pub start_date: String,
    pub end_date: String,
    pub previous_start_date: String,
    pub previous_end_date: String,
    pub available_balance: DashboardIndicator,
    pub received_inflow: DashboardIndicator,
    pub paid_outflow: DashboardIndicator,
    pub period_result: DashboardIndicator,
    pub total_receivable: DashboardIndicator,
    pub total_payable: DashboardIndicator,
    pub total_overdue: DashboardIndicator,
    pub goal_progress_basis_points: Option<i64>,
    pub goal_target_cents: Option<i64>,
    pub goal_actual_cents: i64,
    pub goal_daily_business_cents: Option<i64>,
    pub points: Vec<DashboardPoint>,
    pub expense_categories: Vec<ExpenseCategory>,
    pub upcoming_payables: Vec<DashboardListItem>,
    pub upcoming_receivables: Vec<DashboardListItem>,
    pub overdue_accounts: Vec<DashboardListItem>,
    pub largest_expenses: Vec<DashboardListItem>,
    pub latest_movements: Vec<DashboardListItem>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalInput {
    pub reference_month: String,
    pub revenue_goal_cents: Option<i64>,
    pub expense_limit_cents: Option<i64>,
    pub result_goal_cents: Option<i64>,
    pub sales_count_goal: Option<i64>,
    pub new_customers_goal: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalMetric {
    pub target: Option<i64>,
    pub actual: i64,
    pub previous_actual: i64,
    pub difference: Option<i64>,
    pub progress_basis_points: Option<i64>,
    pub daily_calendar_amount: Option<i64>,
    pub daily_business_amount: Option<i64>,
    pub is_limit: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalPerformance {
    pub reference_month: String,
    pub start_date: String,
    pub end_date: String,
    pub calendar_days_remaining: i64,
    pub business_days_remaining: i64,
    pub revenue: GoalMetric,
    pub expenses: GoalMetric,
    pub result: GoalMetric,
    pub sales: GoalMetric,
    pub new_customers: GoalMetric,
}

#[derive(Default)]
struct Actuals {
    revenue: i64,
    expenses: i64,
    result: i64,
    sales: i64,
    new_customers: i64,
}

type GoalValues = (
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
);

fn date(value: &str, label: &str) -> Result<NaiveDate, ManagementError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| ManagementError::Validation(format!("Informe {label} válida.")))
}

fn month_range(reference: &str) -> Result<(NaiveDate, NaiveDate), ManagementError> {
    if reference.len() != 7 {
        return Err(ManagementError::Validation(
            "Informe o mês no formato AAAA-MM.".into(),
        ));
    }
    let first = date(&format!("{reference}-01"), "um mês de referência")?;
    let next = if first.month() == 12 {
        NaiveDate::from_ymd_opt(first.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(first.year(), first.month() + 1, 1)
    }
    .ok_or_else(|| ManagementError::Validation("Mês fora do limite.".into()))?;
    Ok((first, next - Duration::days(1)))
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
) -> Result<(), ManagementError> {
    connection.execute(
        &format!("INSERT INTO audit_logs(id,user_id,entity_type,entity_id,action,summary,created_at) VALUES(?1,?2,'goal',?3,?4,?5,{NOW})"),
        params![Uuid::new_v4().to_string(), actor(connection)?, entity_id, action, summary],
    )?;
    Ok(())
}

fn validate_goal(input: &GoalInput) -> Result<(), ManagementError> {
    month_range(&input.reference_month)?;
    let non_negative = [
        input.revenue_goal_cents,
        input.expense_limit_cents,
        input.sales_count_goal,
        input.new_customers_goal,
    ]
    .into_iter()
    .flatten()
    .all(|value| value >= 0);
    if !non_negative
        || [
            input.revenue_goal_cents,
            input.expense_limit_cents,
            input.result_goal_cents,
            input.sales_count_goal,
            input.new_customers_goal,
        ]
        .into_iter()
        .all(|value| value.is_none())
    {
        return Err(ManagementError::Validation(
            "Defina ao menos uma meta e não use valores negativos em limites ou quantidades."
                .into(),
        ));
    }
    Ok(())
}

fn local_today(connection: &Connection) -> Result<NaiveDate, ManagementError> {
    let value: String =
        connection.query_row("SELECT date('now','localtime')", [], |row| row.get(0))?;
    date(&value, "a data atual")
}

fn actuals(connection: &Connection, reference: &str) -> Result<Actuals, ManagementError> {
    let (first, last) = month_range(reference)?;
    let start = first.format("%Y-%m-%d").to_string();
    let next = (last + Duration::days(1)).format("%Y-%m-%d").to_string();
    let (revenue, expenses, result): (i64, i64, i64) = connection.query_row(
        "SELECT
           COALESCE(SUM(CASE WHEN e.entry_type='REVENUE' THEN e.net_amount_cents WHEN e.entry_type='REVERSAL' AND e.result_multiplier=-1 THEN -e.net_amount_cents ELSE 0 END),0),
           COALESCE(SUM(CASE WHEN e.entry_type='EXPENSE' THEN e.net_amount_cents WHEN e.entry_type='REVERSAL' AND e.result_multiplier=1 THEN -e.net_amount_cents ELSE 0 END),0),
           COALESCE(SUM(e.net_amount_cents*e.result_multiplier),0)
         FROM financial_entries e
         WHERE e.deleted_at IS NULL AND e.status NOT IN ('DRAFT','CANCELED') AND e.competence_date>=?1 AND e.competence_date<?2",
        params![start, next],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let sales = connection.query_row(
        "SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL AND status NOT IN ('DRAFT','CANCELED') AND issue_date>=?1 AND issue_date<?2",
        params![start, next],
        |row| row.get(0),
    )?;
    let new_customers = connection.query_row(
        "SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL AND role_customer=1 AND created_at>=?1 AND created_at<?2",
        params![start, next],
        |row| row.get(0),
    )?;
    Ok(Actuals {
        revenue,
        expenses,
        result,
        sales,
        new_customers,
    })
}

fn ceil_div(value: i64, divisor: i64) -> i64 {
    if value <= 0 || divisor <= 0 {
        0
    } else {
        (value + divisor - 1) / divisor
    }
}

fn metric(
    target: Option<i64>,
    actual: i64,
    previous_actual: i64,
    calendar_days: i64,
    business_days: i64,
    is_limit: bool,
) -> GoalMetric {
    let difference = target.map(|value| value - actual);
    let progress_basis_points = target.and_then(|value| {
        if value > 0 {
            Some(actual.saturating_mul(10_000) / value)
        } else if value == 0 {
            if actual < 0 {
                Some(0)
            } else if is_limit && actual > 0 {
                Some(10_001)
            } else {
                Some(10_000)
            }
        } else {
            None
        }
    });
    let remaining = difference.unwrap_or(0).max(0);
    let per_day = |days| {
        target.map(|_| {
            if is_limit {
                if days > 0 {
                    remaining / days
                } else {
                    0
                }
            } else {
                ceil_div(remaining, days)
            }
        })
    };
    GoalMetric {
        target,
        actual,
        previous_actual,
        difference,
        progress_basis_points,
        daily_calendar_amount: per_day(calendar_days),
        daily_business_amount: per_day(business_days),
        is_limit,
    }
}

fn goal_in_connection(
    connection: &Connection,
    reference: &str,
) -> Result<GoalPerformance, ManagementError> {
    let (first, last) = month_range(reference)?;
    let previous_reference = (first - Duration::days(1)).format("%Y-%m").to_string();
    let goals: Option<GoalValues> = connection
        .query_row(
            "SELECT revenue_goal_cents,expense_limit_cents,result_goal_cents,sales_count_goal,new_customers_goal FROM goals WHERE reference_month=?1",
            [reference],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .optional()?;
    let goals = goals.unwrap_or((None, None, None, None, None));
    let current = actuals(connection, reference)?;
    let previous = actuals(connection, &previous_reference)?;
    let today = local_today(connection)?;
    let remaining_start = if today < first { first } else { today };
    let calendar_days = if remaining_start > last {
        0
    } else {
        (last - remaining_start).num_days() + 1
    };
    let mut business_days = 0;
    let mut cursor = remaining_start;
    while cursor <= last {
        if !matches!(cursor.weekday(), Weekday::Sat | Weekday::Sun) {
            business_days += 1;
        }
        cursor += Duration::days(1);
    }
    Ok(GoalPerformance {
        reference_month: reference.to_owned(),
        start_date: first.format("%Y-%m-%d").to_string(),
        end_date: last.format("%Y-%m-%d").to_string(),
        calendar_days_remaining: calendar_days,
        business_days_remaining: business_days,
        revenue: metric(
            goals.0,
            current.revenue,
            previous.revenue,
            calendar_days,
            business_days,
            false,
        ),
        expenses: metric(
            goals.1,
            current.expenses,
            previous.expenses,
            calendar_days,
            business_days,
            true,
        ),
        result: metric(
            goals.2,
            current.result,
            previous.result,
            calendar_days,
            business_days,
            false,
        ),
        sales: metric(
            goals.3,
            current.sales,
            previous.sales,
            calendar_days,
            business_days,
            false,
        ),
        new_customers: metric(
            goals.4,
            current.new_customers,
            previous.new_customers,
            calendar_days,
            business_days,
            false,
        ),
    })
}

fn save_goal_in_connection(
    connection: &Connection,
    input: &GoalInput,
) -> Result<GoalPerformance, ManagementError> {
    validate_goal(input)?;
    let tx = connection.unchecked_transaction()?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT id FROM goals WHERE reference_month=?1",
            [&input.reference_month],
            |row| row.get(0),
        )
        .optional()?;
    let actor_id = actor(&tx)?;
    let id = existing
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    tx.execute(
        &format!("INSERT INTO goals(id,reference_month,revenue_goal_cents,expense_limit_cents,result_goal_cents,sales_count_goal,new_customers_goal,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8,{NOW},{NOW}) ON CONFLICT(reference_month) DO UPDATE SET revenue_goal_cents=excluded.revenue_goal_cents,expense_limit_cents=excluded.expense_limit_cents,result_goal_cents=excluded.result_goal_cents,sales_count_goal=excluded.sales_count_goal,new_customers_goal=excluded.new_customers_goal,updated_by=excluded.updated_by,updated_at={NOW}"),
        params![id,input.reference_month,input.revenue_goal_cents,input.expense_limit_cents,input.result_goal_cents,input.sales_count_goal,input.new_customers_goal,actor_id],
    )?;
    audit(
        &tx,
        &id,
        if existing.is_some() {
            "UPDATE"
        } else {
            "CREATE"
        },
        "Metas mensais salvas",
    )?;
    tx.commit()?;
    goal_in_connection(connection, &input.reference_month)
}

fn balance_as_of(connection: &Connection, value: &str) -> Result<i64, ManagementError> {
    Ok(connection.query_row(
        "SELECT
           COALESCE((SELECT SUM(opening_balance_cents) FROM financial_accounts WHERE deleted_at IS NULL AND opening_balance_date<=?1),0)
           +COALESCE((SELECT SUM(CASE e.direction WHEN 'IN' THEN s.net_amount_cents ELSE -s.net_amount_cents END) FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id WHERE s.settlement_date<=?1),0)",
        [value],
        |row| row.get(0),
    )?)
}

fn cash_period(
    connection: &Connection,
    start: &str,
    end: &str,
) -> Result<(i64, i64, i64), ManagementError> {
    Ok(connection.query_row(
        "SELECT
          COALESCE(SUM(CASE WHEN e.direction='IN' THEN s.net_amount_cents ELSE 0 END),0),
          COALESCE(SUM(CASE WHEN e.direction='OUT' THEN s.net_amount_cents ELSE 0 END),0),
          COALESCE(SUM(s.net_amount_cents*e.result_multiplier),0)
         FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id
         WHERE s.settlement_date>=?1 AND s.settlement_date<=?2",
        params![start, end],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?)
}

fn pending_totals(connection: &Connection) -> Result<(i64, i64, i64), ManagementError> {
    let remaining = "e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)";
    Ok(connection.query_row(
        &format!("SELECT
          COALESCE(SUM(CASE WHEN e.entry_type='REVENUE' THEN {remaining} ELSE 0 END),0),
          COALESCE(SUM(CASE WHEN e.entry_type='EXPENSE' THEN {remaining} ELSE 0 END),0),
          COALESCE(SUM(CASE WHEN e.due_date<date('now','localtime') THEN {remaining} ELSE 0 END),0)
         FROM financial_entries e WHERE e.deleted_at IS NULL AND e.status='PENDING' AND e.reversed_at IS NULL AND e.entry_type IN ('REVENUE','EXPENSE')"),
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?)
}

fn chart_points(
    connection: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    grouping: &str,
) -> Result<Vec<DashboardPoint>, ManagementError> {
    let start_text = start.format("%Y-%m-%d").to_string();
    let end_text = end.format("%Y-%m-%d").to_string();
    let mut movements = HashMap::new();
    {
        let mut statement = connection.prepare(
            "SELECT s.settlement_date,
              COALESCE(SUM(CASE WHEN e.direction='IN' THEN s.net_amount_cents ELSE 0 END),0),
              COALESCE(SUM(CASE WHEN e.direction='OUT' THEN s.net_amount_cents ELSE 0 END),0)
             FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id
             WHERE s.settlement_date>=?1 AND s.settlement_date<=?2 GROUP BY s.settlement_date",
        )?;
        for row in statement.query_map(params![start_text, end_text], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })? {
            let (key, inflow, outflow) = row?;
            movements.insert(key, (inflow, outflow));
        }
    }
    let mut openings = HashMap::new();
    {
        let mut statement = connection.prepare(
            "SELECT opening_balance_date,SUM(opening_balance_cents) FROM financial_accounts WHERE deleted_at IS NULL AND opening_balance_date>=?1 AND opening_balance_date<=?2 GROUP BY opening_balance_date",
        )?;
        for row in statement.query_map(params![start_text, end_text], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })? {
            let (key, amount) = row?;
            openings.insert(key, amount);
        }
    }
    let previous_day = (start - Duration::days(1)).format("%Y-%m-%d").to_string();
    let mut running = balance_as_of(connection, &previous_day)?;
    let mut daily = Vec::new();
    let mut cursor = start;
    while cursor <= end {
        let key = cursor.format("%Y-%m-%d").to_string();
        running += openings.get(&key).copied().unwrap_or(0);
        let opening = running;
        let (inflow, outflow) = movements.get(&key).copied().unwrap_or((0, 0));
        running += inflow - outflow;
        daily.push(DashboardPoint {
            key: key.clone(),
            start_date: key.clone(),
            end_date: key,
            opening_balance_cents: opening,
            inflow_cents: inflow,
            outflow_cents: outflow,
            closing_balance_cents: running,
        });
        cursor += Duration::days(1);
    }
    if grouping == "DAILY" {
        return Ok(daily);
    }
    let mut monthly: Vec<DashboardPoint> = Vec::new();
    for point in daily {
        let key = point.start_date[..7].to_owned();
        if let Some(last) = monthly.last_mut().filter(|item| item.key == key) {
            last.end_date = point.end_date;
            last.inflow_cents += point.inflow_cents;
            last.outflow_cents += point.outflow_cents;
            last.closing_balance_cents = point.closing_balance_cents;
        } else {
            monthly.push(DashboardPoint { key, ..point });
        }
    }
    Ok(monthly)
}

fn expense_categories(
    connection: &Connection,
    start: &str,
    end: &str,
) -> Result<Vec<ExpenseCategory>, ManagementError> {
    let mut statement = connection.prepare(
        "SELECT e.category_id,COALESCE(c.name,'Sem categoria'),SUM(s.net_amount_cents)
         FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id LEFT JOIN categories c ON c.id=e.category_id
         WHERE e.entry_type='EXPENSE' AND e.reversed_at IS NULL AND s.settlement_date>=?1 AND s.settlement_date<=?2
         GROUP BY e.category_id,c.name ORDER BY SUM(s.net_amount_cents) DESC LIMIT 8",
    )?;
    let raw = statement
        .query_map(params![start, end], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get::<_, i64>(2)?))
        })?
        .collect::<Result<Vec<(Option<String>, String, i64)>, _>>()?;
    let total: i64 = raw.iter().map(|item| item.2).sum();
    Ok(raw
        .into_iter()
        .map(|(category_id, name, amount_cents)| ExpenseCategory {
            category_id,
            name,
            amount_cents,
            percentage_basis_points: if total > 0 {
                amount_cents.saturating_mul(10_000) / total
            } else {
                0
            },
        })
        .collect())
}

fn obligation_items(
    connection: &Connection,
    entry_type: Option<&str>,
    overdue: bool,
) -> Result<Vec<DashboardListItem>, ManagementError> {
    let type_filter = entry_type.unwrap_or("");
    let due_filter = if overdue {
        "e.due_date<date('now','localtime')"
    } else {
        "e.due_date>=date('now','localtime')"
    };
    let mut statement = connection.prepare(&format!(
        "SELECT e.id,e.description,ct.name,e.issue_date,e.due_date,
          e.gross_amount_cents-COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0),
          CASE WHEN e.due_date<date('now','localtime') THEN 'OVERDUE' WHEN COALESCE((SELECT SUM(s.principal_amount_cents) FROM entry_settlements s WHERE s.entry_id=e.id),0)>0 THEN 'PARTIAL' ELSE 'PENDING' END,
          e.origin_type,e.origin_id,e.contact_id,e.recurrence_id,e.entry_type
         FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id
         WHERE e.deleted_at IS NULL AND e.status='PENDING' AND e.reversed_at IS NULL AND e.entry_type IN ('REVENUE','EXPENSE') AND (?1='' OR e.entry_type=?1) AND {due_filter}
         ORDER BY e.due_date,e.created_at LIMIT 5"
    ))?;
    let items = statement
        .query_map([type_filter], |row| {
            let item_type: String = row.get(11)?;
            Ok(DashboardListItem {
                id: row.get(0)?,
                list_kind: if item_type == "REVENUE" {
                    "RECEIVABLE".into()
                } else {
                    "PAYABLE".into()
                },
                title: row.get(1)?,
                subtitle: row.get(2)?,
                date: row.get(3)?,
                due_date: row.get(4)?,
                amount_cents: row.get(5)?,
                status: row.get(6)?,
                origin_type: row.get(7)?,
                origin_id: row.get(8)?,
                contact_id: row.get(9)?,
                recurrence_id: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

fn largest_expenses(
    connection: &Connection,
    start: &str,
    end: &str,
) -> Result<Vec<DashboardListItem>, ManagementError> {
    let mut statement = connection.prepare(
        "SELECT e.id,e.description,COALESCE(ct.name,c.name),MAX(s.settlement_date),SUM(s.net_amount_cents),e.origin_type,e.origin_id,e.contact_id,e.recurrence_id
         FROM entry_settlements s JOIN financial_entries e ON e.id=s.entry_id LEFT JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories c ON c.id=e.category_id
         WHERE e.entry_type='EXPENSE' AND e.reversed_at IS NULL AND s.settlement_date>=?1 AND s.settlement_date<=?2
         GROUP BY e.id ORDER BY SUM(s.net_amount_cents) DESC LIMIT 5",
    )?;
    let items = statement
        .query_map(params![start, end], |row| {
            Ok(DashboardListItem {
                id: row.get(0)?,
                list_kind: "EXPENSE".into(),
                title: row.get(1)?,
                subtitle: row.get(2)?,
                date: row.get(3)?,
                due_date: None,
                amount_cents: row.get(4)?,
                status: "SETTLED".into(),
                origin_type: row.get(5)?,
                origin_id: row.get(6)?,
                contact_id: row.get(7)?,
                recurrence_id: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

fn latest_movements(connection: &Connection) -> Result<Vec<DashboardListItem>, ManagementError> {
    let mut statement = connection.prepare(
        "SELECT e.id,e.description,COALESCE(ct.name,c.name),e.issue_date,e.due_date,e.net_amount_cents,
          CASE WHEN e.reversed_at IS NOT NULL THEN 'REVERSED' WHEN e.status='PENDING' AND e.due_date<date('now','localtime') THEN 'OVERDUE' ELSE e.status END,
          e.origin_type,e.origin_id,e.contact_id,e.recurrence_id,e.entry_type
         FROM financial_entries e LEFT JOIN contacts ct ON ct.id=e.contact_id LEFT JOIN categories c ON c.id=e.category_id
         WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 5",
    )?;
    let items = statement
        .query_map([], |row| {
            let entry_type: String = row.get(11)?;
            Ok(DashboardListItem {
                id: row.get(0)?,
                list_kind: entry_type,
                title: row.get(1)?,
                subtitle: row.get(2)?,
                date: row.get(3)?,
                due_date: row.get(4)?,
                amount_cents: row.get(5)?,
                status: row.get(6)?,
                origin_type: row.get(7)?,
                origin_id: row.get(8)?,
                contact_id: row.get(9)?,
                recurrence_id: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

fn dashboard_in_connection(
    connection: &Connection,
    query: &DashboardQuery,
) -> Result<DashboardResult, ManagementError> {
    let start = date(&query.start_date, "uma data inicial")?;
    let end = date(&query.end_date, "uma data final")?;
    if end < start || (end - start).num_days() > 3_660 {
        return Err(ManagementError::Validation(
            "O período do dashboard deve ter até dez anos.".into(),
        ));
    }
    if !["DAILY", "MONTHLY"].contains(&query.grouping.as_str()) {
        return Err(ManagementError::Validation(
            "Agrupamento do dashboard inválido.".into(),
        ));
    }
    if query.grouping == "DAILY" && (end - start).num_days() > 366 {
        return Err(ManagementError::Validation(
            "Para períodos acima de 367 dias, use o agrupamento mensal.".into(),
        ));
    }
    let period_days = (end - start).num_days() + 1;
    let previous_end = start - Duration::days(1);
    let previous_start = previous_end - Duration::days(period_days - 1);
    let previous_start_text = previous_start.format("%Y-%m-%d").to_string();
    let previous_end_text = previous_end.format("%Y-%m-%d").to_string();
    let (inflow, outflow, result) = cash_period(connection, &query.start_date, &query.end_date)?;
    let (previous_inflow, previous_outflow, previous_result) =
        cash_period(connection, &previous_start_text, &previous_end_text)?;
    let (receivable, payable, overdue) = pending_totals(connection)?;
    let goal_reference = end.format("%Y-%m").to_string();
    let goal = goal_in_connection(connection, &goal_reference)?;
    let (business_name, user_name): (String, String) = connection
        .query_row(
            "SELECT COALESCE(b.trade_name,b.legal_name),u.name FROM business_profile b CROSS JOIN local_users u WHERE u.is_active=1 ORDER BY u.created_at LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| ManagementError::Validation("Conclua a configuração inicial.".into()))?;
    Ok(DashboardResult {
        business_name,
        user_name,
        start_date: query.start_date.clone(),
        end_date: query.end_date.clone(),
        previous_start_date: previous_start_text.clone(),
        previous_end_date: previous_end_text.clone(),
        available_balance: DashboardIndicator {
            current_cents: balance_as_of(connection, &query.end_date)?,
            previous_cents: Some(balance_as_of(connection, &previous_end_text)?),
        },
        received_inflow: DashboardIndicator {
            current_cents: inflow,
            previous_cents: Some(previous_inflow),
        },
        paid_outflow: DashboardIndicator {
            current_cents: outflow,
            previous_cents: Some(previous_outflow),
        },
        period_result: DashboardIndicator {
            current_cents: result,
            previous_cents: Some(previous_result),
        },
        total_receivable: DashboardIndicator {
            current_cents: receivable,
            previous_cents: None,
        },
        total_payable: DashboardIndicator {
            current_cents: payable,
            previous_cents: None,
        },
        total_overdue: DashboardIndicator {
            current_cents: overdue,
            previous_cents: None,
        },
        goal_progress_basis_points: goal.revenue.progress_basis_points,
        goal_target_cents: goal.revenue.target,
        goal_actual_cents: goal.revenue.actual,
        goal_daily_business_cents: goal.revenue.daily_business_amount,
        points: chart_points(connection, start, end, &query.grouping)?,
        expense_categories: expense_categories(connection, &query.start_date, &query.end_date)?,
        upcoming_payables: obligation_items(connection, Some("EXPENSE"), false)?,
        upcoming_receivables: obligation_items(connection, Some("REVENUE"), false)?,
        overdue_accounts: obligation_items(connection, None, true)?,
        largest_expenses: largest_expenses(connection, &query.start_date, &query.end_date)?,
        latest_movements: latest_movements(connection)?,
    })
}

pub fn dashboard(
    app: &AppHandle,
    query: DashboardQuery,
) -> Result<DashboardResult, ManagementError> {
    let connection = database::connection(app)?;
    dashboard_in_connection(&connection, &query)
}

pub fn goal(app: &AppHandle, reference: &str) -> Result<GoalPerformance, ManagementError> {
    let connection = database::connection(app)?;
    goal_in_connection(&connection, reference)
}

pub fn save_goal(app: &AppHandle, input: GoalInput) -> Result<GoalPerformance, ManagementError> {
    let connection = database::connection(app)?;
    save_goal_in_connection(&connection, &input)
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
             INSERT INTO local_users(id,name,username,password_hash,role,is_active,created_at,updated_at) VALUES('user','Maria Gestora','maria','$argon2id$test','ADMIN',1,'2099-01-01','2099-01-01');
             INSERT INTO categories(id,name,nature,is_system,is_active,display_order,created_at,updated_at,created_by,updated_by) VALUES('revenue','Receitas','REVENUE',0,1,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO categories(id,name,nature,is_system,is_active,display_order,created_at,updated_at,created_by,updated_by) VALUES('expense','Operação','EXPENSE',0,1,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO financial_accounts(id,name,account_type,opening_balance_cents,opening_balance_date,is_default,is_active,created_at,updated_at,created_by,updated_by) VALUES('account','Caixa','CASH',100000,'2099-01-01',1,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO payment_methods(id,name,payment_type,is_system,is_active,created_at,updated_at,created_by,updated_by) VALUES('pix','Pix','PIX',0,1,'2099-01-01','2099-01-01','user','user');
             INSERT INTO contacts(id,contact_kind,role_customer,role_supplier,name,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES('contact','PERSON',1,1,'Cliente Teste',1,0,'2099-08-02T10:00:00Z','2099-08-02T10:00:00Z','user','user');
             INSERT INTO app_preferences(id,business_id,default_financial_account_id,default_payment_method_id,default_view_regime,theme,created_at,updated_at) VALUES('preferences','business','account','pix','CASH','LIGHT','2099-01-01','2099-01-01');
             INSERT INTO app_license(id,edition,activation_status,trial_usage_count,created_at,updated_at) VALUES('license','ESSENTIAL','ACTIVE',0,'2099-01-01','2099-01-01');
             INSERT INTO catalog_items(id,item_type,name,sale_price_cents,unit,is_active,is_demo,created_at,updated_at,created_by,updated_by) VALUES('item','SERVICE','Serviço',10000,'UN',1,0,'2099-01-01','2099-01-01','user','user');
             INSERT INTO sales(id,number,customer_id,category_id,issue_date,description,gross_amount_cents,discount_amount_cents,fee_amount_cents,net_amount_cents,receipt_mode,payment_method_id,installment_count,first_due_date,received_now_cents,status,created_by,updated_by,created_at,updated_at) VALUES('sale','V2099-000001','contact','revenue','2099-08-03','Venda',10000,0,0,10000,'FUTURE','pix',1,'2099-08-10',0,'CONFIRMED','user','user','2099-08-03','2099-08-03');",
        ).unwrap();
        connection
    }

    #[allow(clippy::too_many_arguments)]
    fn entry(
        connection: &Connection,
        id: &str,
        entry_type: &str,
        direction: &str,
        result_multiplier: i64,
        category: &str,
        value_date: &str,
        amount: i64,
        status: &str,
        due_date: &str,
    ) {
        connection.execute(
            "INSERT INTO financial_entries(id,entry_type,direction,result_multiplier,origin_type,contact_id,category_id,financial_account_id,payment_method_id,description,issue_date,competence_date,due_date,gross_amount_cents,net_amount_cents,status,created_by,updated_by,created_at,updated_at) VALUES(?1,?2,?3,?4,'MANUAL','contact',?5,'account','pix',?1,?6,?6,?8,?7,?7,?9,'user','user',?6,?6)",
            params![id,entry_type,direction,result_multiplier,category,value_date,amount,due_date,status],
        ).unwrap();
        if status == "SETTLED" {
            connection.execute(
                "INSERT INTO entry_settlements(id,entry_id,financial_account_id,payment_method_id,settlement_date,principal_amount_cents,net_amount_cents,created_by,created_at) VALUES(?1||'-settlement',?1,'account','pix',?2,?3,?3,'user',?2)",
                params![id,value_date,amount],
            ).unwrap();
        }
    }

    fn seed_management(connection: &Connection) {
        entry(
            connection,
            "revenue-current",
            "REVENUE",
            "IN",
            1,
            "revenue",
            "2099-08-05",
            10_000,
            "SETTLED",
            "2099-08-05",
        );
        entry(
            connection,
            "expense-current",
            "EXPENSE",
            "OUT",
            -1,
            "expense",
            "2099-08-06",
            3_000,
            "SETTLED",
            "2099-08-06",
        );
        entry(
            connection,
            "revenue-previous",
            "REVENUE",
            "IN",
            1,
            "revenue",
            "2099-07-05",
            8_000,
            "SETTLED",
            "2099-07-05",
        );
        entry(
            connection,
            "receivable",
            "REVENUE",
            "IN",
            1,
            "revenue",
            "2099-08-05",
            7_000,
            "PENDING",
            "2099-08-20",
        );
        entry(
            connection,
            "payable",
            "EXPENSE",
            "OUT",
            -1,
            "expense",
            "2099-08-05",
            5_000,
            "PENDING",
            "2099-08-21",
        );
    }

    fn goals() -> GoalInput {
        GoalInput {
            reference_month: "2099-08".into(),
            revenue_goal_cents: Some(20_000),
            expense_limit_cents: Some(10_000),
            result_goal_cents: Some(12_000),
            sales_count_goal: Some(2),
            new_customers_goal: Some(3),
        }
    }

    #[test]
    fn saves_updates_and_audits_monthly_goals() {
        let connection = database();
        seed_management(&connection);
        let first = save_goal_in_connection(&connection, &goals()).unwrap();
        assert_eq!(first.revenue.actual, 17_000);
        assert_eq!(first.revenue.previous_actual, 8_000);
        assert_eq!(first.expenses.actual, 8_000);
        assert_eq!(first.result.actual, 9_000);
        assert_eq!(first.sales.actual, 1);
        assert_eq!(first.new_customers.actual, 1);
        assert!(first.calendar_days_remaining > 0);
        assert!(first.business_days_remaining > 0);

        let mut changed = goals();
        changed.revenue_goal_cents = Some(30_000);
        let second = save_goal_in_connection(&connection, &changed).unwrap();
        assert_eq!(second.revenue.target, Some(30_000));
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM goals", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM audit_logs WHERE entity_type='goal'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );
    }

    #[test]
    fn reconciles_dashboard_indicators_charts_and_quick_lists() {
        let connection = database();
        seed_management(&connection);
        save_goal_in_connection(&connection, &goals()).unwrap();
        let dashboard = dashboard_in_connection(
            &connection,
            &DashboardQuery {
                start_date: "2099-08-01".into(),
                end_date: "2099-08-31".into(),
                grouping: "DAILY".into(),
            },
        )
        .unwrap();
        assert_eq!(dashboard.available_balance.current_cents, 115_000);
        assert_eq!(dashboard.received_inflow.current_cents, 10_000);
        assert_eq!(dashboard.received_inflow.previous_cents, Some(8_000));
        assert_eq!(dashboard.paid_outflow.current_cents, 3_000);
        assert_eq!(dashboard.period_result.current_cents, 7_000);
        assert_eq!(dashboard.total_receivable.current_cents, 7_000);
        assert_eq!(dashboard.total_payable.current_cents, 5_000);
        assert_eq!(dashboard.goal_progress_basis_points, Some(8_500));
        assert!(dashboard.goal_daily_business_cents.is_some());
        assert_eq!(dashboard.points.len(), 31);
        assert_eq!(
            dashboard.points.last().unwrap().closing_balance_cents,
            115_000
        );
        assert_eq!(dashboard.expense_categories[0].amount_cents, 3_000);
        assert_eq!(dashboard.upcoming_receivables.len(), 1);
        assert_eq!(dashboard.upcoming_payables.len(), 1);
        assert_eq!(dashboard.largest_expenses.len(), 1);
        assert_eq!(dashboard.latest_movements.len(), 5);
    }

    #[test]
    fn validates_goal_and_dashboard_boundaries() {
        let connection = database();
        let empty = GoalInput {
            reference_month: "2099-08".into(),
            revenue_goal_cents: None,
            expense_limit_cents: None,
            result_goal_cents: None,
            sales_count_goal: None,
            new_customers_goal: None,
        };
        assert!(save_goal_in_connection(&connection, &empty).is_err());
        assert!(dashboard_in_connection(
            &connection,
            &DashboardQuery {
                start_date: "2099-09-01".into(),
                end_date: "2099-08-01".into(),
                grouping: "DAILY".into()
            }
        )
        .is_err());
        assert!(dashboard_in_connection(
            &connection,
            &DashboardQuery {
                start_date: "2098-01-01".into(),
                end_date: "2099-12-31".into(),
                grouping: "DAILY".into()
            }
        )
        .is_err());
        assert_eq!(
            metric(Some(0), 1, 0, 1, 1, true).progress_basis_points,
            Some(10_001)
        );
    }
}
