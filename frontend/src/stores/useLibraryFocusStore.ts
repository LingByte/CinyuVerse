import { create } from 'zustand';

/**
 * Overview (and others) ask the Library tab to select a local book path.
 * NovelLibraryPanel consumes the pending path when the library tab is shown.
 */
interface LibraryFocusState {
  pendingPath: string | null;
  focusBook: (path: string) => void;
  consume: () => string | null;
}

export const useLibraryFocusStore = create<LibraryFocusState>((set, get) => ({
  pendingPath: null,
  focusBook: (path) => set({ pendingPath: path }),
  consume: () => {
    const pending = get().pendingPath;
    if (pending !== null) set({ pendingPath: null });
    return pending;
  },
}));
