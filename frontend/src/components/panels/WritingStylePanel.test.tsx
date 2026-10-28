import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fileTreeApi: {
    getTree: vi.fn().mockRejectedValue(new Error('no dir')),
    readFile: vi.fn().mockRejectedValue(new Error('no file')),
    saveFile: vi.fn(),
    createDirectory: vi.fn(),
    listDirectoryChildren: vi.fn().mockRejectedValue(new Error('no dir')),
  },
  fetch: vi.fn(),
  requestPrefill: vi.fn(),
  setRightPanelVisible: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useProjectRepos: () => ({ data: [{ id: 'r1', path: 'D:/books/bookx' }] }),
}));

vi.mock('@/contexts/ProjectContext', () => ({
  useProject: () => ({ projectId: 'p1' }),
}));

vi.mock('@/lib/api', () => ({ fileTreeApi: mocks.fileTreeApi }));

vi.mock('@/contexts/KanbanSessionContext', () => ({
  useKanbanSessionContext: () => ({
    visibleRightSession: { sessionId: 's1' },
  }),
}));

vi.mock('@/stores/useComposerPrefillStore', () => ({
  useComposerPrefillStore: (selector: (s: unknown) => unknown) =>
    selector({ requestPrefill: mocks.requestPrefill }),
}));

vi.mock('@/stores/useLayoutStore', () => ({
  useLayoutStore: (selector: (s: unknown) => unknown) =>
    selector({ setRightPanelVisible: mocks.setRightPanelVisible }),
}));

import { WritingStylePanel } from './WritingStylePanel';

const INDEX = {
  source: 'test',
  skills: [
    {
      id: 'xin-fanqie-style-gou',
      book: '每年加一点从山野村夫成仙界道祖',
      author: '',
      category: '番茄小说风格',
      keywords: ['苟道流', '长生苟王'],
      hasExamples: true,
    },
    {
      id: 'xin-gulong-style-duoqingjianke',
      book: '多情剑客无情剑',
      author: '古龙',
      category: '古龙武侠风格',
      keywords: ['苍凉浪漫'],
      hasExamples: true,
    },
  ],
};

const SKILL_MD =
  '---\nname: xin-fanqie-style-gou\ndescription: "文风锁定"\n---\n\n# 《每年加一点》文风锁定\n\n短句为主。';
const EXAMPLES_MD =
  '# 摘录\n\n## 摘录1：开篇（第1章）\n\n“长生真是寂寞如雪啊。”';

function respondToFetch(url: string): string {
  if (url.endsWith('index.json')) return JSON.stringify(INDEX);
  if (url.endsWith('skills/xin-fanqie-style-gou.md')) return SKILL_MD;
  if (url.endsWith('examples/xin-fanqie-style-gou.md')) return EXAMPLES_MD;
  throw new Error(`unexpected ${url}`);
}

function mockFetchOk() {
  mocks.fetch.mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(respondToFetch(url)),
      json: () => Promise.resolve(JSON.parse(respondToFetch(url))),
    })
  );
  vi.stubGlobal('fetch', mocks.fetch);
}

