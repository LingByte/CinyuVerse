use std::sync::Arc;

use agents::AgentId;
use application::{ApplicationDomainPort, ApplicationError, DomainCommand, Principal};
use artifacts::{ArtifactRepository, SqliteArtifactRepository};
use async_trait::async_trait;
use automation::{
    AutomationDraft, AutomationDraftInput, AutomationSpec, AutomationTarget,
    BuiltinTemplateCatalog, ClaimedRun, PORTABLE_AUTOMATION_SPEC_VERSION,
    PortableAutomationTarget, PortableTurnLaunchSpec, PortableWorkflowLaunchSpec,
    PortableWorkspaceRef, RunStatus, ScheduleService, ScheduleSpec, SystemClock, TurnLaunchSpec,
    TurnLaunchSpecInput, WORKFLOW_AUTOMATION_SPEC_VERSION, WorkflowAutomationDraft,
    WorkflowLaunchSpec, WorkspaceTarget,
};
use chrono::{DateTime, Utc};
use conversations::{ConversationContext, ConversationSessionService};
use db::models::{
    automation_v2::{AutomationRecord, AutomationRunRecord, SqliteAutomationStore},
    project::Project,
    project_repo::ProjectRepo,
};
use deployment::Deployment;
use local_deployment::LocalDeployment;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{PreviewProxyRegistry, automation_runtime::HeadlessAutomationRuntime};

#[derive(Clone)]
pub struct ServerApplicationDomains {
    pub(crate) pool: SqlitePool,
    preview_proxy: PreviewProxyRegistry,
    automation: HeadlessAutomationRuntime,
    owns_automation_engine: bool,
    pub(crate) conversations: ConversationContext,
    pub(crate) deployment: Arc<LocalDeployment>,
    pub(crate) host_data_dir: std::path::PathBuf,
}

pub struct ServerDomainDependencies {
    pub pool: SqlitePool,
    pub preview_proxy: PreviewProxyRegistry,
    pub automation: HeadlessAutomationRuntime,
    pub owns_automation_engine: bool,
    pub conversations: ConversationContext,
    pub deployment: Arc<LocalDeployment>,
    pub host_data_dir: std::path::PathBuf,
}

impl ServerApplicationDomains {
    pub fn new(dependencies: ServerDomainDependencies) -> Self {
        let ServerDomainDependencies {
            pool,
            preview_proxy,
            automation,
            owns_automation_engine,
            conversations,
            deployment,
            host_data_dir,
        } = dependencies;
        Self {
            pool,
            preview_proxy,
            automation,
            owns_automation_engine,
            conversations,
            deployment,
            host_data_dir,
        }
    }

    fn automation_store(&self) -> SqliteAutomationStore {
        SqliteAutomationStore::new(self.pool.clone())
    }

