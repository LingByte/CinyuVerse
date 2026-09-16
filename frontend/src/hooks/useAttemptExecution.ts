import { useMemo, useCallback, useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import {
  useStopToastSuppression,
  useTaskStopping,
} from '@/stores/useTaskDetailsUiStore';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import type { AttemptData } from '@/lib/types';
import type { ExecutionProcess } from 'shared/types';
import { useAgentWorkbench } from '@/features/agents/useAgentWorkbench';
import { conversationApi } from '@/features/conversation/conversationApi';
import {
  clearTurnCancelling,
  markTurnCancelling,
} from '@/features/conversation/turnCancelIntent';

// How long to wait for the durable cancel to be acknowledged before
// releasing the stop control again. Under backend pressure (e.g. the
// durable store draining slowly) settlement can take far longer than a
// user is willing to wait; re-enabling the control lets them retry while
// the in-flight settlement continues in the background.
const CANCEL_ACK_TIMEOUT_MS = 10_000;

export function useAttemptExecution(
  attemptId?: string,
  taskId?: string,
  sessionId?: string | null
) {
  const { isStopping, setIsStopping } = useTaskStopping(taskId || '');
  const { markStopToastSuppressed, clearStopToastSuppression } =
    useStopToastSuppression();
  const { sessions: agentSessions } = useAgentWorkbench();
  const agentSession = sessionId ? agentSessions[sessionId] : undefined;
  const activeAgentPromptId = agentSession?.active_prompt_id ?? null;
  const isAgentPromptRunning = Boolean(activeAgentPromptId);

  const {
    executionProcessesVisible: executionProcesses,
    isAttemptRunningVisible: isExecutionProcessRunning,
    isLoading: streamLoading,
  } = useExecutionProcessesContext();

  // Get setup script processes that need detailed info
  const setupProcesses = useMemo(() => {
    if (!executionProcesses.length) return [] as ExecutionProcess[];
    return executionProcesses.filter((p) => p.run_reason === 'setupscript');
  }, [executionProcesses]);

  // Fetch details for setup processes
  const processDetailQueries = useQueries({
    queries: setupProcesses.map((process) => ({
      queryKey: ['processDetails', process.id],
      queryFn: () => executionProcessesApi.getDetails(process.id),
      enabled: !!process.id,
    })),
  });

  // Build attempt data combining processes and details
  const attemptData: AttemptData = useMemo(() => {
    if (!executionProcesses.length) {
      return { processes: [], runningProcessDetails: {} };
    }

    // Build runningProcessDetails from the detail queries
    const runningProcessDetails: Record<string, ExecutionProcess> = {};

    setupProcesses.forEach((process, index) => {
      const detailQuery = processDetailQueries[index];
      if (detailQuery?.data) {
        runningProcessDetails[process.id] = detailQuery.data;
      }
    });

    return {
      processes: executionProcesses,
      runningProcessDetails,
    };
  }, [executionProcesses, setupProcesses, processDetailQueries]);

  const stopExecution = useCallback(async () => {
    if ((!attemptId && !sessionId) || isStopping) return;

    const releaseStopping = () => {
      setIsStopping(false);
      if (attemptId) {
        clearStopToastSuppression(attemptId);
      }
    };

    try {
      setIsStopping(true);
      if (attemptId) {
        markStopToastSuppressed(attemptId);
      }

      if (sessionId) {
        // Show the cancelling state in the timeline immediately instead of
        // waiting for the durable settlement to land.
        markTurnCancelling(sessionId);
        let timedOut = false;
        try {
          await Promise.race([
            conversationApi.cancel({
              conversationId: sessionId,
              reason: '用户请求停止',
            }),
            // Settle the race on timeout instead of rejecting it — the
            // settlement is still in flight in the background; a rejection
            // here would surface as a spurious stop error.
            new Promise<void>((resolveTimeout) => {
              window.setTimeout(() => {
                timedOut = true;
                resolveTimeout();
              }, CANCEL_ACK_TIMEOUT_MS);
            }),
          ]);
        } catch (error) {
          clearTurnCancelling(sessionId);
          throw error;
        }
        if (timedOut) {
          releaseStopping();
        }
        return;
      }

      if (attemptId) {
        await attemptsApi.stop(attemptId);
      }
    } catch (error) {
      releaseStopping();
      console.error('Failed to stop executions:', error);
      throw error;
    }
  }, [
    attemptId,
    clearStopToastSuppression,
    isStopping,
    markStopToastSuppressed,
    sessionId,
    setIsStopping,
  ]);

  const clearStopping = useCallback(() => {
    setIsStopping(false);
  }, [setIsStopping]);

  useEffect(() => {
    const isAttemptRunning = isExecutionProcessRunning || isAgentPromptRunning;
    if (isStopping && !isAttemptRunning) {
      setIsStopping(false);
    }
  }, [
    isAgentPromptRunning,
    isExecutionProcessRunning,
    isStopping,
    setIsStopping,
  ]);

  const isLoading =
    streamLoading || processDetailQueries.some((q) => q.isLoading);
  const isFetching =
    streamLoading || processDetailQueries.some((q) => q.isFetching);

  const isAttemptRunning = isExecutionProcessRunning || isAgentPromptRunning;

  return {
    // Data
    processes: executionProcesses,
    attemptData,
    runningProcessDetails: attemptData.runningProcessDetails,

    // Status
    isAttemptRunning,
    isLoading,
    isFetching,

    // Actions
    stopExecution,
    clearStopping,
    isStopping,
  };
}
