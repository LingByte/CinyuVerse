use std::sync::Arc;

use application::{
    ApplicationCore, ConversationSessionExecutionPort, SqliteConversationRepository,
    WorkflowStoreExecutionPort,
};
use conversations::ConversationContext;
use sqlx::SqlitePool;

use crate::{
    ServerApplicationDomains, ServerDomainDependencies,
    automation_runtime::HeadlessAutomationRuntime,
};

/// Shared Application Core used by `cinyuverse-server` and the desktop remote listener.
pub fn host_application_core(
    pool: SqlitePool,
    conversations: ConversationContext,
    companion_memory: Option<std::sync::Arc<delegation::InMemoryCompanionFeatures>>,
    preview_proxy: crate::PreviewProxyRegistry,
    automation: HeadlessAutomationRuntime,
    owns_automation_engine: bool,
    deployment: Arc<local_deployment::LocalDeployment>,
    host_data_dir: std::path::PathBuf,
) -> ApplicationCore<SqliteConversationRepository> {
    let domains = Arc::new(ServerApplicationDomains::new(ServerDomainDependencies {
        pool: pool.clone(),
        preview_proxy,
        automation,
        owns_automation_engine,
        conversations: conversations.clone(),
        deployment,
        host_data_dir,
    }));
    let companion = companion_memory.map(|memory| {
        std::sync::Arc::new(crate::companion_session::CompanionSessionAdapter::new(
            memory,
            conversations.clone(),
        )) as std::sync::Arc<dyn application::CompanionSessionPort>
    });
    let execution = Arc::new(ConversationSessionExecutionPort::with_companion(
        conversations.clone(),
        companion,
    ));
    let workflows = Arc::new(WorkflowStoreExecutionPort::with_conversations(
        pool.clone(),
        conversations,
    ));
    ApplicationCore::with_all_ports(
        SqliteConversationRepository::new(pool),
        execution,
        domains,
        workflows,
    )
}