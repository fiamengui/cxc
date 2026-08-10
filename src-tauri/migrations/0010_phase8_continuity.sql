ALTER TABLE app_preferences ADD COLUMN backup_retention_count INTEGER NOT NULL DEFAULT 12 CHECK(backup_retention_count BETWEEN 1 AND 120);
ALTER TABLE app_preferences ADD COLUMN last_backup_at TEXT;

CREATE TABLE backup_history (
    id TEXT PRIMARY KEY NOT NULL,
    backup_type TEXT NOT NULL CHECK(backup_type IN ('MANUAL','AUTOMATIC','PREVENTIVE')),
    path TEXT NOT NULL,
    protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1)),
    status TEXT NOT NULL CHECK(status IN ('SUCCESS','FAILED')),
    size_bytes INTEGER,
    checksum TEXT,
    error_summary TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX backup_history_created_idx ON backup_history(created_at DESC, status);

CREATE TABLE app_updates (
    id TEXT PRIMARY KEY NOT NULL,
    from_version TEXT NOT NULL,
    to_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('VALIDATED','PREPARED','FAILED')),
    summary TEXT NOT NULL,
    backup_path TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX app_updates_created_idx ON app_updates(created_at DESC);
