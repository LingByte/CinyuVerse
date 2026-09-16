import { useSyncExternalStore } from 'react';

// Transient per-conversation "the user asked to cancel" intent. Purely a UI
// signal so the timeline can show a cancelling state the moment the stop
// button is pressed; the durable turn state still comes from the event log.
// Entries expire on their own so a settlement that never lands (e.g. the
// backend draining under pressure) can never wedge the indicator.
const INTENT_EXPIRY_MS = 60_000;

const markedAtByConversation = new Map<string, number>();
const listeners = new Set<() => void>();
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of [...listeners]) listener();
}

export function markTurnCancelling(conversationId: string): void {
  const previous = expiryTimers.get(conversationId);
  if (previous) clearTimeout(previous);
  markedAtByConversation.set(conversationId, Date.now());
  expiryTimers.set(
    conversationId,
    setTimeout(() => {
      expiryTimers.delete(conversationId);
      if (markedAtByConversation.delete(conversationId)) emit();
    }, INTENT_EXPIRY_MS)
  );
  emit();
}

export function clearTurnCancelling(conversationId: string): void {
  const timer = expiryTimers.get(conversationId);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(conversationId);
  }
  if (markedAtByConversation.delete(conversationId)) emit();
}

export function useTurnCancelling(
  conversationId: string | null | undefined
): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () =>
      conversationId !== null &&
      conversationId !== undefined &&
      markedAtByConversation.has(conversationId)
  );
}
