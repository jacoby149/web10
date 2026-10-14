import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from './utils';

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
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 break-words"
    >
      {children}
    </a>
  ),
};

interface MarkdownTextProps {
  /** The markdown `text` to render. */
  text: string;
  className?: string;
}

/**
 * Render a post/comment's markdown `text` as inline elements inside a
 * `<span>`, so it drops into a parent that owns the layout (a line-clamped
 * caption, a comment row) without a stray block element breaking the clamp.
 */
export function MarkdownText({ text, className }: MarkdownTextProps) {
  if (!text) return null;
  return (
    <span className={cn('break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        urlTransform={defaultUrlTransform}
        components={inlineComponents}
      >
        {text}
      </ReactMarkdown>
    </span>
  );
}