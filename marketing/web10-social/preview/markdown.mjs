// A tiny generic markdown → plain-text strip (KB: social/rich-text.md,
// "The one node touch" — now the client-side preview touch).
//
// "Render this string as plain text" — bold / italic / heading / link / code /
// list / blockquote → the plain words, with the syntax gone. It is generic, not
// a social concept (D60): any app can use it to flatten a markdown string to
// readable text. It is the preview server's job to keep a post's markdown from
// leaking `**` / `#` / `[]()` / ``` into an OG / Twitter-card description.
//
// Pure + small so it is unit-testable. It is NOT a markdown parser — it only
// strips the syntax the composer produces (the GFM core in rich-text.md), and
// it degrades gracefully: syntax it does not recognize passes through as-is,
// so a plain-text (pre-markdown) string is unchanged.

// Strip fenced code blocks (``` … ```), keeping the code text, dropping the
// fences. The composer's code blocks are the only block-level syntax that
// carries a triple-backtick marker.
function stripFencedCode(s) {
  return s.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, code) => code)
}

// Strip inline code spans (`code`), keeping the code text.
function stripInlineCode(s) {
  return s.replace(/`([^`]+)`/g, '$1')
}

// Strip links [text](url) → text (the words, not the URL). Mentions
// @[handle](web10:handle) resolve to the handle the same way.
function stripLinks(s) {
  return s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
}

// Strip emphasis / strikethrough markers, keeping the words: **bold**, *ital*,
// ~~strike~~. Only when the markers FLANK the content directly (no whitespace
// between a marker and the words) — that's what makes it markdown emphasis.
// `* word *` or `** word **` (a space inside the markers) are literal asterisks
// the user typed on purpose, not bold, so they pass through unchanged. Same for
// a lone `**` / `***` / `!` with nothing to pair with. Order matters — the
// double markers first so a lone asterisk left by a bold strip is not misread.
function stripEmphasis(s) {
  // True when the captured content is NOT real emphasis — there's whitespace
  // between a marker and the words (e.g. `* word *`) → keep the original match.
  const unflanked = (content) => /^\s|\s$/.test(content)
  return s
    .replace(/\*\*([^*]+)\*\*/g, (m, c) => (unflanked(c) ? m : c))
    .replace(/__([^_]+)__/g, (m, c) => (unflanked(c) ? m : c))
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, (m, pre, c) => (unflanked(c) ? m : pre + c))
    .replace(/(^|[\s(])_([^_\n]+)_/g, (m, pre, c) => (unflanked(c) ? m : pre + c))
    .replace(/~~([^~]+)~~/g, (m, c) => (unflanked(c) ? m : c))
}

// Strip heading markers (## / ### …), keeping the line's words.
function stripHeadings(s) {
  return s.replace(/^\s{0,3}#{1,6}\s+/gm, '')
}

// Strip blockquote markers ("> " at line start), keeping the quoted words.
function stripBlockquotes(s) {
  return s.replace(/^\s{0,3}>\s?/gm, '')
}

// Strip list markers (- / * / 1. at line start), keeping the item's words.
function stripLists(s) {
  return s.replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
}

// The one call: flatten a markdown string to plain text.
export function stripMarkdown(input) {
  if (!input) return input
  let s = String(input)
  s = stripFencedCode(s)
  s = stripInlineCode(s)
  s = stripLinks(s)
  s = stripEmphasis(s)
  s = stripHeadings(s)
  s = stripBlockquotes(s)
  s = stripLists(s)
  return s
}
