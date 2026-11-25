//! Manual background imitate-analysis for local book directories.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
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
    ImitateCards, ImitatePhase, ImitateStatus, STEP_AGENT_RUNNING, STEP_HOST_EXTRACT,
    STEP_PARSE_SAVE, STEP_QUEUED, STEP_START_AGENT, STEP_TOTAL, apply_seed_to_project,
    build_analysis_prompt, parse_imitate_cards_json, prepare_analysis_pack, read_cards,
    read_status, recover_cards_from_raw, resolve_book_dir_for_imitate, write_cards, write_status,
};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{
    conversation_service::{ConversationSessionService, ConversationStartTurnInput},
    state::AppState,
};

const CANCELLED_MSG: &str = "已中断";

const LIBRARY_IMITATE_ORIGIN: &str = "library_imitate";
const PROJECT_NAME: &str = "Library Imitate";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const MAX_WAIT: Duration = Duration::from_secs(60 * 20);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImitateStatusView {
    pub phase: String,
    pub step: Option<u32>,
    pub step_total: Option<u32>,
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
            step: status.step,
            step_total: status.step_total,
            progress: status.progress,
            error: status.error,
            updated_at: status.updated_at,
            conversation_id: status.conversation_id,
        }
    }
}

fn format_elapsed(elapsed: Duration) -> String {
    let secs = elapsed.as_secs();
    let mins = secs / 60;
    let rem = secs % 60;
    if mins == 0 {
        format!("{rem}秒")
    } else {
        format!("{mins}分{rem:02}秒")
    }
}

struct ImitateJobHandle {
    cancel: CancellationToken,
    conversation_id: Mutex<Option<Uuid>>,
}

#[derive(Default)]
pub struct ImitateJobRegistry {
    jobs: Mutex<HashMap<String, Arc<ImitateJobHandle>>>,
}

impl ImitateJobRegistry {
    async fn try_begin(&self, path: &str) -> Option<Arc<ImitateJobHandle>> {
        let mut guard = self.jobs.lock().await;
        if guard.contains_key(path) {
            return None;
        }
        let handle = Arc::new(ImitateJobHandle {
            cancel: CancellationToken::new(),
            conversation_id: Mutex::new(None),
        });
        guard.insert(path.to_string(), handle.clone());
        Some(handle)
    }

    async fn finish(&self, path: &str) {
        self.jobs.lock().await.remove(path);
    }

    async fn request_cancel(&self, path: &str) -> Option<Arc<ImitateJobHandle>> {
        let guard = self.jobs.lock().await;
        let handle = guard.get(path)?.clone();
        handle.cancel.cancel();
        Some(handle)
    }
}

#[tauri::command]
pub async fn library_imitate_status(path: String) -> Result<LibraryImitateStatusView, String> {
    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    let status = read_status(&book_dir).map_err(|e| e.to_string())?;
    Ok(status.into())
}

#[tauri::command]
pub async fn library_imitate_pack(path: String) -> Result<ImitateCards, String> {
    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || read_cards(&book_dir))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Re-parse saved Agent output without re-running the expensive analysis turn.
