//! Shared AI config and non-streaming completion for async Rust commands.

use crate::ai::{create_ai_client, AiConfig, ChatMessage, ChatRequest};
use tokio::sync::Mutex as TokioMutex;

pub static AI_CONFIG: TokioMutex<Option<AiConfig>> = TokioMutex::const_new(None);

pub async fn llm_chat_completion(
    system: &str,
    user: &str,
    model: Option<&str>,
) -> Result<String, String> {
    let config = AI_CONFIG.lock().await;
    let config = config.as_ref().ok_or("AI 配置未设置")?;
    let client = create_ai_client(config.clone());
    let req = ChatRequest {
        model: model.unwrap_or(&config.model).to_string(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: system.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user.to_string(),
            },
        ],
        temperature: Some(0.35),
        max_tokens: Some(4096),
        stream: Some(false),
    };
    let resp = client.chat(req).await.map_err(|e| e.to_string())?;
    Ok(resp
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .unwrap_or_default())
}
