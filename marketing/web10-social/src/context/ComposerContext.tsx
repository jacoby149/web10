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
 * The app-level composer seam (the "New Post" sheet). The always-visible
 * composer boxes that used to sit inline on the feed / profile / video /
 * group surfaces are retired (operator, 29.09.2026: "i see these boxes all
 * over the place, it should be invisible! with a + New Post on the screen
 * you hit that, then the full thing pops up"). Instead, ONE composer lives
 * app-level (above the routes, in App.tsx) and any surface opens it through
 * this context:
 *
 * - The floating "+" button (the Layout's NewPostFab) → `openComposer()`.
 * - A group feed → `openComposer({ groups: [groupId] })` (the post attaches
 *   to the group, the old group-composer behavior).
 * - A repeat icon (repost mode) → `setRepostingTo(post)` (RepostContext) +
 *   `openComposer()` — the sheet reads `repostingTo` and renders the
 *   composer in repost mode.
 * - An owner's "Edit post" (ANY surface — feed, profile, lightbox, discover,
 *   group) → `openComposer({ editingPost: post })` — the sheet renders the
 *   composer in EDIT mode (pre-filled title + body + media, saves via
 *   updatePost). This is the ONE edit path: every surface edits through the
 *   same composer it creates with (the operator, 30.09.2026: "we definitely
 *   need some kind of consistent strategy for all these surfaces").
 *
 * The sheet is a modal (bottom sheet on mobile, centered on desktop — the
 * app's dialog idiom, design.md §8). It is NOT inline chrome: the screens
 * are content-first, the composer is on demand.
 */
interface ComposerContextValue {
  /** Whether the New Post sheet is open. */
  composerOpen: boolean;
  /** The groups the open composer posts into (undefined = the user's followers). */
  composerGroups: string[] | undefined;
  /** The post the open composer is editing (undefined = creating a new post). */
  editingPost: PostRecord | undefined;
  /** Open the sheet, optionally scoped to a group or to editing an existing post. */
  openComposer: (opts?: { groups?: string[]; editingPost?: PostRecord }) => void;
  /** Close the sheet. */
  closeComposer: () => void;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerGroups, setComposerGroups] = useState<string[] | undefined>(undefined);
  const [editingPost, setEditingPost] = useState<PostRecord | undefined>(undefined);

  const openComposer = useCallback((opts?: { groups?: string[]; editingPost?: PostRecord }) => {
    console.log('[social-composer] open sheet', {
      groups: opts?.groups,
      editing: opts?.editingPost?._id || null,
    });
    setComposerGroups(opts?.groups);
    setEditingPost(opts?.editingPost);
    setComposerOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    console.log('[social-composer] close sheet');
    setComposerOpen(false);
    setComposerGroups(undefined);
    setEditingPost(undefined);
  }, []);

  const value = useMemo(
    () => ({ composerOpen, composerGroups, editingPost, openComposer, closeComposer }),
    [composerOpen, composerGroups, editingPost, openComposer, closeComposer],
  );

  return <ComposerContext.Provider value={value}>{children}</ComposerContext.Provider>;
}

/**
 * The shared composer seam. Falls back to a no-op (a closed sheet) when used
 * outside a provider — a bare-surface test that renders a group feed without
 * the app shell still works (the "post to this group" button is a safe no-op
 * rather than a crash).
 */
export function useComposer(): ComposerContextValue {
  const ctx = useContext(ComposerContext);
  if (ctx) return ctx;
  return {
    composerOpen: false,
    composerGroups: undefined,
    editingPost: undefined,
    openComposer: () => {},
    closeComposer: () => {},
  };
}
