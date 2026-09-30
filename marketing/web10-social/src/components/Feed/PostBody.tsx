import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { LinkEmbed } from './LinkEmbed';
import { isEmbeddable, parseEmbed } from '@/lib/linkEmbeds';
import { cn } from '@/lib/utils';

/**
 * The post body renderer (D85, rich-text.md "The read side"): a post's `text`
 * is markdown (the true data, written by the WYSIWYG composer), and every read
 * surface renders it through this ONE component — markdown → sanitized HTML →
 * the brand type scale. One component, one scale, every surface.
 *
 * The pipeline (the security line): `react-markdown` + `remark-gfm` (the
 * GitHub-flavored syntax) → `rehype-sanitize` with a LOCKED schema → React
 * elements. The sanitizer is the choke point: it strips `<script>`, every `on*`
 * event handler, `javascript:` / `data:` URLs, and any tag/attribute not on the
 * allow-list. The stored markdown is inert; this is the single place untrusted
 * content becomes DOM, and that place is locked.
 *
 * Links reconcile with the existing `TextWithLinks` / `LinkEmbed`: a markdown
 * link (or a bare URL, which remark-gfm auto-links) routes through the same
 * `parseEmbed` / `isEmbeddable` logic, so a YouTube link in a markdown post
 * still becomes a player, not a plain `<a>`.
 *
 * Two densities (the card vs. the detail):
 * - `light` — inline bold/italic/code/links only. Block structure (headings,
 *   lists, code blocks, blockquotes, tables) is flattened to its inline text so
 *   a feed card never blows up in height. A card is a teaser.
 * - `full` — the whole type scale (headings, lists, code blocks, blockquotes,
 *   tables) at a reading measure. The "beautiful Notion" surface.
 */

// The locked schema: the GitHub-flavored tags the composer can produce, with
// the attributes the render needs. Everything else (script, on*, javascript:,
// data:, raw <img>, …) is stripped. `defaultSchema` already drops unknown tags
// and forbids dangerous protocols on href/src.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
    '*': ['class'],
  },
  // The `web10:` scheme (an @mention → /u/:username) is not an http(s) URL, so
  // the default protocol allow-list would strip it. Allow it on `href` only —
  // it is the one social-specific token the renderer recognizes (the KB).
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href || []), 'web10'],
  },
};

type Density = 'light' | 'full';

interface PostBodyProps {
  /** The post's markdown `text`. */
  text: string;
  /** `light` (feed cards — inline only) or `full` (detail surfaces — the whole
   *  type scale). Default `full`. */
  density?: Density;
  className?: string;
}

/** The display face for headings (the type scale, design.md §5). */
const DISPLAY = 'font-display font-medium tracking-tight';

/**
 * A link in the body. Embeddable (YouTube / Vimeo) → the player / chip.
 * Otherwise a plain external link (new tab). `web10:` scheme mentions are
 * rendered as a tappable handle (the one social-specific token — the
 * `web10:` scheme is not an http(s) URL, so `parseEmbed` returns the external
 * fallback, which we map to the profile route instead).
 */
function BodyLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (!href) return <>{children}</>;
  // A web10 mention: @[username](web10:username) → a tappable handle.
  if (href.startsWith('web10:')) {
    const username = href.slice('web10:'.length);
    return (
      <a
        href={`/u/${encodeURIComponent(username)}`}
        className="text-brand-300 font-medium hover:underline"
        data-testid="post-body-mention"
      >
        @{username}
      </a>
    );
  }
  const embed = parseEmbed(href);
  if (embed && isEmbeddable(embed)) {
    return (
      <span className="block my-2">
        <LinkEmbed embed={embed} />
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-300 underline underline-offset-2 hover:text-brand-200 break-words"
    >
      {children}
    </a>
  );
}

/**
 * The `a` component for react-markdown. react-markdown passes the element's
 * props (including `href`) + `children`; we drop `node` (the hast element) so
 * it isn't spread onto the DOM.
 */
function markdownA(props: { href?: string; children?: React.ReactNode }) {
  return <BodyLink href={props.href}>{props.children}</BodyLink>;
}

/**
 * Inline code (no `pre` parent) vs. a code block (a `pre` parent). The `code`
 * element is styled by whether it sits inside a `pre` — the block gets the
 * surface bg + border + scroll, the inline gets the muted tint.
 */
function markdownCode(props: { className?: string; children?: React.ReactNode }) {
  return <code className={props.className}>{props.children}</code>;
}

/**
 * The `pre` component (code block). Renders the fenced block with the type
 * scale: JetBrains Mono, the surface bg, a border, the radius, horizontal
 * scroll. The `code` child is styled by the `.post-body` CSS (see index.css).
 */
function markdownPre(props: { children?: React.ReactNode }) {
  return <pre className="post-body-pre">{props.children}</pre>;
}

// The `web10:` scheme (an @mention → /u/:username) is not an http(s) URL, so
// react-markdown's default `urlTransform` would empty the href (and the
// sanitizer's protocol allow-list would strip it). Allow it explicitly — it is
// the one social-specific token the renderer recognizes (the KB). Everything
// else goes through the default (safe) transform.
function postUrlTransform(url: string): string {
  if (url.startsWith('web10:')) return url;
  return defaultUrlTransform(url);
}

export function PostBody({ text, density = 'full', className }: PostBodyProps) {
  if (!text) return null;

  const light = density === 'light';

  // The full type scale (design.md §5, tokens only). Headings are the display
  // face; body is Inter; code is JetBrains Mono; blockquote has the brand
  // left-border; lists use the brand-300 markers.
  const fullComponents = {
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className={cn('text-2xl', DISPLAY, 'mb-2 mt-3 first:mt-0')}>{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className={cn('text-lg', DISPLAY, 'mb-1.5 mt-3 first:mt-0')}>{children}</h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className={cn('text-base font-semibold', DISPLAY, 'mb-1 mt-2 first:mt-0')}>{children}</h4>
    ),
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 list-disc pl-5 marker:text-brand-300 last:mb-0">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 list-decimal pl-5 marker:text-brand-300 last:mb-0">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="mb-2 border-l-2 border-brand pl-3 text-muted-foreground italic last:mb-0">{children}</blockquote>
    ),
    hr: () => <hr className="my-3 border-border" />,
    a: markdownA,
    code: markdownCode,
    pre: markdownPre,
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="mb-2 overflow-x-auto last:mb-0">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border border-border px-2 py-1">{children}</td>
    ),
  };

  // Light density: flatten every block element to its inline text (the
  // children render as-is — bold/italic/links survive). No headings, no lists,
  // no code blocks, no tables — a card is a teaser, not a document.
  const lightComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    h2: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    h3: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    h4: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    h5: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    h6: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    ol: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    li: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    blockquote: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    pre: ({ children }: { children?: React.ReactNode }) => <code className="post-body-inline-code">{children}</code>,
    code: markdownCode,
    a: markdownA,
  };

  return (
    <div
      className={cn('post-body text-foreground break-words', light ? 'whitespace-normal' : 'max-w-prose', className)}
      data-density={density}
      data-testid="post-body"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        urlTransform={postUrlTransform}
        components={light ? lightComponents : fullComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
