CREATE INDEX financial_entries_status_issue_idx
ON financial_entries(status, issue_date DESC, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX financial_entries_account_status_due_idx
ON financial_entries(financial_account_id, status, due_date)
WHERE deleted_at IS NULL;

CREATE INDEX financial_entries_category_status_competence_idx
ON financial_entries(category_id, status, competence_date)
WHERE deleted_at IS NULL;

CREATE INDEX financial_entries_origin_issue_idx
ON financial_entries(origin_type, issue_date DESC)
WHERE deleted_at IS NULL;

CREATE INDEX contacts_name_nocase_idx
ON contacts(name COLLATE NOCASE, id)
WHERE deleted_at IS NULL;

CREATE INDEX catalog_items_name_nocase_idx
ON catalog_items(name COLLATE NOCASE, id)
WHERE deleted_at IS NULL;

CREATE INDEX sales_issue_number_idx
ON sales(issue_date DESC, number DESC)
WHERE deleted_at IS NULL;
