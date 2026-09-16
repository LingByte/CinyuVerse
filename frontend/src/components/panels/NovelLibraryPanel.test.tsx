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