    async fn execute_command(
        &self,
        command: DomainCommand,
        args: Value,
    ) -> Result<Value, ApplicationError> {
        match command {
            DomainCommand::ProjectList => self.project_list().await,
            DomainCommand::ProjectRepositories => self.project_repositories(args).await,
            DomainCommand::RepoBranches => self.repo_branches(args).await,
            DomainCommand::AgentManagementBar => self.agent_management_bar().await,
            DomainCommand::AgentCapabilityCatalog => self.agent_capability_catalog(args).await,
            DomainCommand::AgentCapabilityCatalogFresh => {
                self.agent_capability_catalog_fresh(args).await
            }
            DomainCommand::AgentRefreshCapabilityCatalog => {
                self.agent_refresh_capability_catalog(args).await
            }
            DomainCommand::AgentSkillsList => self.agent_skills(args).await,
            DomainCommand::UserSystemInfo => self.user_system_info().await,
            DomainCommand::ArtifactList => self.artifact_list(args).await,
            DomainCommand::ArtifactOpenPreview => self.open_preview(args).await,
            DomainCommand::ArtifactClosePreview => self.close_preview(args).await,
            DomainCommand::AutomationList => self.automation_list().await,
            DomainCommand::AutomationEngineStatus => {
                Ok(json!({ "active": self.owns_automation_engine }))
            }
            DomainCommand::AutomationCreate => self.automation_create(args).await,
            DomainCommand::AutomationCreateWorkflow => self.automation_create_workflow(args).await,
            DomainCommand::AutomationUpdate => self.automation_update(args).await,
            DomainCommand::AutomationSetEnabled => self.automation_set_enabled(args).await,
            DomainCommand::AutomationDelete => self.automation_delete(args).await,
            DomainCommand::AutomationRunNow => self.automation_run_now(args).await,
            DomainCommand::AutomationCancelRun => self.automation_cancel_run(args).await,
            DomainCommand::AutomationRuns => self.automation_runs(args).await,
            DomainCommand::AutomationPreviewNextRuns => self.automation_preview(args),
            DomainCommand::AutomationTemplates => self.automation_templates(),
            DomainCommand::AutomationUnseenFailures => self.automation_unseen_failures().await,
            DomainCommand::AutomationMarkSeen => self.automation_mark_seen().await,
            DomainCommand::AutomationExportSpec => self.automation_export_spec(args).await,
            DomainCommand::AutomationImportSpec => self.automation_import_spec(args).await,
            DomainCommand::DelegationCancel => self.delegation_cancel(args).await,
            DomainCommand::ConversationDetail => self.conversation_detail(args).await,
            DomainCommand::ConversationEventsSince => self.conversation_events_since(args).await,
            DomainCommand::ConversationEnsureSessionControls => {
                self.conversation_ensure_session_controls(args).await
            }
            DomainCommand::ConversationTimelinePage => self.conversation_timeline_page(args).await,
            DomainCommand::ConversationRebindSession => {
                self.conversation_rebind_session(args).await
            }
            DomainCommand::ConversationTruncateToTurn => {
                self.conversation_truncate_to_turn(args).await
            }
            DomainCommand::ConversationSearch => self.conversation_search_host(args).await,
            DomainCommand::ConversationExportMarkdown => {
                self.conversation_export_text(args, false).await
            }
            DomainCommand::ConversationExportHtml => {
                self.conversation_export_text(args, true).await
            }
            DomainCommand::ConversationExport => self.conversation_export_bundle(args).await,
            DomainCommand::ConversationClose => self.conversation_close_host(args).await,
            DomainCommand::ConversationCheckpointPreview => {
                self.conversation_checkpoint_preview(args).await
            }
            DomainCommand::ConversationImport => self.conversation_import_host(args).await,
            DomainCommand::ConversationFork => self.conversation_fork_host(args).await,
            DomainCommand::WorkspaceContinueConflicts
            | DomainCommand::WorkspaceConflictFile
            | DomainCommand::WorkspaceWriteConflictResolution
            | DomainCommand::WorkspaceShowStash
            | DomainCommand::WorkspaceCreatePr
            | DomainCommand::WorkspaceAttachPr
            | DomainCommand::WorkspaceCreateFromPr
            | DomainCommand::WorkspaceRunSetupScript
            | DomainCommand::WorkspaceRunCleanupScript
            | DomainCommand::WorkspaceRunArchiveScript => self.product_command(command, args).await,
            DomainCommand::AgentScanLocalHistory => self.surface_command(command, args).await,
            DomainCommand::WorkspaceCreate
            | DomainCommand::WorkspaceUpdate
            | DomainCommand::WorkspaceDelete
            | DomainCommand::WorkspaceMarkSeen
            | DomainCommand::WorkspaceChildren
            | DomainCommand::WorkspaceBranchStatus
            | DomainCommand::WorkspaceCommitHistory
            | DomainCommand::WorkspaceCommitGraph
            | DomainCommand::WorkspaceCommitDiffs
            | DomainCommand::WorkspacePush
            | DomainCommand::WorkspacePull
            | DomainCommand::WorkspaceFetch
            | DomainCommand::WorkspaceMerge
            | DomainCommand::WorkspaceRebase
            | DomainCommand::WorkspaceRebaseBack
            | DomainCommand::WorkspaceContinueRebase
            | DomainCommand::WorkspaceAbortConflicts
            | DomainCommand::WorkspaceStash
            | DomainCommand::WorkspaceStashList
            | DomainCommand::WorkspaceStashApply
            | DomainCommand::WorkspaceStashPop
            | DomainCommand::WorkspaceStashDrop
            | DomainCommand::WorkspaceRenameBranch
            | DomainCommand::WorkspaceChangeTargetBranch
            | DomainCommand::AutomationUpdateWorkflow
            | DomainCommand::AttentionInboxList
            | DomainCommand::ScratchGet
            | DomainCommand::ScratchCreate
            | DomainCommand::ScratchUpdate
            | DomainCommand::ScratchDelete
            | DomainCommand::StoryGraphGet
            | DomainCommand::StoryBeatCreate
            | DomainCommand::StoryBeatUpdate
            | DomainCommand::StoryBeatDelete
            | DomainCommand::StoryBeatEdgeCreate
            | DomainCommand::StoryBeatEdgeDelete
            | DomainCommand::StoryBeatContext
            | DomainCommand::TagList
            | DomainCommand::TagCreate
            | DomainCommand::TagUpdate
            | DomainCommand::TagDelete
            | DomainCommand::TaskGet
            | DomainCommand::TaskCreate
            | DomainCommand::TaskCreateAndStart
            | DomainCommand::TaskUpdate
            | DomainCommand::TaskDelete
            | DomainCommand::RepoUpdate
            | DomainCommand::RepoPush
            | DomainCommand::RepoPull
            | DomainCommand::RepoFetch
            | DomainCommand::RepoRemotes
            | DomainCommand::RepoAddRemote
            | DomainCommand::RepoRemoveRemote
            | DomainCommand::RepoSetRemoteUrl
            | DomainCommand::RepoCommitDetail
            | DomainCommand::RepoCommitDiffs
            | DomainCommand::RepoSearch
            | DomainCommand::RepoIssues
            | DomainCommand::RepoOpenPrs
            | DomainCommand::WorkflowSourceRead
            | DomainCommand::WorkflowSourceWrite
            | DomainCommand::AgentListLiveTerminals
            | DomainCommand::AgentPlanUsage
            | DomainCommand::FrontendPreferencesGet
            | DomainCommand::FrontendPreferencesUpdate
            | DomainCommand::ProjectWorktreeSettingsGet
            | DomainCommand::ProjectWorktreeSettingsUpdate
            | DomainCommand::ReadBinaryAsset => self.product_command(command, args).await,
            DomainCommand::SubscribeDiffStream
            | DomainCommand::SubscribeConversationStream
            | DomainCommand::SubscribeExecutionProcessesStream
            | DomainCommand::SubscribeProjectWorkspacesStream
            | DomainCommand::SubscribeProjectsStream
            | DomainCommand::SubscribeFileTreeStream
            | DomainCommand::SubscribeScratchStream
            | DomainCommand::SubscribeLogStream
            | DomainCommand::SubscribeSlashCommandsStream => {
                self.subscribe_stream(command, args).await
            }
            DomainCommand::AgentConnect
            | DomainCommand::AgentPrepareSession
            | DomainCommand::AgentNewSession
            | DomainCommand::AgentResumeSession
            | DomainCommand::AgentSendPrompt
            | DomainCommand::AgentCancelPrompt
            | DomainCommand::AgentDisconnect
            | DomainCommand::AgentRespondPermission
            | DomainCommand::AgentRuntimeSnapshot
            | DomainCommand::AgentConnectionSnapshot
            | DomainCommand::AgentLoadSession
            | DomainCommand::AgentListSessionCommands
            | DomainCommand::AgentDiscardPreparedSession
            | DomainCommand::AgentSetPreparedSessionMode
            | DomainCommand::AgentSetPreparedSessionConfig
            | DomainCommand::AgentListRemoteSessions
            | DomainCommand::AgentDeleteRemoteSession
            | DomainCommand::AgentImportRemoteSession
            | DomainCommand::AgentResetToCheckpoint
            | DomainCommand::AgentListLocalHistory
            | DomainCommand::AgentImportLocalHistory
            | DomainCommand::AgentImportLocalHistoryBatch
            | DomainCommand::AgentLocalHistoryImportSnapshot
            | DomainCommand::AgentTerminalSnapshot
            | DomainCommand::AgentSessionDefaults
            | DomainCommand::AgentSetSessionDefaults
            | DomainCommand::AgentRegistryView
            | DomainCommand::AgentRegistryRefresh
            | DomainCommand::AgentRegistryAddAndInstall
            | DomainCommand::AgentUserDefinitionAddAndInstall
            | DomainCommand::AgentUserDefinitionDetail
            | DomainCommand::AgentUserDefinitionUpdate
            | DomainCommand::AgentManagementReorder
            | DomainCommand::AgentManagementInstallVersion
            | DomainCommand::AgentManagementRepair
            | DomainCommand::AgentManagementApplyUpdate
            | DomainCommand::AgentManagementUninstall
            | DomainCommand::AgentManagementRemove
            | DomainCommand::AgentManagementRollback
            | DomainCommand::AgentManagementCheckUpdate
            | DomainCommand::AgentManagementCancelOperation
            | DomainCommand::AgentManagementPreflight
            | DomainCommand::AgentManagementActions
            | DomainCommand::AgentManagementRunAction
            | DomainCommand::AgentManagementAccountFlow
            | DomainCommand::AgentManagementDiscoveryProgress
            | DomainCommand::AgentManagementDiagnostics
            | DomainCommand::AgentManagementEnvironmentDiagnostics
            | DomainCommand::AgentManagementClearDiagnostics
            | DomainCommand::AgentManagementMarkDiagnosticsRead
            | DomainCommand::AgentManagementEnvironment
            | DomainCommand::AgentManagementEnvironmentWrite
            | DomainCommand::AgentManagementConfigRead
            | DomainCommand::AgentManagementConfigWrite
            | DomainCommand::AgentManagementConfigFileWrite
            | DomainCommand::AgentAuthMode
            | DomainCommand::AgentAuthModeSet
            | DomainCommand::AgentModelProviders
            | DomainCommand::AgentModelProviderSave
            | DomainCommand::AgentModelProviderDelete
            | DomainCommand::AgentModelProviderBind
            | DomainCommand::AgentModelProviderCatalog
            | DomainCommand::AgentModelProviderProbe
            | DomainCommand::AgentModelProviderImport
            | DomainCommand::AgentModelProviderImportPreview
            | DomainCommand::CodexModelCatalog
            | DomainCommand::CodexModelCatalogApply
            | DomainCommand::CodexModelCatalogConfig
            | DomainCommand::CodexRequestDeviceCode
            | DomainCommand::CodexPollDeviceCode
            | DomainCommand::KimiModelCatalog
            | DomainCommand::CreateWorkflowDebugWorkspace
            | DomainCommand::GetChatEventWebhooks
            | DomainCommand::SetChatEventWebhooks
            | DomainCommand::GetChatMessageLanguage
            | DomainCommand::SetChatMessageLanguage
            | DomainCommand::WeixinGetQrcode
            | DomainCommand::WeixinCheckQrcode
            | DomainCommand::DshPlugins
            | DomainCommand::DshPluginAdd
            | DomainCommand::DshPluginRemove
            | DomainCommand::DshProviders
            | DomainCommand::DshProviderSave
            | DomainCommand::DshProviderDelete
            | DomainCommand::DshProviderDiscoverModels
            | DomainCommand::GrokPlugins
            | DomainCommand::GrokPluginAdd
            | DomainCommand::GrokPluginRemove
            | DomainCommand::OpenCodePluginList
            | DomainCommand::OpenCodePluginAdd
            | DomainCommand::OpenCodePluginInstall
            | DomainCommand::OpenCodePluginUninstall
            | DomainCommand::OpenCodeProviderCatalog
            | DomainCommand::OpenCodeProviderConnect
            | DomainCommand::OpenCodeProviderConnections
            | DomainCommand::OpenCodeProviderDisconnect
            | DomainCommand::OpenCodeProviderImport
            | DomainCommand::OpenCodeProviderSetEnabled => {
                self.surface_command(command, args).await
            }
            other if crate::host::catalog::handles(other) => {
                crate::host::catalog::dispatch(self, other, args).await
            }
            other => self.host_ops(other, args).await,
        }
    }

