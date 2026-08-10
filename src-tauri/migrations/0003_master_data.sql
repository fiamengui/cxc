CREATE TABLE contacts (
    id TEXT PRIMARY KEY NOT NULL,
    contact_kind TEXT NOT NULL CHECK(contact_kind IN ('PERSON', 'COMPANY')),
    role_customer INTEGER NOT NULL DEFAULT 1 CHECK(role_customer IN (0, 1)),
    role_supplier INTEGER NOT NULL DEFAULT 0 CHECK(role_supplier IN (0, 1)),
    name TEXT NOT NULL,
    trade_name TEXT,
    document_number TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    notes TEXT,
    tags TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX contacts_name_idx ON contacts(name) WHERE deleted_at IS NULL;
CREATE INDEX contacts_document_idx ON contacts(document_number) WHERE deleted_at IS NULL;

CREATE TABLE catalog_items (
    id TEXT PRIMARY KEY NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('PRODUCT', 'SERVICE')),
    code TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    sale_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(sale_price_cents >= 0),
    cost_price_cents INTEGER CHECK(cost_price_cents IS NULL OR cost_price_cents >= 0),
    unit TEXT NOT NULL DEFAULT 'UN',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE UNIQUE INDEX catalog_items_code_idx ON catalog_items(code) WHERE code IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX catalog_items_name_idx ON catalog_items(name) WHERE deleted_at IS NULL;
