//! Application-core adapter over the in-memory companion store.

use std::sync::Arc;

use agents::{
    AgentElicitationId, AgentElicitationResponse, AgentEvent, AgentSessionId,
    ids::AgentConnectionId,
};
use application::{ApplicationError, CompanionSessionPort, ConversationLiveFeedbackNote};
use async_trait::async_trait;
use conversations::ConversationContext;
use delegation::{FeedbackNote, InMemoryCompanionFeatures};
use serde_json::json;
use uuid::Uuid;

pub struct CompanionSessionAdapter {
    memory: Arc<InMemoryCompanionFeatures>,
    context: ConversationContext,
}

impl CompanionSessionAdapter {
    pub fn new(memory: Arc<InMemoryCompanionFeatures>, context: ConversationContext) -> Self {
        Self { memory, context }
    }
}

#[async_trait]
impl CompanionSessionPort for CompanionSessionAdapter {
    async fn submit_feedback(
        &self,
        _conversation_id: Uuid,
        _text: &str,
    ) -> Result<ConversationLiveFeedbackNote, ApplicationError> {
        Err(ApplicationError::conflict("live feedback is off"))
    }

    async fn list_feedback(
        &self,
        conversation_id: Uuid,
    ) -> Result<Vec<ConversationLiveFeedbackNote>, ApplicationError> {
        Ok(self
            .memory
            .list_feedback(conversation_id)
            .await
            .into_iter()
            .map(note_view)
            .collect())
    }

    async fn answer_question(
        &self,
        conversation_id: Uuid,
        question_id: &str,
        response: AgentElicitationResponse,
    ) -> Result<bool, ApplicationError> {
        let companion_answer = match &response {
            AgentElicitationResponse::Accept { content } => content
                .get("answers")
                .cloned()
                .unwrap_or_else(|| content.clone()),
            AgentElicitationResponse::Decline | AgentElicitationResponse::Cancel => {
                json!({ "__declined": true })
            }
        };
        let Ok(pending) = self
            .memory
            .answer_question(question_id, conversation_id, companion_answer)
            .await
        else {
            return Ok(false);
        };
        let connection_id = Uuid::parse_str(&pending.scope.parent_connection_id)
            .map(AgentConnectionId::from)
            .map_err(|error| {
                ApplicationError::bad_request(format!("invalid companion connection id: {error}"))
            })?;
        let elicitation_id = Uuid::parse_str(&pending.id)
            .map(AgentElicitationId)
            .map_err(|error| {
                ApplicationError::bad_request(format!("invalid companion question id: {error}"))
            })?;
        self.context
            .agent_runtime
            .emit_external(
                connection_id,
                Some(AgentSessionId::from(pending.scope.parent_conversation_id)),
                AgentEvent::ElicitationResponded {
                    elicitation_id,
                    response,
                },
            )
            .await;
        Ok(true)
    }

    async fn clear_turn(&self, conversation_id: Uuid) {
        self.memory.clear_conversation(conversation_id).await;
    }
}

fn note_view(note: FeedbackNote) -> ConversationLiveFeedbackNote {
    ConversationLiveFeedbackNote {
        id: note.id,
        text: note.text,
        created_at: note.created_at.to_rfc3339(),
        status: match note.status {
            delegation::FeedbackStatus::Pending => "pending".to_string(),
            delegation::FeedbackStatus::Delivered => "delivered".to_string(),
        },
        delivered_at: note.delivered_at.map(|at| at.to_rfc3339()),
    }
}