describe('WritingStylePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fileTreeApi.readFile.mockRejectedValue(new Error('no file'));
    mocks.fileTreeApi.saveFile.mockResolvedValue(undefined);
    mocks.fileTreeApi.getTree.mockRejectedValue(new Error('no dir'));
  });

  it('lists skills grouped by category and filters by search', async () => {
    mockFetchOk();
    render(<WritingStylePanel />);

    expect(await screen.findByText('番茄小说风格（1）')).toBeInTheDocument();
    expect(screen.getByText('古龙武侠风格（1）')).toBeInTheDocument();
    expect(
      screen.getByText('《每年加一点从山野村夫成仙界道祖》')
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('搜索书名、作者、分类、关键词...'),
      { target: { value: '古龙' } }
    );
    expect(
      screen.queryByText('《每年加一点从山野村夫成仙界道祖》')
    ).not.toBeInTheDocument();
    expect(screen.getByText('《多情剑客无情剑》')).toBeInTheDocument();
  });

  it('imports a skill by staging it into .cinyuverse/references/', async () => {
    mockFetchOk();
    render(<WritingStylePanel />);

    fireEvent.click(
      await screen.findByText('《每年加一点从山野村夫成仙界道祖》')
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /导入文风到参考库/ })
    );

    await waitFor(() => {
      expect(mocks.fileTreeApi.saveFile).toHaveBeenCalledTimes(1);
    });
    expect(mocks.fileTreeApi.createDirectory).toHaveBeenCalledWith(
      'D:/books/bookx/.cinyuverse/references'
    );
    const [path, content] = mocks.fileTreeApi.saveFile.mock.calls[0];
    expect(path).toBe(
      'D:/books/bookx/.cinyuverse/references/文风-每年加一点从山野村夫成仙界道祖.md'
    );
    // Staged material: source marker + spec + every excerpt. Never writes
    // style-sample.md — that is exclusively the distill task's artifact.
    expect(content).toContain('<!-- xin-skills:xin-fanqie-style-gou -->');
    expect(content).toContain('## 代表性摘录');
    expect(mocks.fileTreeApi.readFile).not.toHaveBeenCalledWith(
      'D:/books/bookx/.cinyuverse/style-sample.md'
    );
    expect(
      screen.getByText(/已将《每年加一点从山野村夫成仙界道祖》暂存到/)
    ).toBeInTheDocument();
  });

  it('keeps import progress scoped to the importing skill', async () => {
    const okResponse = (body: string) => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve(JSON.parse(body)),
    });
    mocks.fetch.mockImplementation((url: string) => {
      if (url.endsWith('index.json'))
        return Promise.resolve(okResponse(JSON.stringify(INDEX)));
      if (url.endsWith('skills/xin-gulong-style-duoqingjianke.md'))
        return Promise.resolve(okResponse('# 古龙文风'));
      // Import never settles for the first skill, keeping it mid-import.
      return new Promise(() => {});
    });
    vi.stubGlobal('fetch', mocks.fetch);

    render(<WritingStylePanel />);

    fireEvent.click(
      await screen.findByText('《每年加一点从山野村夫成仙界道祖》')
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /导入文风到参考库/ })
    );

    await waitFor(() => {
      expect(screen.getByText('导入中...')).toBeInTheDocument();
    });

    // Each staged file is distinct, so another skill stays importable
    // mid-import and reports its own progress.
    fireEvent.click(screen.getByText('《多情剑客无情剑》'));
    const secondImport = screen.getByRole('button', {
      name: /导入文风到参考库/,
    });
    expect(secondImport).toBeEnabled();
    fireEvent.click(secondImport);

    fireEvent.click(screen.getByText('《每年加一点从山野村夫成仙界道祖》'));
    expect(screen.getByText('导入中...')).toBeInTheDocument();
  });

  it('distills from the selected references only, or from all of them', async () => {
    mockFetchOk();
    mocks.fileTreeApi.getTree.mockResolvedValue([
      { name: '书甲.md', is_dir: false },
      { name: '书乙.md', is_dir: false },
    ]);
    render(<WritingStylePanel />);

    // The distill pool lists everything staged under references/.
    const checkboxA = await screen.findByLabelText('书甲');
    expect(screen.getByLabelText('书乙')).toBeInTheDocument();
    expect(screen.getByText(/提炼文风 · 参考库/)).toBeInTheDocument();

    // Single selection → the prompt pins the exact reference list.
    fireEvent.click(checkboxA);
    fireEvent.click(screen.getByRole('button', { name: /提炼所选（1）/ }));
    expect(mocks.requestPrefill).toHaveBeenCalledTimes(1);
    let prompt = mocks.requestPrefill.mock.calls[0][0] as string;
    expect(prompt).toContain('只参考以下参考作品');
    expect(prompt).toContain('- 书甲');
    expect(prompt).not.toContain('- 书乙');

    // 提炼全部 → no selection pin; the task reads the whole directory.
    fireEvent.click(screen.getByRole('button', { name: '提炼全部' }));
    expect(mocks.requestPrefill).toHaveBeenCalledTimes(2);
    prompt = mocks.requestPrefill.mock.calls[1][0] as string;
    expect(prompt).not.toContain('只参考以下参考作品');
    expect(mocks.setRightPanelVisible).toHaveBeenCalledWith(true);
  });
});
