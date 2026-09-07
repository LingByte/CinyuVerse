import { create } from 'zustand';

/**
 * A pending message to prefill into the session composer input.
 *
 * External panels (e.g. the novel overview) push a message here; the
 * SessionComposerInput consumes it on the next render and replaces its
 * text, mirroring the useComposerSelectionStore pattern.
 */
interface ComposerPrefillState {
  /** The pending prefill message, or null when none. */
  pending: string | null;
  /** External panels call this to request a prefill. */
  requestPrefill: (message: string) => void;
  /** The composer calls this once it has consumed the pending message. */
  consume: () => string | null;
}

export const useComposerPrefillStore = create<ComposerPrefillState>((set, get) => ({
  pending: null,
  requestPrefill: (message) => set({ pending: message }),
  consume: () => {
    const pending = get().pending;
    if (pending !== null) set({ pending: null });
    return pending;
  },
}));
