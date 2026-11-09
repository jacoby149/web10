import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PostBody } from '@/components/Feed/PostBody';
import type { PostRecord } from '@/data/types';
import { postAuthor } from '@/lib/postAuthor';
import { formatCount } from '@web10/discover';

export function ShortDescriptionSheet({ post, likes, views, onClose }: {
  post: PostRecord; likes: number; views: number; onClose(): void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [failedAvatar, setFailedAvatar] = useState<string>();
  const close = useRef(onClose);
  close.current = onClose;
  // Same modal/focus idiom as the Music track menu. Portaling keeps description
  // scrolling and keyboard events out of the Shorts swipe container.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const author = postAuthor(post);
  const date = new Date(post.created_at);
  const validDate = Number.isFinite(date.getTime());

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" data-testid="short-description-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-sm animate-overlay-in" />
      <div ref={panel} id="short-description" role="dialog" aria-modal="true" aria-labelledby="short-description-title"
        className="relative flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-xl animate-panel-in"
        data-testid="short-description-sheet" data-replay-private={post.visibility !== 'public' ? '' : undefined}>
        <header className="flex shrink-0 items-start gap-3 border-b border-border p-4 sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Short description</p>
            <h2 id="short-description-title" className="break-words font-display text-xl font-medium leading-tight sm:text-2xl">{post.title || 'Description'}</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Close description" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6" data-testid="short-description-content">
          <Link to={author.href} className="mb-5 flex min-h-11 items-center gap-3 rounded-sm font-medium hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-10 w-10 shrink-0" aria-hidden="true">
              {post.avatar_url && post.avatar_url !== failedAvatar
                ? <AvatarImage src={post.avatar_url} alt="" onError={() => setFailedAvatar(post.avatar_url)} />
                : <AvatarFallback className="bg-brand-muted text-brand-300">{author.name.replace(/^@/, '').charAt(0).toUpperCase()}</AvatarFallback>}
            </Avatar>
            <span className="min-w-0 break-words">{author.name}</span>
          </Link>
          <dl className="mb-5 grid grid-cols-3 gap-3 text-center text-sm">
            <div><dd className="font-semibold tabular-nums">{formatCount(likes)}</dd><dt className="mt-1 text-xs text-muted-foreground">Likes</dt></div>
            <div><dd className="font-semibold tabular-nums">{formatCount(views)}</dd><dt className="mt-1 text-xs text-muted-foreground">Views</dt></div>
            <div><dd className="font-semibold">{validDate ? <time dateTime={post.created_at}>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time> : 'Unavailable'}</dd><dt className="mt-1 text-xs text-muted-foreground">Published</dt></div>
          </dl>
          <div className="rounded-lg border border-border bg-elevated/50 p-4 text-sm sm:text-base">
            {post.text ? <PostBody text={post.text} density="full" className="max-w-none" /> : <p className="text-muted-foreground">No description added.</p>}
          </div>
        </div>
      </div>
    </div>, document.body,
  );
}
