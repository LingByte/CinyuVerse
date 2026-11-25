use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use db::models::{
    project::{
        CreateProject, Project, ProjectError, RenameProjectWork, SearchMatchType, SearchResult,
        UpdateProject,
    },
    project_repo::{CreateProjectRepo, ProjectRepo},
    repo::Repo,
    workspace::Workspace,
};
use git::GitCli;
use sqlx::SqlitePool;
use thiserror::Error;
use utils::path::normalize_windows_extended_path_prefix;
use uuid::Uuid;

use super::{
    file_search::{FileSearchService, SearchQuery},
    repo::{RepoError, RepoService},
};

#[derive(Debug, Error)]
pub enum ProjectServiceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Project(#[from] ProjectError),
    #[error("Path does not exist: {0}")]
    PathNotFound(PathBuf),
    #[error("Path is not a directory: {0}")]
    PathNotDirectory(PathBuf),
    #[error("Path is not a git repository: {0}")]
    NotGitRepository(PathBuf),
    #[error("Duplicate git repository path")]
    DuplicateGitRepoPath,
    #[error("Duplicate repository name in project")]
    DuplicateRepositoryName,
    #[error("Repository not found")]
    RepositoryNotFound,
    #[error("Git operation failed: {0}")]
    GitError(String),
    #[error("Project must have exactly one repository to rename its folder")]
    UnsupportedRepositoryCount,
    #[error("Invalid project name for folder rename")]
    InvalidFolderName,
    #[error("Target folder already exists: {0}")]
    TargetFolderExists(PathBuf),
    #[error(transparent)]
    Workspace(#[from] db::models::workspace::WorkspaceError),
}

pub type Result<T> = std::result::Result<T, ProjectServiceError>;

impl From<RepoError> for ProjectServiceError {
    fn from(e: RepoError) -> Self {
        match e {
            RepoError::PathNotFound(p) => Self::PathNotFound(p),
            RepoError::PathNotDirectory(p) => Self::PathNotDirectory(p),
            RepoError::NotGitRepository(p) => Self::NotGitRepository(p),
            RepoError::Io(e) => Self::Io(e),
            RepoError::Database(e) => Self::Database(e),
            _ => Self::RepositoryNotFound,
        }
    }
}

#[derive(Clone, Default)]
pub struct ProjectService;

impl ProjectService {
    pub fn new() -> Self {
        Self
    }

    pub async fn create_project(
        &self,
        pool: &SqlitePool,
        repo_service: &RepoService,
        payload: CreateProject,
    ) -> Result<Project> {
        // Validate all repository paths and check for duplicates within the payload
        let mut seen_names = HashSet::new();
        let mut seen_paths = HashSet::new();
        let mut normalized_repos = Vec::new();

        for repo in &payload.repositories {
            let path = repo_service.normalize_path(&repo.git_repo_path)?;
            let repo_path = repo_service.resolve_git_repo_path(&path)?;

            let normalized_path = normalize_windows_extended_path_prefix(&repo_path)
                .to_string_lossy()
                .to_string();

            if !seen_names.insert(repo.display_name.clone()) {
                return Err(ProjectServiceError::DuplicateRepositoryName);
            }

            if !seen_paths.insert(normalized_path.clone()) {
                return Err(ProjectServiceError::DuplicateGitRepoPath);
            }

            normalized_repos.push(CreateProjectRepo {
                display_name: repo.display_name.clone(),
                git_repo_path: normalized_path,
            });
        }

        let id = Uuid::new_v4();

        let project = Project::create(pool, &payload, id)
            .await
            .map_err(|e| ProjectServiceError::Project(ProjectError::CreateFailed(e.to_string())))?;

        for repo in &normalized_repos {
            let repo_entity =
                Repo::find_or_create(pool, Path::new(&repo.git_repo_path), &repo.display_name)
                    .await?;
            ProjectRepo::create(pool, project.id, repo_entity.id).await?;
        }

        Ok(project)
    }

    pub async fn update_project(
        &self,
        pool: &SqlitePool,
        existing: &Project,
        payload: UpdateProject,
    ) -> Result<Project> {
        let project = Project::update(pool, existing.id, &payload).await?;

        Ok(project)
    }

    /// Rename a single-repo project and, when needed, its on-disk folder.
    ///
    /// Agents and UI must use this instead of shell/`move_item` renames so
    /// `repos.path` and workspace container refs stay consistent.
    pub async fn rename_project_work(
        &self,
        pool: &SqlitePool,
        existing: &Project,
        payload: RenameProjectWork,
    ) -> Result<Project> {
        let new_name = payload.new_name.trim().to_string();
        if new_name.is_empty() {
            return Err(ProjectServiceError::InvalidFolderName);
        }

        let folder_name = to_folder_name(&new_name);
        if folder_name.is_empty()
            || folder_name == "."
            || folder_name == ".."
            || folder_name.contains('/')
            || folder_name.contains('\\')
        {
            return Err(ProjectServiceError::InvalidFolderName);
        }

        let repositories = self.get_repositories(pool, existing.id).await?;
        if repositories.len() != 1 {
            return Err(ProjectServiceError::UnsupportedRepositoryCount);
        }
        let repo = &repositories[0];

        let old_path = normalize_windows_extended_path_prefix(&repo.path);
        if !old_path.exists() {
            return Err(ProjectServiceError::PathNotFound(old_path));
        }
        if !old_path.is_dir() {
            return Err(ProjectServiceError::PathNotDirectory(old_path));
        }

        let parent = old_path
            .parent()
            .ok_or_else(|| ProjectServiceError::InvalidFolderName)?;
        let new_path = normalize_windows_extended_path_prefix(&parent.join(&folder_name));
        let folder_changed = old_path != new_path;

        if folder_changed {
            if new_path.exists() {
                return Err(ProjectServiceError::TargetFolderExists(new_path));
            }

            fs::rename(&old_path, &new_path)?;

            if let Err(error) = repair_repo_after_rename(&new_path) {
                let _ = fs::rename(&new_path, &old_path);
                return Err(error);
            }

            match apply_renamed_repo_db(
                pool,
                existing.id,
                repo.id,
                &old_path,
                &new_path,
                &folder_name,
                &new_name,
            )
            .await
            {
                Ok(project) => {
                    update_cinyuverse_book_name(&new_path, &new_name);
                    return Ok(project);
                }
                Err(error) => {
                    let _ = fs::rename(&new_path, &old_path);
                    let _ = repair_repo_after_rename(&old_path);
                    return Err(error);
                }
            }
        }

        Repo::update_name(pool, repo.id, &folder_name, &new_name).await?;
        update_cinyuverse_book_name(&old_path, &new_name);

        let project = Project::update(
            pool,
            existing.id,
            &UpdateProject {
                name: Some(new_name),
                default_main_branch: None,
            },
        )
        .await?;

        Ok(project)
    }

    pub async fn add_repository(
        &self,
        pool: &SqlitePool,
        repo_service: &RepoService,
        project_id: Uuid,
        payload: &CreateProjectRepo,
    ) -> Result<Repo> {
        tracing::debug!(
            "Adding repository '{}' to project {} (path: {})",
            payload.display_name,
            project_id,
            payload.git_repo_path
        );

        let path = repo_service.normalize_path(&payload.git_repo_path)?;
        let repo_path = repo_service.resolve_git_repo_path(&path)?;
        let normalized_repo_path = normalize_windows_extended_path_prefix(&repo_path)
            .to_string_lossy()
            .to_string();

        let repository = ProjectRepo::add_repo_to_project(
            pool,
            project_id,
            &normalized_repo_path,
            &payload.display_name,
        )
        .await
        .map_err(|e| match e {
            db::models::project_repo::ProjectRepoError::AlreadyExists => {
                ProjectServiceError::DuplicateGitRepoPath
            }
            db::models::project_repo::ProjectRepoError::Database(e) => {
                ProjectServiceError::Database(e)
            }
            _ => ProjectServiceError::RepositoryNotFound,
        })?;

        tracing::info!(
            "Added repository {} to project {} (path: {})",
            repository.id,
            project_id,
            repository.path.display()
        );

        Ok(repository)
    }

    pub async fn delete_repository(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<()> {
        tracing::debug!(
            "Removing repository {} from project {}",
            repo_id,
            project_id
        );

        ProjectRepo::remove_repo_from_project(pool, project_id, repo_id)
            .await
            .map_err(|e| match e {
                db::models::project_repo::ProjectRepoError::NotFound => {
                    ProjectServiceError::RepositoryNotFound
                }
                db::models::project_repo::ProjectRepoError::Database(e) => {
                    ProjectServiceError::Database(e)
                }
                _ => ProjectServiceError::RepositoryNotFound,
            })?;

        if let Err(e) = Repo::delete_orphaned(pool).await {
            tracing::error!("Failed to delete orphaned repos: {}", e);
        }

        tracing::info!("Removed repository {} from project {}", repo_id, project_id);

        Ok(())
    }

    pub async fn delete_project(&self, pool: &SqlitePool, project_id: Uuid) -> Result<u64> {
        let rows_affected = Project::delete(pool, project_id).await?;

        if let Err(e) = Repo::delete_orphaned(pool).await {
            tracing::error!("Failed to delete orphaned repos: {}", e);
        }

        Ok(rows_affected)
    }

    pub async fn get_repositories(&self, pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Repo>> {
        let repos = ProjectRepo::find_repos_for_project(pool, project_id).await?;
        Ok(repos)
    }

    pub async fn search_files(
        &self,
        file_search: &FileSearchService,
        repositories: &[Repo],
        query: &SearchQuery,
    ) -> Result<Vec<SearchResult>> {
        let query_str = query.q.trim();
        if query_str.is_empty() || repositories.is_empty() {
            return Ok(vec![]);
        }

        // Search in parallel and prefix paths with repo name
        let search_futures: Vec<_> = repositories
            .iter()
            .map(|repo| {
                let repo_name = repo.name.clone();
                let repo_path = repo.path.clone();
                let mode = query.mode.clone();
                let query_str = query_str.to_string();
                async move {
                    let results = file_search
                        .search_repo(&repo_path, &query_str, mode)
                        .await?;
                    Ok::<_, String>((repo_name, results))
                }
            })
            .collect();

        let repo_results = futures::future::try_join_all(search_futures)
            .await
            .map_err(ProjectServiceError::GitError)?;

        let mut all_results: Vec<SearchResult> = repo_results
            .into_iter()
            .flat_map(|(repo_name, results)| {
                results.into_iter().map(move |r| SearchResult {
                    path: format!("{}/{}", repo_name, r.path),
                    is_file: r.is_file,
                    match_type: r.match_type.clone(),
                    score: r.score,
                })
            })
            .collect();

        all_results.sort_by(|a, b| {
            let priority = |m: &SearchMatchType| match m {
                SearchMatchType::FileName => 0,
                SearchMatchType::DirectoryName => 1,
                SearchMatchType::FullPath => 2,
            };
            priority(&a.match_type)
                .cmp(&priority(&b.match_type))
                .then_with(|| b.score.cmp(&a.score)) // Higher scores first
        });

        all_results.truncate(10);
        Ok(all_results)
    }
}

pub fn to_folder_name(project_name: &str) -> String {
    project_name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if (c as u32) < 32 => '-',
            c => c,
        })
        .collect::<String>()
        .trim()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['.', ' '])
        .to_string()
}