    async fn project_list(&self) -> Result<Value, ApplicationError> {
        serialize(
            Project::find_all(&self.pool)
                .await
                .map_err(internal_error)?,
        )
    }

    async fn project_repositories(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: IdArgs = parse(args)?;
        serialize(
            ProjectRepo::find_repos_for_project(&self.pool, args.id)
                .await
                .map_err(internal_error)?,
        )
    }

    async fn repo_branches(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: RepoIdArgs = parse(args)?;
        let repo = self
            .deployment
            .repo()
            .get_by_id(&self.pool, args.repo_id)
            .await
            .map_err(internal_error)?;
        let git = self.deployment.git().clone();
        let repo_path = repo.path.clone();
        let branches = tokio::task::spawn_blocking(move || git.get_all_branches(&repo_path))
            .await
            .map_err(|error| ApplicationError::internal(error.to_string()))?
            .map_err(internal_error)?;
        serialize(branches)
    }

    async fn agent_management_bar(&self) -> Result<Value, ApplicationError> {
        serialize(
            services::services::agent_management::AgentManagementApplicationService::new(
                self.pool.clone(),
            )
            .list()
            .await
            .map_err(internal_error)?,
        )
    }

    pub(crate) async fn agent_capability_catalog(
        &self,
        args: Value,
    ) -> Result<Value, ApplicationError> {
        let args: AgentIdArgs = parse(args)?;
        let agent_id = AgentId::parse(args.agent_id).map_err(internal_error)?;
        serialize(
            conversations::read_matching_open_capability_catalog(&self.pool, &agent_id)
                .await
                .map_err(conversation_error)?,
        )
    }

