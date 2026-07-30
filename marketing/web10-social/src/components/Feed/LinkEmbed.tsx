import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmbedInfo } from '@/lib/linkEmbeds';
import { isEmbeddable, extractLinks } from '@/lib/linkEmbeds';

interface LinkEmbedProps {
  embed: EmbedInfo;
  className?: string;
}

function YouTubeEmbed({ embed }: { embed: EmbedInfo }) {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className="group relative w-full overflow-hidden rounded-lg bg-elevated cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ aspectRatio: '16/9' }}
        aria-label={`Play video from ${embed.domain}`}
        data-testid="youtube-embed-placeholder"
      >
        {embed.thumbnailUrl ? (
          <img
            src={embed.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-brand-muted flex items-center justify-center" />
        )}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors duration-150 flex items-center justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-transform duration-150 group-hover:scale-110">
            <Play className="w-7 h-7 text-foreground ml-0.5" strokeWidth={2} fill="currentColor" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: '16/9' }}
      data-testid="youtube-embed-loaded"
    >
      <iframe
        src={`${embed.embedUrl}?rel=0&modestbranding=1`}
        title="YouTube video player"
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

function VimeoEmbed({ embed }: { embed: EmbedInfo }) {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className="group relative w-full overflow-hidden rounded-lg bg-elevated cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ aspectRatio: '16/9' }}
        aria-label={`Play video from ${embed.domain}`}
        data-testid="vimeo-embed-placeholder"
      >
        <div className="w-full h-full bg-gradient-to-br from-brand-muted to-elevated flex items-center justify-center">
          <span className="text-muted-foreground text-xs font-medium">vimeo.com</span>
        </div>
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors duration-150 flex items-center justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-transform duration-150 group-hover:scale-110">
            <Play className="w-7 h-7 text-foreground ml-0.5" strokeWidth={2} fill="currentColor" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: '16/9' }}
      data-testid="vimeo-embed-loaded"
    >
      <iframe
        src={`${embed.embedUrl}?autoplay=0&muted=1`}
        title="Vimeo video player"
        className="absolute inset-0 w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

function ExternalLinkChip({ embed }: { embed: EmbedInfo }) {
  const favicon = `https://www.google.com/s2/favicons?domain=${embed.domain}&sz=32`;

  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150',
        'bg-elevated text-muted-foreground hover:text-foreground hover:bg-border',
        'border border-border/50 hover:border-border',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      )}
      data-testid="external-link-chip"
    >
      <img
        src={favicon}
        alt=""
        className="w-3.5 h-3.5 shrink-0"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <span className="truncate max-w-[200px]">{embed.domain}</span>
      <ExternalLink className="w-3 h-3 shrink-0" strokeWidth={2} />
    </a>
  );
}

export function LinkEmbed({ embed, className }: LinkEmbedProps) {
  if (isEmbeddable(embed)) {
    if (embed.provider === 'youtube') {
      return <YouTubeEmbed embed={embed} />;
    }
    return <VimeoEmbed embed={embed} />;
  }
  return <ExternalLinkChip embed={embed} />;
}

export function TextWithLinks({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const links = extractLinks(text);
  if (!links.length) {
    return <span className={className}>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = 0;

  for (const link of links) {
    if (link.start > cursor) {
      parts.push(text.slice(cursor, link.start));
    }
    if (link.embed) {
      const isEmbed = isEmbeddable(link.embed);
      if (isEmbed) {
        parts.push(
          <div key={`embed-${idx}`} className="my-2">
            <LinkEmbed embed={link.embed} />
          </div>,
        );
      } else {
        parts.push(
          <span key={`chip-${idx}`} className="inline-block align-middle my-0.5">
            <LinkEmbed embed={link.embed} />
          </span>,
        );
      }
    }
    cursor = link.end;
    idx++;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <span className={className}>{parts}</span>;
}