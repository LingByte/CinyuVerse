import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Loader2, Plus, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useProjectRepos } from '@/hooks';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { ConfirmDialog } from '@/components/dialogs/shared/ConfirmDialog';
import { APP_NAME } from '@/lib/branding';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { desktopApi, projectsApi, settingsWindowApi } from '@/lib/api';
import {
  PROJECT_DELETE_CONFIRM_CLASSNAME,
  PROJECT_DELETE_CONFIRM_STYLE,
} from '@/lib/projectDeleteUi';
import { toast } from '@/components/ui/toast';

function WelcomeSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function WelcomeAction({
  icon: Icon,
  label,
  onClick,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading?: boolean;
}) {
  const { t } = useTranslation(['app', 'common']);
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="group flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      )}
      <span>{loading ? t('welcomePage.processing') : label}</span>
    </button>
  );
}

function RecentProjectItem({
  project,
  onOpen,
  onMissing,
  onContextMenu,
}: {
  project: { id: string; name: string };
  onOpen: () => void;
  onMissing: () => void | Promise<void>;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation(['app', 'common']);
  const { data: repos, isFetched } = useProjectRepos(project.id);
  const repoPath = repos?.[0]?.path ?? '';
  const [pathExists, setPathExists] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isFetched) {
      setPathExists(null);
      return;
    }
    if (!repoPath) {
      setPathExists(false);
      return;
    }
    setPathExists(null);
    void desktopApi
      .pathExists(repoPath)
      .then((exists) => {
        if (!cancelled) setPathExists(exists);
      })
      .catch(() => {
        if (!cancelled) setPathExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isFetched, repoPath]);

  const handleOpenFolder = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!repoPath || pathExists === false) {
        return;
      }
      try {
        await desktopApi.revealInFileManager(repoPath);
      } catch (error) {
        console.error('Failed to reveal project folder:', error);
      }
    },
    [pathExists, repoPath]
  );

  const handleClick = useCallback(async () => {
    if (!isFetched || pathExists === null) {
      return;
    }
    if (!pathExists) {
      await onMissing();
      return;
    }
    onOpen();
  }, [isFetched, onMissing, onOpen, pathExists]);

  return (
    <div
      className={`group flex w-full items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-muted/60 ${
        pathExists === false ? 'opacity-70' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => void handleClick()}
        onContextMenu={onContextMenu}
        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground"
        title={
          pathExists === false
            ? t('welcomePage.missingProjectTitle')
            : t('welcomePage.recentProjectTooltip')
        }
      >
        {project.name}
        {pathExists === false ? (
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            {t('welcomePage.missingProjectTitle')}
          </span>
        ) : null}
      </button>
      {repoPath && pathExists !== false ? (
        <button
          type="button"
          onClick={(event) => void handleOpenFolder(event)}
          className="flex max-w-[55%] shrink-0 items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t('welcomePage.openProjectFolder')}
          aria-label={t('welcomePage.openProjectFolder')}
        >
          <span className="truncate text-right">{repoPath}</span>
          <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      ) : null}
    </div>
  );
}

type ProjectContextMenuState = {
  projectId: string;
  projectName: string;
  x: number;
  y: number;
};

export function WelcomePage() {
  const { t } = useTranslation(['app', 'common']);
  const navigate = useNavigate();
  const { projects, isLoading } = useProjects();
  const [contextMenu, setContextMenu] =
    useState<ProjectContextMenuState | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const contextMenuStyle = useMemo(() => {
    if (!contextMenu || typeof window === 'undefined') {
      return null;
    }

    return {
      left: Math.max(12, Math.min(contextMenu.x, window.innerWidth - 220)),
      top: Math.max(12, Math.min(contextMenu.y, window.innerHeight - 120)),
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
    };
  }, [contextMenu]);

  const handleCreateProject = async () => {
    const result = await ProjectFormDialog.show({});
    if (result?.status === 'saved' && result.project) {
      navigate(`/local-projects/${result.project.id}/sessions`);
    }
  };

  const handleOpenFolder = async () => {
    const result = await ProjectFormDialog.show({ autoOpenFolderPicker: true });
    if (result?.status === 'saved' && result.project) {
      navigate(`/local-projects/${result.project.id}/sessions`);
    }
  };

  const handleProjectClick = useCallback(
    (projectId: string) => {
      navigate(`/local-projects/${projectId}/sessions`);
    },
    [navigate]
  );

  const deleteProjectRecord = useCallback(
    async (targetProject: { id: string; name: string }) => {
      setIsDeletingProject(true);
      try {
        await projectsApi.delete(targetProject.id);
        toast.success(
          t('welcomePage.projectDeleted', { name: targetProject.name })
        );
      } catch (error) {
        console.error('Failed to delete recent project:', error);
        toast.error(t('welcomePage.deleteProjectFailed'));
      } finally {
        setIsDeletingProject(false);
      }
    },
    [t]
  );

  const handleMissingProject = useCallback(
    async (project: { id: string; name: string }) => {
      if (isDeletingProject) return;
      const result = await ConfirmDialog.show({
        title: t('welcomePage.missingProjectTitle'),
        message: t('welcomePage.missingProjectMessage', {
          name: project.name,
        }),
        confirmText: t('welcomePage.removeMissingRecord'),
        cancelText: t('common:cancel'),
        variant: 'destructive',
        contentClassName: PROJECT_DELETE_CONFIRM_CLASSNAME,
        contentStyle: PROJECT_DELETE_CONFIRM_STYLE,
      });
      if (result !== 'confirmed') return;
      await deleteProjectRecord(project);
    },
    [deleteProjectRecord, isDeletingProject, t]
  );

  const handleProjectContextMenu = useCallback(
    (
      project: { id: string; name: string },
      event: React.MouseEvent<HTMLButtonElement>
    ) => {
      event.preventDefault();
      setContextMenu({
        projectId: project.id,
        projectName: project.name,
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const handleOpenFromContextMenu = useCallback(async () => {
    if (!contextMenu) {
      return;
    }
    const target = {
      id: contextMenu.projectId,
      name: contextMenu.projectName,
    };
    setContextMenu(null);

    try {
      const repos = await projectsApi.getRepositories(target.id);
      const repoPath = repos?.[0]?.path?.trim() ?? '';
      const exists = repoPath
        ? await desktopApi.pathExists(repoPath)
        : false;
      if (!exists) {
        await handleMissingProject(target);
        return;
      }
    } catch (error) {
      console.error('Failed to verify project path:', error);
      await handleMissingProject(target);
      return;
    }

    handleProjectClick(target.id);
  }, [contextMenu, handleMissingProject, handleProjectClick]);

  const handleDeleteFromContextMenu = useCallback(async () => {
    if (!contextMenu || isDeletingProject) {
      return;
    }

    const targetProject = {
      id: contextMenu.projectId,
      name: contextMenu.projectName,
    };
    setContextMenu(null);

    const result = await ConfirmDialog.show({
      title: t('welcomePage.deleteProjectConfirmTitle', {
        name: targetProject.name,
      }),
      message: t('welcomePage.deleteProjectConfirmMessage'),
      confirmText: t('welcomePage.confirmDelete'),
      cancelText: t('common:cancel'),
      variant: 'destructive',
      contentClassName: PROJECT_DELETE_CONFIRM_CLASSNAME,
      contentStyle: PROJECT_DELETE_CONFIRM_STYLE,
    });

    if (result !== 'confirmed') {
      return;
    }

    await deleteProjectRecord(targetProject);
  }, [contextMenu, deleteProjectRecord, isDeletingProject, t]);

  return (
    <div className="welcome-page-surface h-full overflow-auto">
      <div className="mx-auto max-w-2xl px-8 py-16">
        <div className="mb-12 flex items-start justify-between gap-4">
          <div className="-ml-3 flex items-center gap-3">
            <Logo
              showText={false}
              size="hero"
              className="-ml-4 translate-y-[3px]"
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {APP_NAME}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('welcomePage.tagline')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => settingsWindowApi.open()}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        <WelcomeSection title={t('welcomePage.startSection')}>
          <WelcomeAction
            icon={Plus}
            label={t('welcomePage.createNewProject')}
            onClick={handleCreateProject}
          />
          <WelcomeAction
            icon={FolderOpen}
            label={t('welcomePage.selectFolder')}
            onClick={handleOpenFolder}
          />
        </WelcomeSection>

        <WelcomeSection title={t('welcomePage.recentProjects')}>
          {isLoading ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">
              {t('welcomePage.loadingProjects')}
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">
              {t('welcomePage.noProjects')}
            </div>
          ) : (
            projects.map((project) => (
              <RecentProjectItem
                key={project.id}
                project={project}
                onOpen={() => handleProjectClick(project.id)}
                onMissing={() => void handleMissingProject(project)}
                onContextMenu={(event) =>
                  handleProjectContextMenu(project, event)
                }
              />
            ))
          )}
        </WelcomeSection>
      </div>

      {contextMenu && contextMenuStyle ? (
        <div
          className="fixed z-[1000] min-w-[180px] rounded-xl border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg"
          style={contextMenuStyle}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/70"
            onClick={handleOpenFromContextMenu}
          >
            {t('welcomePage.open')}
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void handleDeleteFromContextMenu()}
            disabled={isDeletingProject}
          >
            {t('common:delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
