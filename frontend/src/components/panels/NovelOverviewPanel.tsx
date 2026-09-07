/**
 * Novel overview panel — scans the current project workspace and shows
 * writing statistics: chapter count, total words, character count,
 * hook resolution rate, outline progress, etc.
 *
 * Reads from `.cinyuverse/` metadata files and `chapters/` directory.
 * No backend changes required — uses existing file-tree and file-read APIs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Users as CharactersIcon,
  FileText,
  Anchor as HookIcon,
  Loader2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks/useProjectRepos';
import { fileTreeApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ChapterStat {
  fileName: string;
  title: string;
  wordCount: number;
}

interface OverviewStats {
  chapterCount: number;
  totalWords: number;
  avgWordsPerChapter: number;
  characterCount: number;
  hookTotal: number;
  hookResolved: number;
  hookOpen: number;
  outlineChapters: number;
  chapters: ChapterStat[];
}

const EMPTY_STATS: OverviewStats = {
  chapterCount: 0,
  totalWords: 0,
  avgWordsPerChapter: 0,
  characterCount: 0,
  hookTotal: 0,
  hookResolved: 0,
  hookOpen: 0,
  outlineChapters: 0,
  chapters: [],
};

/** Count CJK + Latin words in a text block. */
function countWords(text: string): number {
  // Remove Markdown headings markers and frontmatter
  const cleaned = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---[\s\S]*?---/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
  if (!cleaned) return 0;

  // CJK characters: count each as one word
  const cjkMatches = cleaned.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // Latin words: split by whitespace
  const latinText = cleaned
    .replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, ' ')
    .trim();
  const latinWords = latinText ? latinText.split(/\s+/).filter(Boolean).length : 0;

  return cjkCount + latinWords;
}

/** Extract chapter title from first H1 in the file. */
function extractChapterTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

/** Parse hook table rows from hooks.md to count statuses. */
function parseHooks(hooksMd: string): { total: number; resolved: number; open: number } {
  const lines = hooksMd.split('\n');
  let total = 0;
  let resolved = 0;
  let open = 0;
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) continue; // separator
    if (line.toLowerCase().includes('hook_id')) continue; // header
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    total++;
    const status = cells[3].toLowerCase();
    if (status === 'resolved') resolved++;
    else if (status === 'open' || status === 'progressing' || status === 'deferred') open++;
  }
  return { total, resolved, open };
}

/** Count chapter entries in outline.md (### headings). */
function countOutlineChapters(outlineMd: string): number {
  const matches = outlineMd.match(/^###\s+/gm);
  return matches ? matches.length : 0;
}

/** Check if a file name looks like a chapter (chapter-NN.md or 第N章). */
function isChapterFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.md')) return false;
  if (lower.includes('-memo.') || lower.includes('-audit.')) return false;
  return (
    /^chapter[-_]?\d+/i.test(lower) ||
    lower.startsWith('第') ||
    /^\d+[-_]/.test(lower)
  );
}

