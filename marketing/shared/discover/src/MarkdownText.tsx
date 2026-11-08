import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from './utils';
import { mentionUsername, remarkMentions } from './mentions';
import { parseEmbed, isEmbeddable } from './linkEmbeds';
import { isUnfurlCandidate, unfurlEndpointHost } from './unfurl';
import { UnfurlLink, YouTubeEmbed, VimeoEmbed } from './UnfurlLink';

/**
 * Inline markdown renderer for the shared discover surfaces (D85 read side).
 *
 * Post text is stored as markdown (the WYSIWYG composer's source of truth).
 * These card / comment surfaces are teasers, not documents, so this renders
 * inline emphasis (bold / italic / code / links) and flattens every block
 * element to its inline text — a card never grows a heading or a list.
 *
 * Security line: the stored markdown is inert until it passes through
 * `rehype-sanitize` with the locked schema below — no `<script>`, no `on*`
 * handlers, no `javascript:` / `data:` URLs. This is the one place untrusted
 * text becomes DOM on these surfaces.
 */
const sanitizeSchema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: [...(defaultSchema.protocols?.href || []), 'web10'] },
  attributes: {
    ...defaultSchema.attributes,
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
    '*': ['class'],
  },
};

const inlineComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  h2: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  h3: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  h4: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  h5: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  h6: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ul: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ol: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  li: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  pre: ({ children }: { children?: React.ReactNode }) => <code>{children}</code>,
  code: ({ children }: { children?: React.ReactNode }) => <code>{children}</code>,
};

interface MarkdownTextProps {
  /** The markdown `text` to render. */
  text: string;
  className?: string;
  onMentionClick?: (username: string) => void;
  /**
   * The link-unfurl endpoint (`<origin>/preview/unfurl`, D99 + the marketing
   * second consumer). When set, an external http(s) link in the body renders
   * the provider's player (the deterministic YouTube / Vimeo embeds — no
   * round-trip) or the server-fetched unfurl card (the provider's oEmbed
   * player or the Open Graph card); every unfurl failure degrades to the
   * plain link below. Absent (the default — the teaser surfaces: comments,
   * the Top 10 rail, the tile captions, the repost embeds) → the plain
   * link, exactly as before (the D99 density rule: block cards only at
   * full density).
   */
  unfurlEndpoint?: string;
}

/**
 * Render a post/comment's markdown `text` as inline elements inside a
 * `<span>`, so it drops into a parent that owns the layout (a line-clamped
 * caption, a comment row) without a stray block element breaking the clamp.
 */
export function MarkdownText({ text, className, onMentionClick, unfurlEndpoint }: MarkdownTextProps) {
  if (!text) return null;
  // The unfurl's "own host" exclusion: the endpoint lives on the social app's
  // origin — a link to the app's own permalinks would fetch the SPA shell
  // (the static brand card), not the post's content.
  const ownHost = unfurlEndpoint ? unfurlEndpointHost(unfurlEndpoint) : undefined;
  // One external link at full density: the deterministic provider embed
  // (YouTube / Vimeo — the url carries the id, no round-trip) or the unfurl
  // (the server-fetched card / oEmbed player). `undefined` = "stay plain"
  // (a url the unfurl excludes: same-host, unparseable, credentialed).
  const renderRichLink = (href: string, children: React.ReactNode): React.ReactNode => {
    const embed = parseEmbed(href);
    if (isEmbeddable(embed)) {
      return (
        <span className="block my-2">
          {embed.provider === 'youtube' ? <YouTubeEmbed embed={embed} /> : <VimeoEmbed embed={embed} />}
        </span>
      );
    }
    if (isUnfurlCandidate(href, ownHost)) {
      return <UnfurlLink url={href} endpoint={unfurlEndpoint as string} text={children} />;
    }
    return undefined;
  };
  return (
    <span className={cn('break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMentions]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        urlTransform={(url) => mentionUsername(url) ? url : defaultUrlTransform(url)}
        components={{ ...inlineComponents, a: ({ href, children }) => {
          const username = href && (mentionUsername(href) || /^\/u\/([a-zA-Z0-9_-]+)$/.exec(href)?.[1]);
          if (username) {
            return <a href={`/u/${encodeURIComponent(username)}`}
              target={undefined} rel="noopener noreferrer"
              onClick={event => { if (onMentionClick && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); event.stopPropagation(); onMentionClick(username); } }}
              className="text-brand-300 underline underline-offset-2 break-words">{children}</a>;
          }
          if (unfurlEndpoint && href) {
            const rich = renderRichLink(href, children);
            if (rich) return rich;
          }
          return <a href={href}
            target="_blank" rel="noopener noreferrer"
            className="text-brand-300 underline underline-offset-2 break-words">{children}</a>;
        } }}
      >
        {text}
      </ReactMarkdown>
    </span>
  );
}
