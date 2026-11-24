//! Concrete `DelegationInjector`: mints a per-launch token, registers it, and
//! returns global remote MCP entries to splice into a capable ACP parent's
//! `session/new`. Official product MCP injection is disabled until the plugin
//! host is removed.

use std::{path::PathBuf, sync::Arc};

use agents::{
    CompanionInjection, CompanionInjectionContext, CompanionInjectionList, DelegationInjector,
    InjectedRemoteMcpServer, InjectedRemoteMcpTransport,
};
use delegation::TokenRegistry;
#[derive(Debug)]
pub(crate) struct VibexDelegationInjector {
    pub tokens: Arc<TokenRegistry>,
    pub socket_path: PathBuf,
}

impl DelegationInjector for VibexDelegationInjector {
    fn companion(&self, context: CompanionInjectionContext<'_>) -> CompanionInjection {
        match self.injected_stdio_servers(context) {
            CompanionInjectionList::Injected(mut servers) if !servers.is_empty() => {
                CompanionInjection::Injected(servers.remove(0))
            }
            CompanionInjectionList::Injected(_) => CompanionInjection::Unsupported {
                code: "companion_features_disabled",
            },
            CompanionInjectionList::Unsupported { code } => {
                CompanionInjection::Unsupported { code }
            }
        }
    }

    fn injected_stdio_servers(
        &self,
        context: CompanionInjectionContext<'_>,
    ) -> CompanionInjectionList {
        if !context.capabilities.accepts_session_mcp_servers {
            return CompanionInjectionList::Unsupported {
                code: "delegation_parent_unsupported",
            };
        }

        let _ = &self.socket_path;
        let _ = &self.tokens;

        CompanionInjectionList::Unsupported {
            code: "official_product_mcp_disabled",
        }
    }

    fn remote_servers(&self) -> Vec<InjectedRemoteMcpServer> {
        services::services::mcp::scan_local_sync()
            .unwrap_or_default()
            .into_iter()
            .filter(|server| server.global)
            .filter_map(|server| {
                let object = server.spec.as_object()?;
                let transport = match object.get("type")?.as_str()? {
                    "http" => InjectedRemoteMcpTransport::Http,
                    "sse" => InjectedRemoteMcpTransport::Sse,
                    _ => return None,
                };
                let url = object.get("url")?.as_str()?.trim();
                if url.is_empty() {
                    return None;
                }
                let headers = object
                    .get("headers")
                    .and_then(serde_json::Value::as_object)
                    .into_iter()
                    .flatten()
                    .filter_map(|(name, value)| {
                        value
                            .as_str()
                            .map(|value| (name.clone(), value.to_string()))
                    })
                    .collect();
                Some(InjectedRemoteMcpServer {
                    name: server.id,
                    transport,
                    url: url.to_string(),
                    headers,
                })
            })
            .collect()
    }
}

pub(crate) fn locate_cinyuverse_mcp_binary() -> PathBuf {
    utils::host_bin::locate_host_family_binary("cinyuverse-mcp")
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use agents::{
        AgentId, CompanionInjectionContext, CompanionInjectionList, DelegationInjector,
    };

    use super::*;

    fn context<'a>(agent: &'a AgentId, accepts: bool) -> CompanionInjectionContext<'a> {
        CompanionInjectionContext {
            parent_connection_id: "parent-1",
            parent_conversation_id: Uuid::new_v4(),
            agent_id: agent,
            working_root: Path::new("/workspace"),
            capabilities: agents::CompanionCapabilities {
                accepts_session_mcp_servers: accepts,
            },
        }
    }

    #[test]
    fn product_mcp_injection_is_disabled() {
        let injector = VibexDelegationInjector {
            tokens: Arc::new(TokenRegistry::new()),
            socket_path: PathBuf::from("/tmp/cinyuverse-delegation-test.sock"),
        };
        let agent = AgentId::parse("vendor.capable-agent").unwrap();
        assert_eq!(
            injector.injected_stdio_servers(context(&agent, true)),
            CompanionInjectionList::Unsupported {
                code: "official_product_mcp_disabled"
            }
        );
    }

    #[test]
    fn parent_without_session_mcp_is_unsupported() {
        let injector = VibexDelegationInjector {
            tokens: Arc::new(TokenRegistry::new()),
            socket_path: PathBuf::from("/tmp/cinyuverse-delegation-test.sock"),
        };
        let agent = AgentId::parse("claude_code").unwrap();
        assert_eq!(
            injector.injected_stdio_servers(context(&agent, false)),
            CompanionInjectionList::Unsupported {
                code: "delegation_parent_unsupported"
            }
        );
    }
}