pub fn rewrite_path_prefix(path: &str, old_prefix: &Path, new_prefix: &Path) -> Option<String> {
    let old_prefix = normalize_windows_extended_path_prefix(old_prefix);
    let new_prefix = normalize_windows_extended_path_prefix(new_prefix);
    let current = normalize_windows_extended_path_prefix(Path::new(path));

    if current == old_prefix {
        return Some(new_prefix.to_string_lossy().to_string());
    }

    let old_prefix_str = old_prefix.to_string_lossy();
    let current_str = current.to_string_lossy();
    let separators = ['/', '\\'];
    for separator in separators {
        let bordered = format!("{old_prefix_str}{separator}");
        if let Some(suffix) = current_str.strip_prefix(&bordered) {
            let mut rewritten = new_prefix.to_path_buf();
            rewritten.push(suffix);
            return Some(
                normalize_windows_extended_path_prefix(&rewritten)
                    .to_string_lossy()
                    .to_string(),
            );
        }
    }

    None
}

fn repair_repo_after_rename(repo_path: &Path) -> Result<()> {
    GitCli::new()
        .git(repo_path, ["worktree", "repair"])
        .map(|_| ())
        .or_else(|error| {
            // No linked worktrees / older git: rename of the main checkout is still valid.
            let message = error.to_string();
            if message.contains("repair") || message.contains("unknown command") {
                Ok(())
            } else {
                // `worktree repair` may fail on repos with no worktrees depending on git version;
                // treat soft failures as success when the repo itself still opens.
                match GitCli::new().git(repo_path, ["rev-parse", "--is-inside-work-tree"]) {
                    Ok(_) => Ok(()),
                    Err(_) => Err(ProjectServiceError::GitError(message)),
                }
            }
        })
}

