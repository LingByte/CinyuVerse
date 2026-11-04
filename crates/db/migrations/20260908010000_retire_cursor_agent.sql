-- Cursor Agent is removed from the built-in catalog. Historical sessions and
-- bindings keep agent_id=cursor; live membership and install state are dropped
-- so it no longer appears in the Agent Bar or session picker.

INSERT OR IGNORE INTO retired_agent_history
    (agent_id, display_name, first_seen_at, last_seen_at)
SELECT 'cursor', 'Cursor', MIN(created_at), MAX(updated_at)
FROM sessions
WHERE agent_id = 'cursor' OR lower(agent_type) = 'cursor'
HAVING COUNT(*) > 0;

DELETE FROM agent_session_default WHERE agent_id = 'cursor';
DELETE FROM agent_config_binding WHERE agent_id = 'cursor';
DELETE FROM agent_install_operation WHERE agent_id = 'cursor';
DELETE FROM agent_install_lock WHERE agent_id = 'cursor';
DELETE FROM agent_diagnostic WHERE agent_id = 'cursor';
DELETE FROM agent_probe WHERE agent_id = 'cursor';
DELETE FROM agent_installation WHERE agent_id = 'cursor';
DELETE FROM agent_user_definition WHERE agent_id = 'cursor';
DELETE FROM agent_capability_catalog WHERE agent_type = 'cursor';
DELETE FROM agent_setting WHERE agent_type = 'cursor';
DELETE FROM agent_membership WHERE agent_id = 'cursor';
