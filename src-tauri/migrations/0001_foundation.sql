CREATE TABLE business_profile (
    id TEXT PRIMARY KEY NOT NULL,
    legal_name TEXT NOT NULL,
    trade_name TEXT,
    document_type TEXT,
    document_number TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    logo_path TEXT,
    business_type TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    opening_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE local_users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE financial_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    institution TEXT,
    opening_balance_cents INTEGER NOT NULL DEFAULT 0,
    opening_balance_date TEXT NOT NULL,
    color_reference TEXT,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE UNIQUE INDEX financial_accounts_one_default_active
ON financial_accounts(is_default) WHERE is_default = 1 AND deleted_at IS NULL;

CREATE TABLE payment_methods (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    default_fee_basis_points INTEGER NOT NULL DEFAULT 0,
    default_receipt_delay_days INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    nature TEXT NOT NULL CHECK(nature IN ('REVENUE', 'EXPENSE')),
    parent_id TEXT REFERENCES categories(id),
    color_reference TEXT,
    icon_reference TEXT,
    is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX categories_nature_active_idx ON categories(nature, is_active) WHERE deleted_at IS NULL;

CREATE TABLE app_preferences (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL UNIQUE REFERENCES business_profile(id),
    default_financial_account_id TEXT REFERENCES financial_accounts(id),
    default_payment_method_id TEXT REFERENCES payment_methods(id),
    default_view_regime TEXT NOT NULL DEFAULT 'CASH' CHECK(default_view_regime IN ('CASH', 'ACCRUAL')),
    theme TEXT NOT NULL DEFAULT 'LIGHT' CHECK(theme IN ('LIGHT', 'DARK', 'SYSTEM')),
    sidebar_collapsed INTEGER NOT NULL DEFAULT 0 CHECK(sidebar_collapsed IN (0, 1)),
    auto_lock_minutes INTEGER,
    backup_directory TEXT,
    backup_reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK(backup_reminder_enabled IN (0, 1)),
    backup_reminder_frequency TEXT NOT NULL DEFAULT 'WEEKLY',
    show_catalog_module INTEGER NOT NULL DEFAULT 1 CHECK(show_catalog_module IN (0, 1)),
    show_sales_module INTEGER NOT NULL DEFAULT 1 CHECK(show_sales_module IN (0, 1)),
    show_goals_module INTEGER NOT NULL DEFAULT 1 CHECK(show_goals_module IN (0, 1)),
    show_suppliers INTEGER NOT NULL DEFAULT 1 CHECK(show_suppliers IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT REFERENCES local_users(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    previous_values TEXT,
    new_values TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
