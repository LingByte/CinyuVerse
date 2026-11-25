import type { ComponentType } from 'react';
import NiceModal, { type NiceModalHocProps } from '@ebay/nice-modal-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, expect, it } from 'vitest';

import {
  CINYUVERSE_ENV_EXAMPLE,
  CINYUVERSE_WRITING_RULES_MD,
  ProjectFormDialog,
  UNTITLED_FOLDER_PREFIX,
  UNTITLED_PROJECT_NAME,
  createUntitledFolderName,
  resolveNewProjectIdentity,
  toFolderName,
  type ProjectFormDialogProps,
} from './ProjectFormDialog';
import { STYLE_RHYTHM_RULES } from '@/lib/writingPrompts';

const Dialog = ProjectFormDialog as ComponentType<
  ProjectFormDialogProps & NiceModalHocProps
>;

function renderDialog(props: ProjectFormDialogProps = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider initiallyActiveScopes={['dialog', 'kanban', 'projects']}>
        <NiceModal.Provider>
          <Dialog id="project-form-dialog-test" defaultVisible {...props} />
        </NiceModal.Provider>
      </HotkeysProvider>
    </QueryClientProvider>
  );
}

describe('ProjectFormDialog', () => {
  it('uses an Astryx multiline field for the project description', async () => {
    renderDialog();

    const descriptionInput = await screen.findByRole('textbox', {
      name: '作品简介（可选，用于 README）',
    });

    expect(descriptionInput.tagName).toBe('TEXTAREA');
    expect(descriptionInput.closest('.astryx-textarea')).toHaveClass(
      'project-form-description-field'
    );
    expect(descriptionInput).toHaveAttribute('rows', '4');
  });

  it('uses Astryx fields and a compact location row', async () => {
    const { container } = renderDialog();

    const nameInput = await screen.findByRole('textbox', {
      name: '作品名称（可选）',
    });
    const locationPreview = screen.getByRole('textbox', {
      name: '创建位置',
    });
    const locationButton = screen.getByRole('button', { name: '选择位置' });

    const nameField = nameInput.closest('.astryx-text-input');
    const locationField = locationPreview.closest('.astryx-text-input');
    const dialogSurface = container.querySelector('[role="dialog"]');

    expect(dialogSurface).toHaveClass('welcome-project-form-surface');
    expect(nameField).toHaveClass('[&_input]:text-sm');
    expect(nameField).toHaveStyle({
      backgroundColor: 'var(--surface-control)',
    });
    expect(locationField).toHaveAttribute('data-size', 'sm');
    expect(locationField).toHaveStyle({
      backgroundColor: 'var(--surface-control)',
    });
    expect(locationPreview).toHaveAttribute('readonly');
    expect(locationPreview).toHaveAttribute('aria-readonly', 'true');
    expect(locationButton).toHaveClass(
      'h-7',
      'text-xs',
      'bg-[var(--surface-control-hover)]'
    );
  });

  it('resolves untitled create identity to a placeholder folder', () => {
    expect(createUntitledFolderName('abc123')).toBe(
      `${UNTITLED_FOLDER_PREFIX}abc123`
    );
    expect(resolveNewProjectIdentity('', '新作品-abc123')).toEqual({
      projectName: UNTITLED_PROJECT_NAME,
      folderName: '新作品-abc123',
    });
    expect(resolveNewProjectIdentity('  夜航  ', '新作品-abc123')).toEqual({
      projectName: '夜航',
      folderName: toFolderName('夜航'),
    });
  });

  it('allows create submit with only a location selected', async () => {
    renderDialog();

    const createButton = await screen.findByRole('button', {
      name: '创建作品',
    });
    expect(createButton).toBeDisabled();
  });

  it('uses the same compact folder picker row for existing projects', async () => {
    const { container } = renderDialog({ autoOpenFolderPicker: true });

    await screen.findByRole('heading', { name: '选择文件夹' });

    const folderPreview = screen.getByRole('textbox', {
      name: '作品文件夹',
    });
    const folderButton = screen.getByRole('button', { name: '选择文件夹' });
    const folderField = folderPreview.closest('.astryx-text-input');
    const dialogSurface = container.querySelector('[role="dialog"]');

    expect(dialogSurface).toHaveClass('welcome-project-form-surface');
    expect(folderField).toHaveAttribute('data-size', 'sm');
    expect(folderField).toHaveStyle({
      backgroundColor: 'var(--surface-control)',
    });
    expect(folderPreview).toHaveAttribute('readonly');
    expect(folderPreview).toHaveAttribute('aria-readonly', 'true');
    expect(folderButton).toHaveClass(
      'h-7',
      'text-xs',
      'bg-[var(--surface-control-hover)]'
    );
  });

  it('scaffolds writing-rules.md with every style rhythm constraint', () => {
    expect(CINYUVERSE_WRITING_RULES_MD).toContain('## 文风节奏');
    for (const rule of STYLE_RHYTHM_RULES) {
      expect(CINYUVERSE_WRITING_RULES_MD).toContain(rule.constraint);
    }
  });

  it('scaffolds .env.example for the AIGC detection key without a value', () => {
    expect(CINYUVERSE_ENV_EXAMPLE).toContain('ZHUQUE_API_KEY=');
    expect(CINYUVERSE_ENV_EXAMPLE).toContain('.gitignore');
    expect(CINYUVERSE_ENV_EXAMPLE).toContain('aigc-check');
    expect(CINYUVERSE_ENV_EXAMPLE).not.toMatch(/ZHUQUE_API_KEY=\S/);
  });
});
