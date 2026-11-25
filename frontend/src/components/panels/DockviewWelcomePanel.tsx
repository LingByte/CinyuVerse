import { useCallback, useMemo } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import {
  FolderOpen,
  GitCompare,
  Globe2,
  HardDrive,
  Terminal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePanelActionsContext } from '@/contexts/PanelActionsContext';
import { useProject } from '@/contexts/ProjectContext';
import { useWorktree } from '@/contexts/WorktreeContext';
import { resolveFileTreeAbsolutePath } from '@/components/file-tree/file-tree-utils';
import { useAttempt } from '@/hooks/useAttempt';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useProjectRepos } from '@/hooks/useProjectRepos';
import { fileTreeApi } from '@/lib/api';
import { useFileTreeStore } from '@/stores/useFileTreeStore';
import {
  pickRandomProjectRootFile,
  resolveWelcomeWorkspaceRootPath,
} from './welcomeRootFile';

const welcomeActions = [
  {
    labelKey: 'welcomePanel.actionFilesLabel',
    descriptionKey: 'welcomePanel.actionFilesDescription',
    icon: FolderOpen,
    action: 'files',
  },
  {
    labelKey: 'welcomePanel.actionDiffsLabel',
    descriptionKey: 'welcomePanel.actionDiffsDescription',
    icon: GitCompare,
    action: 'diffs',
  },
  {
    labelKey: 'welcomePanel.actionTerminalLabel',
    descriptionKey: 'welcomePanel.actionTerminalDescription',
    icon: Terminal,
    action: 'terminal',
  },
  {
    labelKey: 'welcomePanel.actionBrowserLabel',
    descriptionKey: 'welcomePanel.actionBrowserDescription',
    icon: Globe2,
    action: 'browser',
  },
] as const;

function displayWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3) {
    return normalized.startsWith('/') ? normalized : path;
  }
  return `…/${parts.slice(-3).join('/')}`;
}

function DockviewWelcomePanel(_props: IDockviewPanelProps) {
  const { t } = useTranslation(['panels', 'common']);
  const {
    openDiffPreview,
    openFilePreview,
    openNewTerminal,
    openWebPreview,
    showFileTree,
  } = usePanelActionsContext();
  const storedRootPath = useFileTreeStore((state) => state.rootPath);
  const { activeWorktreeId } = useWorktree();
  const { data: workspace } = useAttempt(activeWorktreeId ?? undefined);
  const { repos: workspaceRepos } = useAttemptRepo(
    activeWorktreeId ?? undefined
  );
  const { projectId } = useProject();
  const { data: projectRepos } = useProjectRepos(projectId);

  const workspaceRoot = useMemo(
    () =>
      resolveWelcomeWorkspaceRootPath({
        storedRootPath,
        workspace,
        workspaceRepos,
        projectRepoPath: projectRepos?.[0]?.path ?? null,
      }),
    [projectRepos, storedRootPath, workspace, workspaceRepos]
  );

  const isolationLabel = workspace?.use_worktree
    ? t('welcomePanel.isolationWorktree')
    : t('welcomePanel.isolationProject');
  const repoCount = workspaceRepos.length || projectRepos?.length || 0;

  const openBrowseFiles = useCallback(async () => {
    showFileTree();

    if (!workspaceRoot) {
      return;
    }

    try {
      const response = await fileTreeApi.listDirectoryChildren(
        workspaceRoot,
        ''
      );
      const relativePath = pickRandomProjectRootFile(
        response.files,
        response.gitignored_files
      );
      if (!relativePath) {
        return;
      }
      openFilePreview(resolveFileTreeAbsolutePath(workspaceRoot, relativePath));
    } catch {
      // The file tree is already open; skip preview if listing fails.
    }
  }, [openFilePreview, showFileTree, workspaceRoot]);

  const handleAction = (action: (typeof welcomeActions)[number]['action']) => {
    if (action === 'files') {
      void openBrowseFiles();
      return;
    }
    if (action === 'diffs') {
      openDiffPreview();
      return;
    }
    if (action === 'terminal') {
      openNewTerminal();
      return;
    }
    openWebPreview();
  };

  return (
    <div
      className="workspace-welcome h-full w-full overflow-auto"
      data-panel="welcome"
    >
      <div className="workspace-welcome__inner">
        <section
          className="workspace-welcome__intro"
          aria-labelledby="welcome-title"
        >
          <p className="workspace-welcome__eyebrow">
            {t('welcomePanel.eyebrow')}
          </p>
          <h2 id="welcome-title">{t('welcomePanel.title')}</h2>
          <p className="workspace-welcome__copy">{t('welcomePanel.copy')}</p>
          <div
            className="workspace-welcome__actions"
            aria-label={t('welcomePanel.actionsAriaLabel')}
          >
            {welcomeActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.action}
                  type="button"
                  className="workspace-welcome__action"
                  onClick={() => handleAction(item.action)}
                >
                  <span className="workspace-welcome__action-icon">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="workspace-welcome__action-title">
                      {t(item.labelKey)}
                    </span>
                    <span className="workspace-welcome__action-description">
                      {t(item.descriptionKey)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside
          className="workspace-welcome__context"
          aria-label={t('welcomePanel.contextAriaLabel')}
        >
          <div className="workspace-welcome__context-header">
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('welcomePanel.contextTitle')}</span>
          </div>
          {workspaceRoot ? (
            <p
              className="workspace-welcome__path"
              title={workspaceRoot}
            >
              {displayWorkspacePath(workspaceRoot)}
            </p>
          ) : (
            <p className="workspace-welcome__path is-empty">
              {t('welcomePanel.contextEmpty')}
            </p>
          )}
          <dl className="workspace-welcome__meta">
            <div>
              <dt>{t('welcomePanel.metaIsolation')}</dt>
              <dd>{isolationLabel}</dd>
            </div>
            <div>
              <dt>{t('welcomePanel.metaRepos')}</dt>
              <dd>
                {t('welcomePanel.metaReposValue', { count: repoCount })}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

export default DockviewWelcomePanel;
