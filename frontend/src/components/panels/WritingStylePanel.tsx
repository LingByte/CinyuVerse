/**
 * Writing Style Skills Panel — browses the writing-style skills vendored from
 * github.com/oscar-wang-xin/xin-skills. Importing a skill stages a reference
 * document into `.cinyuverse/references/` (alongside library books); the
 * 「提炼文风」card below then distills `.cinyuverse/style-sample.md` from one
 * or several staged references.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Brush,
  Search,
  Loader2,
  FileText,
  ChevronRight,
  Download,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/contexts/ProjectContext';
import { fileTreeApi } from '@/lib/api';
import { useProjectRepos } from '@/hooks';
import {
  composeStagedReference,
  fetchWritingStyleExamples,
  fetchWritingStyleIndex,
  fetchWritingStyleSkillDoc,
  stagedReferenceName,
  stripFrontmatter,
  type WritingStyleSkill,
} from '@/lib/writingStyleSkills';
import { getWritingPrompt } from '@/lib/writingPrompts';
import { useKanbanSessionContext } from '@/contexts/KanbanSessionContext';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useComposerPrefillStore } from '@/stores/useComposerPrefillStore';
import { cn } from '@/lib/utils';

function referencesDir(rootPath: string): string {
  return `${rootPath}/.cinyuverse/references`;
}

export function WritingStylePanel() {
  const { t } = useTranslation('panels');
  const { projectId } = useProject();
  const { data: repos } = useProjectRepos(projectId);
  const rootPath = repos?.[0]?.path ?? '';

  const [skills, setSkills] = useState<WritingStyleSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<WritingStyleSkill | null>(
    null
  );
  const [previewMd, setPreviewMd] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Each import stages its own file under references/, so several skills can
  // be in flight at once; the set tracks exactly which ones are.
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  // Everything currently staged in .cinyuverse/references/ — imported skills
  // AND library books — this is the distill pool.
  const [referenceFiles, setReferenceFiles] = useState<string[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [importNotice, setImportNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  // ----- Load the vendored skill index -----
  const loadIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const index = await fetchWritingStyleIndex();
      setSkills(index.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  // ----- Track the staged references (skills + library books) -----
  useEffect(() => {
    let cancelled = false;
    if (!rootPath) {
      setReferenceFiles([]);
      return;
    }
    fileTreeApi
      .getTree(referencesDir(rootPath), 1)
      .then((entries) => {
        if (cancelled) return;
        setReferenceFiles(
          (entries ?? []).filter((entry) => !entry.is_dir).map((e) => e.name)
        );
      })
      .catch(() => {
        // No references directory yet — nothing staged.
        if (!cancelled) setReferenceFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const isStaged = useCallback(
    (skill: WritingStyleSkill) =>
      referenceFiles.includes(stagedReferenceName(skill)),
    [referenceFiles]
  );

  // ----- Filtered + grouped list -----
  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.trim().toLowerCase();
    return skills.filter(
      (skill) =>
        skill.book.toLowerCase().includes(q) ||
        skill.author.toLowerCase().includes(q) ||
        skill.category.toLowerCase().includes(q) ||
        skill.keywords.some((keyword) => keyword.toLowerCase().includes(q))
    );
  }, [skills, search]);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, WritingStyleSkill[]>();
    for (const skill of filteredSkills) {
      const group = groups.get(skill.category);
      if (group) {
        group.push(skill);
      } else {
        groups.set(skill.category, [skill]);
      }
    }
    return [...groups.entries()];
  }, [filteredSkills]);

  // ----- Preview a skill -----
  // Slow responses from an earlier click must never overwrite the latest
  // selection, so each preview takes an epoch and stale ones drop out.
  const previewEpochRef = useRef(0);
  const handlePreview = useCallback(
    async (skill: WritingStyleSkill) => {
      const epoch = ++previewEpochRef.current;
      setSelectedSkill(skill);
      setPreviewMd(null);
      setPreviewLoading(true);
      try {
        const doc = stripFrontmatter(await fetchWritingStyleSkillDoc(skill.id));
        if (epoch !== previewEpochRef.current) return;
        setPreviewMd(doc);
      } catch (err) {
        if (epoch !== previewEpochRef.current) return;
        setPreviewMd(
          t('styleSkills.loadFailed', {
            message: err instanceof Error ? err.message : String(err),
          })
        );
      } finally {
        if (epoch === previewEpochRef.current) setPreviewLoading(false);
      }
    },
    [t]
  );

  // ----- Import: stage the skill doc into references/ (distill is the
  // only writer of style-sample.md) -----
  const handleImport = useCallback(
    async (skill: WritingStyleSkill) => {
      if (!rootPath) {
        setImportNotice({
          tone: 'error',
          text: t('styleSkills.importNoRoot'),
        });
        return;
      }
      setImportingIds((prev) => new Set(prev).add(skill.id));
      setImportNotice(null);
      try {
        const [skillMd, examplesMd] = await Promise.all([
          fetchWritingStyleSkillDoc(skill.id),
          // Two vendored skills ship no examples; the index flags them so we
          // never request a missing file (dev server SPA-falls-back to 200).
          skill.hasExamples
            ? fetchWritingStyleExamples(skill.id)
            : Promise.resolve(null),
        ]);
        const content = composeStagedReference({ skill, skillMd, examplesMd });
        const dir = referencesDir(rootPath);
        await fileTreeApi.createDirectory(dir);
        await fileTreeApi.saveFile(
          `${dir}/${stagedReferenceName(skill)}`,
          content
        );
        setReferenceFiles((prev) =>
          prev.includes(stagedReferenceName(skill))
            ? prev
            : [...prev, stagedReferenceName(skill)]
        );
        // Concurrent imports share one notice slot — a success must never
        // overwrite a sibling import's failure.
        setImportNotice((prev) =>
          prev?.tone === 'error'
            ? prev
            : {
                tone: 'success',
                text: t('styleSkills.importStaged', { book: skill.book }),
              }
        );
      } catch (err) {
        setImportNotice({
          tone: 'error',
          text: t('styleSkills.importFailed', {
            message: err instanceof Error ? err.message : String(err),
          }),
        });
      } finally {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(skill.id);
          return next;
        });
      }
    },
    [rootPath, t]
  );

  // ----- Distill: fill the distill-style prompt, scoped to the selection -----
  const { visibleRightSession } = useKanbanSessionContext();
  const setRightPanelVisible = useLayoutStore(
    (state) => state.setRightPanelVisible
  );
  const requestPrefill = useComposerPrefillStore((s) => s.requestPrefill);

  const fillDistillPrompt = useCallback(
    (guidance: string) => {
      const tpl = getWritingPrompt('distill-style');
      if (!tpl) return;
      // Require an existing session on the right panel — do NOT create one.
      if (!visibleRightSession?.sessionId) {
        setImportNotice({
          tone: 'error',
          text: t('panels:overview.noSession'),
        });
        setRightPanelVisible(true);
        return;
      }
      requestPrefill(tpl.build({ guidance }));
      setRightPanelVisible(true);
    },
    [visibleRightSession, requestPrefill, setRightPanelVisible, t]
  );

  const distillSelected = useCallback(() => {
    const names = [...selectedRefs];
    if (names.length === 0) return;
    const guidance = [
      '本次只参考以下参考作品提炼文风（忽略 .cinyuverse/references/ 下其余文件）：',
      ...names.map((name) => `- ${name.replace(/\.md$/, '')}`),
    ].join('\n');
    fillDistillPrompt(guidance);
  }, [selectedRefs, fillDistillPrompt]);

  const toggleRef = useCallback((name: string) => {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  // ----- Render -----
  if (!projectId) {
    return (
      <div className="library-overlay bg-background text-foreground flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">
          {t('panels:overview.noProject')}
        </p>
      </div>
    );
  }

  return (
    <div className="library-overlay bg-background text-foreground flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Brush className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('toolbar.styles')}</h2>
          <span className="text-xs text-muted-foreground">
            {skills.length > 0 &&
              t('styleSkills.skillCount', { count: skills.length })}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {t('styleSkills.headerHint')}
        </span>
      </div>

      {/* Search bar */}
      <div className="border-b px-4 py-2">
        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('styleSkills.searchPlaceholder')}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Distill card — style-sample.md is produced here, never by import */}
      <div className="border-b px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            {t('styleSkills.distillTitle')}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-xs"
              disabled={referenceFiles.length === 0}
              onClick={() => fillDistillPrompt('')}
            >
              {t('styleSkills.distillAll')}
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={selectedRefs.size === 0}
              onClick={distillSelected}
            >
              {t('styleSkills.distillSelected', { count: selectedRefs.size })}
            </Button>
          </div>
        </div>
        {referenceFiles.length === 0 ? (
          <p className="text-[10px] text-muted-foreground mt-1">
            {t('styleSkills.referencesEmpty')}
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {referenceFiles.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-center gap-1 text-xs text-foreground/80"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-primary"
                  checked={selectedRefs.has(name)}
                  onChange={() => toggleRef(name)}
                />
                <span className="max-w-40 truncate">
                  {name.replace(/\.md$/, '')}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Import notice */}
      {importNotice && (
        <div
          className={cn(
            'flex items-center justify-between gap-2 border-b px-4 py-1.5 text-xs',
            importNotice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300'
          )}
        >
          <span>{importNotice.text}</span>
          <button
            className="opacity-60 hover:opacity-100"
            onClick={() => setImportNotice(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Main content: list + preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Skill list */}
        <div className="w-80 border-r overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">
                {t('styleSkills.loading')}
              </span>
            </div>
          )}
          {error && (
            <div className="p-4 text-xs text-rose-500">
              <p className="mb-1 font-medium">
                {t('styleSkills.loadErrorTitle')}
              </p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          )}
          {!loading && !error && filteredSkills.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Brush className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                {t('styleSkills.noMatches')}
              </p>
            </div>
          )}
          {groupedSkills.map(([category, group]) => (
            <div key={category}>
              <div className="sticky top-0 z-10 bg-muted/80 px-3 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
                {t('styleSkills.categoryCount', {
                  category,
                  count: group.length,
                })}
              </div>
              <div className="divide-y">
                {group.map((skill) => (
                  <div
                    key={skill.id}
                    className={cn(
                      'px-3 py-2.5 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                      selectedSkill?.id === skill.id &&
                        'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500'
                    )}
                    onClick={() => void handlePreview(skill)}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          《{skill.book}》
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                          {skill.author && (
                            <>
                              <span>{skill.author}</span>
                              <span>·</span>
                            </>
                          )}
                          <span className="truncate">
                            {skill.keywords.join(' · ')}
                          </span>
                        </div>
                      </div>
                      {isStaged(skill) && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      )}
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Preview panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedSkill && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Brush className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t('styleSkills.selectHint')}
              </p>
            </div>
          )}
          {selectedSkill && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Skill header */}
              <div className="p-4 pb-3 border-b shrink-0">
                <h3 className="text-lg font-semibold">
                  《{selectedSkill.book}》
                </h3>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                  {selectedSkill.author && (
                    <span>
                      {t('styleSkills.authorPrefix')}
                      {selectedSkill.author}
                    </span>
                  )}
                  <span>{selectedSkill.category}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleImport(selectedSkill)}
                    disabled={
                      importingIds.has(selectedSkill.id) ||
                      isStaged(selectedSkill)
                    }
                  >
                    {importingIds.has(selectedSkill.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isStaged(selectedSkill) ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {importingIds.has(selectedSkill.id)
                      ? t('styleSkills.importing')
                      : isStaged(selectedSkill)
                        ? t('styleSkills.alreadyStaged')
                        : t('styleSkills.importAction')}
                  </Button>
                </div>
              </div>

              {/* Style spec reader */}
              <div className="flex-1 overflow-y-auto p-4">
                {previewLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('styleSkills.previewLoading')}
                    </span>
                  </div>
                )}
                {previewMd && !previewLoading && (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/80">
                    {previewMd}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
