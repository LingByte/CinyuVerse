-- Pi, Cline, and Qoder are removed from the built-in catalog. Historical
-- sessions and bindings keep their agent_id; live membership and install state
-- are dropped so they no longer appear in the Agent Bar or session picker.

INSERT OR IGNORE INTO retired_agent_history
    (agent_id, display_name, first_seen_at, last_seen_at)
SELECT 'pi', 'Pi', MIN(created_at), MAX(updated_at)
FROM sessions
WHERE agent_id = 'pi' OR lower(agent_type) = 'pi'
HAVING COUNT(*) > 0;

INSERT OR IGNORE INTO retired_agent_history
    (agent_id, display_name, first_seen_at, last_seen_at)
SELECT 'cline', 'Cline', MIN(created_at), MAX(updated_at)
FROM sessions
WHERE agent_id = 'cline' OR lower(agent_type) = 'cline'
HAVING COUNT(*) > 0;

INSERT OR IGNORE INTO retired_agent_history
    (agent_id, display_name, first_seen_at, last_seen_at)
SELECT 'qoder', 'Qoder', MIN(created_at), MAX(updated_at)
FROM sessions
WHERE agent_id = 'qoder' OR lower(agent_type) = 'qoder'
HAVING COUNT(*) > 0;

DELETE FROM agent_session_default WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_config_binding WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_install_operation WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_install_lock WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_diagnostic WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_probe WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_installation WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_user_definition WHERE agent_id IN ('pi', 'cline', 'qoder');
DELETE FROM agent_capability_catalog WHERE agent_type IN ('pi', 'cline', 'qoder');
DELETE FROM agent_setting WHERE agent_type IN ('pi', 'cline', 'qoder');
DELETE FROM agent_membership WHERE agent_id IN ('pi', 'cline', 'qoder');
