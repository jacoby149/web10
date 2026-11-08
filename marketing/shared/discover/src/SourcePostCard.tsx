import { MediaCarousel } from './MediaCarousel';
import type { MediaItem } from './types';

/** Public foreign-row floor: content and prepared media only. No home-node
 * callbacks, profile/comment reads, signing, analytics or invented app routes. */
export function SourcePostCard({ origin, author, title, text, media = [], portrait = false }: {
  origin: string; author: string; title?: string; text?: string; media?: MediaItem[]; portrait?: boolean;
}) {
  return <article data-testid="source-post-card" className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
    <header className="space-y-1 border-b border-border px-4 py-3">
      <p className="break-words text-sm font-medium text-foreground">{author}</p>
      <p className="break-all font-mono text-xs text-muted-foreground">{new URL(origin).host} · public read-only</p>
    </header>
    {!!media.length && <MediaCarousel items={media} ratio={portrait ? 9 / 16 : undefined} maxHeight="60vh" audioTitle={title} audioArtist={author} />}
    <div className="space-y-2 p-4">
      {title && <h3 className="break-words font-display text-lg text-foreground">{title}</h3>}
      {text && <p className="whitespace-pre-wrap break-words text-sm text-foreground">{text}</p>}
      <p className="text-xs text-muted-foreground">Interactions for this server are not connected here.</p>
    </div>
  </article>;
}
