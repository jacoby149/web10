import { useEffect } from 'react';
import { X, Repeat2 } from 'lucide-react';
import PostComposer from '@/components/Feed/PostComposer';
import { useRepost } from '@/context/RepostContext';
import { useComposer } from '@/context/ComposerContext';
import { trackEvent } from '@/lib/analytics';

/**
 * The app-level New Post sheet — the ONE composer (the operator, 29.09.2026:
 * "with a + New Post on the screen you hit that, then the full thing pops up
 * for you to post"). The always-visible inline composer boxes (feed /
 * profile / video / group) are retired; every surface reaches this sheet
 * through the ComposerContext (the Layout's floating "+" button, a group
 * feed's "Post to this group", or a repeat icon in repost mode).
 *
 * The dialog idiom (design.md §8): a bottom sheet on mobile, a centered
 * modal on desktop (`sm:items-center`), a blurred backdrop, a header with a
 * close X, Esc closes. The composer inside is `chromeless` (the sheet owns
 * the padding + borders).
 *
 * On a successful post the sheet closes itself and fires a `post-created`
 * window event — the screen underneath (the feed, the profile, the group
 * feed, the video wall) listens and reloads, the same seam the old inline
 * composers' `onPostCreated` callbacks wired per screen.
 */
export function NewPostSheet() {
  const { composerOpen, composerGroups, closeComposer } = useComposer();
  const { repostingTo, clearReposting } = useRepost();

  // Esc closes (design.md §11: anything a mouse can do, Esc can do).
  useEffect(() => {
    if (!composerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeComposer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [composerOpen, closeComposer]);

  if (!composerOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-3 pb-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={repostingTo ? 'Repost' : 'New post'}
      data-testid="new-post-sheet"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-overlay-in"
        onClick={closeComposer}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-[0_-8px_30px_rgb(0,0,0,0.35)] sm:rounded-lg animate-panel-in"
        data-testid="new-post-sheet-panel"
      >
        <div className="sticky top-0 z-10 relative border-b border-border bg-card px-4 py-3">
          <h3 className="flex items-center justify-center gap-2 font-display text-base font-medium text-foreground">
            {repostingTo ? (
              <>
                <Repeat2 className="w-4 h-4 text-brand" strokeWidth={2} />
                Repost
              </>
            ) : (
              'New post'
            )}
          </h3>
          <button
            type="button"
            onClick={closeComposer}
            aria-label="Close"
            data-testid="new-post-sheet-close"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <PostComposer
          chromeless
          groups={composerGroups}
          repostingTo={repostingTo}
          onRepostCancel={clearReposting}
          onPostCreated={() => {
            console.log('[social-composer] post created — closing sheet, notifying screens');
            clearReposting();
            closeComposer();
            trackEvent('post_created');
            window.dispatchEvent(new CustomEvent('post-created'));
          }}
        />
      </div>
    </div>
  );
}
