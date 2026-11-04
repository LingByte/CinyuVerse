use std::collections::HashMap;

use agents::{AgentId, apply_built_in_auth_mode_policy, apply_built_in_launch_policy};

#[test]
fn subscription_modes_scrub_conflicting_credentials() {
    let mut grok = HashMap::from([
        ("GROK_AUTH_MODE".to_string(), "subscription".to_string()),
        ("XAI_API_KEY".to_string(), "stale".to_string()),
    ]);
    apply_built_in_auth_mode_policy(&AgentId::parse("grok").unwrap(), &mut grok);
    assert!(!grok.contains_key("XAI_API_KEY"));
}

#[test]
fn api_key_modes_preserve_explicit_credentials() {
    let mut grok = HashMap::from([
        ("GROK_AUTH_MODE".to_string(), "api_key".to_string()),
        ("XAI_API_KEY".to_string(), "xai-key".to_string()),
    ]);
    apply_built_in_auth_mode_policy(&AgentId::parse("grok").unwrap(), &mut grok);
    assert_eq!(grok.get("XAI_API_KEY").map(String::as_str), Some("xai-key"));
}

#[test]
fn deepseek_custom_url_without_mode_is_kept() {
    let mut env = HashMap::from([
        ("DEEPSEEK_API_KEY".to_string(), "sk-keep".to_string()),
        (
            "DEEPSEEK_BASE_URL".to_string(),
            "https://opencode.ai/zen/go/v1".to_string(),
        ),
    ]);
    apply_built_in_auth_mode_policy(&AgentId::parse("deepseek_harness").unwrap(), &mut env);
    assert_eq!(
        env.get("DEEPSEEK_BASE_URL").map(String::as_str),
        Some("https://opencode.ai/zen/go/v1")
    );
}

#[test]
fn deepseek_official_mode_clears_custom_base_url() {
    let mut env = HashMap::from([
        ("DSH_AUTH_MODE".to_string(), "deepseek".to_string()),
        ("DEEPSEEK_API_KEY".to_string(), "sk-keep".to_string()),
        (
            "DEEPSEEK_BASE_URL".to_string(),
            "https://gateway.example/v1".to_string(),
        ),
    ]);
    apply_built_in_auth_mode_policy(&AgentId::parse("deepseek_harness").unwrap(), &mut env);
    assert_eq!(
        env.get("DEEPSEEK_API_KEY").map(String::as_str),
        Some("sk-keep")
    );
    assert!(!env.contains_key("DEEPSEEK_BASE_URL"));
}

#[test]
fn retired_product_agents_have_no_auth_mode_policy() {
    for agent_id in ["cursor", "pi", "cline", "qoder"] {
        assert!(
            agents::built_in_auth_mode_policy(&AgentId::parse(agent_id).unwrap()).is_none(),
            "{agent_id} must not expose a live auth-mode policy"
        );
    }
}

#[test]
fn the_shared_launch_policy_matches_auth_scrubbing_and_argument_projection() {
    let mut env = HashMap::from([
        ("GROK_AUTH_MODE".to_string(), "subscription".to_string()),
        ("XAI_API_KEY".to_string(), "stale".to_string()),
        (
            "GROK_PERMISSION_MODE".to_string(),
            "acceptEdits".to_string(),
        ),
    ]);
    let mut args = vec!["agent".to_string(), "stdio".to_string()];

    apply_built_in_launch_policy(&AgentId::parse("grok").unwrap(), &mut env, &mut args);

    assert!(!env.contains_key("XAI_API_KEY"));
    assert_eq!(
        args,
        [
            "--no-auto-update",
            "--permission-mode",
            "acceptEdits",
            "agent",
            "stdio"
        ]
    );
}
