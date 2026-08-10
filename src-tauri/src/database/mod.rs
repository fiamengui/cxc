use std::{fs, path::PathBuf};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use thiserror::Error;

const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../../migrations/0001_foundation.sql")),
    (2, include_str!("../../migrations/0002_onboarding.sql")),
    (3, include_str!("../../migrations/0003_master_data.sql")),
    (
        4,
        include_str!("../../migrations/0004_phase2_completion.sql"),
    ),
    (
        5,
        include_str!("../../migrations/0005_phase3_master_data.sql"),
    ),
    (
        6,
        include_str!("../../migrations/0006_phase4_financial_core.sql"),
    ),
    (7, include_str!("../../migrations/0007_phase5_sales.sql")),
    (
        8,
        include_str!("../../migrations/0008_phase6_management.sql"),
    ),
    (9, include_str!("../../migrations/0009_phase7_reports.sql")),
    (
        10,
        include_str!("../../migrations/0010_phase8_continuity.sql"),
    ),
    (11, include_str!("../../migrations/0011_phase9_quality.sql")),
    (
        12,
        include_str!("../../migrations/0012_phase10_distribution.sql"),
    ),
    (
        13,
        include_str!("../../migrations/0013_commercial_entitlement.sql"),
    ),
];

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("não foi possível preparar o diretório de dados: {0}")]
    Io(#[from] std::io::Error),
    #[error("erro no banco de dados local: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("não foi possível determinar o diretório de dados da aplicação: {0}")]
    Path(#[from] tauri::Error),
}

pub(crate) fn database_path(app: &AppHandle) -> Result<PathBuf, DatabaseError> {
    let directory = app.path().app_data_dir()?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join("caixa-no-controle.db"))
}

pub(crate) fn connection(app: &AppHandle) -> Result<Connection, DatabaseError> {
    let connection = Connection::open(database_path(app)?)?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA busy_timeout = 5000;
         PRAGMA temp_store = MEMORY;",
    )?;
    Ok(connection)
}

pub fn initialize(app: &AppHandle) -> Result<(), DatabaseError> {
    let connection = connection(app)?;
    apply_migrations(&connection)
}

pub(crate) fn apply_migrations(connection: &Connection) -> Result<(), DatabaseError> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;

    for (version, migration) in MIGRATIONS {
        let applied: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM app_migrations WHERE version = ?1)",
            [version],
            |row| row.get(0),
        )?;

        if !applied {
            let transaction = connection.unchecked_transaction()?;
            transaction.execute_batch(migration)?;
            transaction.execute(
                "INSERT INTO app_migrations (version, applied_at) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                [version],
            )?;
            transaction.commit()?;
            tracing::info!(migration_version = version, "Migração do banco aplicada");
        }
    }
    Ok(())
}

pub fn current_version(app: &AppHandle) -> Result<u32, DatabaseError> {
    let connection = connection(app)?;
    let version: u32 = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM app_migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version.min(MIGRATIONS.last().map_or(0, |migration| migration.0)))
}

