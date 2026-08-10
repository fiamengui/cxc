CREATE TABLE sales (
    id TEXT PRIMARY KEY NOT NULL,
    number TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL REFERENCES contacts(id),
    category_id TEXT NOT NULL REFERENCES categories(id),
    issue_date TEXT NOT NULL,
    description TEXT NOT NULL,
    gross_amount_cents INTEGER NOT NULL CHECK(gross_amount_cents > 0),
    discount_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_amount_cents >= 0),
    fee_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(fee_amount_cents >= 0),
    net_amount_cents INTEGER NOT NULL CHECK(net_amount_cents > 0),
    receipt_mode TEXT NOT NULL CHECK(receipt_mode IN ('IMMEDIATE','FUTURE','INSTALLMENTS','MIXED')),
    payment_method_id TEXT NOT NULL REFERENCES payment_methods(id),
    financial_account_id TEXT REFERENCES financial_accounts(id),
    installment_count INTEGER NOT NULL DEFAULT 1 CHECK(installment_count BETWEEN 1 AND 120),
    first_due_date TEXT NOT NULL,
    received_now_cents INTEGER NOT NULL DEFAULT 0 CHECK(received_now_cents >= 0),
    financial_group_id TEXT UNIQUE REFERENCES entry_groups(id),
    status TEXT NOT NULL CHECK(status IN ('DRAFT','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELED')),
    notes TEXT,
    cancel_reason TEXT,
    confirmed_at TEXT,
    canceled_at TEXT,
    created_by TEXT REFERENCES local_users(id),
    updated_by TEXT REFERENCES local_users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK(discount_amount_cents + fee_amount_cents < gross_amount_cents),
    CHECK(received_now_cents <= net_amount_cents)
);

CREATE TABLE sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL REFERENCES sales(id),
    catalog_item_id TEXT REFERENCES catalog_items(id),
    description TEXT NOT NULL,
    quantity_millis INTEGER NOT NULL CHECK(quantity_millis > 0),
    unit TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents >= 0),
    total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX sales_issue_idx ON sales(issue_date DESC, status) WHERE deleted_at IS NULL;
CREATE INDEX sales_status_idx ON sales(status, issue_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX sales_customer_idx ON sales(customer_id, issue_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX sales_number_idx ON sales(number) WHERE deleted_at IS NULL;
CREATE INDEX sale_items_sale_idx ON sale_items(sale_id, created_at);
CREATE INDEX sale_items_catalog_idx ON sale_items(catalog_item_id, sale_id);
