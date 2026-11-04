import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKanbanPanelSwipe } from './useKanbanPanelSwipe';
import type { PointerEvent } from 'react';

function pointerEvent(
  overrides: Partial<PointerEvent<HTMLElement>> & {
    clientX: number;
    clientY: number;
  }
): PointerEvent<HTMLElement> {
  return {
    button: 0,
    pointerId: 1,
    target: document.createElement('div'),
    ...overrides,
  } as PointerEvent<HTMLElement>;
}

describe('useKanbanPanelSwipe', () => {
  it('swipes left to go to the next panel', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useKanbanPanelSwipe({ onSwipeLeft, onSwipeRight })
    );

    act(() => {
      result.current.onPointerDown(
        pointerEvent({ clientX: 200, clientY: 40 })
      );
      result.current.onPointerUp(pointerEvent({ clientX: 120, clientY: 44 }));
    });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignores mostly vertical movement', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useKanbanPanelSwipe({ onSwipeLeft, onSwipeRight })
    );

    act(() => {
      result.current.onPointerDown(
        pointerEvent({ clientX: 200, clientY: 40 })
      );
      result.current.onPointerUp(pointerEvent({ clientX: 180, clientY: 160 }));
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
