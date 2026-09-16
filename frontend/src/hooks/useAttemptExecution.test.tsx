import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAttemptExecution } from './useAttemptExecution';

const mocks = vi.hoisted(() => ({
  cancelConversation: vi.fn(),
  cancelPrompt: vi.fn(),
  setIsStopping: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueries: () => [],
}));

vi.mock('@/features/conversation/conversationApi', () => ({
  conversationApi: {
    cancel: mocks.cancelConversation,
  },
}));

vi.mock('@/features/agents/useAgentWorkbench', () => ({
  useAgentWorkbench: () => ({
    sessions: {},
    cancelPrompt: mocks.cancelPrompt,
  }),
}));

vi.mock('@/contexts/ExecutionProcessesContext', () => ({
  useExecutionProcessesContext: () => ({
    executionProcessesVisible: [],
    isAttemptRunningVisible: true,
    isLoading: false,
  }),
}));

vi.mock('@/stores/useTaskDetailsUiStore', () => ({
  useTaskStopping: () => ({
    isStopping: false,
    setIsStopping: mocks.setIsStopping,
  }),
  useStopToastSuppression: () => ({
    markStopToastSuppressed: vi.fn(),
    clearStopToastSuppression: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  attemptsApi: { stop: vi.fn() },
  executionProcessesApi: { getDetails: vi.fn() },
}));

describe('useAttemptExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancelConversation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels the in-flight conversation through its public turn API', async () => {
    const { result } = renderHook(() =>
      useAttemptExecution(undefined, 'task-1', 'conversation-1')
    );

    await act(async () => {
      await result.current.stopExecution();
    });

    expect(mocks.cancelConversation).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      reason: '用户请求停止',
    });
    expect(mocks.cancelPrompt).not.toHaveBeenCalled();
  });

  it('releases the stop control when the cancel acknowledgement times out', async () => {
    vi.useFakeTimers();
    // Durable settlement never lands — the stop control must come back
    // on its own so the user can retry.
    mocks.cancelConversation.mockImplementation(
      () => new Promise<never>(() => {})
    );
    const { result } = renderHook(() =>
      useAttemptExecution(undefined, 'task-1', 'conversation-1')
    );

    let stopped: Promise<void> = Promise.resolve();
    let rejected = false;
    act(() => {
      stopped = result.current.stopExecution();
    });
    stopped.catch(() => {
      rejected = true;
    });
    expect(mocks.setIsStopping).toHaveBeenLastCalledWith(true);

    await vi.advanceTimersByTimeAsync(10_000);
    await stopped;
    // Timeout settles the race (not rejects) and releases the stop control
    // so the user can retry while settlement continues in the background.
    expect(rejected).toBe(false);
    expect(mocks.setIsStopping).toHaveBeenLastCalledWith(false);
  });
});
