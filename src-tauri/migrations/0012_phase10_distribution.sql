ALTER TABLE entry_groups ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));
ALTER TABLE financial_entries ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));
ALTER TABLE entry_settlements ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));
ALTER TABLE sales ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));
ALTER TABLE sale_items ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0, 1));

CREATE INDEX financial_entries_demo_idx ON financial_entries(is_demo) WHERE is_demo = 1;
CREATE INDEX sales_demo_idx ON sales(is_demo) WHERE is_demo = 1;
