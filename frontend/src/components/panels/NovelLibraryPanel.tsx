/**
 * Novel Library — search/download books via the Tomato platform and keep them
 * in a configurable local directory.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Library,
  Search,
  RefreshCw,
  Loader2,
  BookOpen,
  Download,
  FileText,
  Settings,
  FolderOpen,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { invoke } from '@tauri-apps/api/core';
import { pickHostDirectory } from '@/lib/hostFs';
import { cn } from '@/lib/utils';

type LocalBook = {
  name: string;
  path: string;
  ext: string;
  size: number;
  modifiedMs: number;
  coverPath: string | null;
  coverDataUrl: string | null;
};

type SearchItem = {
  title: string;
  author: string;
  bookId: string;
  coverUrl: string | null;
  coverDataUrl: string | null;
};

type PreviewResponse = {
  bookId: string;
  bookName: string;
  originalBookName: string;
  author: string;
  chapterCount: number;
  finished: boolean;
  wordCount: number;
  category: string;
  description: string;
  coverUrl: string;
  coverDataUrl: string | null;
};

type LibrarySettings = {
  apiBase: string;
  apiPassword: string;
  libraryPath: string;
  defaultLibraryPath: string;
  passwordConfigured: boolean;
};

type DownloadResult = {
  job_id: number;
  title: string;
  author: string;
  local_path: string;
  format: string;
  size: number;
};

type EpubChapterMeta = {
  index: number;
  title: string;
};

type EpubBook = {
  title: string;
  author: string;
  chapters: EpubChapterMeta[];
};

type EpubChapter = {
  index: number;
  title: string;
  text: string;
};

type Mode = 'local' | 'search';

type ImitateStatusView = {
  phase: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | string;
  progress: string | null;
  error: string | null;
  updatedAt: string;
  conversationId: string | null;
};

export function imitateStatusLabel(status: ImitateStatusView | null): string {
  if (!status) return '未分析';
  switch (status.phase) {
    case 'queued':
    case 'running':
      return status.progress || '分析中';
    case 'completed':
      return '已完成';
    case 'failed':
      return status.error ? `失败：${status.error}` : '失败';
    default:
      return '未分析';
  }
}

export function NovelLibraryPanel() {
  const { t } = useTranslation('panels');
  const [mode, setMode] = useState<Mode>('local');
  const [localBooks, setLocalBooks] = useState<LocalBook[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<LocalBook | null>(null);
  const [selectedRemote, setSelectedRemote] = useState<SearchItem | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [epubBook, setEpubBook] = useState<EpubBook | null>(null);
  const [epubChapter, setEpubChapter] = useState<EpubChapter | null>(null);
  const [epubLoading, setEpubLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<LibrarySettings | null>(null);
  const [pathDraft, setPathDraft] = useState('');
  const [pathSaving, setPathSaving] = useState(false);
  const [imitateStatus, setImitateStatus] = useState<ImitateStatusView | null>(
    null
  );
  const [imitateStarting, setImitateStarting] = useState(false);
  const localPreviewRequestRef = useRef(0);
  const readerScrollRef = useRef<HTMLDivElement | null>(null);

  const loadSettings = useCallback(async () => {
    const cfg = await invoke<LibrarySettings>('library_get_settings');
    setSettings(cfg);
    setPathDraft(cfg.libraryPath);
  }, []);

  const loadLocal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const books = await invoke<LocalBook[]>('library_list_local');
      setLocalBooks(books);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadLocal();
  }, [loadLocal, loadSettings]);

  const filteredLocal = useMemo(() => {
    if (!searchQuery.trim() || mode !== 'local') return localBooks;
    const q = searchQuery.toLowerCase();
    return localBooks.filter((book) => book.name.toLowerCase().includes(q));
  }, [localBooks, mode, searchQuery]);

  const localTitleSet = useMemo(() => {
    const set = new Set<string>();
    for (const book of localBooks) {
      set.add(normalizeBookTitle(displayBookName(book.name)));
    }
    return set;
  }, [localBooks]);

  const isDownloaded = useCallback(
    (title: string) => localTitleSet.has(normalizeBookTitle(title)),
    [localTitleSet]
  );

  const saveLibraryPath = useCallback(
    async (nextPath: string) => {
      if (!settings) return;
      const trimmed = nextPath.trim();
      if (!trimmed || trimmed === settings.libraryPath) return;
      setPathSaving(true);
      setError(null);
      try {
        const updated = await invoke<LibrarySettings>('library_set_settings', {
          settings: {
            apiBase: settings.apiBase,
            apiPassword: settings.apiPassword,
            libraryPath: trimmed,
          },
        });
        setSettings(updated);
        setPathDraft(updated.libraryPath);
        setNotice(`书库路径已更新：${updated.libraryPath}`);
        await loadLocal();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPathDraft(settings.libraryPath);
      } finally {
        setPathSaving(false);
      }
    },
    [loadLocal, settings]
  );

  const handleBrowsePath = useCallback(async () => {
    const selected = await pickHostDirectory({
      title: '选择书库存储目录',
      value: pathDraft || settings?.libraryPath,
    });
    if (!selected) return;
    setPathDraft(selected);
    await saveLibraryPath(selected);
  }, [pathDraft, saveLibraryPath, settings?.libraryPath]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setMode('search');
    setSearching(true);
    setError(null);
    setSelectedRemote(null);
    setPreview(null);
    try {
      const resp = await invoke<{ items: SearchItem[] }>('library_search', {
        query: q,
      });
      setSearchResults(resp.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const loadEpubChapter = useCallback(
    async (bookPath: string, index: number, requestId: number) => {
      setEpubLoading(true);
      try {
        const chapter = await invoke<EpubChapter>('library_read_epub_chapter', {
          args: { path: bookPath, index },
        });
        if (localPreviewRequestRef.current !== requestId) return;
        setEpubChapter(chapter);
        readerScrollRef.current?.scrollTo({ top: 0 });
      } catch (err) {
        if (localPreviewRequestRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (localPreviewRequestRef.current === requestId) {
          setEpubLoading(false);
        }
      }
    },
    []
  );

  const handleSelectRemote = useCallback(async (item: SearchItem) => {
    setSelectedRemote(item);
    setSelectedLocal(null);
    setTextPreview(null);
    setEpubBook(null);
    setEpubChapter(null);
    setPreview(
      item.coverDataUrl
        ? ({
            bookId: item.bookId,
            bookName: item.title,
            originalBookName: item.title,
            author: item.author,
            chapterCount: 0,
            finished: false,
            wordCount: 0,
            category: '',
            description: '',
            coverUrl: item.coverUrl ?? '',
            coverDataUrl: item.coverDataUrl,
          } satisfies PreviewResponse)
        : null
    );
    setPreviewLoading(true);
    setError(null);
    try {
      const data = await invoke<PreviewResponse>('library_preview', {
        bookId: item.bookId,
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleSelectLocal = useCallback(
    async (book: LocalBook) => {
      const requestId = ++localPreviewRequestRef.current;
      setSelectedLocal(book);
      setSelectedRemote(null);
      setPreview(null);
      setTextPreview(null);
      setEpubBook(null);
      setEpubChapter(null);
      setError(null);

      if (book.ext === 'txt') {
        setTextPreviewLoading(true);
        try {
          const content = await invoke<string>('library_read_local', {
            path: book.path,
            maxChars: 40000,
          });
          if (localPreviewRequestRef.current !== requestId) return;
          setTextPreview(content);
        } catch (err) {
          if (localPreviewRequestRef.current !== requestId) return;
          setTextPreview(err instanceof Error ? err.message : String(err));
        } finally {
          if (localPreviewRequestRef.current === requestId) {
            setTextPreviewLoading(false);
          }
        }
        return;
      }

      if (book.ext === 'epub' || book.ext === 'book') {
        setEpubLoading(true);
        try {
          const opened = await invoke<{ book: EpubBook; path: string }>(
            'library_open_epub',
            { path: book.path }
          );
          if (localPreviewRequestRef.current !== requestId) return;
          const bookMeta = opened.book;
          const resolvedPath = opened.path;
          setSelectedLocal({
            ...book,
            path: resolvedPath,
            ext: 'book',
            name: bookMeta.title || book.name,
          });
          setEpubBook(bookMeta);
          // EPUB→folder conversion may have replaced the loose file — refresh list.
          if (resolvedPath !== book.path) {
            void loadLocal();
          }
          const first =
            bookMeta.chapters.find((chapter) =>
              /^第\s*\d+\s*章/.test(chapter.title)
            )?.index ??
            bookMeta.chapters.find(
              (chapter) =>
                !/^(简介|目录|封面|版权)/.test(chapter.title.trim())
            )?.index ??
            bookMeta.chapters[0]?.index ??
            0;
          await loadEpubChapter(resolvedPath, first, requestId);
        } catch (err) {
          if (localPreviewRequestRef.current !== requestId) return;
          setError(err instanceof Error ? err.message : String(err));
          setEpubLoading(false);
        }
      }
    },
    [loadEpubChapter, loadLocal]
  );

  const handleDeleteLocal = useCallback(async () => {
    if (!selectedLocal) return;
    const name = displayBookName(selectedLocal.name);
    if (!window.confirm(`删除「${name}」？此操作不可撤销。`)) {
      return;
    }
    setError(null);
    try {
      await invoke('library_delete_local', { path: selectedLocal.path });
      setSelectedLocal(null);
      setEpubBook(null);
      setEpubChapter(null);
      setTextPreview(null);
      setImitateStatus(null);
      setNotice(`已删除「${name}」`);
      await loadLocal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadLocal, selectedLocal]);

  const refreshImitateStatus = useCallback(async (path: string) => {
    try {
      const status = await invoke<ImitateStatusView>('library_imitate_status', {
        path,
      });
      setImitateStatus(status);
      return status;
    } catch {
      setImitateStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!selectedLocal || selectedLocal.ext !== 'book') {
      setImitateStatus(null);
      return;
    }
    const path = selectedLocal.path;
    void refreshImitateStatus(path);
  }, [selectedLocal, refreshImitateStatus]);

  useEffect(() => {
    if (
      !selectedLocal ||
      selectedLocal.ext !== 'book' ||
      !imitateStatus ||
      (imitateStatus.phase !== 'queued' && imitateStatus.phase !== 'running')
    ) {
      return;
    }
    const path = selectedLocal.path;
    const timer = window.setInterval(() => {
      void refreshImitateStatus(path);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [selectedLocal, imitateStatus, refreshImitateStatus]);

  const handleStartImitate = useCallback(async () => {
    if (!selectedLocal || selectedLocal.ext !== 'book') return;
    setImitateStarting(true);
    setError(null);
    setNotice(null);
    try {
      const status = await invoke<ImitateStatusView>(
        'library_start_imitate_analysis',
        { path: selectedLocal.path }
      );
      setImitateStatus(status);
      setNotice('已开始仿写分析');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImitateStarting(false);
    }
  }, [selectedLocal]);

  const handleDownload = useCallback(
    async (item: SearchItem) => {
      setDownloadingId(item.bookId);
      setNotice(null);
      setError(null);
      try {
        const result = await invoke<DownloadResult>('library_download', {
          args: {
            bookId: item.bookId,
            preferredName: item.title,
          },
        });
        setNotice(`已下载「${result.title}」→ ${result.local_path}`);
        setMode('local');
        await loadLocal();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDownloadingId(null);
      }
    },
    [loadLocal]
  );

  const currentChapterIndex = epubChapter?.index ?? 0;
  const chapterCount = epubBook?.chapters.length ?? 0;

  return (
    <div className="library-overlay bg-background text-foreground flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Library className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="shrink-0 text-sm font-semibold">{t('toolbar.library')}</h2>
          <span className="shrink-0 text-xs text-muted-foreground">
            {localBooks.length > 0 ? `${localBooks.length} 本本地藏书` : '本地书库'}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <div className="flex min-w-0 max-w-md flex-1 items-center gap-1">
            <span className="shrink-0 text-[11px] text-muted-foreground">
              存储路径
            </span>
            <Input
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={() => void saveLibraryPath(pathDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              placeholder={settings?.defaultLibraryPath || '本地书库路径'}
              className="h-7 min-w-0 flex-1 text-[11px]"
              title={pathDraft}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={pathSaving}
              onClick={() => void handleBrowsePath()}
              title="选择目录"
            >
              {pathSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <Button
            size="sm"
            variant={mode === 'local' ? 'secondary' : 'ghost'}
            onClick={() => {
              setMode('local');
              setError(null);
            }}
          >
            本地
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings((v) => !v)}
            title="书库设置"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void loadLocal()}>
            <RefreshCw
              className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
            />
          </Button>
        </div>
      </div>

      {showSettings && settings ? (
        <LibrarySettingsPanel
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={async () => {
            await loadSettings();
            await loadLocal();
            setShowSettings(false);
          }}
        />
      ) : null}

      <div className="border-b px-4 py-2">
        <div className="flex max-w-xl items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder={
                mode === 'local'
                  ? '筛选本地书名，或输入关键词后点搜索'
                  : '搜索番茄书库…'
              }
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleSearch()}
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              '搜索下载'
            )}
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="flex items-center justify-between gap-2 border-b bg-emerald-50 px-4 py-1.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="truncate">{notice}</span>
          <button onClick={() => setNotice(null)}>×</button>
        </div>
      ) : null}

      {error ? (
        <div className="border-b px-4 py-2 text-xs text-rose-500">{error}</div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 overflow-y-auto border-r">
          {mode === 'local' ? (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  加载本地书库…
                </div>
              ) : null}
              {!loading && filteredLocal.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-12 text-center">
                  <BookOpen className="mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">
                    本地还没有书。上方搜索后下载即可。
                  </p>
                </div>
              ) : null}
              <div className="space-y-0.5 p-1.5">
                {filteredLocal.map((book) => {
                  const selected = selectedLocal?.path === book.path;
                  return (
                    <button
                      key={book.path}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        selected ? 'bg-muted' : 'hover:bg-muted/60'
                      )}
                      onClick={() => void handleSelectLocal(book)}
                    >
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
                        {book.coverDataUrl ? (
                          <img
                            src={book.coverDataUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className={cn(
                              'flex h-full w-full items-center justify-center',
                          book.ext === 'epub' || book.ext === 'book'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            )}
                          >
                            {book.ext === 'epub' || book.ext === 'book' ? (
                              <BookOpen className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium leading-snug">
                          {displayBookName(book.name)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {book.ext.toUpperCase()} · {formatSize(book.size)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {searching ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  搜索中…
                </div>
              ) : null}
              {!searching && searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  没有搜索结果
                </div>
              ) : null}
              <div className="space-y-0.5 p-1.5">
                {searchResults.map((item) => {
                  const selected = selectedRemote?.bookId === item.bookId;
                  const downloaded = isDownloaded(item.title);
                  const downloading = downloadingId === item.bookId;
                  return (
                    <div
                      key={item.bookId}
                      className={cn(
                        'rounded-lg px-2.5 py-2 transition-colors',
                        selected ? 'bg-muted' : 'hover:bg-muted/60'
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                          onClick={() => void handleSelectRemote(item)}
                        >
                          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
                            {item.coverDataUrl ? (
                              <img
                                src={item.coverDataUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <BookOpen className="h-4 w-4 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="line-clamp-2 text-[13px] font-medium leading-snug">
                              {item.title}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {item.author || '未知作者'}
                            </div>
                          </div>
                        </button>
                      </div>
                      <div className="mt-2 flex justify-end">
                        {downloaded ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                            已在本地
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2.5 text-[11px]"
                            disabled={downloading}
                            onClick={() => void handleDownload(item)}
                          >
                            {downloading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                下载中…
                              </>
                            ) : (
                              <>
                                <Download className="h-3.5 w-3.5" />
                                下载到本地
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedLocal && !selectedRemote ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Library className="mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                选择本地藏书，或搜索后下载到本地书库
              </p>
            </div>
          ) : null}

          {selectedLocal ? (
            <div className="flex h-full overflow-hidden">
              {(selectedLocal.ext === 'epub' || selectedLocal.ext === 'book') &&
              epubBook ? (
                <div className="flex w-56 shrink-0 flex-col border-r">
                  <div className="shrink-0 border-b px-3 py-2">
                    <div className="truncate text-xs font-medium">目录</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {chapterCount} 章
                      {epubBook.author ? ` · ${epubBook.author}` : ''}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1">
                    {epubBook.chapters.map((chapter) => (
                      <button
                        key={chapter.index}
                        type="button"
                        className={cn(
                          'mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-snug transition-colors',
                          chapter.index === currentChapterIndex
                            ? 'bg-muted font-medium'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        )}
                        onClick={() => {
                          if (!selectedLocal) return;
                          const requestId = ++localPreviewRequestRef.current;
                          void loadEpubChapter(
                            selectedLocal.path,
                            chapter.index,
                            requestId
                          );
                        }}
                      >
                        {chapter.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b p-4">
                  <h3 className="text-lg font-semibold">
                    {epubBook?.title || displayBookName(selectedLocal.name)}
                  </h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selectedLocal.path}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {selectedLocal.ext === 'epub' ||
                    selectedLocal.ext === 'book' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            epubLoading || currentChapterIndex <= 0 || !epubBook
                          }
                          onClick={() => {
                            if (!selectedLocal || !epubBook) return;
                            const prev = Math.max(0, currentChapterIndex - 1);
                            const requestId = ++localPreviewRequestRef.current;
                            void loadEpubChapter(
                              selectedLocal.path,
                              prev,
                              requestId
                            );
                          }}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          上一章
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            epubLoading ||
                            !epubBook ||
                            currentChapterIndex >= chapterCount - 1
                          }
                          onClick={() => {
                            if (!selectedLocal || !epubBook) return;
                            const next = Math.min(
                              chapterCount - 1,
                              currentChapterIndex + 1
                            );
                            const requestId = ++localPreviewRequestRef.current;
                            void loadEpubChapter(
                              selectedLocal.path,
                              next,
                              requestId
                            );
                          }}
                        >
                          下一章
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : null}
                    {selectedLocal.ext === 'book' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          imitateStarting ||
                          imitateStatus?.phase === 'queued' ||
                          imitateStatus?.phase === 'running'
                        }
                        onClick={() => void handleStartImitate()}
                        data-testid="library-imitate-analyze"
                      >
                        {imitateStarting ||
                        imitateStatus?.phase === 'queued' ||
                        imitateStatus?.phase === 'running' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        分析
                      </Button>
                    ) : null}
                    {selectedLocal.ext === 'book' ? (
                      <span
                        className="text-xs text-muted-foreground"
                        data-testid="library-imitate-status"
                      >
                        {imitateStatusLabel(imitateStatus)}
                      </span>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void invoke('library_open_local', {
                          path: selectedLocal.path,
                        })
                      }
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      系统打开
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void invoke('library_reveal_local', {
                          path: selectedLocal.path,
                        })
                      }
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      在访达中显示
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleDeleteLocal()}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </div>
                <div
                  ref={readerScrollRef}
                  className="flex-1 overflow-y-auto p-4"
                >
                  {selectedLocal.ext === 'epub' ||
                  selectedLocal.ext === 'book' ? (
                    epubLoading && !epubChapter ? (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {selectedLocal.ext === 'epub'
                          ? '正在解析并转换书库…'
                          : '加载章节…'}
                      </div>
                    ) : epubChapter ? (
                      <article className="mx-auto max-w-2xl">
                        <h4 className="mb-4 text-base font-semibold">
                          {epubChapter.title}
                        </h4>
                        <div className="space-y-4 text-[15px] leading-7 text-foreground/90">
                          {chapterBodyParagraphs(
                            epubChapter.title,
                            epubChapter.text
                          ).map((para, i) => (
                            <p key={i}>{para}</p>
                          ))}
                        </div>
                        {epubLoading ? (
                          <div className="mt-4 flex items-center text-xs text-muted-foreground">
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            加载中…
                          </div>
                        ) : null}
                      </article>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        无法打开该 EPUB。
                      </p>
                    )
                  ) : textPreviewLoading ? (
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      解析预览…
                    </div>
                  ) : textPreview ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/80">
                      {textPreview}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      该格式不支持内嵌预览。
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {selectedRemote ? (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="shrink-0 border-b p-4">
                <div className="flex items-start gap-4">
                  {preview?.coverDataUrl ? (
                    <img
                      src={preview.coverDataUrl}
                      alt={preview.bookName || selectedRemote.title}
                      className="h-28 w-20 shrink-0 rounded object-cover shadow-sm"
                    />
                  ) : previewLoading ? (
                    <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded bg-muted">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                      无封面
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold">
                      {preview?.bookName || selectedRemote.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>
                        作者: {preview?.author || selectedRemote.author}
                      </span>
                      {preview?.category ? (
                        <span>分类: {preview.category}</span>
                      ) : null}
                      {preview?.chapterCount ? (
                        <span>{preview.chapterCount} 章</span>
                      ) : null}
                      {preview?.wordCount ? (
                        <span>
                          {(preview.wordCount / 10000).toFixed(1)} 万字
                        </span>
                      ) : null}
                      {preview?.finished ? (
                        <span className="text-emerald-600">完结</span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex justify-end">
                      {isDownloaded(selectedRemote.title) ? (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                          已在本地
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={downloadingId === selectedRemote.bookId}
                          onClick={() => void handleDownload(selectedRemote)}
                        >
                          {downloadingId === selectedRemote.bookId ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              下载中…
                            </>
                          ) : (
                            <>
                              <Download className="h-3.5 w-3.5" />
                              下载到本地
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {previewLoading ? (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    加载预览…
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                    {preview?.description || '暂无简介'}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LibrarySettingsPanel({
  settings,
  onSaved,
  onClose,
}: {
  settings: LibrarySettings;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [apiBase, setApiBase] = useState(settings.apiBase);
  const [apiPassword, setApiPassword] = useState(settings.apiPassword);
  const [libraryPath, setLibraryPath] = useState(settings.libraryPath);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    const selected = await pickHostDirectory({
      title: '选择书库存储目录',
      value: libraryPath,
    });
    if (selected) setLibraryPath(selected);
  }, [libraryPath]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await invoke('library_set_settings', {
        settings: {
          apiBase,
          apiPassword,
          libraryPath,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [apiBase, apiPassword, libraryPath, onSaved]);

  return (
    <div className="border-b bg-slate-50 px-4 py-3 dark:bg-slate-800/40">
      <div className="mb-2 text-xs font-medium">书库设置</div>
      <div className="grid max-w-2xl gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={libraryPath}
            onChange={(e) => setLibraryPath(e.target.value)}
            placeholder={settings.defaultLibraryPath || '本地书库路径'}
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleBrowse()}
          >
            选择目录
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLibraryPath(settings.defaultLibraryPath)}
          >
            默认
          </Button>
        </div>
        <Input
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          placeholder="番茄 API 地址"
          className="h-7 text-xs"
        />
        <Input
          value={apiPassword}
          onChange={(e) => setApiPassword(e.target.value)}
          placeholder="API 密码（可留空，改用环境变量）"
          type="password"
          className="h-7 text-xs"
        />
      </div>
      {error ? <p className="mt-1 text-xs text-rose-500">{error}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          取消
        </Button>
        {settings.passwordConfigured ? (
          <span className="text-xs text-emerald-600">密码已配置</span>
        ) : (
          <span className="text-xs text-amber-600">未配置密码</span>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayBookName(filename: string): string {
  return filename.replace(/\.(epub|txt|mp3|wav)$/i, '');
}

function normalizeBookTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s_\-—–·・.]+/g, '');
}

function chapterBodyParagraphs(title: string, text: string): string[] {
  const titleKey = normalizeBookTitle(title);
  const paras = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  let i = 0;
  while (i < paras.length) {
    const key = normalizeBookTitle(paras[i]);
    if (key === titleKey || (titleKey.startsWith(key) && key.length >= 4)) {
      i += 1;
      continue;
    }
    break;
  }
  return paras.slice(i);
}
