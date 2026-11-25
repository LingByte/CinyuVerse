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
  ListTodo,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
import {
  imitateStatusLabel,
  imitateStepPercent,
  type ImitateStatusView,
} from '@/components/panels/novelLibraryImitateUi';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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

type DownloadPhase =
  | 'waiting_slot'
  | 'queued'
  | 'running'
  | 'saving'
  | 'converting'
  | 'done'
  | 'failed'
  | string;

type ActiveDownload = {
  bookId: string;
  title: string;
  phase: DownloadPhase;
  message: string | null;
  percent: number | null;
  updatedAt: number;
};

type DownloadProgressEvent = {
  bookId: string;
  title: string;
  phase: DownloadPhase;
  message: string | null;
  jobId: number | null;
  percent: number | null;
};

type ImitateCraftRule = {
  rule: string;
  why?: string;
  evidence: { chapterIndex: number; quote: string };
};

type ImitateCharacterCard = {
  name?: string;
  /** @deprecated legacy placeholder id */
  slot?: string;
  roleFunction: string;
  desire: string;
  costOrFear: string;
  voiceTraits?: string[];
  voiceSamples?: string[];
  voiceRules: string[];
  keyEvents?: string[];
  arcStages: string[];
  relationships: Array<{ toName?: string; toSlot?: string; tension: string }>;
  tags: string[];
};

type ImitatePackView = {
  schemaVersion: number;
  storyline: {
    throughline: string;
    signatureDevices?: string[];
    acts: Array<{
      name: string;
      function: string;
      beatPatterns: string[];
    }>;
    escalationLadder: string[];
    foreshadowCadence: string;
    chapterEngines: Array<{
      pattern: string;
      purpose: string;
      placement: string;
    }>;
    mustMutate: string[];
  };
  characters: ImitateCharacterCard[];
  craft: {
    howToImitate?: string[];
    proseEngines: ImitateCraftRule[];
    dialogueEngines: ImitateCraftRule[];
    infoControl: string[];
    chapterEndingHooks: string[];
    forbiddenHabits: string[];
    narrationStance: string;
  };
  setting: {
    conflictAxes: string[];
    worldframeType: string;
    powerSystemType: string;
    stakesCurrency: string[];
    tabooTransfers: string[];
    notes: string[];
  };
  antiPlagiarism: {
    bannedNames: string[];
    bannedSetpieces: string[];
    rewriteMandates: string[];
    reviewChecklist: string[];
  };
};

type ImitateSeedResult = {
  projectPath: string;
  projectId: string;
  title: string;
};

