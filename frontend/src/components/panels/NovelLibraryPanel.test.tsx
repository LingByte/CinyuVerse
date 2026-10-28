import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

vi.mock('@/hooks', () => ({
  useProjectRepos: () => ({ data: [{ id: 'r1', path: 'D:/books/bookx' }] }),
}));

vi.mock('@/contexts/ProjectContext', () => ({
  useProject: () => ({ projectId: 'p1' }),
}));

vi.mock('@/lib/api', () => ({
  fileTreeApi: {
    getTree: vi.fn().mockRejectedValue(new Error('no dir')),
    readFile: vi.fn().mockRejectedValue(new Error('no file')),
    saveFile: vi.fn(),
    createDirectory: vi.fn(),
    listDirectoryChildren: vi.fn().mockRejectedValue(new Error('no dir')),
  },
}));

import { NovelLibraryPanel } from './NovelLibraryPanel';

const EMPTY_LIST = { items: [], total: 0 };
const CONFIGURED = {
  access_key: 'ak',
  secret_key: 'sk',
  bucket: 'b',
  domain: 'd',
  is_configured: true,
};

describe('NovelLibraryPanel empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('points unconfigured users at the storage setup CTA and opens the config panel', async () => {
    mocks.invoke.mockImplementation((cmd: string) => {
      if (cmd === 'qiniu_get_config')
        return Promise.reject(new Error('invoke handler not registered'));
      if (cmd === 'qiniu_list_novels') return Promise.resolve(EMPTY_LIST);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<NovelLibraryPanel />);

    await waitFor(() => {
      expect(
        screen.getByText('尚未配置云存储，完成七牛配置后即可浏览书库')
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '配置存储' }));
    expect(screen.getByText('七牛云对象存储配置')).toBeInTheDocument();
  });

  it('shows the crawler upload hint instead when storage is configured but empty', async () => {
    mocks.invoke.mockImplementation((cmd: string) => {
      if (cmd === 'qiniu_get_config') return Promise.resolve(CONFIGURED);
      if (cmd === 'qiniu_list_novels') return Promise.resolve(EMPTY_LIST);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<NovelLibraryPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(/用爬虫工具把参考小说上传到七牛桶/)
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: '配置存储' })
    ).not.toBeInTheDocument();
  });
});

describe('NovelLibraryPanel import progress scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const bookA = {
    key: 'novels/jia',
    title: '书甲',
    author: '甲作者',
    category: '玄幻',
    word_count: 100000,
    chapter_count: 100,
    status: 'completed',
    source_url: 'https://example.com/a',
    uploaded_at: '',
    size: 100,
  };
  const bookB = {
    key: 'novels/yi',
    title: '书乙',
    author: '乙作者',
    category: '都市',
    word_count: 200000,
    chapter_count: 200,
    status: 'completed',
    source_url: 'https://example.com/b',
    uploaded_at: '',
    size: 200,
  };

  it('imports several books concurrently with independent progress states', async () => {
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    const dlA = deferred<{ content: string; failed_chapters: string[] }>();
    const dlB = deferred<{ content: string; failed_chapters: string[] }>();
    mocks.invoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === 'qiniu_get_config') return Promise.resolve(CONFIGURED);
      if (cmd === 'qiniu_list_novels')
        return Promise.resolve({ items: [bookA, bookB], total: 2 });
      if (cmd === 'qiniu_list_chapters') return Promise.resolve([]);
      if (cmd === 'qiniu_download_book') {
        const key = (args as { bookKey: string }).bookKey;
        return key === bookA.key ? dlA.promise : dlB.promise;
      }
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<NovelLibraryPanel />);

    // Clicking a list row: once a book is selected its title also appears in
    // the detail header, so take the sidebar-row occurrence (always first).
    const clickRow = (title: string) => {
      fireEvent.click(screen.getAllByText(title)[0]);
    };

    // Start both imports while the downloads are in flight.
    await screen.findByText('书甲');
    clickRow('书甲');
    fireEvent.click(
      await screen.findByRole('button', { name: '导入到当前作品参考库' })
    );
    await waitFor(() => {
      expect(screen.getByText('导入中...')).toBeInTheDocument();
    });
    clickRow('书乙');
    fireEvent.click(
      screen.getByRole('button', { name: '导入到当前作品参考库' })
    );

    // Each book reports its own in-progress state.
    clickRow('书甲');
    expect(screen.getByText('导入中...')).toBeInTheDocument();
    clickRow('书乙');
    expect(screen.getByText('导入中...')).toBeInTheDocument();

    // Finishing one leaves the other untouched.
    dlA.resolve({ content: '甲的内容', failed_chapters: [] });
    clickRow('书甲');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '已导入' })
      ).toBeInTheDocument();
    });
    clickRow('书乙');
    expect(screen.getByText('导入中...')).toBeInTheDocument();

    dlB.resolve({ content: '乙的内容', failed_chapters: [] });
    clickRow('书乙');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '已导入' })
      ).toBeInTheDocument();
    });
  });
});