/// Atomically rewrite repo + workspace path rows after a successful on-disk rename.
async fn apply_renamed_repo_db(
    pool: &SqlitePool,
    project_id: Uuid,
    repo_id: Uuid,
    old_path: &Path,
    new_path: &Path,
    folder_name: &str,
    new_name: &str,
) -> Result<Project> {
    let workspaces = Workspace::fetch_by_project_id(pool, project_id).await?;
    let new_path_str = normalize_windows_extended_path_prefix(new_path)
        .to_string_lossy()
        .to_string();

    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"UPDATE repos
           SET path = ?,
               name = ?,
               display_name = ?,
               updated_at = datetime('now', 'subsec')
           WHERE id = ?"#,
    )
    .bind(&new_path_str)
    .bind(folder_name)
    .bind(new_name)
    .bind(repo_id)
    .execute(&mut *tx)
    .await?;

    for workspace in workspaces {
        if let Some(container_ref) = workspace.container_ref.as_deref()
            && let Some(rewritten) = rewrite_path_prefix(container_ref, old_path, new_path)
        {
            sqlx::query(
                r#"UPDATE workspaces
                   SET container_ref = ?, updated_at = datetime('now', 'subsec')
                   WHERE id = ?"#,
            )
            .bind(&rewritten)
            .bind(workspace.id)
            .execute(&mut *tx)
            .await?;
        }

        if let Some(agent_working_dir) = workspace.agent_working_dir.as_deref()
            && let Some(rewritten) = rewrite_path_prefix(agent_working_dir, old_path, new_path)
        {
            sqlx::query(
                r#"UPDATE workspaces
                   SET agent_working_dir = ?, updated_at = datetime('now', 'subsec')
                   WHERE id = ?"#,
            )
            .bind(&rewritten)
            .bind(workspace.id)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        r#"UPDATE projects
           SET name = ?, updated_at = datetime('now', 'subsec')
           WHERE id = ?"#,
    )
    .bind(new_name)
    .bind(project_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Project::find_by_id(pool, project_id)
        .await?
        .ok_or_else(|| ProjectServiceError::Project(ProjectError::ProjectNotFound))
}

fn update_cinyuverse_book_name(repo_path: &Path, new_name: &str) {
    let project_json = repo_path.join(".cinyuverse").join("project.json");
    let Ok(contents) = fs::read_to_string(&project_json) else {
        return;
    };
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return;
    };
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "bookName".to_string(),
            serde_json::Value::String(new_name.to_string()),
        );
        let _ = fs::write(
            project_json,
            serde_json::to_string_pretty(&value).unwrap_or(contents),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{rewrite_path_prefix, to_folder_name};
    use std::path::Path;

    #[test]
    fn to_folder_name_strips_invalid_characters() {
        assert_eq!(to_folder_name("夜航?终章"), "夜航-终章");
        assert_eq!(to_folder_name("  hello   world.  "), "hello world");
        assert_eq!(to_folder_name("<>"), "--");
        assert_eq!(to_folder_name("   "), "");
    }

    #[test]
    fn rewrite_path_prefix_rewrites_exact_and_child_paths() {
        let old = Path::new("/books/新作品-abc123");
        let new = Path::new("/books/夜航");
        assert_eq!(
            rewrite_path_prefix("/books/新作品-abc123", old, new).as_deref(),
            Some("/books/夜航")
        );
        assert_eq!(
            rewrite_path_prefix("/books/新作品-abc123/chapters", old, new).as_deref(),
            Some("/books/夜航/chapters")
        );
        assert_eq!(
            rewrite_path_prefix("/books/other", old, new),
            None
        );
    }
}