#[tauri::command]
pub async fn library_imitate_recover(path: String) -> Result<LibraryImitateStatusView, String> {
    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking({
        let book_dir = book_dir.clone();
        move || recover_cards_from_raw(&book_dir)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let completed = ImitateStatus::with_step(
        ImitatePhase::Completed,
        STEP_PARSE_SAVE,
        "已从原文重新解析",
        None,
    );
    write_status(&book_dir, &completed).map_err(|e| e.to_string())?;
    Ok(completed.into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImitateSeedResult {
    pub project_path: String,
    pub project_id: String,
    pub title: String,
}

/// Create a new novel project folder seeded from the deep-analysis pack
/// (storyline + character cards + craft engines — not style samples).
#[tauri::command]
pub async fn library_imitate_seed_project(
    state: State<'_, AppState>,
    path: String,
    parent_dir: String,
    new_title: String,
) -> Result<LibraryImitateSeedResult, String> {
    let title = new_title.trim().to_string();
    if title.is_empty() {
        return Err("请填写新书标题".into());
    }
    let parent = PathBuf::from(parent_dir.trim());
    if !parent.is_dir() {
        return Err(format!("父目录不存在: {}", parent.display()));
    }

    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    let folder_name = sanitize_folder_name(&title);
    let project_path = parent.join(&folder_name);
    if project_path.exists() {
        return Err(format!("目标已存在: {}", project_path.display()));
    }

    let project_path_for_job = project_path.clone();
    let book_dir_for_job = book_dir.clone();
    let title_for_job = title.clone();
    tokio::task::spawn_blocking(move || {
        fs::create_dir_all(&project_path_for_job)
            .map_err(|e| format!("创建目录失败: {e}"))?;
        ensure_git_repo(&project_path_for_job)?;
        apply_seed_to_project(&book_dir_for_job, &project_path_for_job, &title_for_job)
            .map_err(|e| e.to_string())?;
        write_seed_project_stubs(&project_path_for_job, &title_for_job)?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    let create = CreateProject {
        name: title.clone(),
        repositories: vec![db::models::project_repo::CreateProjectRepo {
            display_name: title.clone(),
            git_repo_path: project_path.to_string_lossy().into_owned(),
        }],
    };
    let project = state
        .deployment
        .project()
        .create_project(
            &state.deployment.db().pool,
            state.deployment.repo(),
            create,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(LibraryImitateSeedResult {
        project_path: project_path.to_string_lossy().into_owned(),
        project_id: project.id.to_string(),
        title,
    })
}

fn sanitize_folder_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "untitled-novel".into()
    } else {
        trimmed.to_string()
    }
}

fn write_seed_project_stubs(project_repo: &Path, title: &str) -> Result<(), String> {
    let meta = project_repo.join(".cinyuverse");
    let project_json = serde_json::json!({
        "name": title,
        "kind": "novel",
        "seededFrom": "library_imitate_v3"
    });
    fs::write(
        meta.join("project.json"),
        serde_json::to_string_pretty(&project_json).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let claude = format!(
        "# {title}\n\n本项目由书库深度分析包生成。\n\n\
         - 故事线：`.cinyuverse/outline.md`\n\
         - 人物卡：`.cinyuverse/characters/`\n\
         - 写法引擎：`.cinyuverse/writing-rules.md`\n\
         - 反抄袭：`.cinyuverse/anti-plagiarism.md`\n\n\
         **禁止**把原书正文当仿写范文。\n"
    );
    fs::write(meta.join("CLAUDE.md"), claude).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn library_start_imitate_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<LibraryImitateStatusView, String> {
    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    let path_key = book_dir.to_string_lossy().into_owned();

    let Some(job) = state.imitate_jobs.try_begin(&path_key).await else {
        return Err("该书正在分析中".into());
    };

    let queued = ImitateStatus::with_step(ImitatePhase::Queued, STEP_QUEUED, "已排队", None);
    if let Err(error) = write_status(&book_dir, &queued) {
        state.imitate_jobs.finish(&path_key).await;
        return Err(error.to_string());
    }

    let app_handle = app.clone();
    let path_for_job = path_key.clone();
    let job_for_run = job.clone();
    tokio::spawn(async move {
        let result =
            run_imitate_job(app_handle.clone(), PathBuf::from(&path_for_job), job_for_run).await;
        if let Some(state) = app_handle.try_state::<AppState>() {
            state.imitate_jobs.finish(&path_for_job).await;
        }
        match result {
            Ok(()) => {}
            Err(error) if error == CANCELLED_MSG => {
                let _ = write_status(
                    Path::new(&path_for_job),
                    &ImitateStatus {
                        phase: ImitatePhase::Idle,
                        step: None,
                        step_total: Some(STEP_TOTAL),
                        progress: Some(CANCELLED_MSG.into()),
                        error: None,
                        updated_at: tomato_now(),
                        conversation_id: None,
                    },
                );
            }
            Err(error) => {
                tracing::warn!(%error, path = %path_for_job, "library imitate analysis failed");
                let _ = write_status(
                    Path::new(&path_for_job),
                    &ImitateStatus {
                        phase: ImitatePhase::Failed,
                        step: None,
                        step_total: Some(STEP_TOTAL),
                        progress: None,
                        error: Some(error),
                        updated_at: tomato_now(),
                        conversation_id: None,
                    },
                );
            }
        }
    });

    Ok(queued.into())
}

#[tauri::command]
pub async fn library_cancel_imitate_analysis(
    state: State<'_, AppState>,
    path: String,
) -> Result<LibraryImitateStatusView, String> {
    let book_dir = resolve_book_dir_for_imitate(Path::new(&path)).map_err(|e| e.to_string())?;
    let path_key = book_dir.to_string_lossy().into_owned();

    let handle = state.imitate_jobs.request_cancel(&path_key).await;
    let status = read_status(&book_dir).map_err(|e| e.to_string())?;
    let conversation_id = match &handle {
        Some(job) => *job.conversation_id.lock().await,
        None => status
            .conversation_id
            .as_deref()
            .and_then(|id| Uuid::parse_str(id).ok()),
    };

    if let Some(conversation_id) = conversation_id {
        let service = ConversationSessionService::new(state.conversation_context());
        if let Err(error) = service
            .cancel_turn(conversation_id, Some(CANCELLED_MSG.to_string()))
            .await
        {
            tracing::warn!(
                %error,
                %conversation_id,
                "failed to cancel imitate analysis turn"
            );
        }
    }

    if handle.is_none()
        && !matches!(
            status.phase,
            ImitatePhase::Queued | ImitatePhase::Running
        )
    {
        return Err("当前没有进行中的分析".into());
    }

    let cancelled = ImitateStatus {
        phase: ImitatePhase::Idle,
        step: None,
        step_total: Some(STEP_TOTAL),
        progress: Some(CANCELLED_MSG.into()),
        error: None,
        updated_at: tomato_now(),
        conversation_id: None,
    };
    write_status(&book_dir, &cancelled).map_err(|e| e.to_string())?;
    Ok(cancelled.into())
}

fn tomato_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn ensure_not_cancelled(job: &ImitateJobHandle) -> Result<(), String> {
    if job.cancel.is_cancelled() {
        Err(CANCELLED_MSG.into())
    } else {
        Ok(())
    }
}

async fn run_imitate_job(
    app: AppHandle,
    book_dir: PathBuf,
    job: Arc<ImitateJobHandle>,
) -> Result<(), String> {
    let state = app
        .try_state::<AppState>()
        .ok_or_else(|| "AppState unavailable".to_string())?;

    ensure_not_cancelled(&job)?;
    write_status(
        &book_dir,
        &ImitateStatus::with_step(
            ImitatePhase::Running,
            STEP_HOST_EXTRACT,
            "抽取指纹与场景…",
            None,
        ),
    )
    .map_err(|e| e.to_string())?;

    let pack = tokio::task::spawn_blocking({
        let book_dir = book_dir.clone();
        move || prepare_analysis_pack(&book_dir)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    ensure_not_cancelled(&job)?;

    let agent_id = {
        let config = state.deployment.config().read().await;
        config.executor_profile.executor.clone()
    };

    write_status(
        &book_dir,
        &ImitateStatus::with_step(
            ImitatePhase::Running,
            STEP_START_AGENT,
            format!("启动 Agent（{}）…", agent_id.as_str()),
            None,
        ),
    )
    .map_err(|e| e.to_string())?;
    ensure_not_cancelled(&job)?;

    let (_project_id, workspace_id, _cwd) = ensure_library_imitate_workspace(&state).await?;
    ensure_not_cancelled(&job)?;

    let conversation_id = Uuid::new_v4();
    {
        let mut guard = job.conversation_id.lock().await;
        *guard = Some(conversation_id);
    }
    let title = format!("深度分析 · {}", pack.title);
    Session::create(
        &state.deployment.db().pool,
        &CreateSession {
            executor: Some(agent_id.as_str().to_string()),
            agent_id: Some(agent_id.clone()),
            task_id: None,
            name: Some(title),
            initial_prompt: Some("深度分析".into()),
            status: None,
        },
        conversation_id,
        workspace_id,
    )
    .await
    .map_err(|e| e.to_string())?;

    write_status(
        &book_dir,
        &ImitateStatus::with_step(
            ImitatePhase::Running,
            STEP_AGENT_RUNNING,
            "Agent 分析中…",
            Some(conversation_id.to_string()),
        ),
    )
    .map_err(|e| e.to_string())?;
    ensure_not_cancelled(&job)?;

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
                display_text: Some(format!("深度分析 · {}", pack.title)),
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
    let terminal_status =
        wait_for_turn(&service, turn_id, &job, &book_dir, conversation_id).await?;
    if terminal_status == "cancelled" || terminal_status == "interrupted" {
        return Err(CANCELLED_MSG.into());
    }
    if terminal_status != "completed" {
        return Err(format!("分析回合结束状态: {terminal_status}"));
    }
    ensure_not_cancelled(&job)?;

    write_status(
        &book_dir,
        &ImitateStatus::with_step(
            ImitatePhase::Running,
            STEP_PARSE_SAVE,
            "解析并落盘分析包…",
            Some(conversation_id.to_string()),
        ),
    )
    .map_err(|e| e.to_string())?;

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
        &ImitateStatus::with_step(
            ImitatePhase::Completed,
            STEP_PARSE_SAVE,
            "已拆出故事线 / 人物卡 / 写法引擎",
            Some(conversation_id.to_string()),
        ),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn wait_for_turn(
    service: &ConversationSessionService,
    turn_id: Uuid,
    job: &ImitateJobHandle,
    book_dir: &Path,
    conversation_id: Uuid,
) -> Result<String, String> {
    let started = tokio::time::Instant::now();
    loop {
        ensure_not_cancelled(job)?;
        let elapsed = started.elapsed();
        if elapsed > MAX_WAIT {
            return Err("分析超时".into());
        }
        let _ = write_status(
            book_dir,
            &ImitateStatus::with_step(
                ImitatePhase::Running,
                STEP_AGENT_RUNNING,
                format!("Agent 分析中… 已耗时 {}", format_elapsed(elapsed)),
                Some(conversation_id.to_string()),
            ),
        );
        let snapshot = service
            .turn_snapshot(turn_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "回合不存在".to_string())?;
        let status = snapshot.status;
        if status == "blocked" {
            return Err("分析被权限/提问阻塞，请在会话中处理后重试".into());
        }
        if !matches!(
            status.as_str(),
            "pending" | "queued" | "running" | "blocked"
        ) {
            return Ok(status);
        }
        tokio::select! {
            _ = job.cancel.cancelled() => return Err(CANCELLED_MSG.into()),
            _ = tokio::time::sleep(POLL_INTERVAL) => {}
        }
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
