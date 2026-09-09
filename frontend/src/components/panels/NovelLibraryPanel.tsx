/**
 * Novel Library Panel — displays reference novels scraped from free book
 * sites and stored in Qiniu object storage. The panel lets the author browse,
 * search, preview, and import reference texts into the current project's
 * `.cinyuverse/references/` directory for AI style analysis.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Library,
  Search,
  RefreshCw,
  Loader2,
  BookOpen,
  Download,
  FileText,
  ChevronRight,
  ChevronLeft,
  Settings,
  List,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { invoke } from '@tauri-apps/api/core';
import { useProject } from '@/contexts/ProjectContext';
import { fileTreeApi } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types — mirror the Rust QiniuStorage crate structs
// ---------------------------------------------------------------------------

type LibraryItem = {
  key: string;
  title: string;
  author: string;
  category: string;
  word_count: number;
  chapter_count: number;
  status: string;
  source_url: string;
  uploaded_at: string;
  size: number;
};

type LibraryListResponse = {
  items: LibraryItem[];
  total: number;
};

type QiniuConfig = {
  access_key: string;
  secret_key: string;
  bucket: string;
  domain: string;
  is_configured: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NovelLibraryPanel() {
  const { t } = useTranslation();
  const { projectId } = useProject();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [chapters, setChapters] = useState<string[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chapterPage, setChapterPage] = useState(0);
  const CHAPTERS_PER_PAGE = 50;
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState<string | null>(null);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [config, setConfig] = useState<QiniuConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // ----- Load config -----
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await invoke<QiniuConfig>('qiniu_get_config');
      setConfig(cfg);
    } catch {
      setConfig(null);
    }
  }, []);

  // ----- Load library list -----
  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await invoke<LibraryListResponse>('qiniu_list_novels', {
        prefix: 'novels/',
        limit: 100,
      });
      setItems(resp.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadLibrary();
  }, [loadConfig, loadLibrary]);

  // ----- Filtered items -----
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [items, search]);

  // ----- Preview a novel: load metadata + chapter list -----
  const handlePreview = useCallback(async (item: LibraryItem) => {
    setSelectedItem(item);
    setPreviewContent(null);
    setSelectedChapter(null);
    setChapterContent(null);
    setChapters([]);
    setChapterPage(0);
    setChaptersLoading(true);
    setPreviewLoading(true);
    try {
      // Load book overview (first 3000 chars for the header preview)
      const content = await invoke<string>('qiniu_download_book', {
        bookKey: item.key,
        maxChars: 3000,
      });
      setPreviewContent(content);
      // Load chapter list
      const chList = await invoke<string[]>('qiniu_list_chapters', {
        bookKey: item.key,
      });
      setChapters(chList);
    } catch (err) {
      setPreviewContent(`加载失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setChaptersLoading(false);
      setPreviewLoading(false);
    }
  }, []);

  // ----- Load a single chapter -----
  const handleSelectChapter = useCallback(
    async (chapterKey: string) => {
      setSelectedChapter(chapterKey);
      setChapterContent(null);
      setChapterLoading(true);
      try {
        const content = await invoke<string>('qiniu_download_text', {
          key: chapterKey,
          maxChars: 0,
        });
        setChapterContent(content);
      } catch (err) {
        setChapterContent(`加载失败: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setChapterLoading(false);
      }
    },
    []
  );

  // ----- Import novel into current project's references -----
  const handleImport = useCallback(
    async (item: LibraryItem) => {
      if (!projectId) return;
      setImporting(true);
      setImportNotice(null);
      try {
        const content = await invoke<string>('qiniu_download_book', {
          bookKey: item.key,
          maxChars: 0,
        });
        // Write to .cinyuverse/references/
        const projectRoot = projectId;
        const refPath = `${projectRoot}/.cinyuverse/references/${item.title}.md`;
        await fileTreeApi.saveFile(refPath, content);
        setImportNotice(`已导入「${item.title}」到 .cinyuverse/references/`);
      } catch (err) {
        setImportNotice(
          `导入失败: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setImporting(false);
      }
    },
    [projectId]
  );

  // ----- Render -----
  if (!projectId) {
    return (
      <div className="library-overlay bg-background text-foreground flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('panels:overview.noProject')}</p>
      </div>
    );
  }

  return (
    <div className="library-overlay bg-background text-foreground flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('toolbar.library')}</h2>
          <span className="text-xs text-muted-foreground">
            {items.length > 0 && `${items.length} 部参考作品`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowConfig(!showConfig)}
            title="七牛云配置"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void loadLibrary()}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Config panel (collapsible) */}
      {showConfig && (
        <QiniuConfigPanel
          config={config}
          onSaved={() => {
            void loadConfig();
            void loadLibrary();
            setShowConfig(false);
          }}
        />
      )}

      {/* Search bar */}
      <div className="border-b px-4 py-2">
        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索书名、作者、分类..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Import notice */}
      {importNotice && (
        <div className="flex items-center justify-between gap-2 border-b bg-slate-100 dark:bg-slate-800/60 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span>{importNotice}</span>
          <button
            className="text-slate-400 hover:text-slate-600"
            onClick={() => setImportNotice(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Main content: list + preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Novel list */}
        <div className="w-80 border-r overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">加载中...</span>
            </div>
          )}
          {error && (
            <div className="p-4 text-xs text-rose-500">
              <p className="font-medium mb-1">加载失败</p>
              <p className="text-muted-foreground">{error}</p>
              {!config?.is_configured && (
                <p className="mt-2 text-amber-600">
                  请先配置七牛云存储（点击右上角齿轮）
                </p>
              )}
            </div>
          )}
          {!loading && !error && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                {items.length === 0
                  ? '书库为空，请先爬取参考小说并上传'
                  : '没有匹配的结果'}
              </p>
            </div>
          )}
          <div className="divide-y">
            {filteredItems.map((item) => (
              <div
                key={item.key}
                className={cn(
                  'px-3 py-2.5 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                  selectedItem?.key === item.key &&
                    'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500'
                )}
                onClick={() => void handlePreview(item)}
              >
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {item.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{item.author}</span>
                      <span>·</span>
                      <span>{item.category}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{item.chapter_count} 章</span>
                      <span>·</span>
                      <span>{(item.word_count / 10000).toFixed(1)} 万字</span>
                      {item.status === 'completed' && (
                        <span className="text-emerald-500">· 完结</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedItem && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Library className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                从左侧选择一部参考作品查看预览
              </p>
            </div>
          )}
          {selectedItem && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Book header */}
              <div className="p-4 pb-3 border-b shrink-0">
                <h3 className="text-lg font-semibold">{selectedItem.title}</h3>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                  <span>作者: {selectedItem.author}</span>
                  <span>分类: {selectedItem.category}</span>
                  <span>
                    {(selectedItem.word_count / 10000).toFixed(1)} 万字
                  </span>
                  <span>{selectedItem.chapter_count} 章</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleImport(selectedItem)}
                    disabled={importing}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {importing ? '导入中...' : '导入到当前作品参考库'}
                  </Button>
                  <a
                    href={selectedItem.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    来源链接
                  </a>
                </div>
              </div>

              {/* Body: chapter list + content reader */}
              <div className="flex-1 flex overflow-hidden">
                {/* Chapter list sidebar */}
                <div className="w-56 shrink-0 border-r flex flex-col overflow-hidden">
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground shrink-0 border-b">
                    <List className="h-3 w-3 inline mr-1" />
                    章节目录 ({chapters.length})
                  </div>
                  {chaptersLoading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!chaptersLoading && chapters.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground/50">
                      无章节
                    </div>
                  )}
                  {!chaptersLoading && chapters.length > 0 && (
                    <>
                      <div className="flex-1 overflow-y-auto">
                        {chapters
                          .slice(
                            chapterPage * CHAPTERS_PER_PAGE,
                            (chapterPage + 1) * CHAPTERS_PER_PAGE
                          )
                          .map((chKey) => {
                            const chName = chKey.split('/').pop() || chKey;
                            const chIdx = chName.replace('.md', '');
                            const isActive = selectedChapter === chKey;
                            return (
                              <button
                                key={chKey}
                                onClick={() => void handleSelectChapter(chKey)}
                                className={`w-full text-left px-3 py-1.5 text-xs border-b border-border/30 transition-colors ${
                                  isActive
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'hover:bg-muted/50 text-foreground/70'
                                }`}
                              >
                                第 {chIdx} 章
                              </button>
                            );
                          })}
                      </div>
                      {/* Pagination */}
                      {chapters.length > CHAPTERS_PER_PAGE && (
                        <div className="shrink-0 flex items-center justify-between px-2 py-1.5 border-t text-xs">
                          <button
                            disabled={chapterPage === 0}
                            onClick={() => setChapterPage(chapterPage - 1)}
                            className="p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-muted-foreground">
                            {chapterPage + 1}/
                            {Math.ceil(chapters.length / CHAPTERS_PER_PAGE)}
                          </span>
                          <button
                            disabled={
                              (chapterPage + 1) * CHAPTERS_PER_PAGE >=
                              chapters.length
                            }
                            onClick={() => setChapterPage(chapterPage + 1)}
                            className="p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Content reader */}
                <div className="flex-1 overflow-y-auto p-4">
                  {previewLoading && !selectedChapter && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-xs text-muted-foreground">
                        加载预览...
                      </span>
                    </div>
                  )}
                  {!selectedChapter && previewContent && !previewLoading && (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/80">
                        {previewContent}
                      </pre>
                    </div>
                  )}
                  {selectedChapter && (
                    <div>
                      <button
                        onClick={() => {
                          setSelectedChapter(null);
                          setChapterContent(null);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        返回概览
                      </button>
                      {chapterLoading && (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="ml-2 text-xs text-muted-foreground">
                            加载章节...
                          </span>
                        </div>
                      )}
                      {chapterContent && !chapterLoading && (
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/80">
                          {chapterContent}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Qiniu config sub-panel
// ---------------------------------------------------------------------------

function QiniuConfigPanel({
  config,
  onSaved,
}: {
  config: QiniuConfig | null;
  onSaved: () => void;
}) {
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bucket, setBucket] = useState('');
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setAccessKey(config.access_key);
      setSecretKey(config.secret_key);
      setBucket(config.bucket);
      setDomain(config.domain);
    }
  }, [config]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await invoke('qiniu_set_config', {
        accessKey,
        secretKey,
        bucket,
        domain,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [accessKey, secretKey, bucket, domain, onSaved]);

  return (
    <div className="border-b bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
      <div className="text-xs font-medium mb-2">七牛云对象存储配置</div>
      <div className="grid grid-cols-2 gap-2 max-w-lg">
        <Input
          placeholder="Access Key"
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          className="h-7 text-xs"
        />
        <Input
          placeholder="Secret Key"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          type="password"
          className="h-7 text-xs"
        />
        <Input
          placeholder="Bucket 名称"
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          className="h-7 text-xs"
        />
        <Input
          placeholder="绑定域名 (如 https://cdn.example.com)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
      {error && (
        <p className="text-xs text-rose-500 mt-1">{error}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </Button>
        {config?.is_configured && (
          <span className="text-xs text-emerald-600">已配置</span>
        )}
      </div>
    </div>
  );
}

// Utility — cn helper (avoid extra import if not already available)
function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
