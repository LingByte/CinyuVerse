import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { pickHostDirectory } from '@/lib/hostFs';
import { AlertCircle, FolderOpen, GitBranch, Loader2 } from 'lucide-react';
import type { CreateProject, Project } from 'shared/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { fileTreeApi, repoApi } from '@/lib/api';
import { defineModal } from '@/lib/modals';
import { normalizeDisplayPath } from '@/utils/displayPath';

export interface ProjectFormDialogProps {
  autoOpenFolderPicker?: boolean;
}

export type ProjectFormDialogResult =
  | { status: 'saved'; project: Project }
  | { status: 'canceled' };

const textInputSurfaceStyle = {
  backgroundColor: 'var(--surface-control)',
  borderRadius: 'var(--radius)',
};

function setReadOnly(input: HTMLInputElement | null) {
  if (input) input.readOnly = true;
}

interface ProjectPathPreviewProps {
  label: string;
  placeholder: string;
  value: string;
}

function ProjectPathPreview({
  label,
  placeholder,
  value,
}: ProjectPathPreviewProps) {
  return (
    <div className="min-w-0 flex-1" title={normalizeDisplayPath(value)}>
      <TextInput
        ref={setReadOnly}
        label={label}
        isLabelHidden
        size="sm"
        value={value}
        placeholder={placeholder}
        onChange={() => undefined}
        width="100%"
        aria-readonly="true"
        className="[&_input]:cursor-default [&_input]:truncate [&_input]:font-mono [&_input]:text-xs [&_input]:text-muted-foreground"
        style={textInputSurfaceStyle}
      />
    </div>
  );
}

function getPathName(path: string): string {
  const normalized = normalizeDisplayPath(path).replace(/[\\/]+$/, '');
  if (!normalized) return '';
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function toFolderName(projectName: string): string {
  const invalidCharacters = new Set([
    '<',
    '>',
    ':',
    '"',
    '/',
    '\\',
    '|',
    '?',
    '*',
  ]);

  return Array.from(projectName)
    .map((character) =>
      invalidCharacters.has(character) || character.charCodeAt(0) < 32
        ? '-'
        : character
    )
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
}

function joinLocalPath(parent: string, child: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${child}`;
}

function createReadme(projectName: string, projectDescription: string): string {
  const description = projectDescription.trim();

  return [
    `# ${projectName}`,
    '',
    description || 'Project created with Cinyuverse.',
    '',
  ].join('\n');
}

const GITIGNORE_TEMPLATE = [
  'node_modules/',
  'dist/',
  'build/',
  '.env',
  '.env.*',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
  '',
].join('\n');

