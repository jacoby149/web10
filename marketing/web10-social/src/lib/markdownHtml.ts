import MarkdownIt from 'markdown-it';

/**
 * The write-side markdown → HTML bridge (D85, rich-text.md "The write side").
 *
 * A post's `text` is the markdown string (the true data, written by the
 * WYSIWYG composer via turndown). The Tiptap editor, however, is seeded with
 * **HTML** (`content`), not markdown — so re-opening a post in edit mode must
 * convert the stored markdown back to the HTML the editor understands, or the
 * editor would show the raw syntax (`**bold**` instead of **bold**).
 *
 * The converter is the exact inverse of the composer's turndown pipeline for
 * the elements the editor can produce (bold / italic / H2 / bullet list /
 * inline code / code block / link / line break), so an edit that saves without
 * touching the body round-trips to the identical markdown (lossless). `html:
 * false` keeps it safe: any raw HTML a post carries is escaped, never injected
 * into the editor DOM.
 */
const md = new MarkdownIt({ html: false });

/** Convert a post's markdown `text` to the HTML the Tiptap editor seeds from. */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  return md.render(markdown);
}