    async fn agent_capability_catalog_fresh(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: AgentIdArgs = parse(args)?;
        let agent_id = AgentId::parse(args.agent_id).map_err(internal_error)?;
        serialize(
            conversations::capability_catalog_is_fresh(&self.pool, &agent_id)
                .await
                .map_err(conversation_error)?,
        )
    }

    async fn agent_refresh_capability_catalog(
        &self,
        args: Value,
    ) -> Result<Value, ApplicationError> {
        let args: AgentIdArgs = parse(args)?;
        let agent_id = AgentId::parse(args.agent_id).map_err(internal_error)?;
        serialize(
            conversations::refresh_open_capability_catalog(
                &self.pool,
                &self.conversations.agent_runtime,
                &agent_id,
            )
            .await
            .map_err(conversation_error)?,
        )
    }

    async fn agent_skills(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: AgentSkillsArgs = parse(args)?;
        crate::host::catalog::skills::list_agent_skills(self, args.agent_type, args.workspace_path)
            .await
    }

    async fn user_system_info(&self) -> Result<Value, ApplicationError> {
        crate::host::catalog::config::user_system_info(self).await
    }

    async fn artifact_list(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: ArtifactListArgs = parse(args)?;
        let ids = if let Some(conversation_id) = args.conversation_id {
            sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM artifact_revisions WHERE conversation_id = ? \
                 GROUP BY id ORDER BY MAX(updated_at_unix_ms) DESC LIMIT ?",
            )
            .bind(conversation_id)
            .bind(args.limit.unwrap_or(100).clamp(1, 200))
            .fetch_all(&self.pool)
            .await
            .map_err(internal_error)?
        } else {
            sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM artifact_revisions GROUP BY id \
                 ORDER BY MAX(updated_at_unix_ms) DESC LIMIT ?",
            )
            .bind(args.limit.unwrap_or(100).clamp(1, 200))
            .fetch_all(&self.pool)
            .await
            .map_err(internal_error)?
        };
        let repository = SqliteArtifactRepository::new(self.pool.clone());
        let mut artifacts = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(artifact) = repository.find(id).await.map_err(internal_error)? {
                artifacts.push(serde_json::to_value(artifact).map_err(internal_error)?);
            }
        }
        Ok(Value::Array(artifacts))
    }

    async fn open_preview(&self, _args: Value) -> Result<Value, ApplicationError> {
        Err(ApplicationError::capability_unavailable(
            "plugin artifact preview is unavailable",
        ))
    }

    async fn close_preview(&self, _args: Value) -> Result<Value, ApplicationError> {
        Err(ApplicationError::capability_unavailable(
            "plugin artifact preview is unavailable",
        ))
    }

    async fn automation_list(&self) -> Result<Value, ApplicationError> {
        let records = self
            .automation_store()
            .list()
            .await
            .map_err(internal_error)?;
        serialize(records.into_iter().map(automation_view).collect::<Vec<_>>())
    }

    pub(crate) async fn automation_create(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: AutomationInputArgs = parse(args)?;
        let draft = self.normalize_draft(args.input).await?;
        let record = self
            .automation_store()
            .create(draft, Utc::now())
            .await
            .map_err(internal_error)?;
        serialize(automation_view(record))
    }

    async fn automation_create_workflow(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: WorkflowAutomationInputArgs = parse(args)?;
        let mut draft = args.input;
        draft.launch.workspace.root_folder =
            ProjectRepo::find_repos_for_project(&self.pool, draft.launch.workspace.project_id)
                .await
                .map_err(internal_error)?
                .into_iter()
                .next()
                .map(|repo| repo.path.to_string_lossy().to_string())
                .ok_or_else(|| ApplicationError::bad_request("project has no repository"))?;
        draft.launch.workspace.branch = draft
            .launch
            .workspace
            .branch
            .map(|branch| branch.trim().to_string())
            .filter(|branch| !branch.is_empty());
        draft
            .launch
            .validate()
            .map_err(|error| ApplicationError::bad_request(error.to_string()))?;
        let record = self
            .automation_store()
            .create_workflow(draft, Utc::now())
            .await
            .map_err(internal_error)?;
        serialize(automation_view(record))
    }

    pub(crate) async fn automation_update(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: AutomationUpdateArgs = parse(args)?;
        let draft = self.normalize_draft(args.input).await?;
        let record = self
            .automation_store()
            .update(args.id, draft, Utc::now())
            .await
            .map_err(store_error)?;
        serialize(automation_view(record))
    }

    async fn automation_set_enabled(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: AutomationEnabledArgs = parse(args)?;
        self.automation_store()
            .set_enabled(args.id, args.enabled, Utc::now())
            .await
            .map_err(store_error)?;
        Ok(Value::Null)
    }

    async fn automation_delete(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: IdArgs = parse(args)?;
        self.automation_store()
            .delete(args.id)
            .await
            .map_err(internal_error)?;
        Ok(Value::Null)
    }

    async fn automation_run_now(&self, args: Value) -> Result<Value, ApplicationError> {
        if !self.owns_automation_engine {
            return Err(ApplicationError::conflict(
                "this host does not own the Automation Engine lease",
            ));
        }
        let args: IdArgs = parse(args)?;
        let run = self
            .automation_store()
            .run_now(args.id, Utc::now())
            .await
            .map_err(store_error)?;
        let view = automation_run_view(run.clone());
        if run.snapshot.status == RunStatus::Running {
            let runtime = self.automation.clone();
            tokio::spawn(async move {
                runtime
                    .execute_claimed(ClaimedRun {
                        run_id: run.snapshot.run_id,
                        automation_id: run.snapshot.automation_id,
                        scheduled_for: run.started_at,
                        next_run_at: None,
                    })
                    .await;
            });
        }
        serialize(view)
    }

    async fn automation_cancel_run(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: RunIdArgs = parse(args)?;
        let store = self.automation_store();
        if !store
            .request_cancel(args.run_id)
            .await
            .map_err(internal_error)?
        {
            return Err(ApplicationError::conflict("automation run is not running"));
        }
        if let Some(run) = store.run(args.run_id).await.map_err(internal_error)? {
            if let Some(conversation_id) = run.snapshot.conversation_id {
                ConversationSessionService::new(self.conversations.clone())
                    .cancel_turn(
                        conversation_id,
                        Some("automation run cancelled".to_string()),
                    )
                    .await
                    .map_err(internal_error)?;
            }
            if let Some(workflow_run_id) = run.workflow_run_id {
                application::WorkflowExecutionPort::cancel(
                    &application::WorkflowStoreExecutionPort::with_conversations(
                        self.pool.clone(),
                        self.conversations.clone(),
                    ),
                    Uuid::new_v4(),
                    application::CancelWorkflowRequest {
                        run_id: workflow_run_id,
                        reason: Some("automation run cancelled".to_string()),
                    },
                )
                .await?;
            }
        }
        self.automation
            .reconcile_running_turns()
            .await
            .map_err(ApplicationError::internal)?;
        Ok(Value::Null)
    }

    async fn automation_runs(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: AutomationRunsArgs = parse(args)?;
        let runs = self
            .automation_store()
            .runs(args.automation_id, args.limit.unwrap_or(20))
            .await
            .map_err(internal_error)?;
        serialize(
            runs.into_iter()
                .map(automation_run_view)
                .collect::<Vec<_>>(),
        )
    }

    fn automation_preview(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: PreviewRunsArgs = parse(args)?;
        let values = ScheduleService::new(SystemClock)
            .preview(
                &ScheduleSpec::Schedule {
                    cron: args.cron,
                    timezone: args.timezone,
                },
                args.count.unwrap_or(5),
            )
            .map_err(|error| ApplicationError::bad_request(error.to_string()))?;
        serialize(values)
    }

    fn automation_templates(&self) -> Result<Value, ApplicationError> {
        serialize(
            BuiltinTemplateCatalog::all()
                .into_iter()
                .map(|template| json!({ "id": template.id, "draft": template.draft }))
                .collect::<Vec<_>>(),
        )
    }

    async fn automation_unseen_failures(&self) -> Result<Value, ApplicationError> {
        Ok(json!(
            self.automation_store()
                .unseen_failure_count()
                .await
                .map_err(internal_error)?
        ))
    }

    async fn automation_mark_seen(&self) -> Result<Value, ApplicationError> {
        self.automation_store()
            .mark_all_seen()
            .await
            .map_err(internal_error)?;
        Ok(Value::Null)
    }

    async fn automation_export_spec(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: IdArgs = parse(args)?;
        let record = self
            .automation_store()
            .find(args.id)
            .await
            .map_err(internal_error)?
            .ok_or_else(|| ApplicationError::not_found("Automation not found"))?;
        let target = match record.target {
            AutomationTarget::Turn(spec) => {
                PortableAutomationTarget::Turn(PortableTurnLaunchSpec {
                    prompt_blocks: spec.prompt_blocks,
                    display_text: spec.display_text,
                    agent: spec.agent,
                    mode_id: spec.mode_id,
                    config_values: spec.config_values,
                    skills: spec.skills,
                    workspace: self.portable_workspace(&spec.workspace).await?,
                    label_snapshot: spec.label_snapshot,
                })
            }
            AutomationTarget::Workflow(spec) => {
                let version = workflows::WorkflowStore::new(self.pool.clone())
                    .version(spec.definition_version_id)
                    .await
                    .map_err(|error| ApplicationError::internal(error.to_string()))?;
                let source_path = version.source_path.ok_or_else(|| {
                    ApplicationError::conflict(
                        "Workflow version has no portable source identity; publish it from Studio first",
                    )
                })?;
                PortableAutomationTarget::Workflow(PortableWorkflowLaunchSpec {
                    source_path,
                    version_digest: version.digest,
                    input: spec.input,
                    policy_override: spec.policy_override,
                    workspace: self.portable_workspace(&spec.workspace).await?,
                })
            }
        };
        let spec = AutomationSpec {
            format_version: PORTABLE_AUTOMATION_SPEC_VERSION,
            name: record.name,
            trigger: record.trigger,
            target,
        };
        spec.validate()
            .map_err(|error| ApplicationError::bad_request(error.to_string()))?;
        serialize(
            serde_json::to_string_pretty(&spec)
                .map_err(|error| ApplicationError::internal(error.to_string()))?,
        )
    }

    async fn automation_import_spec(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: AutomationImportArgs = parse(args)?;
        let spec: AutomationSpec = serde_json::from_str(&args.json).map_err(|error| {
            ApplicationError::bad_request(format!("Invalid Automation JSON: {error}"))
        })?;
        spec.validate()
            .map_err(|error| ApplicationError::bad_request(error.to_string()))?;
        let record = match spec.target {
            PortableAutomationTarget::Turn(launch) => {
                let workspace = self.resolve_portable_workspace(&launch.workspace).await?;
                let draft = AutomationDraft {
                    name: spec.name,
                    enabled: false,
                    trigger: spec.trigger,
                    launch: AutomationDraftInput(TurnLaunchSpecInput {
                        prompt_blocks: launch.prompt_blocks,
                        display_text: launch.display_text,
                        agent: launch.agent,
                        mode_id: launch.mode_id,
                        config_values: launch.config_values,
                        skills: launch.skills,
                        workspace,
                        label_snapshot: launch.label_snapshot,
                    }),
                };
                self.automation_store()
                    .create(draft, Utc::now())
                    .await
                    .map_err(internal_error)?
            }
            PortableAutomationTarget::Workflow(launch) => {
                let workspace = self.resolve_portable_workspace(&launch.workspace).await?;
                let version = workflows::WorkflowStore::new(self.pool.clone())
                    .version_by_source_digest(&launch.source_path, &launch.version_digest)
                    .await
                    .map_err(|error| ApplicationError::conflict(error.to_string()))?;
                self.automation_store()
                    .create_workflow(
                        WorkflowAutomationDraft {
                            name: spec.name,
                            enabled: false,
                            trigger: spec.trigger,
                            launch: WorkflowLaunchSpec {
                                spec_version: WORKFLOW_AUTOMATION_SPEC_VERSION,
                                definition_version_id: version.id,
                                input: launch.input,
                                policy_override: launch.policy_override,
                                workspace,
                            },
                        },
                        Utc::now(),
                    )
                    .await
                    .map_err(internal_error)?
            }
        };
        serialize(automation_view(record))
    }

    async fn portable_workspace(
        &self,
        workspace: &WorkspaceTarget,
    ) -> Result<PortableWorkspaceRef, ApplicationError> {
        let project = Project::find_by_id(&self.pool, workspace.project_id)
            .await
            .map_err(internal_error)?
            .ok_or_else(|| ApplicationError::not_found("Automation project not found"))?;
        let root_folder_name = std::path::Path::new(&workspace.root_folder)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| ApplicationError::conflict("Automation workspace root is not portable"))?
            .to_string();
        Ok(PortableWorkspaceRef {
            project_name: project.name,
            root_folder_name,
            branch: workspace.branch.clone(),
            isolation: workspace.isolation.clone(),
        })
    }

    async fn resolve_portable_workspace(
        &self,
        reference: &PortableWorkspaceRef,
    ) -> Result<WorkspaceTarget, ApplicationError> {
        let projects = Project::find_all(&self.pool)
            .await
            .map_err(internal_error)?;
        let matches = projects
            .into_iter()
            .filter(|project| project.name == reference.project_name)
            .collect::<Vec<_>>();
        let [project] = matches.as_slice() else {
            return Err(ApplicationError::conflict(format!(
                "Project `{}` is missing or ambiguous",
                reference.project_name
            )));
        };
        let repos = ProjectRepo::find_repos_for_project(&self.pool, project.id)
            .await
            .map_err(internal_error)?;
        let roots = repos
            .into_iter()
            .filter(|repo| {
                repo.name == reference.root_folder_name
                    || std::path::Path::new(&repo.path)
                        .file_name()
                        .and_then(|name| name.to_str())
                        == Some(reference.root_folder_name.as_str())
            })
            .collect::<Vec<_>>();
        let [repo] = roots.as_slice() else {
            return Err(ApplicationError::conflict(format!(
                "Workspace root `{}` is missing or ambiguous in project `{}`",
                reference.root_folder_name, reference.project_name
            )));
        };
        Ok(WorkspaceTarget {
            project_id: project.id,
            root_folder: repo.path.to_string_lossy().into_owned(),
            branch: reference.branch.clone(),
            isolation: reference.isolation.clone(),
        })
    }

    async fn delegation_cancel(&self, args: Value) -> Result<Value, ApplicationError> {
        let args: DelegationCancelArgs = parse(args)?;
        ConversationSessionService::new(self.conversations.clone())
            .cancel_turn(
                args.child_conversation_id,
                Some("delegation cancelled remotely".to_string()),
            )
            .await
            .map_err(internal_error)?;
        Ok(Value::Null)
    }

    async fn normalize_draft(
        &self,
        input: AutomationDraftRequest,
    ) -> Result<AutomationDraft, ApplicationError> {
        let mut launch = input.launch.0;
        launch.workspace.root_folder =
            ProjectRepo::find_repos_for_project(&self.pool, launch.workspace.project_id)
                .await
                .map_err(internal_error)?
                .into_iter()
                .next()
                .map(|repo| repo.path.to_string_lossy().to_string())
                .ok_or_else(|| ApplicationError::bad_request("project has no repository"))?;
        launch.workspace.branch = launch
            .workspace
            .branch
            .map(|branch| branch.trim().to_string())
            .filter(|branch| !branch.is_empty());
        let draft = AutomationDraft {
            name: input.name,
            enabled: input.enabled,
            trigger: input.trigger,
            launch: AutomationDraftInput(launch),
        };
        TurnLaunchSpec::from_automation_draft(draft.launch.clone())
            .map_err(|error| ApplicationError::bad_request(format!("{}: {error}", error.code())))?;
        Ok(draft)
    }

}

