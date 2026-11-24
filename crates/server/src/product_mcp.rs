//! Loopback HTTP entry for product MCP processes.
//!
//! Product-plugin MCP is disabled while the plugin host is removed; this entry
//! point remains as a no-op so callers can drop gate wiring incrementally.

use std::{
    path::PathBuf,
    sync::Arc,
};

use delegation::{DelegationListener, TokenRegistry};
use uuid::Uuid;

#[async_trait::async_trait]
pub trait ProductMcpSessionLookup: Send + Sync {
    async fn resolve(&self, conversation_id: Uuid) -> Option<(String, PathBuf)>;
}

/// Former loopback gateway for official product MCP plugins. Disabled.
pub async fn start_product_mcp_gateway(
    _listener: Arc<DelegationListener>,
    _tokens: Arc<TokenRegistry>,
    _sessions: Arc<dyn ProductMcpSessionLookup>,
) -> Result<(), std::io::Error> {
    Ok(())
}