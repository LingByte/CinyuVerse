-- Rename the auto-approve mode value 'yolo' to 'bypass' and widen the CHECK
-- constraint to accept the new value. Existing rows using 'yolo' are migrated
-- to 'bypass' so old data remains valid.
UPDATE agent_setting SET auto_approve_mode = 'bypass' WHERE auto_approve_mode = 'yolo';

-- SQLite cannot ALTER a CHECK constraint in place, so recreate the table.
-- Column order matches the original table so `SELECT *` maps correctly.
CREATE TABLE agent_setting_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    installed_version TEXT,
    env_json TEXT,
    config_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    auto_approve_mode TEXT NOT NULL DEFAULT 'off'
        CHECK (auto_approve_mode IN ('off', 'allow_always', 'bypass')),
    runtime_cli_path TEXT,
    runtime_cli_version TEXT,
    runtime_cli_revision TEXT,
    runtime_acp_path TEXT,
    runtime_acp_version TEXT,
    runtime_acp_revision TEXT
);

INSERT INTO agent_setting_new (
    id, agent_type, enabled, sort_order, installed_version,
    env_json, config_json, created_at, updated_at,
    auto_approve_mode, runtime_cli_path, runtime_cli_version,
    runtime_cli_revision, runtime_acp_path, runtime_acp_version,
    runtime_acp_revision
)
SELECT
    id, agent_type, enabled, sort_order, installed_version,
    env_json, config_json, created_at, updated_at,
    auto_approve_mode, runtime_cli_path, runtime_cli_version,
    runtime_cli_revision, runtime_acp_path, runtime_acp_version,
    runtime_acp_revision
FROM agent_setting;

DROP TABLE agent_setting;
ALTER TABLE agent_setting_new RENAME TO agent_setting;
