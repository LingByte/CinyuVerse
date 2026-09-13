import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionKanbanBoard } from './DockviewKanbanPanel';
import type { KanbanProjectSessionRecord } from '@/hooks/useKanbanProjectSessions';
import type { SessionStatus } from '@/lib/api';

vi.mock('@/contexts/ProjectContext', () => ({
  useProject: () => ({ projectId: 'project-1' }),
}));

vi.mock('@/contexts/KanbanSessionContext', () => ({
  useKanbanSessionContext: () => ({
    panelView: 'board',
    goToBoard: vi.fn(),
    goToSessionHub: vi.fn(),
    goToUsageDashboard: vi.fn(),
    pruneSessions: vi.fn(),
    replaceRightSession: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  sessionsApi: {
    updateStatus: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useKanbanProjectSessions', () => ({
  useKanbanProjectSessions: () => ({
    sessions: [
      sessionRecord('session-done', 'done', '完成会话'),
      sessionRecord('session-todo', 'todo', '待办会话'),
    ],
    isLoading: false,
  }),
}));

function sessionRecord(
  id: string,
  status: SessionStatus,
  fullName: string
): KanbanProjectSessionRecord {
  return {
    id,
    placement: { sessionId: id, workspaceId: 'workspace-1' },
    workspace: {} as KanbanProjectSessionRecord['workspace'],
    task: null,
    taskId: null,
    name: fullName,
    status,
    branch: 'main',
    workspaceName: 'book3',
    workspaceDisplayLabel: 'book3',
    executor: 'claude_code',
    agentId: 'claude_code',
    updatedAt: '2026-09-14T00:00:00Z',
    createdAt: '2026-09-14T00:00:00Z',
    firstPrompt: null,
    fullName,
    shortName: fullName,
    taskTitle: null,
    isCompleted: status === 'done',
    isRunning: false,
    isErrored: false,
    pinnedAt: null,
  };
}

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionKanbanBoard />
    </QueryClientProvider>
  );
}

function laneByStatus(status: string) {
  const lane = screen
    .getAllByTestId('kanban-lane')
    .find((element) => element.getAttribute('data-status') === status);
  expect(lane).toBeDefined();
  return lane!;
}

describe('SessionKanbanBoard', () => {
  it('stacks the four status lanes vertically in fixed order', () => {
    renderBoard();

    const list = screen.getByTestId('kanban-lane-list');
    expect(list.className).toContain('flex-col');

    const lanes = within(list).getAllByTestId('kanban-lane');
    expect(lanes.map((lane) => lane.getAttribute('data-status'))).toEqual([
      'todo',
      'inprogress',
      'inreview',
      'done',
    ]);
  });

  it('places each session card inside its lane wrapping grid', () => {
    renderBoard();

    const todoCards = within(
      laneByStatus('todo').querySelector('[data-testid="kanban-lane-cards"]')!
    );
    const doneCards = within(
      laneByStatus('done').querySelector('[data-testid="kanban-lane-cards"]')!
    );

    expect(todoCards.getByText('待办会话')).toBeTruthy();
    expect(doneCards.getByText('完成会话')).toBeTruthy();
  });
});
