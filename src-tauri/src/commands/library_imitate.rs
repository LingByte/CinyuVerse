//! Manual background imitate-analysis for local book directories.

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use db::models::{
    project::{CreateProject, Project},
    project_repo::ProjectRepo,
    repo::Repo,
    session::{CreateSession, Session},
    task::{CreateTask, Task},
    workspace::{CreateWorkspace, Workspace},
    workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tomato_library::{
    ImitatePhase, ImitateStatus, build_analysis_prompt, parse_imitate_cards_json,
    prepare_analysis_pack, read_status, resolve_book_dir_for_imitate, write_cards, write_status,
};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    conversation_service::{ConversationSessionService, ConversationStartTurnInput},
    state::AppState,
};

const LIBRARY_IMITATE_ORIGIN: &str = "library_imitate";
const PROJECT_NAME: &str = "Library Imitate";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const MAX_WAIT: Duration = Duration::from_secs(60 * 20);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImitateStatusView {
    pub phase: String,
    pub progress: Option<String>,
    pub error: Option<String>,
    pub updated_at: String,
    pub conversation_id: Option<String>,
}

impl From<ImitateStatus> for LibraryImitateStatusView {
    fn from(status: ImitateStatus) -> Self {
        Self {
            phase: match status.phase {
                ImitatePhase::Idle => "idle",
                ImitatePhase::Queued => "queued",
                ImitatePhase::Running => "running",
                ImitatePhase::Completed => "completed",
                ImitatePhase::Failed => "failed",
            }
            .into(),
            progress: status.progress,
            error: status.error,
            updated_at: status.updated_at,
            conversation_id: status.conversation_id,
        }
    }
}

#[derive(Default)]
pub struct ImitateJobRegistry {
    running: Mutex<HashSet<String>>,
}

impl ImitateJobRegistry {
    pub async fn try_begin(&self, path: &str) -> bool {
        let mut guard = self.running.lock().await;
        guard.insert(path.to_string())
    }

    pub async fn finish(&self, path: &str) {
        self.running.lock().await.remove(path);
    }
}

#[tauri::command]
pub async fn library_imitate_status(path: String) -> Result<LibraryImitateStatusView, String> {
    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    let status = read_status(&book_dir).map_err(|e| e.to_string())?;
    Ok(status.into())
}

#[tauri::command]
pub async fn library_start_imitate_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<LibraryImitateStatusView, String> {
    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    let path_key = book_dir.to_string_lossy().into_owned();

    if !state.imitate_jobs.try_begin(&path_key).await {
        return Err("该书正在分析中".into());
    }

    let queued = ImitateStatus {
        phase: ImitatePhase::Queued,
        progress: Some("已排队".into()),
        error: None,
        updated_at: tomato_now(),
        conversation_id: None,
    };
    write_status(&book_dir, &queued).map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    let path_for_job = path_key.clone();
    tokio::spawn(async move {
        let result = run_imitate_job(app_handle.clone(), PathBuf::from(&path_for_job)).await;
        if let Some(state) = app_handle.try_state::<AppState>() {
            state.imitate_jobs.finish(&path_for_job).await;
        }
        if let Err(error) = result {
            tracing::warn!(%error, path = %path_for_job, "library imitate analysis failed");
            let _ = write_status(
                Path::new(&path_for_job),
                &ImitateStatus {
                    phase: ImitatePhase::Failed,
                    progress: None,
                    error: Some(error),
                    updated_at: tomato_now(),
                    conversation_id: None,
                },
            );
        }
    });

    Ok(queued.into())
}

fn tomato_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