export function NovelLibraryPanel() {
  const { t } = useTranslation('panels');
  const [mode, setMode] = useState<Mode>('local');
  const [localBooks, setLocalBooks] = useState<LocalBook[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<
    Record<string, ActiveDownload>
  >({});
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
  const [imitatePack, setImitatePack] = useState<ImitatePackView | null>(null);
  const [imitatePackLoading, setImitatePackLoading] = useState(false);
  const [imitateStarting, setImitateStarting] = useState(false);
  const [imitateCancelling, setImitateCancelling] = useState(false);
  const [imitateRecovering, setImitateRecovering] = useState(false);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedTitle, setSeedTitle] = useState('');
  const [seedParentDir, setSeedParentDir] = useState('');
  const [seedBusy, setSeedBusy] = useState(false);
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
          if (status.phase === 'starting') {
            toast.info(status.message || '下载器仍在启动，请稍候刷新');
          }
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
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<DownloadProgressEvent>('library-download-progress', (event) => {
      if (disposed) return;
      const payload = event.payload;
      setActiveDownloads((prev) => {
        const next = { ...prev };
        if (payload.phase === 'done') {
          delete next[payload.bookId];
          return next;
        }
        next[payload.bookId] = {
          bookId: payload.bookId,
          title: payload.title || prev[payload.bookId]?.title || payload.bookId,
          phase: payload.phase,
          message: payload.message,
          percent: payload.percent,
          updatedAt: Date.now(),
        };
        return next;
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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
      setImitatePack(null);
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

  const refreshImitatePack = useCallback(async (path: string) => {
    setImitatePackLoading(true);
    try {
      const pack = await invoke<ImitatePackView>('library_imitate_pack', {
        path,
      });
      setImitatePack(pack);
      return pack;
    } catch {
      setImitatePack(null);
      return null;
    } finally {
      setImitatePackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedLocal || selectedLocal.ext !== 'book') {
      setImitateStatus(null);
      setImitatePack(null);
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

  useEffect(() => {
    if (
      !selectedLocal ||
      selectedLocal.ext !== 'book' ||
      imitateStatus?.phase !== 'completed'
    ) {
      if (imitateStatus?.phase !== 'completed') {
        setImitatePack(null);
      }
      return;
    }
    void refreshImitatePack(selectedLocal.path);
  }, [selectedLocal, imitateStatus?.phase, refreshImitatePack]);

  const handleStartImitate = useCallback(async () => {
    if (!selectedLocal || selectedLocal.ext !== 'book') return;
    setImitateStarting(true);
    setImitatePack(null);
    try {
      const status = await invoke<ImitateStatusView>(
        'library_start_imitate_analysis',
        { path: selectedLocal.path }
      );
      setImitateStatus(status);
      toast.success('已开始深度分析（故事线 / 人物卡 / 写法）');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImitateStarting(false);
    }
  }, [selectedLocal]);

  const handleCancelImitate = useCallback(async () => {
    if (!selectedLocal || selectedLocal.ext !== 'book') return;
    setImitateCancelling(true);
    try {
      const status = await invoke<ImitateStatusView>(
        'library_cancel_imitate_analysis',
        { path: selectedLocal.path }
      );
      setImitateStatus(status);
      toast.success('已中断分析');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImitateCancelling(false);
    }
  }, [selectedLocal]);

  const handleRecoverImitate = useCallback(async () => {
    if (!selectedLocal || selectedLocal.ext !== 'book') return;
    setImitateRecovering(true);
    try {
      const status = await invoke<ImitateStatusView>(
        'library_imitate_recover',
        { path: selectedLocal.path }
      );
      setImitateStatus(status);
      await refreshImitatePack(selectedLocal.path);
      toast.success('已从原文重新解析');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImitateRecovering(false);
    }
  }, [refreshImitatePack, selectedLocal]);

  const handleOpenSeedDialog = useCallback(() => {
    if (!selectedLocal) return;
    setSeedTitle(`${displayBookName(selectedLocal.name)}·转置`);
    setSeedParentDir('');
    setSeedDialogOpen(true);
  }, [selectedLocal]);

  const handleSeedProject = useCallback(async () => {
    if (!selectedLocal || selectedLocal.ext !== 'book') return;
    if (!seedTitle.trim()) {
      toast.error('请填写新书标题');
      return;
    }
    if (!seedParentDir.trim()) {
      toast.error('请选择保存目录');
      return;
    }
    setSeedBusy(true);
    try {
      const result = await invoke<ImitateSeedResult>(
        'library_imitate_seed_project',
        {
          path: selectedLocal.path,
          parentDir: seedParentDir,
          newTitle: seedTitle.trim(),
        }
      );
      setSeedDialogOpen(false);
      toast.success(`已开新书「${result.title}」`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSeedBusy(false);
    }
  }, [selectedLocal, seedParentDir, seedTitle]);

  const handleDownload = useCallback(
    async (item: SearchItem) => {
      if (!downloader?.running) {
        pendingSearchRef.current = false;
        setDownloaderPromptOpen(true);
        return;
      }
      if (activeDownloads[item.bookId]) {
        toast.info(`「${item.title}」已在下载队列中`);
        return;
      }
      // Tomato server is single-slot; multiple invokes queue on the busy slot.
      setActiveDownloads((prev) => ({
        ...prev,
        [item.bookId]: {
          bookId: item.bookId,
          title: item.title,
          phase: 'waiting_slot',
          message: '已加入下载队列…',
          percent: 5,
          updatedAt: Date.now(),
        },
      }));
      try {
        const result = await invoke<DownloadResult>('library_download', {
          args: {
            bookId: item.bookId,
            preferredName: item.title,
          },
        });
        toast.success(`已下载「${result.title}」`);
        setActiveDownloads((prev) => {
          const next = { ...prev };
          delete next[item.bookId];
          return next;
        });
        await loadLocal();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(message);
        setActiveDownloads((prev) => ({
          ...prev,
          [item.bookId]: {
            bookId: item.bookId,
            title: item.title,
            phase: 'failed',
            message,
            percent: null,
            updatedAt: Date.now(),
          },
        }));
      }
    },
    [activeDownloads, downloader?.running, loadLocal]
  );

  const dismissFailedDownload = useCallback((bookId: string) => {
    setActiveDownloads((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
  }, []);

  const activeDownloadList = useMemo(
    () =>
      Object.values(activeDownloads).sort((a, b) => a.updatedAt - b.updatedAt),
    [activeDownloads]
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
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <div className="flex shrink-0 items-center gap-1.5">
            <Library className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t('toolbar.library')}</h2>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {localBooks.length}
            </Badge>
          </div>

          <div className="flex items-center gap-0.5 rounded-md border border-border/50 p-0.5">
            <Button
              size="sm"
              variant={mode === 'local' ? 'secondary' : 'ghost'}
              className="h-6 px-2 text-[11px]"
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
              className="h-6 px-2 text-[11px]"
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

          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder={
                mode === 'local' ? '筛选本地…' : '搜索书名或作者…'
              }
              className="h-7 pl-7 text-xs"
            />
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="h-7 shrink-0"
            disabled={searching || !searchQuery.trim()}
            onClick={() => void handleSearch()}
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              '搜索'
            )}
          </Button>

          <div className="flex shrink-0 items-center gap-0.5">
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
              <TooltipContent className="max-w-sm break-all">
                {pathDraft || settings?.defaultLibraryPath || '选择书库目录'}
              </TooltipContent>
            </Tooltip>

            <TomatoDownloaderControls
              status={downloader}
              busy={downloaderBusy}
              onInstall={() =>
                void runDownloaderAction('library_install_downloader')
              }
              onStart={() =>
                void runDownloaderAction('library_start_downloader')
              }
              onStop={() =>
                void runDownloaderAction('library_stop_downloader')
              }
              onRefresh={() => void loadDownloaderStatus()}
              onPrompt={() => setDownloaderPromptOpen(true)}
            />

            <DownloadQueuePopover
              downloads={activeDownloadList}
              onDismissFailed={dismissFailedDownload}
              onShowLocal={() => setMode('local')}
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
              <TooltipContent>刷新</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {downloaderPhase === 'installing' && installProgress != null ? (
          <div className="border-b px-3 py-1.5">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{downloader?.message || '正在安装…'}</span>
              <span>{installProgress}%</span>
            </div>
            <Progress value={installProgress} className="h-1" />
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r">
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
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
                  downloads={activeDownloads}
                  isDownloaded={isDownloaded}
                  onSelect={(item) => void handleSelectRemote(item)}
                  onDownload={(item) => void handleDownload(item)}
                />
              )}
            </div>
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
                imitatePack={imitatePack}
                imitatePackLoading={imitatePackLoading}
                imitateStarting={imitateStarting}
                imitateCancelling={imitateCancelling}
                currentChapterIndex={currentChapterIndex}
                chapterCount={chapterCount}
                readerScrollRef={readerScrollRef}
                onChapter={(index) => {
                  const requestId = ++localPreviewRequestRef.current;
                  void loadEpubChapter(selectedLocal.path, index, requestId);
                }}
                onImitate={() => void handleStartImitate()}
                onCancelImitate={() => void handleCancelImitate()}
                onRecoverImitate={() => void handleRecoverImitate()}
                imitateRecovering={imitateRecovering}
                onSeed={() => handleOpenSeedDialog()}
                onDelete={() => void handleDeleteLocal()}
              />
            ) : null}

            {selectedRemote ? (
              <RemotePreview
                item={selectedRemote}
                preview={preview}
                previewLoading={previewLoading}
                downloaded={isDownloaded(selectedRemote.title)}
                download={activeDownloads[selectedRemote.bookId] ?? null}
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

        <Dialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>据此开新书</DialogTitle>
              <DialogDescription>
                写入故事线骨架、人物卡与写法引擎，不粘贴原书范文。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">新书标题</label>
                <Input
                  value={seedTitle}
                  onChange={(e) => setSeedTitle(e.target.value)}
                  placeholder="新书名"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">保存位置</label>
                <div className="flex gap-2">
                  <Input
                    value={seedParentDir}
                    readOnly
                    placeholder="选择父目录"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={seedBusy}
                    onClick={() => {
                      void pickHostDirectory({ title: '选择新书保存目录' }).then(
                        (dir) => {
                          if (dir) setSeedParentDir(dir);
                        }
                      );
                    }}
                  >
                    浏览
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={seedBusy}
                onClick={() => setSeedDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                disabled={seedBusy}
                onClick={() => void handleSeedProject()}
                data-testid="library-imitate-seed-confirm"
              >
                {seedBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                创建项目
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
  const running = phase === 'running';
  const action =
    phase === 'missing' || (phase === 'error' && !status?.installed)
      ? { label: '安装', onClick: onInstall, icon: Download }
      : phase === 'ready' || (phase === 'error' && status?.installed)
        ? { label: '启动', onClick: onStart, icon: Play }
        : running
          ? { label: '停止', onClick: onStop, icon: Square }
          : null;

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={onPrompt}
          >
            <HardDriveDownload
              className={cn(
                'h-3.5 w-3.5',
                running && 'text-foreground',
                phase === 'error' && 'text-destructive',
                (phase === 'starting' || phase === 'installing') &&
                  'animate-pulse'
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {status?.message || downloaderPhaseLabel(status)}
        </TooltipContent>
      </Tooltip>
      {action ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={busy}
              onClick={action.onClick}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <action.icon className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{action.label}</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>刷新下载器状态</TooltipContent>
      </Tooltip>
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
    <div className="space-y-0.5 p-2">
      {books.map((book) => {
        const selected = selectedPath === book.path;
        return (
          <button
            key={book.path}
            type="button"
            className={cn(
              'flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
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

function downloadPhaseLabel(phase: DownloadPhase): string {
  switch (phase) {
    case 'waiting_slot':
      return '排队';
    case 'queued':
      return '等待';
    case 'running':
      return '下载中';
    case 'saving':
      return '保存中';
    case 'converting':
      return '转换中';
    case 'failed':
      return '失败';
    case 'done':
      return '完成';
    default:
      return phase;
  }
}

function DownloadQueuePopover({
  downloads,
  onDismissFailed,
  onShowLocal,
}: {
  downloads: ActiveDownload[];
  onDismissFailed: (bookId: string) => void;
  onShowLocal: () => void;
}) {
  const count = downloads.length;
  const hasActive = downloads.some((job) => job.phase !== 'failed');

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="relative h-7 px-2"
              disabled={count === 0}
            >
              <ListTodo
                className={cn(
                  'h-3.5 w-3.5',
                  hasActive && 'text-foreground',
                  count === 0 && 'text-muted-foreground'
                )}
              />
              {count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[9px] font-medium text-background">
                  {count}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {count > 0 ? `下载队列 · ${count}` : '暂无下载任务'}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-xs font-medium">下载队列</div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={onShowLocal}
          >
            本地书库
          </Button>
        </div>
        {count === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
            暂无进行中的下载
          </p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {downloads.map((job) => (
              <div
                key={job.bookId}
                className="rounded-md border border-border/50 px-2 py-1.5"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">
                      {job.title}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {job.message || downloadPhaseLabel(job.phase)}
                    </div>
                  </div>
                  {job.phase === 'failed' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 p-0"
                      onClick={() => onDismissFailed(job.bookId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {typeof job.percent === 'number'
                        ? `${job.percent}%`
                        : downloadPhaseLabel(job.phase)}
                    </span>
                  )}
                </div>
                {typeof job.percent === 'number' && job.phase !== 'failed' ? (
                  <Progress value={job.percent} className="mt-1.5 h-1" />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SearchBookList({
  searching,
  items,
  selectedId,
  downloads,
  isDownloaded,
  onSelect,
  onDownload,
}: {
  searching: boolean;
  items: SearchItem[];
  selectedId: string | null;
  downloads: Record<string, ActiveDownload>;
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
    <div className="space-y-0.5 p-2">
      {items.map((item) => {
        const selected = selectedId === item.bookId;
        const downloaded = isDownloaded(item.title);
        const download = downloads[item.bookId];
        const downloading = Boolean(download) && download.phase !== 'failed';
        return (
          <div
            key={item.bookId}
            className={cn(
              'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 transition-colors',
              selected
                ? 'bg-[var(--surface-active)]'
                : 'hover:bg-[var(--surface-control-hover)]'
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              onClick={() => onSelect(item)}
            >
              <CoverThumb
                dataUrl={item.coverDataUrl}
                fallback={
                  <BookOpen className="h-4 w-4 text-muted-foreground/50" />
                }
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="line-clamp-2 text-[13px] font-medium leading-snug">
                  {item.title}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {download
                    ? download.message || downloadPhaseLabel(download.phase)
                    : item.author || '未知作者'}
                </div>
              </div>
            </button>
            <div className="flex shrink-0 items-center justify-end">
              {downloaded ? (
                <Badge variant="secondary" className="h-6 px-1.5 text-[10px]">
                  已存
                </Badge>
              ) : downloading ? (
                <Badge
                  variant="secondary"
                  className="h-6 min-w-7 justify-center gap-1 px-1.5 text-[10px]"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {typeof download.percent === 'number'
                    ? `${download.percent}%`
                    : null}
                </Badge>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 w-7 shrink-0 p-0"
                      aria-label={`下载 ${item.title}`}
                      onClick={() => onDownload(item)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>下载</TooltipContent>
                </Tooltip>
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
  imitatePack,
  imitatePackLoading,
  imitateStarting,
  imitateCancelling,
  imitateRecovering,
  currentChapterIndex,
  chapterCount,
  readerScrollRef,
  onChapter,
  onImitate,
  onCancelImitate,
  onRecoverImitate,
  onSeed,
  onDelete,
}: {
  book: LocalBook;
  epubBook: EpubBook | null;
  epubChapter: EpubChapter | null;
  epubLoading: boolean;
  textPreview: string | null;
  textPreviewLoading: boolean;
  imitateStatus: ImitateStatusView | null;
  imitatePack: ImitatePackView | null;
  imitatePackLoading: boolean;
  imitateStarting: boolean;
  imitateCancelling: boolean;
  imitateRecovering: boolean;
  currentChapterIndex: number;
  chapterCount: number;
  readerScrollRef: RefObject<HTMLDivElement | null>;
  onChapter: (index: number) => void;
  onImitate: () => void;
  onCancelImitate: () => void;
  onRecoverImitate: () => void;
  onSeed: () => void;
  onDelete: () => void;
}) {
  const isEpub = book.ext === 'epub' || book.ext === 'book';
  const imitateBusy =
    imitateStarting ||
    imitateStatus?.phase === 'queued' ||
    imitateStatus?.phase === 'running';
  const showPack =
    book.ext === 'book' &&
    (imitatePack != null ||
      imitatePackLoading ||
      imitateStatus?.phase === 'completed');

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
                {imitateBusy ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7"
                    disabled={imitateCancelling}
                    onClick={onCancelImitate}
                    data-testid="library-imitate-cancel"
                  >
                    {imitateCancelling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                    中断
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7"
                    onClick={onImitate}
                    data-testid="library-imitate-analyze"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    深度分析
                  </Button>
                )}
                {imitateStatus?.phase === 'failed' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7"
                    disabled={imitateRecovering}
                    onClick={onRecoverImitate}
                    data-testid="library-imitate-recover"
                  >
                    {imitateRecovering ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    重解析原文
                  </Button>
                ) : null}
                {imitateStatus?.phase === 'completed' && imitatePack ? (
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={onSeed}
                    data-testid="library-imitate-seed"
                  >
                    据此开新书
                  </Button>
                ) : null}
                <Badge
                  variant="outline"
                  className="h-5 max-w-[22rem] truncate text-[10px] font-normal"
                  data-testid="library-imitate-status"
                  title={imitateStatusLabel(imitateStatus)}
                >
                  {imitateStatusLabel(imitateStatus)}
                </Badge>
                {imitateBusy && imitateStepPercent(imitateStatus) != null ? (
                  <div
                    className="flex w-28 items-center gap-1.5"
                    data-testid="library-imitate-progress"
                  >
                    <Progress
                      value={imitateStepPercent(imitateStatus) ?? 0}
                      className="h-1.5"
                    />
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {imitateStepPercent(imitateStatus)}%
                    </span>
                  </div>
                ) : null}
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
          {showPack ? (
            <div className="mb-6 space-y-4" data-testid="library-imitate-pack">
              {imitatePackLoading && !imitatePack ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载分析包…
                </div>
              ) : null}
              {imitatePack ? <ImitatePackPanel pack={imitatePack} /> : null}
            </div>
          ) : null}
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

function ImitatePackPanel({ pack }: { pack: ImitatePackView }) {
  const devices = pack.storyline.signatureDevices ?? [];
  const howTo = pack.craft.howToImitate ?? [];
  return (
    <div className="mx-auto max-w-2xl space-y-5 rounded-lg border border-border/60 bg-[var(--surface-raised)]/40 p-4">
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">故事线</h4>
        <p className="text-[13px] leading-relaxed text-foreground/90">
          {pack.storyline.throughline || '（无主线）'}
        </p>
        {devices.length > 0 ? (
          <p className="text-[12px] text-foreground/80">
            独特装置：{devices.join('；')}
          </p>
        ) : null}
        {pack.storyline.acts.length > 0 ? (
          <ul className="space-y-1.5 text-[12px] text-muted-foreground">
            {pack.storyline.acts.map((act, i) => (
              <li key={`${act.name}-${i}`}>
                <span className="font-medium text-foreground/80">
                  {act.name || `幕${i + 1}`}
                </span>
                {act.function ? ` · ${act.function}` : ''}
                {act.beatPatterns.length > 0
                  ? ` — ${act.beatPatterns.join(' / ')}`
                  : ''}
              </li>
            ))}
          </ul>
        ) : null}
        {pack.storyline.escalationLadder.length > 0 ? (
          <p className="text-[12px] text-muted-foreground">
            升级：{pack.storyline.escalationLadder.join(' → ')}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">
          人物卡（{pack.characters.length}）
        </h4>
        <div className="space-y-3">
          {pack.characters.map((ch, idx) => {
            const displayName = ch.name || ch.slot || `人物${idx + 1}`;
            const traits = ch.voiceTraits ?? [];
            const samples = ch.voiceSamples ?? [];
            const events = ch.keyEvents ?? [];
            return (
              <div
                key={displayName}
                className="rounded-md border border-border/50 px-3 py-2"
              >
                <div className="text-[13px] font-medium">
                  {displayName}
                  {ch.roleFunction ? (
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      {ch.roleFunction}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  欲望：{ch.desire || '—'}
                  {ch.costOrFear ? ` · 代价：${ch.costOrFear}` : ''}
                </p>
                {traits.length > 0 ? (
                  <p className="mt-1 text-[12px] text-foreground/80">
                    声口：{traits.join('；')}
                  </p>
                ) : null}
                {samples.length > 0 ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    样本：{samples.map((s) => `「${s}」`).join(' ')}
                  </p>
                ) : null}
                {events.length > 0 ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    经历：{events.join('；')}
                  </p>
                ) : null}
                {traits.length === 0 && ch.voiceRules.length > 0 ? (
                  <p className="mt-1 text-[12px] text-foreground/80">
                    声音：{ch.voiceRules.join('；')}
                  </p>
                ) : null}
                {ch.arcStages.length > 0 ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    弧光：{ch.arcStages.join(' → ')}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">写法</h4>
        {pack.craft.narrationStance ? (
          <p className="text-[12px] text-muted-foreground">
            立场：{pack.craft.narrationStance}
          </p>
        ) : null}
        {howTo.length > 0 ? (
          <ul className="space-y-1 text-[12px] text-foreground/90">
            {howTo.map((tip, i) => (
              <li key={`how-${i}`}>· {tip}</li>
            ))}
          </ul>
        ) : null}
        <ul className="space-y-1.5 text-[12px]">
          {[...pack.craft.proseEngines, ...pack.craft.dialogueEngines].map(
            (rule, i) => (
              <li key={`${rule.rule}-${i}`} className="leading-snug">
                <span className="text-foreground/90">{rule.rule}</span>
                {rule.evidence?.quote ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · 取证「{rule.evidence.quote}」
                  </span>
                ) : null}
              </li>
            )
          )}
        </ul>
        {pack.craft.forbiddenHabits.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            禁止：{pack.craft.forbiddenHabits.join('；')}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function RemotePreview({
  item,
  preview,
  previewLoading,
  downloaded,
  download,
  onDownload,
}: {
  item: SearchItem;
  preview: PreviewResponse | null;
  previewLoading: boolean;
  downloaded: boolean;
  download: ActiveDownload | null;
  onDownload: () => void;
}) {
  const downloading = Boolean(download) && download?.phase !== 'failed';
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
            <div className="flex flex-col items-end gap-1.5">
              {downloaded ? (
                <Badge variant="secondary">已在本地</Badge>
              ) : downloading ? (
                <div className="w-full max-w-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {download?.message ||
                        downloadPhaseLabel(download?.phase ?? 'running')}
                    </span>
                    <span>
                      {typeof download?.percent === 'number'
                        ? `${download.percent}%`
                        : null}
                    </span>
                  </div>
                  <Progress value={download?.percent ?? 15} className="h-1.5" />
                </div>
              ) : (
                <Button size="sm" onClick={onDownload}>
                  <Download className="h-3.5 w-3.5" />
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
