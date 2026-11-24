use automation::{AutomationDraftInput, ComposerCanonicalInput, TurnLaunchSpec};

fn fixture() -> serde_json::Value {
    serde_json::json!({
        "promptBlocks": [
            { "type": "text", "text": "Create a quarterly presentation" }
        ],
        "displayText": "Create a quarterly presentation",
        "agent": {
            "agentId": "codex",
            "executorProfileId": null
        },
        "modeId": "plan",
        "configValues": [
            { "key": "model", "value": "gpt-5" }
        ],
        "skills": ["slides"],
        "workspace": {
            "projectId": "16ef4a10-7a38-4ac0-b439-ddd9747560e1",
            "rootFolder": "/workspace/cinyuverse",
            "branch": "main",
            "isolation": "worktree_per_run"
        },
        "labelSnapshot": "Codex · Create PPT"
    })
}

#[test]
fn turn_launch_spec_matches_composer_input() {
    let composer: ComposerCanonicalInput =
        serde_json::from_value(fixture()).expect("composer fixture");
    let draft: AutomationDraftInput =
        serde_json::from_value(fixture()).expect("automation draft fixture");

    let from_composer = TurnLaunchSpec::from_composer(composer).expect("composer input is valid");
    let from_automation =
        TurnLaunchSpec::from_automation_draft(draft).expect("automation draft is valid");

    assert_eq!(from_composer, from_automation);
}
