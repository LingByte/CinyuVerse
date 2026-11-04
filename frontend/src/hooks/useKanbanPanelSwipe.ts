import { useCallback, useRef, type PointerEvent } from 'react';

const SWIPE_THRESHOLD_PX = 56;
const DIRECTION_RATIO = 1.25;

/**
 * Horizontal swipe on the Kanban shell switches panels the same way as the
 * left/right nav arrows. Vertical scrolls and short taps are ignored.
 */
export function useKanbanPanelSwipe(options: {
  enabled?: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const { enabled = true, onSwipeLeft, onSwipeRight } = options;
  const origin = useRef<{ x: number; y: number; pointerId: number } | null>(
    null
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      if (event.target instanceof Element) {
        // Nested drag handles / interactive controls own the gesture.
        if (
          event.target.closest(
            '[data-no-kanban-swipe],button,a,input,textarea,select,[role="slider"],[data-dnd-kit-draggable]'
          )
        ) {
          return;
        }
      }
      origin.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    [enabled]
  );

  const clear = useCallback(() => {
    origin.current = null;
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const start = origin.current;
      origin.current = null;
      if (!enabled || !start || start.pointerId !== event.pointerId) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

      if (dx < 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    },
    [enabled, onSwipeLeft, onSwipeRight]
  );

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: clear,
    onPointerLeave: clear,
  };
}
