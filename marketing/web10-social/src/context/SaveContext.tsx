import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PostRecord } from '@/data/types';

/**
 * The app-level "Save to…" sheet seam (D88, saved-collections.md). Saving a
 * post into a collection is a per-post action reachable from any post surface
 * (the feed card's kebab, and — as follow-ups — the lightbox / discover /
 * group surfaces). Instead of each surface wiring its own sheet, ONE SaveSheet
 * lives app-level (above the routes, in App.tsx) and any surface opens it
 * through this context: `openSave(post)`.
 *
 * The sheet lists the user's collections (a checkmark on the ones already
 * containing the post) + a "New collection" row. It is a modal (bottom sheet
 * on mobile, centered on desktop — the app's dialog idiom, design.md §8).
 *
 * The context is owner-of-the-token only: a signed-out (anon) visitor has no
 * collections, so surfaces hide the Save control when not signed in.
 */
interface SaveContextValue {
  /** Whether the Save sheet is open. */
  saveOpen: boolean;
  /** The post the open sheet is saving (undefined = closed). */
  savingPost: PostRecord | undefined;
  /** Open the sheet for a post. */
  openSave: (post: PostRecord) => void;
  /** Close the sheet. */
  closeSave: () => void;
}

const SaveContext = createContext<SaveContextValue | null>(null);

export function SaveProvider({ children }: { children: ReactNode }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [savingPost, setSavingPost] = useState<PostRecord | undefined>(undefined);

  const openSave = useCallback((post: PostRecord) => {
    console.log('[social-save] open sheet', { post: post._id || null });
    setSavingPost(post);
    setSaveOpen(true);
  }, []);

  const closeSave = useCallback(() => {
    console.log('[social-save] close sheet');
    setSaveOpen(false);
    setSavingPost(undefined);
  }, []);

  const value = useMemo(
    () => ({ saveOpen, savingPost, openSave, closeSave }),
    [saveOpen, savingPost, openSave, closeSave],
  );

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

/**
 * The shared save seam. Falls back to a no-op (a closed sheet) when used
 * outside a provider — a bare-surface test that renders a post card without
 * the app shell still works (the Save button is a safe no-op rather than a
 * crash).
 */
export function useSave(): SaveContextValue {
  const ctx = useContext(SaveContext);
  if (ctx) return ctx;
  return {
    saveOpen: false,
    savingPost: undefined,
    openSave: () => {},
    closeSave: () => {},
  };
}