#[async_trait]
impl ApplicationDomainPort for ServerApplicationDomains {
    async fn execute(
        &self,
        _principal: &Principal,
        command: DomainCommand,
        args: Value,
    ) -> Result<Value, ApplicationError> {
        self.execute_command(command, args).await
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginEnabledArgs {
    plugin_id: String,
    enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginIdentityArgs {
    plugin_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginConfigArgs {
    plugin_id: String,
    config: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginGrantPermissionsArgs {
    plugin_id: String,
    permission_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginRuntimeArgs {
    plugin_id: String,
    runtime_id: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveFileOpenerArgs {
    extension: Option<String>,
    media_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginFilePreviewArgs {
    file_path: String,
    #[serde(default)]
    lease_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginFilePreviewRenewArgs {
    lease_id: Uuid,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactListArgs {
    conversation_id: Option<Uuid>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactIdArgs {
    artifact_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeaseIdArgs {
    lease_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutomationDraftRequest {
    name: String,
    enabled: bool,
    trigger: ScheduleSpec,
    launch: AutomationDraftInput,
}

#[derive(Deserialize)]
struct AutomationInputArgs {
    input: AutomationDraftRequest,
}

#[derive(Deserialize)]
struct WorkflowAutomationInputArgs {
    input: WorkflowAutomationDraft,
}

#[derive(Deserialize)]
struct AutomationUpdateArgs {
    id: Uuid,
    input: AutomationDraftRequest,
}

#[derive(Deserialize)]
struct AutomationEnabledArgs {
    id: Uuid,
    enabled: bool,
}

#[derive(Deserialize)]
struct AutomationImportArgs {
    json: String,
}

#[derive(Deserialize)]
struct IdArgs {
    id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoIdArgs {
    repo_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentIdArgs {
    agent_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSkillsArgs {
    agent_type: String,
    workspace_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunIdArgs {
    run_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutomationRunsArgs {
    automation_id: Uuid,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct PreviewRunsArgs {
    cron: String,
    timezone: String,
    count: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DelegationCancelArgs {
    child_conversation_id: Uuid,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AutomationView {
    id: Uuid,
    name: String,
    enabled: bool,
    spec_version: u16,
    trigger: ScheduleSpec,
    next_run_at: Option<DateTime<Utc>>,
    target: AutomationTarget,
    launch: Option<TurnLaunchSpec>,
    migration_required: bool,
    unseen_failure_count: i64,
    last_run_status: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AutomationRunView {
    id: Uuid,
    automation_id: Uuid,
    trigger: String,
    scheduled_for: Option<DateTime<Utc>>,
    status: &'static str,
    cancellation_requested: bool,
    conversation_id: Option<Uuid>,
    turn_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
    workflow_run_id: Option<Uuid>,
    stop_reason: Option<String>,
    summary: Option<String>,
    error: Option<String>,
    seen: bool,
    started_at: DateTime<Utc>,
    finished_at: Option<DateTime<Utc>>,
}

fn automation_view(record: AutomationRecord) -> AutomationView {
    let launch = match &record.target {
        AutomationTarget::Turn(spec) => Some(spec.clone()),
        AutomationTarget::Workflow(_) => None,
    };
    AutomationView {
        id: record.id,
        name: record.name,
        enabled: record.enabled,
        spec_version: record.spec_version,
        trigger: record.trigger,
        next_run_at: record.next_run_at,
        target: record.target,
        launch,
        migration_required: record.legacy_migration_status == "migration_required",
        unseen_failure_count: record.unseen_failure_count,
        last_run_status: record.last_run_status,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn automation_run_view(run: AutomationRunRecord) -> AutomationRunView {
    AutomationRunView {
        id: run.snapshot.run_id,
        automation_id: run.snapshot.automation_id,
        trigger: run.trigger,
        scheduled_for: run.scheduled_for,
        status: match run.snapshot.status {
            RunStatus::Running => "running",
            RunStatus::Completed => "completed",
            RunStatus::Failed => "failed",
            RunStatus::Cancelled => "cancelled",
            RunStatus::Interrupted => "interrupted",
            RunStatus::Skipped => "skipped",
        },
        cancellation_requested: run.snapshot.cancellation_requested,
        conversation_id: run.snapshot.conversation_id,
        turn_id: run.snapshot.turn_id,
        workspace_id: run.snapshot.workspace_id,
        workflow_run_id: run.workflow_run_id,
        stop_reason: run.stop_reason,
        summary: run.summary,
        error: run.snapshot.error,
        seen: run.seen,
        started_at: run.started_at,
        finished_at: run.finished_at,
    }
}

pub(crate) fn parse<T: DeserializeOwned>(value: Value) -> Result<T, ApplicationError> {
    application::decode_command_args(value).map_err(ApplicationError::bad_request)
}

pub(crate) fn serialize(value: impl Serialize) -> Result<Value, ApplicationError> {
    serde_json::to_value(value).map_err(internal_error)
}

pub(crate) fn internal_error(error: impl std::fmt::Display) -> ApplicationError {
    ApplicationError::internal(error.to_string())
}

fn store_error(error: sqlx::Error) -> ApplicationError {
    match error {
        sqlx::Error::RowNotFound => ApplicationError::not_found("record not found"),
        other => internal_error(other),
    }
}

fn conversation_error(error: conversations::ConversationServiceError) -> ApplicationError {
    match error {
        conversations::ConversationServiceError::NotFound(message) => {
            ApplicationError::not_found(message)
        }
        conversations::ConversationServiceError::BadRequest(message) => {
            ApplicationError::bad_request(message)
        }
        conversations::ConversationServiceError::Conflict(message) => {
            ApplicationError::conflict(message)
        }
        conversations::ConversationServiceError::AuthenticationRequired(message)
        | conversations::ConversationServiceError::SessionUnavailable { message, .. } => {
            ApplicationError::bad_request(message)
        }
        conversations::ConversationServiceError::Internal(message) => {
            ApplicationError::internal(message)
        }
    }
}
