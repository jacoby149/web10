import { Plus } from 'lucide-react';
import { useComposer } from '@/context/ComposerContext';
import { trackEvent } from '@/lib/analytics';

/**
 * The floating "New Post" control — a quiet neutral pill, with a compact
 * plus on phones and an explicit desktop label (operator, 13.11.2026).
 * It replaces the always-visible composer
 * boxes that used to sit inline on every surface: the button is the only
 * resting chrome, the full composer pops up on tap (the NewPostSheet).
 *
 * Rendered once in the Layout (above the mobile bottom bar, bottom-right —
 * the Instagram/TikTok FAB position). Hidden on the Shorts lens (the
 * immersive full-screen surface hides the whole bottom chrome) and in anon
 * mode (a signed-out visitor can't post — the same gate the old inline
 * composers had).
 */
export function NewPostFab({ hidden = false }: { hidden?: boolean }) {
  const { composerOpen, openComposer } = useComposer();

  if (hidden || composerOpen) return null;

  return (
    <button
      type="button"
      aria-label="New post"
      data-testid="new-post-fab"
      onClick={() => {
        trackEvent('new_post_open');
        openComposer();
      }}
      className={
        'chrome-compose-position chrome-compose-control chrome-glass fixed right-4 md:right-6 md:bottom-6 z-30 ' +
        'flex h-12 w-12 items-center justify-center gap-2 rounded-full border border-border md:w-auto md:px-4 ' +
        'text-sm font-medium text-foreground transition-colors duration-150 motion-reduce:transition-none'
      }
    >
      <Plus className="h-5 w-5 text-brand-300" strokeWidth={1.75} aria-hidden="true" />
      <span className="hidden md:inline">New post</span>
    </button>
  );
}
