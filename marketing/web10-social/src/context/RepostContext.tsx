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
 * The app-level repost state (reposts.md: "the repeat icon opens the composer
 * in repost mode on EVERY surface"). A repost is a POST, not a reaction — the
 * composer's `createRepost` is the single write, and the composer is app-level
 * (above the feed, in App.tsx). So the "which post am I reposting?" state must
 * be reachable from every surface that has a repeat icon (Feed, Discover,
 * PostLightbox, ProfileFeed, Groups) without each one owning a copy of the
 * composer. This is that shared seam: one global `repostingTo` + a setter.
 *
 * The composer (rendered once, in App's FeedRoute) reads `repostingTo` from
 * this context; any surface's repeat icon calls `setRepostingTo(post)` to open
 * the composer in repost mode. The feed's `onRepost` → `repostingTo` pattern
 * (3.110.0) is lifted from a FeedRoute-local state to this app-wide context so
 * the other four surfaces reach the same composer instead of writing the
 * legacy `type:'repost'` reaction (the "1 0 1 0" toggle).
 */
interface RepostContextValue {
  /** The post the composer is currently reposting (null = normal mode). */
  repostingTo: PostRecord | null;
  /** Open the composer in repost mode with `post` as the context. */
  setRepostingTo: (post: PostRecord) => void;
  /** Clear the repost state (the composer's X / a successful submit). */
  clearReposting: () => void;
}

const RepostContext = createContext<RepostContextValue | null>(null);

export function RepostProvider({ children }: { children: ReactNode }) {
  const [repostingTo, setRepostingToState] = useState<PostRecord | null>(null);

  const setRepostingTo = useCallback((post: PostRecord) => {
    console.log('[social-repost] open composer in repost mode for', post._id);
    setRepostingToState(post);
  }, []);

  const clearReposting = useCallback(() => setRepostingToState(null), []);

  const value = useMemo(
    () => ({ repostingTo, setRepostingTo, clearReposting }),
    [repostingTo, setRepostingTo, clearReposting],
  );

  return <RepostContext.Provider value={value}>{children}</RepostContext.Provider>;
}

/**
 * The shared repost seam (reposts.md). A surface's repeat icon calls
 * `setRepostingTo(post)` to open the app-level composer in repost mode. Falls
 * back to a no-op setter when used outside a provider (a test that renders a
 * bare surface) so the repeat icon still reports intent without crashing.
 */
export function useRepost(): RepostContextValue {
  const ctx = useContext(RepostContext);
  if (ctx) return ctx;
  // No provider (a bare-surface test): a no-op setter so the repeat icon's
  // report is a safe no-op rather than a crash.
  return {
    repostingTo: null,
    setRepostingTo: () => {},
    clearReposting: () => {},
  };
}