pub(crate) fn supported_version() -> u32 {
    MIGRATIONS.last().map_or(0, |migration| migration.0)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use rusqlite::{params, Connection};

    use super::apply_migrations;

    const DIGITS: &str = "WITH digits(n) AS (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9))";

    fn query_plan(connection: &Connection, sql: &str) -> String {
        let mut statement = connection
            .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
            .expect("o plano deve ser gerado");
        statement
            .query_map([], |row| row.get::<_, String>(3))
            .expect("o plano deve ser consultado")
            .collect::<Result<Vec<_>, _>>()
            .expect("o plano deve ser legível")
            .join(" | ")
    }

    #[test]
    fn remains_responsive_at_the_reference_business_scale() {
        let mut connection = Connection::open_in_memory().expect("banco temporário");
        apply_migrations(&connection).expect("migrações");
        let seed_started = Instant::now();
        let transaction = connection.transaction().expect("transação de carga");
        transaction
            .execute_batch(
                "INSERT INTO local_users(id,name,username,password_hash,role,is_active,created_at,updated_at)
                 VALUES('00000000-0000-4000-8000-000000000001','Teste','teste','hash','ADMIN',1,'2021-01-01T00:00:00Z','2021-01-01T00:00:00Z');
                 INSERT INTO financial_accounts(id,name,account_type,opening_balance_date,created_at,updated_at)
                 VALUES('00000000-0000-4000-8000-000000000002','Caixa','CASH','2021-01-01','2021-01-01T00:00:00Z','2021-01-01T00:00:00Z');
                 INSERT INTO payment_methods(id,name,payment_type,created_at,updated_at)
                 VALUES('00000000-0000-4000-8000-000000000003','Dinheiro','CASH','2021-01-01T00:00:00Z','2021-01-01T00:00:00Z');
                 INSERT INTO categories(id,name,nature,created_at,updated_at)
                 VALUES('00000000-0000-4000-8000-000000000004','Receitas','REVENUE','2021-01-01T00:00:00Z','2021-01-01T00:00:00Z');",
            )
            .expect("referências");

        transaction
            .execute_batch(&format!(
                "{DIGITS}, numbers(x) AS (
                    SELECT a.n+10*b.n+100*c.n+1000*d.n+1
                    FROM digits a CROSS JOIN digits b CROSS JOIN digits c CROSS JOIN digits d
                 )
                 INSERT INTO contacts(id,contact_kind,name,is_active,created_at,updated_at)
                 SELECT printf('10000000-0000-4000-8000-%012d',x),'PERSON',printf('Contato %05d',x),1,'2021-01-01T00:00:00Z','2021-01-01T00:00:00Z'
                 FROM numbers;

                 {DIGITS}, numbers(x) AS (
                    SELECT a.n+10*b.n+100*c.n+1000*d.n+1
                    FROM digits a CROSS JOIN digits b CROSS JOIN digits c CROSS JOIN digits d
                 )
                 INSERT INTO catalog_items(id,item_type,code,name,sale_price_cents,unit,is_active,created_at,updated_at)
                 SELECT printf('20000000-0000-4000-8000-%012d',x),'PRODUCT',printf('ITEM-%05d',x),printf('Item %05d',x),1000+x,'UN',1,'2021-01-01T00:00:00Z','2021-01-01T00:00:00Z'
                 FROM numbers;

                 {DIGITS}, numbers(x) AS (
                    SELECT a.n+10*b.n+100*c.n+1000*d.n+10000*e.n+1
                    FROM digits a CROSS JOIN digits b CROSS JOIN digits c CROSS JOIN digits d CROSS JOIN digits e
                    WHERE a.n+10*b.n+100*c.n+1000*d.n+10000*e.n < 50000
                 )
                 INSERT INTO financial_entries(
                    id,entry_type,direction,result_multiplier,origin_type,origin_id,contact_id,category_id,
                    financial_account_id,payment_method_id,description,issue_date,competence_date,due_date,
                    gross_amount_cents,net_amount_cents,status,created_at,updated_at
                 )
                 SELECT printf('30000000-0000-4000-8000-%012d',x),
                    CASE WHEN x%2=0 THEN 'REVENUE' ELSE 'EXPENSE' END,
                    CASE WHEN x%2=0 THEN 'IN' ELSE 'OUT' END,
                    CASE WHEN x%2=0 THEN 1 ELSE -1 END,
                    CASE WHEN x%10=0 THEN 'SALE' ELSE 'MANUAL' END,
                    printf('origin-%d',x),
                    printf('10000000-0000-4000-8000-%012d',((x-1)%10000)+1),
                    '00000000-0000-4000-8000-000000000004',
                    '00000000-0000-4000-8000-000000000002',
                    '00000000-0000-4000-8000-000000000003',
                    printf('Movimentação %05d',x),
                    date('2021-01-01',printf('+%d days',(x-1)%2000)),
                    date('2021-01-01',printf('+%d days',(x-1)%2000)),
                    date('2021-01-01',printf('+%d days',((x-1)%2000)+30)),
                    1000+(x%100000),1000+(x%100000),
                    CASE WHEN x%3=0 THEN 'SETTLED' ELSE 'PENDING' END,
                    '2021-01-01T00:00:00Z','2021-01-01T00:00:00Z'
                 FROM numbers;"
            ))
            .expect("massa de referência");
        transaction.commit().expect("concluir massa");

        let counts: (i64, i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM financial_entries),
                        (SELECT COUNT(*) FROM contacts),
                        (SELECT COUNT(*) FROM catalog_items)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("contagens");
        assert_eq!(counts, (50_000, 10_000, 10_000));

        let financial_plan = query_plan(
            &connection,
            "SELECT id FROM financial_entries
             WHERE deleted_at IS NULL AND status='PENDING'
             ORDER BY issue_date DESC,created_at DESC LIMIT 25",
        );
        assert!(financial_plan.contains("financial_entries_status_issue_idx"));
        let contact_plan = query_plan(
            &connection,
            "SELECT id FROM contacts WHERE deleted_at IS NULL
             ORDER BY name COLLATE NOCASE LIMIT 25",
        );
        assert!(contact_plan.contains("contacts_name_nocase_idx"));
        let catalog_plan = query_plan(
            &connection,
            "SELECT id FROM catalog_items WHERE deleted_at IS NULL
             ORDER BY name COLLATE NOCASE LIMIT 25",
        );
        assert!(catalog_plan.contains("catalog_items_name_nocase_idx"));

        let queries_started = Instant::now();
        let first_page: Vec<String> = connection
            .prepare(
                "SELECT id FROM financial_entries
                 WHERE deleted_at IS NULL AND status=?1
                 ORDER BY issue_date DESC,created_at DESC LIMIT ?2 OFFSET ?3",
            )
            .expect("lista financeira")
            .query_map(params!["PENDING", 25, 0], |row| row.get(0))
            .expect("primeira página")
            .collect::<Result<Vec<_>, _>>()
            .expect("linhas financeiras");
        assert_eq!(first_page.len(), 25);
        let result_cents: i64 = connection
            .query_row(
                "SELECT COALESCE(SUM(net_amount_cents*result_multiplier),0)
                 FROM financial_entries
                 WHERE deleted_at IS NULL AND status NOT IN ('DRAFT','CANCELED')
                   AND competence_date BETWEEN ?1 AND ?2",
                ["2025-01-01", "2026-06-23"],
                |row| row.get(0),
            )
            .expect("agregação plurianual");
        std::hint::black_box(result_cents);
        let query_elapsed = queries_started.elapsed();

        eprintln!(
            "phase9_reference_scale seed_ms={} queries_ms={} movements={} contacts={} items={}",
            seed_started.elapsed().as_millis(),
            query_elapsed.as_millis(),
            counts.0,
            counts.1,
            counts.2
        );
        assert!(
            query_elapsed < Duration::from_secs(5),
            "consultas críticas excederam cinco segundos: {query_elapsed:?}"
        );
    }
}