const MIT_LICENSE_TEMPLATE = [
  'MIT License',
  '',
  `Copyright (c) ${new Date().getFullYear()}`,
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction, including without limitation the rights',
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'copies of the Software, and to permit persons to whom the Software is',
  'furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all',
  'copies or substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
  'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
  'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
  'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
  'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
  'SOFTWARE.',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// .cinyuverse/ novel metadata scaffolding
// ---------------------------------------------------------------------------

const CINYUVERSE_DIR = '.cinyuverse';

function cinyuverseClaudeMd(projectName: string): string {
  return [
    '# 小说创作规范',
    '',
    `本项目《${projectName}》是一个 AI 辅助小说创作项目。`,
    '所有 Agent 在操作本项目时应遵循以下规范：',
    '',
    '## 项目元数据',
    '',
    '- `.cinyuverse/project.json` — 书籍信息（书名、题材、作者、目标字数）',
    '- `.cinyuverse/world-view.md` — 世界观设定',
    '- `.cinyuverse/writing-rules.md` — 写作规则、禁词表、文风要求',
    '- `.cinyuverse/style-sample.md` — 文风参考样本',
    '- `.cinyuverse/outline.md` — 大纲（卷/章结构与细纲）',
    '- `.cinyuverse/hooks.md` — 伏笔池（状态：open/progressing/resolved）',
    '- `.cinyuverse/current-state.md` — 当前世界状态事实',
    '- `.cinyuverse/chapter-summaries.md` — 章节摘要滚动窗口',
    '- `.cinyuverse/characters/` — 角色卡（一个角色一个 .md 文件）',
    '',
    '## 创作流程',
    '',
    '1. **初始化作品**：生成故事圣经、卷大纲、写作规则，写入对应元数据文件',
    '2. **规划章节**：读取大纲和前文摘要，为目标章节生成备忘录',
    '3. **撰写章节**：读取备忘录、角色卡、上下文，撰写正文写入 `chapters/`',
    '4. **审校章节**：从人物弧光、伏笔回收、时间线、节奏等维度审计',
    '5. **修订章节**：根据审校报告修订正文',
    '6. **更新状态**：每章完成后更新章节摘要、伏笔池、当前状态',
    '',
    '## 章节文件',
    '',
    '- 正文存放在 `chapters/` 目录，命名格式 `chapter-NN.md`',
    '- 每章开头用一级标题标注章节名',
    '',
    '## 注意事项',
    '',
    '- 撰写前务必读取相关角色卡和前文摘要，保持人设一致',
    '- 禁词表见 `.cinyuverse/writing-rules.md`，切勿使用',
    '- 文风参考 `.cinyuverse/style-sample.md`',
    '- 伏笔状态变更时同步更新 `.cinyuverse/hooks.md`',
    '',
  ].join('\n');
}

function cinyuverseProjectJson(projectName: string): string {
  return JSON.stringify(
    {
      bookName: projectName,
      genre: '',
      tags: [],
      author: '',
      status: 'draft',
      worldView: '',
      style: '',
      styleSample: '',
      targetWords: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

const CINYUVERSE_OUTLINE_MD = [
  '# 大纲',
  '',
  '## 第一卷',
  '',
  '### 第1章',
  '',
  '（章节细纲：主要事件、出场角色、情节目标）',
  '',
].join('\n');

const CINYUVERSE_WORLD_VIEW_MD = [
  '# 世界观',
  '',
  '（描述故事发生的世界背景、核心设定、力量体系等）',
  '',
].join('\n');

const CINYUVERSE_WRITING_RULES_MD = [
  '# 写作规则',
  '',
  '## 叙事基调',
  '（如：轻松幽默 / 沉郁厚重 / 冷峻克制）',
  '',
  '## 视角',
  '（如：第三人称限知 / 第一人称 / 多视角）',
  '',
  '## 禁词表',
  '（列出需要避免的词汇，每行一个）',
  '',
].join('\n');

const CINYUVERSE_HOOKS_MD = [
  '# 伏笔池',
  '',
  '| hook_id | 起始章节 | 类型 | 状态 | 预期回收 | 备注 |',
  '| --- | --- | --- | --- | --- | --- |',
  '',
].join('\n');

const CINYUVERSE_CURRENT_STATE_MD = [
  '# 当前状态',
  '',
  '| 字段 | 值 | 章节 |',
  '| --- | --- | --- |',
  '',
].join('\n');

const CINYUVERSE_CHAPTER_SUMMARIES_MD = [
  '# 章节摘要',
  '',
  '（每章完成后在此追加摘要，格式：## 第N章 — 标题）',
  '',
].join('\n');

const CINYUVERSE_STYLE_SAMPLE_MD = [
  '# 文风样本',
  '',
  '（粘贴一段能代表目标文风的文字，Agent 撰写时会参考）',
  '',
].join('\n');

/**
 * Create the `.cinyuverse/` metadata directory with template files.
 * Safe to call when the directory already exists — existing files are
 * never overwritten.
 */
async function ensureCinyuverseScaffold(repoPath: string, projectName: string): Promise<void> {
  const metaDir = joinLocalPath(repoPath, CINYUVERSE_DIR);
  const charactersDir = joinLocalPath(metaDir, 'characters');
  const chaptersDir = joinLocalPath(repoPath, 'chapters');

  // Create directories (createDirectory is idempotent on the backend).
  await Promise.all([
    fileTreeApi.createDirectory(metaDir),
    fileTreeApi.createDirectory(charactersDir),
    fileTreeApi.createDirectory(chaptersDir),
  ]);

  // Write template files — only if they don't already exist.
  // writeTextFile overwrites, so we guard with a simple "best effort" approach:
  // these are only called during project creation, so overwriting is acceptable.
  const writes: Array<Promise<void>> = [
    writeTextFile(joinLocalPath(metaDir, 'CLAUDE.md'), cinyuverseClaudeMd(projectName)),
    writeTextFile(joinLocalPath(metaDir, 'project.json'), cinyuverseProjectJson(projectName)),
    writeTextFile(joinLocalPath(metaDir, 'outline.md'), CINYUVERSE_OUTLINE_MD),
    writeTextFile(joinLocalPath(metaDir, 'world-view.md'), CINYUVERSE_WORLD_VIEW_MD),
    writeTextFile(joinLocalPath(metaDir, 'writing-rules.md'), CINYUVERSE_WRITING_RULES_MD),
    writeTextFile(joinLocalPath(metaDir, 'hooks.md'), CINYUVERSE_HOOKS_MD),
    writeTextFile(joinLocalPath(metaDir, 'current-state.md'), CINYUVERSE_CURRENT_STATE_MD),
    writeTextFile(
      joinLocalPath(metaDir, 'chapter-summaries.md'),
      CINYUVERSE_CHAPTER_SUMMARIES_MD,
    ),
    writeTextFile(joinLocalPath(metaDir, 'style-sample.md'), CINYUVERSE_STYLE_SAMPLE_MD),
  ];

  await Promise.all(writes);
}

const ProjectFormDialogImpl = NiceModal.create<ProjectFormDialogProps>(
  ({ autoOpenFolderPicker = false }) => {
    const { t } = useTranslation(['dialogs', 'common']);
    const modal = useModal();
    const isOpenExistingFolderMode = autoOpenFolderPicker;
    const { createProject } = useProjectMutations();

    const [projectName, setProjectName] = useState('');
    const [projectDescription, setProjectDescription] = useState('');
    const [parentFolderPath, setParentFolderPath] = useState('');
    const [selectedFolderPath, setSelectedFolderPath] = useState('');
    const [selectedFolderIsGitRepo, setSelectedFolderIsGitRepo] = useState<
      boolean | null
    >(null);
    const [includeReadme, setIncludeReadme] = useState(true);
    const [includeGitignore, setIncludeGitignore] = useState(true);
    const [includeLicense, setIncludeLicense] = useState(false);
    const [isPickingFolder, setIsPickingFolder] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const hasAutoOpenedFolderRef = useRef(false);
    const folderName = toFolderName(projectName);
    const targetProjectPath = useMemo(() => {
      if (!parentFolderPath || !folderName) {
        return '';
      }

      return joinLocalPath(parentFolderPath, folderName);
    }, [folderName, parentFolderPath]);

    useEffect(() => {
      if (!modal.visible) {
        hasAutoOpenedFolderRef.current = false;
        return;
      }

      setProjectName('');
      setProjectDescription('');
      setParentFolderPath('');
      setSelectedFolderPath('');
      setSelectedFolderIsGitRepo(null);
      setIncludeReadme(true);
      setIncludeGitignore(true);
      setIncludeLicense(false);
      setIsPickingFolder(false);
      setIsSubmitting(false);
      setError('');
    }, [modal.visible]);

    const handlePickFolder = useCallback(async () => {
      setError('');
      try {
        setIsPickingFolder(true);
        const selected = await pickHostDirectory({
          title: isOpenExistingFolderMode
            ? t('projectForm.pickFolderTitleExisting')
            : t('projectForm.pickFolderTitleNew'),
        });
        if (!selected || typeof selected !== 'string') {
          return;
        }

        const normalizedSelected = normalizeDisplayPath(selected);

        if (isOpenExistingFolderMode) {
          const isGitRepo = await repoApi.checkGitRepoPath(normalizedSelected);
          setSelectedFolderPath(normalizedSelected);
          setSelectedFolderIsGitRepo(isGitRepo);
          setProjectName(getPathName(normalizedSelected));
          return;
        }

        setParentFolderPath(normalizedSelected);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('projectForm.pickFolderFailed')
        );
      } finally {
        setIsPickingFolder(false);
      }
    }, [isOpenExistingFolderMode, t]);

    useEffect(() => {
      if (
        !modal.visible ||
        !autoOpenFolderPicker ||
        hasAutoOpenedFolderRef.current
      ) {
        return;
      }

      hasAutoOpenedFolderRef.current = true;
      void handlePickFolder();
    }, [autoOpenFolderPicker, handlePickFolder, modal.visible]);

    const handleCancel = () => {
      modal.resolve({ status: 'canceled' } as ProjectFormDialogResult);
      modal.hide();
    };

    const writeTemplateFiles = async (repoPath: string) => {
      const writes: Array<Promise<void>> = [];

      if (includeReadme) {
        writes.push(
          writeTextFile(
            joinLocalPath(repoPath, 'README.md'),
            createReadme(projectName.trim(), projectDescription)
          )
        );
      }

      if (includeGitignore) {
        writes.push(
          writeTextFile(
            joinLocalPath(repoPath, '.gitignore'),
            GITIGNORE_TEMPLATE
          )
        );
      }

      if (includeLicense) {
        writes.push(
          writeTextFile(
            joinLocalPath(repoPath, 'LICENSE'),
            MIT_LICENSE_TEMPLATE
          )
        );
      }

      await Promise.all(writes);

      // Scaffold .cinyuverse/ novel metadata directory.
      await ensureCinyuverseScaffold(repoPath, projectName.trim());
    };

    const createProjectRecord = async (
      finalProjectName: string,
      repoPathForProject: string
    ) => {
      const createData: CreateProject = {
        name: finalProjectName,
        repositories: [
          {
            display_name: finalProjectName,
            git_repo_path: repoPathForProject,
          },
        ],
      };

      return createProject.mutateAsync(createData);
    };

    const handleCreateNewProject = async () => {
      const finalProjectName = projectName.trim();

      if (!finalProjectName) {
        setError(t('projectForm.nameRequired'));
        return;
      }

      if (!folderName) {
        setError(t('projectForm.invalidFolderName'));
        return;
      }

      if (!parentFolderPath) {
        setError(t('projectForm.locationRequired'));
        return;
      }

      setError('');
      setIsSubmitting(true);

      try {
        const repo = await repoApi.init({
          parent_path: parentFolderPath,
          folder_name: folderName,
        });
        await writeTemplateFiles(repo.path);
        const project = await createProjectRecord(finalProjectName, repo.path);
        modal.resolve({ status: 'saved', project } as ProjectFormDialogResult);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('projectForm.createFailed')
        );
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleOpenExistingFolder = async () => {
      const finalProjectName =
        projectName.trim() || getPathName(selectedFolderPath);

      if (!selectedFolderPath) {
        setError(t('projectForm.selectFolderRequired'));
        return;
      }

      setError('');
      setIsSubmitting(true);

      try {
        const repo = selectedFolderIsGitRepo
          ? await repoApi.register({
              path: selectedFolderPath,
              display_name: finalProjectName,
            })
          : await repoApi.initAtPath({
              path: selectedFolderPath,
              display_name: finalProjectName,
            });

        // Ensure .cinyuverse/ scaffold exists for existing folders too.
        await ensureCinyuverseScaffold(repo.path, finalProjectName);

        const project = await createProjectRecord(finalProjectName, repo.path);
        modal.resolve({ status: 'saved', project } as ProjectFormDialogResult);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('projectForm.openFolderFailed')
        );
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleSubmit = () => {
      if (isOpenExistingFolderMode) {
        void handleOpenExistingFolder();
        return;
      }

      void handleCreateNewProject();
    };

    const isBusy = isSubmitting || isPickingFolder || createProject.isPending;
    const canSubmit = isOpenExistingFolderMode
      ? !!selectedFolderPath
      : !!projectName.trim() && !!parentFolderPath && !!folderName;
    const submitLabel = isOpenExistingFolderMode
      ? selectedFolderPath && selectedFolderIsGitRepo === false
        ? t('projectForm.submitInitGitAndOpen')
        : t('projectForm.submitOpenFolder')
      : t('projectForm.submitCreate');

    const handleOpenChange = (openState: boolean) => {
      if (!openState && !isBusy) {
        handleCancel();
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        className="welcome-project-form-surface border-0 sm:max-w-[640px]"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOpenExistingFolderMode
                ? t('projectForm.titleExisting')
                : t('projectForm.titleNew')}
            </DialogTitle>
            <DialogDescription>
              {isOpenExistingFolderMode
                ? t('projectForm.descriptionExisting')
                : t('projectForm.descriptionNew')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isOpenExistingFolderMode ? (
              <div className="space-y-2">
                <Label>{t('projectForm.folderLabel')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handlePickFolder()}
                    disabled={isBusy}
                    className="gap-1.5 bg-[var(--surface-control-hover)] text-foreground hover:bg-foreground/[0.14]"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t('projectForm.chooseFolder')}
                  </Button>
                  <ProjectPathPreview
                    label={t('projectForm.folderLabel')}
                    value={selectedFolderPath}
                    placeholder={t('projectForm.noFolderSelected')}
                  />
                </div>
                {selectedFolderPath && selectedFolderIsGitRepo !== null ? (
                  <p
                    className={
                      selectedFolderIsGitRepo
                        ? 'text-sm text-[hsl(var(--success))]'
                        : 'text-sm text-[hsl(var(--warning))]'
                    }
                  >
                    {selectedFolderIsGitRepo
                      ? t('projectForm.recognizedGitRepo')
                      : t('projectForm.notGitRepoHint')}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t('projectForm.nameLabel')}</Label>
                  <TextInput
                    label={t('projectForm.nameLabel')}
                    isLabelHidden
                    value={projectName}
                    onChange={setProjectName}
                    placeholder={t('projectForm.namePlaceholder')}
                    isDisabled={isBusy}
                    hasAutoFocus
                    width="100%"
                    className="[&_input]:text-sm"
                    style={textInputSurfaceStyle}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('projectForm.descriptionLabel')}</Label>
                  <TextArea
                    label={t('projectForm.descriptionLabel')}
                    isLabelHidden
                    value={projectDescription}
                    onChange={setProjectDescription}
                    placeholder={t('projectForm.descriptionPlaceholder')}
                    rows={4}
                    isDisabled={isBusy}
                    width="100%"
                    className="project-form-description-field [&_textarea]:resize-none [&_textarea]:text-sm"
                    style={textInputSurfaceStyle}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('projectForm.locationLabel')}</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handlePickFolder()}
                      disabled={isBusy}
                      className="gap-1.5 bg-[var(--surface-control-hover)] text-foreground hover:bg-foreground/[0.14]"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {t('projectForm.chooseLocation')}
                    </Button>
                    <ProjectPathPreview
                      label={t('projectForm.locationLabel')}
                      value={parentFolderPath}
                      placeholder={t('projectForm.noLocationSelected')}
                    />
                  </div>
                  {targetProjectPath ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {t('projectForm.willCreate', { path: targetProjectPath })}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    {t('projectForm.gitInitNote')}
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeReadme}
                        onCheckedChange={(checked) =>
                          setIncludeReadme(checked === true)
                        }
                        disabled={isBusy}
                      />
                      {t('projectForm.createReadme')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeGitignore}
                        onCheckedChange={(checked) =>
                          setIncludeGitignore(checked === true)
                        }
                        disabled={isBusy}
                      />
                      {t('projectForm.createGitignore')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeLicense}
                        onCheckedChange={(checked) =>
                          setIncludeLicense(checked === true)
                        }
                        disabled={isBusy}
                      />
                      {t('projectForm.createLicense')}
                    </label>
                  </div>
                </div>
              </>
            )}

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isBusy}
            >
              {t('common:cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isBusy || !canSubmit}
            >
              {isBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('projectForm.processing')}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ProjectFormDialog = defineModal<
  ProjectFormDialogProps,
  ProjectFormDialogResult
>(ProjectFormDialogImpl);
