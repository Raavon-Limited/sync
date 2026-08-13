import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Per-conversation inbox preferences.
 *
 * Persisted to localStorage so pinning, muting, archiving, blocking and theme
 * survive a refresh. Messages themselves are NOT persisted - attachments hold
 * object URLs that die with the document, so re-seeding them would render
 * broken previews. `clearedIds` therefore gates the mock seed rather than the
 * live message list, which keeps a cleared conversation empty after a reload.
 */

export type ChatTheme = 'default' | 'sand' | 'mint' | 'dusk';

export interface ConversationPrefs {
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  blocked: boolean;
  reported: boolean;
  theme: ChatTheme;
}

export const DEFAULT_PREFS: ConversationPrefs = {
  muted: false,
  pinned: false,
  archived: false,
  blocked: false,
  reported: false,
  theme: 'default',
};

interface ChatStore {
  prefs: Record<string, ConversationPrefs>;
  clearedIds: string[];
  deletedIds: string[];

  toggleMuted: (id: string) => void;
  togglePinned: (id: string) => void;
  toggleArchived: (id: string) => void;
  setBlocked: (id: string, blocked: boolean) => void;
  setReported: (id: string, reported: boolean) => void;
  setTheme: (id: string, theme: ChatTheme) => void;

  markCleared: (id: string) => void;
  unmarkCleared: (id: string) => void;

  deleteConversation: (id: string) => void;
  restoreConversation: (id: string) => void;
}

const withoutId = (ids: string[], id: string) => ids.filter((item) => item !== id);

const withId = (ids: string[], id: string) => (ids.includes(id) ? ids : [...ids, id]);

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => {
      /*
       * Merges a patch onto one conversation's prefs, filling any missing keys
       * from the defaults so entries written by an older build stay complete.
       */
      const patch = (id: string, changes: Partial<ConversationPrefs>) =>
        set((state) => ({
          prefs: {
            ...state.prefs,
            [id]: { ...DEFAULT_PREFS, ...state.prefs[id], ...changes },
          },
        }));

      const toggle = (id: string, key: 'muted' | 'pinned' | 'archived') =>
        set((state) => {
          const current = { ...DEFAULT_PREFS, ...state.prefs[id] };

          return {
            prefs: { ...state.prefs, [id]: { ...current, [key]: !current[key] } },
          };
        });

      return {
        prefs: {},
        clearedIds: [],
        deletedIds: [],

        toggleMuted: (id) => toggle(id, 'muted'),
        togglePinned: (id) => toggle(id, 'pinned'),
        toggleArchived: (id) => toggle(id, 'archived'),

        setBlocked: (id, blocked) => patch(id, { blocked }),
        setReported: (id, reported) => patch(id, { reported }),
        setTheme: (id, theme) => patch(id, { theme }),

        markCleared: (id) => set((state) => ({ clearedIds: withId(state.clearedIds, id) })),
        unmarkCleared: (id) => set((state) => ({ clearedIds: withoutId(state.clearedIds, id) })),

        deleteConversation: (id) =>
          set((state) => ({ deletedIds: withId(state.deletedIds, id) })),

        restoreConversation: (id) =>
          set((state) => ({ deletedIds: withoutId(state.deletedIds, id) })),
      };
    },
    {
      name: 'sync-vendor-chat-prefs',
      partialize: (state) => ({
        prefs: state.prefs,
        clearedIds: state.clearedIds,
        deletedIds: state.deletedIds,
      }),
    },
  ),
);

/**
 * Reads one conversation's prefs, falling back to a shared frozen default.
 *
 * The fallback is a stable reference, so subscribing components do not
 * re-render on every store update just because a fresh object was created.
 */
export const selectPrefs = (id: string | null) => (state: ChatStore) =>
  (id ? state.prefs[id] : undefined) ?? DEFAULT_PREFS;
