CREATE INDEX entry_settlements_payment_date_idx
ON entry_settlements(payment_method_id, settlement_date, entry_id);

CREATE INDEX financial_entries_contact_competence_idx
ON financial_entries(contact_id, competence_date, entry_type)
WHERE deleted_at IS NULL;

CREATE INDEX sale_items_description_idx
ON sale_items(description COLLATE NOCASE, sale_id);
