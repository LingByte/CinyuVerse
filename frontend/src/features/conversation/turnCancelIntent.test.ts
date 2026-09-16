import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearTurnCancelling,
  markTurnCancelling,
  useTurnCancelling,
} from './turnCancelIntent';

describe('turnCancelIntent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks a conversation as cancelling until the expiry lands', () => {
    const { result } = renderHook(() => useTurnCancelling('conversation-1'));

    expect(result.current).toBe(false);

    act(() => {
      markTurnCancelling('conversation-1');
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(false);
  });

  it('clears the marker immediately on cancel completion', () => {
    const { result } = renderHook(() => useTurnCancelling('conversation-2'));

    act(() => {
      markTurnCancelling('conversation-2');
    });
    expect(result.current).toBe(true);

    act(() => {
      clearTurnCancelling('conversation-2');
    });
    expect(result.current).toBe(false);
  });
});