async fn run_imitate_job(app: AppHandle, book_dir: PathBuf) -> Result<(), String> {
    let state = app
        .try_state::<AppState>()
        .ok_or_else(|| "AppState unavailable".to_string())?;

    write_status(
        &book_dir,
        &ImitateStatus {
            phase: ImitatePhase::Running,
            progress: Some("抽取指纹与场景…".into()),
            error: None,
            updated_at: tomato_now(),
            conversation_id: None,
        },
    )
    .map_err(|e| e.to_string())?;

    let pack = tokio::task::spawn_blocking({
        let book_dir = book_dir.clone();
        move || prepare_analysis_pack(&book_dir)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let agent_id = {
        let config = state.deployment.config().read().await;
        config.executor_profile.executor.clone()
    };

    write_status(
        &book_dir,
        &ImitateStatus {
            phase: ImitatePhase::Running,
            progress: Some(format!("调用 Agent（{}）分析…", agent_id.as_str())),
            error: None,
            updated_at: tomato_now(),
            conversation_id: None,
        },
    )
    .map_err(|e| e.to_string())?;

    let (_project_id, workspace_id, _cwd) = ensure_library_imitate_workspace(&state).await?;

    let conversation_id = Uuid::new_v4();
    let title = format!("仿写分析 · {}", pack.title);
    Session::create(
        &state.deployment.db().pool,
        &CreateSession {
            executor: Some(agent_id.as_str().to_string()),
            agent_id: Some(agent_id.clone()),
            task_id: None,
            name: Some(title),
            initial_prompt: Some("仿写分析".into()),
            status: None,
        },
        conversation_id,
        workspace_id,
    )
    .await
    .map_err(|e| e.to_string())?;

    write_status(
        &book_dir,
        &ImitateStatus {
            phase: ImitatePhase::Running,
            progress: Some("Agent 分析中…".into()),
            error: None,
            updated_at: tomato_now(),
            conversation_id: Some(conversation_id.to_string()),
        },
    )
    .map_err(|e| e.to_string())?;

    let prompt = build_analysis_prompt(&pack);
    let service = ConversationSessionService::new(state.conversation_context());
    let (turn, _) = service
        .start_turn_with_origin(
            ConversationStartTurnInput {
                agent_id: agent_id.clone(),
                workspace_id,
                conversation_id,
                executor_profile_id: None,
                text: prompt,
                display_text: Some(format!("仿写分析 · {}", pack.title)),
                images: Vec::new(),
                mode_override: None,
                config_overrides: Vec::new(),
                workflow_refs: Vec::new(),
                file_refs: Vec::new(),
                queued_input_claim: None,
                operation_id: None,
            },
            LIBRARY_IMITATE_ORIGIN,
        )
        .await
        .map_err(|e| e.to_string())?;

    let turn_id = turn.turn_id;
    let terminal_status = wait_for_turn(&service, turn_id).await?;
    if terminal_status != "completed" {
        return Err(format!("分析回合结束状态: {terminal_status}"));
    }

    let assistant = extract_assistant_text(&state.deployment.db().pool, conversation_id, turn_id)
        .await
        .map_err(|e| e.to_string())?;
    let raw_path = tomato_library::imitate_root(&book_dir).join("raw_assistant.txt");
    let _ = fs::write(&raw_path, &assistant);
    let cards = parse_imitate_cards_json(&assistant).map_err(|e| {
        format!("{e}（已保存原文到 {}）", raw_path.display())
    })?;
    write_cards(
        &book_dir,
        &cards,
        agent_id.as_str(),
        Some(&conversation_id.to_string()),
    )
    .map_err(|e| e.to_string())?;

    write_status(
        &book_dir,
        &ImitateStatus {
            phase: ImitatePhase::Completed,
            progress: Some("分析完成".into()),
            error: None,
            updated_at: tomato_now(),
            conversation_id: Some(conversation_id.to_string()),
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn wait_for_turn(
    service: &ConversationSessionService,
    turn_id: Uuid,
) -> Result<String, String> {
    let started = tokio::time::Instant::now();
    loop {
        if started.elapsed() > MAX_WAIT {
            return Err("分析超时".into());
        }
        let snapshot = service
            .turn_snapshot(turn_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "回合不存在".to_string())?;
        let status = snapshot.status;
        if !matches!(
            status.as_str(),
            "pending" | "queued" | "running" | "blocked"
        ) {
            return Ok(status);
        }
        if status == "blocked" {
            return Err("分析被权限/提问阻塞，请在会话中处理后重试".into());
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn extract_assistant_text(
    pool: &sqlx::SqlitePool,
    conversation_id: Uuid,
    turn_id: Uuid,
) -> Result<String, String> {
    let events = sqlx::query_as::<_, (i64, String, String)>(
        "SELECT sequence, event_kind, normalized_json
         FROM conversation_events
         WHERE conversation_id = ? AND turn_id = ?
         ORDER BY sequence",
    )
    .bind(conversation_id)
    .bind(turn_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let boundary = events
        .iter()
        .filter(|(_, kind, _)| {
            matches!(
                kind.as_str(),
                "assistant_reasoning_delta" | "tool_call_upsert" | "plan_updated"
            )
        })
        .map(|(sequence, _, _)| *sequence)
        .max()
        .unwrap_or(i64::MIN);
    let text = events
        .iter()
        .filter(|(sequence, kind, _)| *sequence > boundary && kind == "assistant_text_delta")
        .filter_map(|(_, _, normalized)| {
            serde_json::from_str::<serde_json::Value>(normalized)
                .ok()?
                .get("text")?
                .as_str()
                .map(str::to_owned)
        })
        .collect::<String>();
    if text.trim().is_empty() {
        return Err("Agent 未产出可用文本".into());
    }
    Ok(text)
}

async fn ensure_library_imitate_workspace(
    state: &AppState,
) -> Result<(Uuid, Uuid, PathBuf), String> {
    let cwd = library_imitate_cwd()?;
    fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
    ensure_git_repo(&cwd)?;

    let pool = &state.deployment.db().pool;
    let cwd_str = cwd.to_string_lossy().to_string();

    let project = {
        let existing = Project::find_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|p| p.name == PROJECT_NAME);
        if let Some(project) = existing {
            project
        } else {
            Project::create(
                pool,
                &CreateProject {
                    name: PROJECT_NAME.into(),
                    repositories: Vec::new(),
                },
                Uuid::new_v4(),
            )
            .await
            .map_err(|e| e.to_string())?
        }
    };

    let repo = Repo::find_or_create(pool, &cwd, PROJECT_NAME)
        .await
        .map_err(|e| e.to_string())?;
    match ProjectRepo::add_repo_to_project(pool, project.id, &cwd_str, PROJECT_NAME).await {
        Ok(_) => {}
        Err(db::models::project_repo::ProjectRepoError::AlreadyExists) => {}
        Err(error) => return Err(error.to_string()),
    }

    let workspaces = Workspace::fetch_by_project_id(pool, project.id)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(workspace) = workspaces.into_iter().find(|workspace| {
        workspace.container_ref.as_deref() == Some(cwd_str.as_str())
            || workspace.agent_working_dir.as_deref() == Some(cwd_str.as_str())
    }) {
        return Ok((project.id, workspace.id, cwd));
    }

    let task = Task::create(
        pool,
        &CreateTask::from_title_description(project.id, "仿写分析".into(), None),
        Uuid::new_v4(),
    )
    .await
    .map_err(|e| e.to_string())?;

    let workspace = Workspace::create(
        pool,
        &CreateWorkspace {
            project_id: project.id,
            parent_workspace_id: None,
            branch: "main".into(),
            container_ref: Some(cwd_str.clone()),
            use_worktree: false,
            agent_working_dir: Some(cwd_str),
        },
        Uuid::new_v4(),
        task.id,
    )
    .await
    .map_err(|e| e.to_string())?;

    WorkspaceRepo::create_many(
        pool,
        workspace.id,
        &[CreateWorkspaceRepo {
            repo_id: repo.id,
            target_branch: "main".into(),
        }],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok((project.id, workspace.id, cwd))
}

fn library_imitate_cwd() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "无法解析用户目录".to_string())?;
    Ok(home.join(".cinyuverse").join("library-imitate").join("cwd"))
}

fn ensure_git_repo(cwd: &Path) -> Result<(), String> {
    if cwd.join(".git").exists() {
        return Ok(());
    }
    let status = Command::new("git")
        .args(["init"])
        .current_dir(cwd)
        .status()
        .map_err(|e| format!("git init 失败: {e}"))?;
    if !status.success() {
        return Err("git init 失败".into());
    }
    // Create an initial commit so some agents accept the repo.
    let _ = Command::new("git")
        .args(["-C"])
        .arg(cwd)
        .args(["commit", "--allow-empty", "-m", "library imitate workspace"])
        .status();
    Ok(())
}
