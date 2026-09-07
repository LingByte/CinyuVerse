import { useCallback, useEffect, useRef } from 'react';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useRightPanelSlot } from '@/contexts/RightPanelSlotContext';
import { cn } from '@/lib/utils';

/**
 * Session (right panel) slot for the overview page. Adopts the shared
 * session host element while the overview page owns the placement, so
 * the conversation keeps its React state when moving between tabs.
 *
 * This mirrors KanbanSessionSlot but is simpler — a single right-side
 * slot with a resize handle.
 */
export function OverviewSessionSlot({ visible }: { visible: boolean }) {
  const { host, placement } = useRightPanelSlot();
  const sessionWidth = useLayoutStore((state) => state.rightPanelWidth);
  const setSessionWidth = useLayoutStore((state) => state.setRightPanelWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeAbortRef = useRef<AbortController | null>(null);

  const shouldShow = visible && !!host;
  const ownsHost = shouldShow && placement === 'overview';

  useEffect(() => {
    if (!ownsHost || !host) return;
    const container = containerRef.current;
    if (!container) return;
    container.appendChild(host);
    return () => {
      if (host.parentElement === container) {
        container.removeChild(host);
      }
    };
  }, [host, ownsHost]);

  useEffect(() => () => resizeAbortRef.current?.abort(), []);

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sessionWidth;
      resizeAbortRef.current?.abort();
      const controller = new AbortController();
      resizeAbortRef.current = controller;
      const { signal } = controller;
      document.addEventListener(
        'mousemove',
        (moveEvent) => {
          const delta = startX - moveEvent.clientX;
          setSessionWidth(startWidth + delta);
        },
        { signal }
      );
      document.addEventListener(
        'mouseup',
        () => {
          resizeAbortRef.current?.abort();
          resizeAbortRef.current = null;
        },
        { signal }
      );
    },
    [sessionWidth, setSessionWidth]
  );

  if (!shouldShow) return null;

  return (
    <div className="flex h-full shrink-0" data-panel="overview-session-slot">
      <div
        role="separator"
        aria-orientation="vertical"
        className="workspace-resize-handle relative z-20 w-px shrink-0 cursor-col-resize after:absolute after:inset-y-0 after:-left-[5px] after:w-[11px] after:content-['']"
        onMouseDown={handleResizeMouseDown}
      />
      <div
        ref={containerRef}
        className={cn('workspace-right-panel h-full min-w-0 overflow-hidden border-l')}
        style={{ width: sessionWidth }}
      />
    </div>
  );
}
