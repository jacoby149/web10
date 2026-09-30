import { Plus } from 'lucide-react';
import { useComposer } from '@/context/ComposerContext';
import { trackEvent } from '@/lib/analytics';

/**
 * The floating "New Post" button — the bubbly "+" the operator asked for
 * (29.09.2026: "with a + New Post on the screen you hit that, then the full
 * thing pops up for you to post"). It replaces the always-visible composer
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
        'fixed right-4 bottom-20 md:right-6 md:bottom-6 z-30 ' +
        'flex h-16 w-16 items-center justify-center rounded-full ' +
        'bg-gradient-to-br from-brand to-brand-600 text-brand-foreground ' +
        'ring-2 ring-brand-300/40 ' +
        'shadow-[0_8px_30px_rgb(0,0,0/0.45)] ' +
        'transition-transform duration-150 ease-out hover:scale-105 active:scale-95 ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      }
    >
      <Plus className="w-8 h-8" strokeWidth={2.25} />
    </button>
  );
}
