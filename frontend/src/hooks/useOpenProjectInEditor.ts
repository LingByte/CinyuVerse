import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { projectsApi } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import type { EditorType, Project } from 'shared/types';

export function useOpenProjectInEditor(project: Project | null) {
  const { t } = useTranslation('app');

  return useCallback(
    async (editorType?: EditorType) => {
      if (!project) return;

      try {
        const response = await projectsApi.openEditor(project.id, {
          editor_type: editorType ?? null,
          file_path: null,
        });

        if (response.url) {
          window.open(response.url, '_blank');
        }
      } catch (err) {
        console.error('Failed to open project in editor:', err);
        toast.error(t('projectCard.openInIdeFailed'));
      }
    },
    [project, t]
  );
}
