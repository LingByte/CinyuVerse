//! Vendor ACP reverse-requests that ask the user a question or decision.
//!
//! Claude uses standard `elicitation/create`. Grok blocks on vendor
//! ext-methods instead. This module is the single host entry: parse those
//! methods onto the existing `x-cinyuverse-questions` card, then encode the user's
//! answer back into the vendor payload.

use std::collections::HashMap;

use serde_json::{Value, json};

use crate::{
    elicitation::AgentElicitationResponse,
    grok_ask::{self, AskUserQuestionExtRequest},
    grok_plan::{self, ExitPlanModeExtRequest},
    ids::AgentSessionId,
};

#[derive(Debug, Clone, PartialEq)]
pub struct ExtQuestion {
    pub session_id: Option<String>,
    pub prompt: String,
    pub schema: Value,
    kind: ExtQuestionKind,
}

#[derive(Debug, Clone, PartialEq)]
enum ExtQuestionKind {
    GrokAsk(AskUserQuestionExtRequest),
    GrokExitPlan(ExitPlanModeExtRequest),
}

pub fn normalize_method(method: &str) -> &str {
    method.strip_prefix('_').unwrap_or(method)
}

pub fn unwrap_params(params: &str) -> Result<Value, String> {
    let value: Value =
        serde_json::from_str(params).map_err(|error| format!("invalid JSON: {error}"))?;
    Ok(value
        .get("params")
        .filter(|inner| inner.is_object())
        .cloned()
        .unwrap_or(value))
}

pub fn question_schema(questions: impl IntoIterator<Item = Value>) -> Value {
    json!({
        "type": "object",
        "x-cinyuverse-questions": questions.into_iter().collect::<Vec<_>>(),
    })
}

pub fn answer_entries(content: &Value) -> Vec<(String, Vec<String>)> {
    if let Some(items) = content.get("answers").and_then(Value::as_array) {
        return items
            .iter()
            .filter_map(|item| {
                let question_id = item.get("questionId").and_then(Value::as_str)?;
                let labels = match item.get("labels") {
                    Some(Value::Array(items)) => items
                        .iter()
                        .filter_map(Value::as_str)
                        .filter(|text| !text.trim().is_empty())
                        .map(str::to_string)
                        .collect(),
                    Some(Value::String(text)) if !text.trim().is_empty() => {
                        vec![text.clone()]
                    }
                    _ => Vec::new(),
                };
                Some((question_id.to_string(), labels))
            })
            .collect();
    }
    content
        .as_object()
        .map(|object| {
            object
                .iter()
                .filter(|(key, _)| *key != "answers")
                .map(|(key, value)| {
                    let labels = match value {
                        Value::Array(items) => items
                            .iter()
                            .filter_map(Value::as_str)
                            .filter(|text| !text.trim().is_empty())
                            .map(str::to_string)
                            .collect(),
                        Value::String(text) if !text.trim().is_empty() => {
                            vec![text.clone()]
                        }
                        _ => Vec::new(),
                    };
                    (key.clone(), labels)
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse(method: &str, params: &str) -> Option<Result<ExtQuestion, String>> {
    if grok_ask::is_ask_user_question_method(method) {
        return Some(parse_grok_ask(params));
    }
    if grok_plan::is_exit_plan_mode_method(method) {
        return Some(parse_grok_plan(params));
    }
    None
}

pub fn resolve_session_id(
    requested: Option<&str>,
    sessions: &HashMap<AgentSessionId, String>,
) -> Option<AgentSessionId> {
    if let Some(acp_session) = requested.map(str::trim).filter(|id| !id.is_empty())
        && let Some(session_id) = sessions
            .iter()
            .find_map(|(session_id, candidate)| (candidate == acp_session).then_some(*session_id))
    {
        return Some(session_id);
    }
    if sessions.len() == 1 {
        return sessions.keys().next().copied();
    }
    None
}

impl ExtQuestion {
    pub fn into_response(self, response: AgentElicitationResponse) -> Value {
        match self.kind {
            ExtQuestionKind::GrokAsk(request) => {
                grok_ask::ext_response_from_elicitation(response, &request.questions)
            }
            ExtQuestionKind::GrokExitPlan(_) => grok_plan::ext_response_from_elicitation(response),
        }
    }
}

fn parse_grok_ask(params: &str) -> Result<ExtQuestion, String> {
    let request = grok_ask::parse_request(params)?;
    if request.questions.is_empty() {
        return Err("ask_user_question requires at least one question".into());
    }
    Ok(ExtQuestion {
        session_id: Some(request.session_id.clone()),
        prompt: grok_ask::prompt_from_questions(&request.questions),
        schema: grok_ask::question_schema(&request.questions),
        kind: ExtQuestionKind::GrokAsk(request),
    })
}

fn parse_grok_plan(params: &str) -> Result<ExtQuestion, String> {
    let request = grok_plan::parse_request(params)?;
    Ok(ExtQuestion {
        session_id: Some(request.session_id.clone()),
        prompt: grok_plan::question_prompt(&request),
        schema: grok_plan::plan_question_schema(&request),
        kind: ExtQuestionKind::GrokExitPlan(request),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::elicitation::AgentElicitationResponse;

    #[test]
    fn ignores_unknown_methods() {
        assert!(parse("session/request_permission", "{}").is_none());
        assert!(parse("x.ai/announcements/update", "{}").is_none());
        assert!(parse("cursor/ask_question", "{}").is_none());
        assert!(parse("cursor/create_plan", "{}").is_none());
    }

    #[test]
    fn parses_all_vendor_question_methods() {
        let grok = parse(
            "_x.ai/ask_user_question",
            r#"{"sessionId":"s1","questions":[{"question":"Ready?","options":[]}]}"#,
        )
        .unwrap()
        .unwrap();
        assert_eq!(grok.session_id.as_deref(), Some("s1"));
        assert!(grok.schema["x-cinyuverse-questions"].is_array());

        let exit = parse(
            "x.ai/exit_plan_mode",
            r##"{"sessionId":"s2","toolCallId":"t1","planContent":"# Plan"}"##,
        )
        .unwrap()
        .unwrap();
        assert_eq!(exit.prompt, "# Plan");
    }

    #[test]
    fn rejects_empty_question_lists() {
        assert!(
            parse(
                "x.ai/ask_user_question",
                r#"{"sessionId":"s1","questions":[]}"#
            )
            .unwrap()
            .is_err()
        );
    }

    #[test]
    fn encodes_vendor_specific_replies() {
        let grok_plan = parse(
            "x.ai/exit_plan_mode",
            r#"{"sessionId":"s1","toolCallId":"t1"}"#,
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            grok_plan.into_response(AgentElicitationResponse::Accept {
                content: json!({
                    "answers": [{ "questionId": "plan", "labels": ["Approve"] }]
                }),
            })["outcome"],
            "approved"
        );
    }

    #[test]
    fn resolves_requested_or_single_session() {
        let only = AgentSessionId::new();
        let extra = AgentSessionId::new();
        let single = HashMap::from([(only, "acp-1".into())]);
        let many = HashMap::from([(only, "acp-1".into()), (extra, "acp-2".into())]);

        assert_eq!(resolve_session_id(Some("acp-2"), &many), Some(extra));
        assert_eq!(resolve_session_id(None, &single), Some(only));
        assert_eq!(resolve_session_id(None, &many), None);
        assert_eq!(resolve_session_id(Some("missing"), &many), None);
        assert_eq!(resolve_session_id(Some("missing"), &single), Some(only));
    }
}
