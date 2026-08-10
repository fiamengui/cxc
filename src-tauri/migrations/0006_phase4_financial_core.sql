CREATE TABLE entry_groups (
    id TEXT PRIMARY KEY NOT NULL,
    group_type TEXT NOT NULL CHECK(group_type IN ('INSTALLMENT','RECURRENCE','TRANSFER','REVERSAL','SALE')),
    description TEXT NOT NULL,
    created_by TEXT REFERENCES local_users(id),
    created_at TEXT NOT NULL
);

CREATE TABLE recurrences (
    id TEXT PRIMARY KEY NOT NULL,
    entry_group_id TEXT NOT NULL UNIQUE REFERENCES entry_groups(id),
    entry_template TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('WEEKLY','MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL')),
    interval_value INTEGER NOT NULL DEFAULT 1 CHECK(interval_value > 0),
    start_date TEXT NOT NULL,
    end_date TEXT,
    next_generation_date TEXT,
    maximum_occurrences INTEGER CHECK(maximum_occurrences IS NULL OR maximum_occurrences > 0),
    generated_occurrences INTEGER NOT NULL DEFAULT 0 CHECK(generated_occurrences >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
    created_by TEXT REFERENCES local_users(id),
    updated_by TEXT REFERENCES local_users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE financial_entries (
    id TEXT PRIMARY KEY NOT NULL,
    entry_group_id TEXT REFERENCES entry_groups(id),
    entry_type TEXT NOT NULL CHECK(entry_type IN ('REVENUE','EXPENSE','OWNER_CONTRIBUTION','OWNER_WITHDRAWAL','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_POSITIVE','ADJUSTMENT_NEGATIVE','REVERSAL')),
    direction TEXT NOT NULL CHECK(direction IN ('IN','OUT')),
    result_multiplier INTEGER NOT NULL CHECK(result_multiplier IN (-1,0,1)),
    origin_type TEXT NOT NULL DEFAULT 'MANUAL',
    origin_id TEXT,
    contact_id TEXT REFERENCES contacts(id),
    category_id TEXT REFERENCES categories(id),
    financial_account_id TEXT REFERENCES financial_accounts(id),
    payment_method_id TEXT REFERENCES payment_methods(id),
    description TEXT NOT NULL,
    document_reference TEXT,
    issue_date TEXT NOT NULL,
    competence_date TEXT NOT NULL,
    due_date TEXT,
    settlement_date TEXT,
    gross_amount_cents INTEGER NOT NULL CHECK(gross_amount_cents > 0),
    discount_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_amount_cents >= 0),
    fee_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(fee_amount_cents >= 0),
    interest_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(interest_amount_cents >= 0),
    penalty_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(penalty_amount_cents >= 0),
    net_amount_cents INTEGER NOT NULL CHECK(net_amount_cents >= 0),
    installment_number INTEGER NOT NULL DEFAULT 1 CHECK(installment_number > 0),
    installment_count INTEGER NOT NULL DEFAULT 1 CHECK(installment_count > 0 AND installment_number <= installment_count),
    status TEXT NOT NULL CHECK(status IN ('DRAFT','PENDING','SETTLED','CANCELED')),
    is_recurring INTEGER NOT NULL DEFAULT 0 CHECK(is_recurring IN (0,1)),
    recurrence_id TEXT REFERENCES recurrences(id),
    notes TEXT,
    cancel_reason TEXT,
    reversed_entry_id TEXT UNIQUE REFERENCES financial_entries(id),
    reversed_at TEXT,
    reversal_reason TEXT,
    created_by TEXT REFERENCES local_users(id),
    updated_by TEXT REFERENCES local_users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE entry_settlements (
    id TEXT PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES financial_entries(id),
    financial_account_id TEXT NOT NULL REFERENCES financial_accounts(id),
    payment_method_id TEXT NOT NULL REFERENCES payment_methods(id),
    settlement_date TEXT NOT NULL,
    principal_amount_cents INTEGER NOT NULL CHECK(principal_amount_cents > 0),
    discount_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_amount_cents >= 0),
    fee_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(fee_amount_cents >= 0),
    interest_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(interest_amount_cents >= 0),
    penalty_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(penalty_amount_cents >= 0),
    net_amount_cents INTEGER NOT NULL CHECK(net_amount_cents >= 0),
    notes TEXT,
    created_by TEXT REFERENCES local_users(id),
    created_at TEXT NOT NULL
);

CREATE INDEX financial_entries_issue_idx ON financial_entries(issue_date, entry_type, status) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_due_idx ON financial_entries(due_date, entry_type, status) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_type_status_idx ON financial_entries(entry_type, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_competence_idx ON financial_entries(competence_date, result_multiplier) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_contact_idx ON financial_entries(contact_id, issue_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_category_idx ON financial_entries(category_id, competence_date) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_account_idx ON financial_entries(financial_account_id, issue_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_origin_idx ON financial_entries(origin_type, origin_id) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_group_idx ON financial_entries(entry_group_id, installment_number) WHERE deleted_at IS NULL;
CREATE INDEX financial_entries_recurrence_idx ON financial_entries(recurrence_id, issue_date) WHERE deleted_at IS NULL;
CREATE INDEX entry_settlements_entry_idx ON entry_settlements(entry_id, settlement_date);
CREATE INDEX entry_settlements_account_idx ON entry_settlements(financial_account_id, settlement_date);
CREATE INDEX recurrences_generation_idx ON recurrences(is_active, next_generation_date);