function joinPath(parent: string, child: string): string {
  const sep = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${sep}${child}`;
}

async function scanWorkspace(rootPath: string): Promise<OverviewStats> {
  const cinyuverseDir = joinPath(rootPath, '.cinyuverse');
  const chaptersDir = joinPath(rootPath, 'chapters');

  // Read metadata files in parallel (best-effort, ignore errors)
  const [hooksResult, outlineResult, charsResult] = await Promise.allSettled([
    fileTreeApi.readFile(joinPath(cinyuverseDir, 'hooks.md')),
    fileTreeApi.readFile(joinPath(cinyuverseDir, 'outline.md')),
    fileTreeApi.listDirectoryChildren(rootPath, '.cinyuverse/characters'),
  ]);

  const hooksMd = hooksResult.status === 'fulfilled' ? hooksResult.value : '';
  const outlineMd = outlineResult.status === 'fulfilled' ? outlineResult.value : '';
  const characterFiles =
    charsResult.status === 'fulfilled' ? charsResult.value.files : [];

  const hooks = parseHooks(hooksMd);
  const outlineChapters = countOutlineChapters(outlineMd);

  // Scan chapters directory
  let chapterFiles: { name: string; path: string }[] = [];
  try {
    const chaptersListing = await fileTreeApi.listDirectoryChildren(
      rootPath,
      'chapters',
    );
    chapterFiles = chaptersListing.files
      .filter((fileName) => isChapterFile(fileName))
      .map((fileName) => ({
        name: fileName,
        path: joinPath(chaptersDir, fileName),
      }));
  } catch {
    // chapters/ might not exist yet
  }

  // Read each chapter to count words (limit to first 50 to avoid overload)
  const chaptersToRead = chapterFiles.slice(0, 50);
  const chapterResults = await Promise.allSettled(
    chaptersToRead.map(async (file) => {
      const content = await fileTreeApi.readFile(file.path);
      return {
        fileName: file.name,
        title: extractChapterTitle(content, file.name.replace(/\.md$/i, '')),
        wordCount: countWords(content),
      };
    }),
  );

  const chapters: ChapterStat[] = chapterResults
    .filter((r): r is PromiseFulfilledResult<ChapterStat> => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return {
    chapterCount: chapters.length,
    totalWords,
    avgWordsPerChapter: chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0,
    characterCount: characterFiles.filter((name) => name.endsWith('.md')).length,
    hookTotal: hooks.total,
    hookResolved: hooks.resolved,
    hookOpen: hooks.open,
    outlineChapters,
    chapters,
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="overview-stat-card flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {sublabel ? (
        <div className="text-xs text-muted-foreground">{sublabel}</div>
      ) : null}
    </div>
  );
}

export function NovelOverviewPanel() {
  const { t } = useTranslation(['panels', 'writingPrompts']);
  const { projectId } = useProject();
  const { data: repos } = useProjectRepos(projectId);
  const rootPath = repos?.[0]?.path ?? '';

  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  const refresh = useCallback(async () => {
    if (!rootPath) {
      setError(null);
      setStats(EMPTY_STATS);
      setHasScanned(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await scanWorkspace(rootPath);
      setStats(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setHasScanned(true);
    }
  }, [rootPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hookResolutionRate = useMemo(() => {
    if (stats.hookTotal === 0) return 0;
    return Math.round((stats.hookResolved / stats.hookTotal) * 100);
  }, [stats.hookResolved, stats.hookTotal]);

  const outlineProgress = useMemo(() => {
    if (stats.outlineChapters === 0) return 0;
    return Math.min(
      100,
      Math.round((stats.chapterCount / stats.outlineChapters) * 100),
    );
  }, [stats.chapterCount, stats.outlineChapters]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {t('overview.noProject')}
      </div>
    );
  }

  if (!rootPath) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {t('overview.noWorkspace')}
      </div>
    );
  }

  return (
    <div className="overview-panel flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {t('overview.title')}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
          className="h-7 px-2"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!error && hasScanned && stats.chapterCount === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t('overview.emptyHint')}
            </p>
          </div>
        ) : null}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            icon={FileText}
            label={t('overview.chapterCount')}
            value={stats.chapterCount}
            sublabel={
              stats.outlineChapters > 0
                ? t('overview.outlineProgress', {
                    written: stats.chapterCount,
                    planned: stats.outlineChapters,
                    percent: outlineProgress,
                  })
                : undefined
            }
          />
          <StatCard
            icon={BookOpen}
            label={t('overview.totalWords')}
            value={stats.totalWords.toLocaleString()}
            sublabel={
              stats.avgWordsPerChapter > 0
                ? t('overview.avgWords', { avg: stats.avgWordsPerChapter })
                : undefined
            }
          />
          <StatCard
            icon={CharactersIcon}
            label={t('overview.characterCount')}
            value={stats.characterCount}
          />
          <StatCard
            icon={HookIcon}
            label={t('overview.hooks')}
            value={stats.hookTotal}
            sublabel={
              stats.hookTotal > 0
                ? t('overview.hookResolution', {
                    resolved: stats.hookResolved,
                    open: stats.hookOpen,
                    rate: hookResolutionRate,
                  })
                : undefined
            }
          />
          <StatCard
            icon={TrendingUp}
            label={t('overview.outlineChapters')}
            value={stats.outlineChapters}
            sublabel={
              stats.outlineChapters > 0
                ? t('overview.completionRate', { percent: outlineProgress })
                : undefined
            }
          />
        </div>

        {/* Chapter list */}
        {stats.chapters.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('overview.chapterList')}
            </h3>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {t('overview.chapterTitle')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                      {t('overview.wordCount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.chapters.map((ch, idx) => (
                    <tr
                      key={ch.fileName}
                      className={cn(
                        'border-t border-border',
                        idx % 2 === 1 && 'bg-muted/20',
                      )}
                    >
                      <td className="px-3 py-2 text-foreground">
                        {ch.title}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {ch.wordCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
