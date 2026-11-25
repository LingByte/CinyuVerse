/**
 * Novel Library — local books + Tomato search/download via the managed
 * local `--server` process.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Library,
  Search,
  RefreshCw,
  Loader2,
  BookOpen,
  Download,
  FileText,
  FolderOpen,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Sparkles,
  Play,
  Square,
  HardDriveDownload,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/dialogs/shared/ConfirmDialog';
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

type DownloaderPhase =
  | 'missing'
  | 'installing'
  | 'ready'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

type DownloaderStatus = {
  phase: DownloaderPhase;
  installed: boolean;
  running: boolean;
  version: string | null;
  binaryPath: string | null;
  apiBase: string;
  message: string | null;
  installProgress: number | null;
};

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
  const [selectedLocal, setSelectedLocal] = useState<LocalBook | null>(null);
  const [selectedRemote, setSelectedRemote] = useState<SearchItem | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [epubBook, setEpubBook] = useState<EpubBook | null>(null);
  const [epubChapter, setEpubChapter] = useState<EpubChapter | null>(null);
  const [epubLoading, setEpubLoading] = useState(false);
  const [settings, setSettings] = useState<LibrarySettings | null>(null);
  const [pathDraft, setPathDraft] = useState('');
  const [pathSaving, setPathSaving] = useState(false);
  const [imitateStatus, setImitateStatus] = useState<ImitateStatusView | null>(
    null
  );
  const [imitateStarting, setImitateStarting] = useState(false);
  const [downloader, setDownloader] = useState<DownloaderStatus | null>(null);
  const [downloaderBusy, setDownloaderBusy] = useState(false);
  const [downloaderPromptOpen, setDownloaderPromptOpen] = useState(false);
  const pendingSearchRef = useRef(false);
  const localPreviewRequestRef = useRef(0);
  const readerScrollRef = useRef<HTMLDivElement | null>(null);

  const loadSettings = useCallback(async () => {
    const cfg = await invoke<LibrarySettings>('library_get_settings');
    setSettings(cfg);
    setPathDraft(cfg.libraryPath);
  }, []);

  const loadDownloaderStatus = useCallback(async () => {
    try {
      const status = await invoke<DownloaderStatus>('library_downloader_status');
      setDownloader(status);
    } catch (err) {
      setDownloader({
        phase: 'error',
        installed: false,
        running: false,
        version: null,
        binaryPath: null,
        apiBase: 'http://127.0.0.1:18423',
        message: err instanceof Error ? err.message : String(err),
        installProgress: null,
      });
    }
  }, []);

  const runDownloaderAction = useCallback(
    async (command: string) => {
      setDownloaderBusy(true);
      // Optimistic phase so the badge/polling update before the invoke returns.
      setDownloader((prev) => {
        if (!prev) return prev;
        if (command === 'library_start_downloader') {
          return {
            ...prev,
            phase: 'starting',
            message: '正在启动本机番茄下载服务…',
          };
        }
        if (command === 'library_install_downloader') {
          return {
            ...prev,
            phase: 'installing',
            message: '正在安装番茄下载器…',
            installProgress: prev.installProgress ?? 0.05,
          };
        }
        if (command === 'library_stop_downloader') {
          return {
            ...prev,
            phase: 'stopping',
            message: '正在停止本机服务…',
          };
        }
        return prev;
      });
      try {
        const status = await invoke<DownloaderStatus>(command);
        setDownloader(status);
        if (command === 'library_start_downloader') {
          await loadSettings();
        }
        return status;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(message);
        await loadDownloaderStatus();
        return null;
      } finally {
        setDownloaderBusy(false);
      }
    },
    [loadDownloaderStatus, loadSettings]
  );

  const loadLocal = useCallback(async () => {
    setLoading(true);
    try {
      const books = await invoke<LocalBook[]>('library_list_local');
      setLocalBooks(books);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadLocal();
    void loadDownloaderStatus();
  }, [loadDownloaderStatus, loadLocal, loadSettings]);

  useEffect(() => {
    const phase = downloader?.phase;
    const transitional =
      phase === 'installing' ||
      phase === 'starting' ||
      phase === 'stopping' ||
      downloaderBusy;
    if (!transitional) return;
    const timer = window.setInterval(() => {
      void loadDownloaderStatus();
    }, 500);
    return () => window.clearInterval(timer);
  }, [downloader?.phase, downloaderBusy, loadDownloaderStatus]);

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
      try {
        const updated = await invoke<LibrarySettings>('library_set_settings', {
          settings: { libraryPath: trimmed },
        });
        setSettings(updated);
        setPathDraft(updated.libraryPath);
        toast.success(`已切换到 ${updated.libraryPath}`);
        await loadLocal();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
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

  const runSearch = useCallback(
    async (query: string) => {
      setMode('search');
      setSearching(true);
      setSelectedRemote(null);
      setPreview(null);
      try {
        const resp = await invoke<{ items: SearchItem[] }>('library_search', {
          query,
        });
        setSearchResults(resp.items ?? []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    if (!downloader?.running) {
      pendingSearchRef.current = true;
      setDownloaderPromptOpen(true);
      return;
    }
    pendingSearchRef.current = false;
    await runSearch(q);
  }, [downloader?.running, runSearch, searchQuery]);

  const handleDownloaderPromptAction = useCallback(async () => {
    const phase = downloader?.phase ?? 'missing';
    const needsInstall =
      phase === 'missing' || (phase === 'error' && !downloader?.installed);
    const command = needsInstall
      ? 'library_install_downloader'
      : 'library_start_downloader';

    const status = await runDownloaderAction(command);
    if (needsInstall && status?.phase === 'ready') {
      const started = await runDownloaderAction('library_start_downloader');
      if (started?.running) {
        setDownloaderPromptOpen(false);
        if (pendingSearchRef.current && searchQuery.trim()) {
          pendingSearchRef.current = false;
          await runSearch(searchQuery.trim());
        }
      }
      return;
    }

    if (status?.running) {
      setDownloaderPromptOpen(false);
      if (pendingSearchRef.current && searchQuery.trim()) {
        pendingSearchRef.current = false;
        await runSearch(searchQuery.trim());
      }
    }
  }, [downloader, runDownloaderAction, runSearch, searchQuery]);

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
        toast.error(err instanceof Error ? err.message : String(err));
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
    try {
      const data = await invoke<PreviewResponse>('library_preview', {
        bookId: item.bookId,
      });
      setPreview(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
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
          toast.error(err instanceof Error ? err.message : String(err));
          setEpubLoading(false);
        }
      }
    },
    [loadEpubChapter, loadLocal]
  );

  const handleDeleteLocal = useCallback(async () => {
    if (!selectedLocal) return;
    const name = displayBookName(selectedLocal.name);
    const result = await ConfirmDialog.show({
      title: '删除本地书',
      message: `删除「${name}」？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'destructive',
    });
    if (result !== 'confirmed') return;
    try {
      await invoke('library_delete_local', { path: selectedLocal.path });
      setSelectedLocal(null);
      setEpubBook(null);
      setEpubChapter(null);
      setTextPreview(null);
      setImitateStatus(null);
      toast.success(`已删除「${name}」`);
      await loadLocal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
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
    void refreshImitateStatus(selectedLocal.path);
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
    try {
      const status = await invoke<ImitateStatusView>(
        'library_start_imitate_analysis',
        { path: selectedLocal.path }
      );
      setImitateStatus(status);
      toast.success('已开始仿写分析');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImitateStarting(false);
    }
  }, [selectedLocal]);

  const handleDownload = useCallback(
    async (item: SearchItem) => {
      if (!downloader?.running) {
        pendingSearchRef.current = false;
        setDownloaderPromptOpen(true);
        return;
      }
      setDownloadingId(item.bookId);
      try {
        const result = await invoke<DownloadResult>('library_download', {
          args: {
            bookId: item.bookId,
            preferredName: item.title,
          },
        });
        toast.success(`已下载「${result.title}」`);
        setMode('local');
        await loadLocal();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setDownloadingId(null);
      }
    },
    [downloader?.running, loadLocal]
  );

  const currentChapterIndex = epubChapter?.index ?? 0;
  const chapterCount = epubBook?.chapters.length ?? 0;
  const downloaderPhase = downloader?.phase ?? 'missing';
  const installProgress =
    typeof downloader?.installProgress === 'number'
      ? Math.round(downloader.installProgress * 100)
      : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="library-overlay flex h-full w-full flex-col overflow-hidden bg-background text-foreground"
        data-panel="library"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Library className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="shrink-0 text-sm font-semibold">
              {t('toolbar.library')}
            </h2>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {localBooks.length}
            </Badge>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Input
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={() => void saveLibraryPath(pathDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              placeholder={settings?.defaultLibraryPath || '本地书库路径'}
              className="h-7 min-w-0 flex-1 text-[11px]"
              title={pathDraft}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={pathSaving}
                  onClick={() => void handleBrowsePath()}
                >
                  {pathSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FolderOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>选择目录</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border/60 bg-[var(--surface-control)] p-0.5">
            <Button
              size="sm"
              variant={mode === 'local' ? 'secondary' : 'ghost'}
              className="h-6 px-2.5 text-[11px]"
              onClick={() => {
                setMode('local');
                setSelectedRemote(null);
                setPreview(null);
              }}
            >
              本地
            </Button>
            <Button
              size="sm"
              variant={mode === 'search' ? 'secondary' : 'ghost'}
              className="h-6 px-2.5 text-[11px]"
              onClick={() => {
                setMode('search');
                setSelectedLocal(null);
                setEpubBook(null);
                setEpubChapter(null);
                setTextPreview(null);
                setImitateStatus(null);
              }}
            >
              搜索
            </Button>
          </div>

          <TomatoDownloaderControls
            status={downloader}
            busy={downloaderBusy}
            onInstall={() => void runDownloaderAction('library_install_downloader')}
            onStart={() => void runDownloaderAction('library_start_downloader')}
            onStop={() => void runDownloaderAction('library_stop_downloader')}
            onRefresh={() => void loadDownloaderStatus()}
            onPrompt={() => setDownloaderPromptOpen(true)}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => void loadLocal()}
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新本地书库</TooltipContent>
          </Tooltip>
        </header>

        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder={
                mode === 'local' ? '筛选本地书名…' : '搜索书名或作者…'
              }
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-8"
            disabled={searching || !searchQuery.trim()}
            onClick={() => void handleSearch()}
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            搜索下载
          </Button>
        </div>

        {downloaderPhase === 'installing' && installProgress != null ? (
          <div className="border-b px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{downloader?.message || '正在安装番茄下载器…'}</span>
              <span>{installProgress}%</span>
            </div>
            <Progress value={installProgress} className="h-1.5" />
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-80 shrink-0 flex-col border-r">
            <ScrollArea className="min-h-0 flex-1">
              {mode === 'local' ? (
                <LocalBookList
                  loading={loading}
                  books={filteredLocal}
                  selectedPath={selectedLocal?.path ?? null}
                  onSelect={(book) => void handleSelectLocal(book)}
                />
              ) : (
                <SearchBookList
                  searching={searching}
                  items={searchResults}
                  selectedId={selectedRemote?.bookId ?? null}
                  downloadingId={downloadingId}
                  isDownloaded={isDownloaded}
                  onSelect={(item) => void handleSelectRemote(item)}
                  onDownload={(item) => void handleDownload(item)}
                />
              )}
            </ScrollArea>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {!selectedLocal && !selectedRemote ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <Library className="h-10 w-10 text-muted-foreground/35" />
                <p className="text-sm text-muted-foreground">
                  选择左侧藏书，或搜索后下载到本地
                </p>
              </div>
            ) : null}

            {selectedLocal ? (
              <LocalReader
                book={selectedLocal}
                epubBook={epubBook}
                epubChapter={epubChapter}
                epubLoading={epubLoading}
                textPreview={textPreview}
                textPreviewLoading={textPreviewLoading}
                imitateStatus={imitateStatus}
                imitateStarting={imitateStarting}
                currentChapterIndex={currentChapterIndex}
                chapterCount={chapterCount}
                readerScrollRef={readerScrollRef}
                onChapter={(index) => {
                  const requestId = ++localPreviewRequestRef.current;
                  void loadEpubChapter(selectedLocal.path, index, requestId);
                }}
                onImitate={() => void handleStartImitate()}
                onDelete={() => void handleDeleteLocal()}
              />
            ) : null}

            {selectedRemote ? (
              <RemotePreview
                item={selectedRemote}
                preview={preview}
                previewLoading={previewLoading}
                downloaded={isDownloaded(selectedRemote.title)}
                downloading={downloadingId === selectedRemote.bookId}
                onDownload={() => void handleDownload(selectedRemote)}
              />
            ) : null}
          </main>
        </div>

        <DownloaderRequiredDialog
          open={downloaderPromptOpen}
          status={downloader}
          busy={downloaderBusy}
          onOpenChange={(open) => {
            setDownloaderPromptOpen(open);
            if (!open) pendingSearchRef.current = false;
          }}
          onAction={() => void handleDownloaderPromptAction()}
        />
      </div>
    </TooltipProvider>
  );
}

function downloaderPhaseLabel(status: DownloaderStatus | null): string {
  if (!status) return '检测中';
  switch (status.phase) {
    case 'missing':
      return '未安装';
    case 'installing':
      return '安装中';
    case 'ready':
      return status.version ? `v${status.version}` : '已安装';
    case 'starting':
      return '启动中';
    case 'running':
      return status.version ? `运行中 · v${status.version}` : '运行中';
    case 'stopping':
      return '停止中';
    case 'error':
      return '异常';
    default:
      return status.phase;
  }
}

function TomatoDownloaderControls({
  status,
  busy,
  onInstall,
  onStart,
  onStop,
  onRefresh,
  onPrompt,
}: {
  status: DownloaderStatus | null;
  busy: boolean;
  onInstall: () => void;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onPrompt: () => void;
}) {
  const phase = status?.phase ?? 'missing';
  const badgeVariant =
    phase === 'running'
      ? 'default'
      : phase === 'error'
        ? 'destructive'
        : 'secondary';

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex"
            onClick={onPrompt}
          >
            <Badge
              variant={badgeVariant}
              className="h-6 cursor-pointer gap-1 px-2 text-[10px] font-medium"
            >
              <HardDriveDownload className="h-3 w-3" />
              {downloaderPhaseLabel(status)}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {status?.message || '番茄下载器状态'}
        </TooltipContent>
      </Tooltip>

      {phase === 'missing' || (phase === 'error' && !status?.installed) ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7"
          disabled={busy}
          onClick={onInstall}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          安装
        </Button>
      ) : null}

      {phase === 'ready' || (phase === 'error' && status?.installed) ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7"
          disabled={busy}
          onClick={onStart}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          启动
        </Button>
      ) : null}

      {phase === 'running' ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={busy}
          onClick={onStop}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </Button>
      ) : null}

      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        disabled={busy}
        onClick={onRefresh}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
      </Button>
    </div>
  );
}

function DownloaderRequiredDialog({
  open,
  status,
  busy,
  onOpenChange,
  onAction,
}: {
  open: boolean;
  status: DownloaderStatus | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: () => void;
}) {
  const phase = status?.phase ?? 'missing';
  const needsInstall =
    phase === 'missing' || (phase === 'error' && !status?.installed);
  const installing = phase === 'installing' || phase === 'starting';
  const progress =
    typeof status?.installProgress === 'number'
      ? Math.round(status.installProgress * 100)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="!max-w-[400px] sm:!max-w-[400px]"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {needsInstall ? '安装番茄下载器' : '启动番茄下载器'}
          </DialogTitle>
          <DialogDescription>
            {needsInstall
              ? '搜索和下载需要本机番茄下载器。安装完成后会自动启动。'
              : '番茄下载器已安装，但当前未运行。启动后即可搜索下载。'}
          </DialogDescription>
        </DialogHeader>

        {status?.message ? (
          <Alert>
            <AlertDescription className="text-xs">
              {status.message}
            </AlertDescription>
          </Alert>
        ) : null}

        {installing && progress != null ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>安装进度</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy && installing}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button disabled={busy} onClick={onAction}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : needsInstall ? (
              <Download className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {needsInstall ? '安装并启动' : '启动'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocalBookList({
  loading,
  books,
  selectedPath,
  onSelect,
}: {
  loading: boolean;
  books: LocalBook[];
  selectedPath: string | null;
  onSelect: (book: LocalBook) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-14 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-[75%]" />
              <Skeleton className="h-2.5 w-[33%]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 py-12 text-center">
        <BookOpen className="mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">本地还没有书</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 p-1.5">
      {books.map((book) => {
        const selected = selectedPath === book.path;
        return (
          <button
            key={book.path}
            type="button"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
              selected
                ? 'bg-[var(--surface-active)]'
                : 'hover:bg-[var(--surface-control-hover)]'
            )}
            onClick={() => onSelect(book)}
          >
            <CoverThumb
              dataUrl={book.coverDataUrl}
              fallback={
                book.ext === 'epub' || book.ext === 'book' ? (
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )
              }
            />
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
  );
}

function SearchBookList({
  searching,
  items,
  selectedId,
  downloadingId,
  isDownloaded,
  onSelect,
  onDownload,
}: {
  searching: boolean;
  items: SearchItem[];
  selectedId: string | null;
  downloadingId: string | null;
  isDownloaded: (title: string) => boolean;
  onSelect: (item: SearchItem) => void;
  onDownload: (item: SearchItem) => void;
}) {
  if (searching) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-14 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-[80%]" />
              <Skeleton className="h-2.5 w-[25%]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-muted-foreground">
        输入关键词搜索番茄书库
      </div>
    );
  }

  return (
    <div className="space-y-0.5 p-1.5">
      {items.map((item) => {
        const selected = selectedId === item.bookId;
        const downloaded = isDownloaded(item.title);
        const downloading = downloadingId === item.bookId;
        return (
          <div
            key={item.bookId}
            className={cn(
              'rounded-md px-2.5 py-2 transition-colors',
              selected
                ? 'bg-[var(--surface-active)]'
                : 'hover:bg-[var(--surface-control-hover)]'
            )}
          >
            <button
              type="button"
              className="flex w-full items-start gap-2.5 text-left"
              onClick={() => onSelect(item)}
            >
              <CoverThumb
                dataUrl={item.coverDataUrl}
                fallback={
                  <BookOpen className="h-4 w-4 text-muted-foreground/50" />
                }
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="line-clamp-2 text-[13px] font-medium leading-snug">
                  {item.title}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {item.author || '未知作者'}
                </div>
              </div>
            </button>
            <div className="mt-2 flex justify-end">
              {downloaded ? (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  已在本地
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2.5 text-[11px]"
                  disabled={downloading}
                  onClick={() => onDownload(item)}
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  下载
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CoverThumb({
  dataUrl,
  fallback,
}: {
  dataUrl: string | null;
  fallback: ReactNode;
}) {
  return (
    <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted">
      {dataUrl ? (
        <img src={dataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {fallback}
        </div>
      )}
    </div>
  );
}

function LocalReader({
  book,
  epubBook,
  epubChapter,
  epubLoading,
  textPreview,
  textPreviewLoading,
  imitateStatus,
  imitateStarting,
  currentChapterIndex,
  chapterCount,
  readerScrollRef,
  onChapter,
  onImitate,
  onDelete,
}: {
  book: LocalBook;
  epubBook: EpubBook | null;
  epubChapter: EpubChapter | null;
  epubLoading: boolean;
  textPreview: string | null;
  textPreviewLoading: boolean;
  imitateStatus: ImitateStatusView | null;
  imitateStarting: boolean;
  currentChapterIndex: number;
  chapterCount: number;
  readerScrollRef: RefObject<HTMLDivElement | null>;
  onChapter: (index: number) => void;
  onImitate: () => void;
  onDelete: () => void;
}) {
  const isEpub = book.ext === 'epub' || book.ext === 'book';

  return (
    <div className="flex h-full overflow-hidden">
      {isEpub && epubBook ? (
        <div className="flex w-56 shrink-0 flex-col border-r">
          <div className="shrink-0 border-b px-3 py-2">
            <div className="truncate text-xs font-medium">目录</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {chapterCount} 章
              {epubBook.author ? ` · ${epubBook.author}` : ''}
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-1">
              {epubBook.chapters.map((chapter) => (
                <button
                  key={chapter.index}
                  type="button"
                  className={cn(
                    'mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-snug transition-colors',
                    chapter.index === currentChapterIndex
                      ? 'bg-[var(--surface-active)] font-medium'
                      : 'text-muted-foreground hover:bg-[var(--surface-control-hover)] hover:text-foreground'
                  )}
                  onClick={() => onChapter(chapter.index)}
                >
                  {chapter.title}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 space-y-3 border-b px-4 py-3">
          <div>
            <h3 className="text-base font-semibold leading-snug">
              {epubBook?.title || displayBookName(book.name)}
            </h3>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {book.path}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isEpub ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  disabled={epubLoading || currentChapterIndex <= 0 || !epubBook}
                  onClick={() => onChapter(Math.max(0, currentChapterIndex - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一章
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  disabled={
                    epubLoading ||
                    !epubBook ||
                    currentChapterIndex >= chapterCount - 1
                  }
                  onClick={() =>
                    onChapter(
                      Math.min(chapterCount - 1, currentChapterIndex + 1)
                    )
                  }
                >
                  下一章
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
            {book.ext === 'book' ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  disabled={
                    imitateStarting ||
                    imitateStatus?.phase === 'queued' ||
                    imitateStatus?.phase === 'running'
                  }
                  onClick={onImitate}
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
                <Badge
                  variant="outline"
                  className="h-5 text-[10px] font-normal"
                  data-testid="library-imitate-status"
                >
                  {imitateStatusLabel(imitateStatus)}
                </Badge>
              </>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() =>
                void invoke('library_open_local', { path: book.path })
              }
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() =>
                void invoke('library_reveal_local', { path: book.path })
              }
            >
              <FolderOpen className="h-3.5 w-3.5" />
              访达
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </Button>
          </div>
        </div>

        <div ref={readerScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          {isEpub ? (
            epubLoading && !epubChapter ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {book.ext === 'epub' ? '正在解析并转换书库…' : '加载章节…'}
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
              </article>
            ) : (
              <p className="text-xs text-muted-foreground">无法打开该 EPUB。</p>
            )
          ) : textPreviewLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
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
  );
}

function RemotePreview({
  item,
  preview,
  previewLoading,
  downloaded,
  downloading,
  onDownload,
}: {
  item: SearchItem;
  preview: PreviewResponse | null;
  previewLoading: boolean;
  downloaded: boolean;
  downloading: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-start gap-4">
          {preview?.coverDataUrl ? (
            <img
              src={preview.coverDataUrl}
              alt={preview.bookName || item.title}
              className="h-28 w-20 shrink-0 rounded-md border border-border/50 object-cover"
            />
          ) : previewLoading ? (
            <Skeleton className="h-28 w-20 shrink-0 rounded-md" />
          ) : (
            <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted text-[10px] text-muted-foreground">
              无封面
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-base font-semibold leading-snug">
              {preview?.bookName || item.title}
            </h3>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{preview?.author || item.author || '未知作者'}</span>
              {preview?.category ? <span>· {preview.category}</span> : null}
              {preview?.chapterCount ? (
                <span>· {preview.chapterCount} 章</span>
              ) : null}
              {preview?.wordCount ? (
                <span>· {(preview.wordCount / 10000).toFixed(1)} 万字</span>
              ) : null}
              {preview?.finished ? (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  完结
                </Badge>
              ) : null}
            </div>
            <div className="flex justify-end">
              {downloaded ? (
                <Badge variant="secondary">已在本地</Badge>
              ) : (
                <Button
                  size="sm"
                  disabled={downloading}
                  onClick={onDownload}
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  下载到本地
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {previewLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[83%]" />
              <Skeleton className="h-3 w-[66%]" />
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
              {preview?.description || '暂无简介'}
            </p>
          )}
        </div>
      </ScrollArea>
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
