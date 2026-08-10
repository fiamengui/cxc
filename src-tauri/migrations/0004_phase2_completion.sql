ALTER TABLE categories ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));
ALTER TABLE contacts ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));
ALTER TABLE catalog_items ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));
ALTER TABLE app_license ADD COLUMN trial_usage_count INTEGER NOT NULL DEFAULT 0 CHECK(trial_usage_count >= 0);
DELETE FROM app_license
WHERE rowid NOT IN (
    SELECT rowid
    FROM app_license
    ORDER BY
        CASE activation_status WHEN 'ACTIVE' THEN 0 WHEN 'TRIAL' THEN 1 ELSE 2 END,
        updated_at DESC
    LIMIT 1
);
CREATE UNIQUE INDEX app_license_singleton_idx ON app_license((1));

CREATE TABLE app_installation (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX app_installation_singleton_idx ON app_installation((1));

CREATE TABLE goals (
    id TEXT PRIMARY KEY NOT NULL,
    reference_month TEXT NOT NULL UNIQUE,
    revenue_goal_cents INTEGER CHECK(revenue_goal_cents IS NULL OR revenue_goal_cents >= 0),
    expense_limit_cents INTEGER CHECK(expense_limit_cents IS NULL OR expense_limit_cents >= 0),
    result_goal_cents INTEGER,
    sales_count_goal INTEGER CHECK(sales_count_goal IS NULL OR sales_count_goal >= 0),
    new_customers_goal INTEGER CHECK(new_customers_goal IS NULL OR new_customers_goal >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
