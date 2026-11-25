import { fireEvent, render, screen } from '@testing-library/react';
import type { IDockviewPanelProps } from 'dockview-react';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerImagePreviewSource,
  releaseImagePreviewSource,
} from '@/lib/imagePreviewRegistry';

import DockviewPreviewPanel from './DockviewPreviewPanel';

const fileContent = vi.hoisted(() => ({
  data: '# Preview title' as string | undefined,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock('@monaco-editor/react', () => {
  function MockMonacoEditor({
    defaultValue,
    loading = 'Loading...',
  }: {
    defaultValue?: string;
    loading?: ReactNode;
  }) {
    const [modelValue] = useState(defaultValue);
    return (
      <div
        data-testid="monaco-editor"
        data-model-value={modelValue}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {loading}
      </div>
    );
  }

  return { default: MockMonacoEditor };
});

vi.mock('@/hooks/useFileContent', () => ({
  useFileContent: () => fileContent,
  useFileAtHead: () => ({
    data: null,
    isLoading: false,
    error: null,
  }),
  useBinaryAssetPreview: () => ({
    assetUrl: null,
    isLoading: false,
    error: null,
  }),
  useSaveFile: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/stores/useFileTreeStore', () => ({
  useFileTreeStore: (
    selector: (state: { rootPath: string }) => unknown
  ): unknown => selector({ rootPath: '/workspace' }),
}));

vi.mock('@/components/NormalizedConversation/FileContentView', () => ({
  default: () => <div data-testid="file-content-view" />,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('@/components/NormalizedConversation/AstryxMarkdown', () => ({
  default: ({
    value,
    workspacePath,
  }: {
    value?: string;
    workspacePath?: string | null;
  }) => (
    <div
      data-testid="astryx-markdown"
      data-value={value}
      data-workspace-path={workspacePath ?? ''}
    />
  ),
}));

function panelProps(filePath = 'README.md'): IDockviewPanelProps {
  return {
    params: {
      filePath,
      displayPath: filePath,
      mode: 'editor',
    },
  } as unknown as IDockviewPanelProps;
}

describe('DockviewPreviewPanel', () => {
  beforeEach(() => {
    fileContent.data = '# Preview title';
    fileContent.isLoading = false;
    fileContent.error = null;
  });

  it('resolves transient conversation images without serializing their data', () => {
    const previewId = 'image:test-preview';
    registerImagePreviewSource(previewId, 'data:image/png;base64,AAAA');

    render(
      <DockviewPreviewPanel
        {...({
          params: {
            filePath: '',
            displayPath: 'generated.png',
            imagePreviewId: previewId,
          },
        } as unknown as IDockviewPanelProps)}
      />
    );

    expect(screen.getByRole('img', { name: 'generated.png' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA'
    );
    releaseImagePreviewSource(previewId);
  });

  it('uses a file-specific loading state while Monaco initializes', async () => {
    render(<DockviewPreviewPanel {...panelProps()} />);

    await screen.findByTestId('monaco-editor');
    expect(
      screen.getByRole('status', { name: 'Opening README.md' })
    ).toBeVisible();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('switches Markdown source to preview on a middle click inside Monaco', async () => {
    render(<DockviewPreviewPanel {...panelProps()} />);

    expect(await screen.findByRole('button', { name: 'Source' })).toBeVisible();

    fireEvent.mouseDown(screen.getByTestId('monaco-editor'), { button: 1 });

    expect(screen.getByRole('button', { name: 'Preview' })).toBeVisible();
  });

  it('renders markdown preview relative to the file directory', async () => {
    render(<DockviewPreviewPanel {...panelProps('docs/guide.md')} />);

    await screen.findByRole('button', { name: 'Source' });
    fireEvent.mouseDown(screen.getByTestId('monaco-editor'), { button: 1 });

    const markdown = await screen.findByTestId('astryx-markdown');
    expect(markdown).toHaveAttribute('data-workspace-path', '/workspace/docs');
    expect(markdown).toHaveAttribute('data-value', '# Preview title');
  });

  it('lets a diff preview switch to the editable file view', async () => {
    render(
      <DockviewPreviewPanel
        {...({
          params: {
            filePath: 'src/App.tsx',
            displayPath: 'src/App.tsx',
            mode: 'diff',
            diffViewMode: 'inline',
          },
        } as unknown as IDockviewPanelProps)}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: '切换文件视图' })
    );
    expect(
      screen.getByRole('button', { name: '切换差异视图' })
    ).toBeInTheDocument();
  });
});