//! Loopback preview proxy for artifact/preview leases (no product plugin plane).

use std::sync::Arc;

#[derive(Clone)]
pub struct DesktopPreviewProxy {
    endpoint: Arc<str>,
    registry: server::PreviewProxyRegistry,
}

impl DesktopPreviewProxy {
    pub async fn start() -> anyhow::Result<Self> {
        let registry = server::PreviewProxyRegistry::default();
        let endpoint = server::start_loopback_preview_proxy(registry.clone()).await?;
        Ok(Self {
            endpoint: Arc::from(endpoint),
            registry,
        })
    }

    pub async fn register(
        &self,
        lease_id: uuid::Uuid,
        loopback_port: u16,
        capability_token: &str,
        expires_at_unix_ms: u64,
    ) -> anyhow::Result<String> {
        self.registry
            .register(lease_id, loopback_port, capability_token, expires_at_unix_ms)
            .await?;
        Ok(format!(
            "{}/api/v1/previews/{lease_id}/c/{capability_token}/",
            self.endpoint
        ))
    }

    pub async fn revoke(&self, lease_id: &str) {
        if let Ok(lease_id) = uuid::Uuid::parse_str(lease_id) {
            self.registry.revoke(lease_id).await;
        }
    }

    pub fn registry(&self) -> server::PreviewProxyRegistry {
        self.registry.clone()
    }
}
