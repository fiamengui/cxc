CREATE TABLE app_license (
    id TEXT PRIMARY KEY NOT NULL,
    edition TEXT NOT NULL CHECK(edition IN ('TRIAL', 'ESSENTIAL', 'PROFESSIONAL', 'BUSINESS')),
    activation_status TEXT NOT NULL CHECK(activation_status IN ('TRIAL', 'ACTIVE', 'PENDING')),
    trial_started_at TEXT,
    trial_ends_at TEXT,
    trial_entry_limit INTEGER,
    license_metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
