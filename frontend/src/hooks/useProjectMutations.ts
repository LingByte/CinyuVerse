import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type {
  CreateProject,
  Project,
  RenameProjectWork,
  UpdateProject,
} from 'shared/types';

interface UseProjectMutationsOptions {
  onCreateSuccess?: (project: Project) => void;
  onCreateError?: (err: unknown) => void;
  onUpdateSuccess?: (project: Project) => void;
  onUpdateError?: (err: unknown) => void;
  onRenameSuccess?: (project: Project) => void;
  onRenameError?: (err: unknown) => void;
}

function cacheRenamedProject(
  queryClient: ReturnType<typeof useQueryClient>,
  project: Project
) {
  queryClient.setQueryData(['project', project.id], project);
  queryClient.setQueryData<Project[]>(['projects'], (old) => {
    if (!old) return old;
    return old.map((entry) => (entry.id === project.id ? project : entry));
  });
  queryClient.invalidateQueries({ queryKey: ['project-repositories', project.id] });
  queryClient.invalidateQueries({ queryKey: ['projectWorktrees', project.id] });
}

export function useProjectMutations(options?: UseProjectMutationsOptions) {
  const queryClient = useQueryClient();

  const createProject = useMutation({
    mutationKey: ['createProject'],
    mutationFn: (data: CreateProject) => projectsApi.create(data),
    onSuccess: (project: Project) => {
      queryClient.setQueryData(['project', project.id], project);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      options?.onCreateSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to create project:', err);
      options?.onCreateError?.(err);
    },
  });

  const updateProject = useMutation({
    mutationKey: ['updateProject'],
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: UpdateProject;
    }) => projectsApi.update(projectId, data),
    onSuccess: (project: Project) => {
      cacheRenamedProject(queryClient, project);
      options?.onUpdateSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to update project:', err);
      options?.onUpdateError?.(err);
    },
  });

  const renameProjectWork = useMutation({
    mutationKey: ['renameProjectWork'],
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: RenameProjectWork;
    }) => projectsApi.renameWork(projectId, data),
    onSuccess: (project: Project) => {
      cacheRenamedProject(queryClient, project);
      options?.onRenameSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to rename project work:', err);
      options?.onRenameError?.(err);
    },
  });

  return {
    createProject,
    updateProject,
    renameProjectWork,
  };
}
