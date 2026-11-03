import { describe, expect, it } from 'vitest';
import { deriveProjectVisualState } from './ProjectActivityUi';
import type { ProjectActivitySnapshot } from '@/stores/useWindowProjectsStore';

function snapshot(
  overrides: Partial<ProjectActivitySnapshot> = {}
): ProjectActivitySnapshot {
  return {
    isLoading: false,
    hasRunning: false,
    runningCount: 0,
    hasError: false,
    hasSessions: false,
    recentSessions: [],
    ...overrides,
  };
}

describe('deriveProjectVisualState', () => {
  it('does not treat bootstrap loading as a spinning activity state', () => {
    expect(deriveProjectVisualState(snapshot({ isLoading: true }))).toBe(
      'idle'
    );
  });

  it('spins only while a session is actually running', () => {
    expect(
      deriveProjectVisualState(
        snapshot({ hasRunning: true, runningCount: 1, hasSessions: true })
      )
    ).toBe('loading');
  });

  it('prefers unread error alerts after running work settles', () => {
    expect(
      deriveProjectVisualState(snapshot({ hasSessions: true }), {
        projectId: 'p1',
        workspaceId: 'w1',
        sessionId: 's1',
        taskId: null,
        kind: 'error',
        unread: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        title: 'failed',
        description: 'boom',
      })
    ).toBe('error-unread');
  });
});
