// Hashtags (D110, the body's second social token — social/hashtags.md).
//
// The ONE shared source of the hashtag pattern: `#` + 1–30 of
// `[a-zA-Z0-9_]` (letters, digits, underscore — no hyphens: `#walk-king` tags
// `walk` and leaves `-king` as text; no unicode in v1), with the mention's
// boundary discipline (mentions.ts): the `#` sits at the start of the text or
// after whitespace / `(`, and the run must END on a boundary — a 31-char run
// is not a hashtag (no mid-word truncation, no partial tag). Code, headings,
// link labels, URLs and raw HTML never match: the write-side derivation walks
// markdown-it tokens (the data/mentions.ts pattern) and the read-side
// `remarkHashtags` skips the same node types, so the two can never drift.
//
// Normalization: stored + looked up LOWERCASE (`#Walking` ≡ `#walking`; the
// link's href is the normalized tag so both caseings land on one board). The
// rendered child keeps the case the author typed.
//
// Hashtags live in a derived `body.hashtags` field (the `mention_usernames`
// precedent) — NEVER the doc `tags` column, which is the machine's vocabulary
// (`short` / `video` / `music` / `ad` / `product` / `album:<id>`). User prose
// must not be able to reclassify a post.
//
// `remarkHashtags` takes an EXPLICIT href factory (no default): a consumer
// that does not pass one links nothing — marketing-ui's router has no `/tag`
// route, and a dead link is worse than inert text (D110).

export interface HashtagMatch {
  /** The normalized (lowercase) tag. */
  hashtag: string;
  /** The raw match, as typed (child `#` …). */
  raw: string;
  /** Offset of the `#` in the source text. */
  start: number;
  /** Offset just past the tag's last char (the `#` + run). */
  end: number;
}

/** The hashtag run (the child of the shared boundary regex). */
export const HASHTAG_RUN = '[a-zA-Z0-9_]{1,30}';
/** The shared boundary + run + end-guard (the mention's discipline). */
export const HASHTAG_PATTERN = new RegExp(
  `(^|[\\s(])#(${HASHTAG_RUN})(?![a-zA-Z0-9_])`,
  'g',
);
/** A valid hashtag tag (after normalization + trimming the `#`). */
export const HASHTAG_VALID = /^[a-z0-9_]{1,30}$/;

/** The default href for a hashtag link (the social app's board route). */
export function defaultHashtagHref(tag: string): string {
  return `/tag/${encodeURIComponent(tag)}`;
}

/** Normalize a typed hashtag to its stored/looked-up form (lowercase). */
export function normalizeHashtag(raw: string): string {
  return raw.toLowerCase();
}

/**
 * Find the hashtags in a prose string (the shared matcher — the write-side
 * derivation runs it over markdown text tokens, the read-side plugin over
 * remark text nodes). Never matches across a word boundary before the `#`
 * (the mention's `(^|[\s([{,;:!?])` loosened to the hashtag's own rules: a
 * `#` glued to a word — `a#b` — is not a hashtag; `(` and whitespace open one)
 * and never inside a longer run (the end-guard).
 */
export function hashtagMatches(text: string): HashtagMatch[] {
  const out: HashtagMatch[] = [];
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const run = match[2];
    out.push({
      hashtag: normalizeHashtag(run),
      raw: `#${run}`,
      start: match.index! + match[1].length,
      end: match.index! + match[0].length,
    });
  }
  return out;
}

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

/**
 * The remark plugin: turn `#tag` prose into links (the `remarkMentions`
 * pattern, social/hashtags.md). The child keeps the typed case; the href is
 * the NORMALIZED tag through the caller's factory (one board per lowercase
 * tag). The factory is required (D110: no default — a consumer without a
 * `/tag` destination links nothing). Skips link / code / html / image nodes
 * exactly as `remarkMentions` does (a hashtag in a link label or a code span
 * is inert — the mention's "code, emails and ordinary link labels are not
 * tags" rule).
 */
export function remarkHashtags(href: (tag: string) => string) {
  return () => (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (['heading', 'link', 'linkReference', 'code', 'inlineCode', 'html', 'image', 'imageReference'].includes(node.type)) return;
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          walk(child);
          return [child];
        }
        const parts: MarkdownNode[] = [];
        let offset = 0;
        for (const match of hashtagMatches(child.value)) {
          parts.push({ type: 'text', value: child.value.slice(offset, match.start) });
          parts.push({
            type: 'link',
            url: href(match.hashtag),
            children: [{ type: 'text', value: match.raw }],
          });
          offset = match.end;
        }
        parts.push({ type: 'text', value: child.value.slice(offset) });
        return parts;
      });
    };
    walk(tree);
  };
}
