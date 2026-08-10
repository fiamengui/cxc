CREATE INDEX contacts_phone_idx ON contacts(phone) WHERE deleted_at IS NULL;
CREATE INDEX contacts_whatsapp_idx ON contacts(whatsapp) WHERE deleted_at IS NULL;
CREATE INDEX contacts_active_roles_idx ON contacts(is_active, role_customer, role_supplier) WHERE deleted_at IS NULL;
CREATE INDEX catalog_items_type_active_idx ON catalog_items(item_type, is_active) WHERE deleted_at IS NULL;
CREATE INDEX categories_parent_idx ON categories(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX financial_accounts_active_idx ON financial_accounts(is_active) WHERE deleted_at IS NULL;

ALTER TABLE contacts ADD COLUMN created_by TEXT REFERENCES local_users(id);
ALTER TABLE contacts ADD COLUMN updated_by TEXT REFERENCES local_users(id);
ALTER TABLE catalog_items ADD COLUMN created_by TEXT REFERENCES local_users(id);
ALTER TABLE catalog_items ADD COLUMN updated_by TEXT REFERENCES local_users(id);
ALTER TABLE categories ADD COLUMN created_by TEXT REFERENCES local_users(id);
ALTER TABLE categories ADD COLUMN updated_by TEXT REFERENCES local_users(id);
ALTER TABLE financial_accounts ADD COLUMN created_by TEXT REFERENCES local_users(id);
ALTER TABLE financial_accounts ADD COLUMN updated_by TEXT REFERENCES local_users(id);
ALTER TABLE payment_methods ADD COLUMN created_by TEXT REFERENCES local_users(id);
ALTER TABLE payment_methods ADD COLUMN updated_by TEXT REFERENCES local_users(id);

INSERT INTO payment_methods(id,name,payment_type,is_system,is_active,created_at,updated_at,created_by,updated_by)
SELECT 'system-payment-term','Prazo','TERM',1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       (SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1),
       (SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1)
WHERE EXISTS(SELECT 1 FROM business_profile)
  AND NOT EXISTS(SELECT 1 FROM payment_methods WHERE lower(name)=lower('Prazo'));

INSERT INTO payment_methods(id,name,payment_type,is_system,is_active,created_at,updated_at,created_by,updated_by)
SELECT 'system-payment-other','Outro','OTHER',1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       (SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1),
       (SELECT id FROM local_users WHERE is_active=1 ORDER BY created_at LIMIT 1)
WHERE EXISTS(SELECT 1 FROM business_profile)
  AND NOT EXISTS(SELECT 1 FROM payment_methods WHERE lower(name)=lower('Outro'));
