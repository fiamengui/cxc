ALTER TABLE goals ADD COLUMN created_by TEXT REFERENCES local_users(id);
ALTER TABLE goals ADD COLUMN updated_by TEXT REFERENCES local_users(id);

UPDATE goals SET reference_month = substr(reference_month, 1, 7) WHERE length(reference_month) = 10;

UPDATE goals
SET created_by = (SELECT id FROM local_users WHERE is_active = 1 ORDER BY created_at LIMIT 1),
    updated_by = (SELECT id FROM local_users WHERE is_active = 1 ORDER BY created_at LIMIT 1);

CREATE INDEX entry_settlements_date_idx ON entry_settlements(settlement_date, entry_id);
CREATE INDEX contacts_customer_created_idx ON contacts(created_at, role_customer) WHERE deleted_at IS NULL;
CREATE INDEX goals_reference_idx ON goals(reference_month DESC);
