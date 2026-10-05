# Rich text — the post body is markdown, never shown to the user

A post's `text` (D82's caption) is **markdown**. The user never sees markdown:
they write in a **WYSIWYG editor** that looks like a rich text box, and they read
a **rendered** post with real type. The markdown is the *true data* — the source
of truth stored on the wire — but it is an implementation detail, the same way
the wire format of a file is an implementation detail of the file's contents.
This doc settles the model: what is stored, how it is written, how it is
rendered, and the one node touch (the share preview). It builds on D82 (the two
bodies of text: `title` + `text`) and is **app-owned, zero node surface (D60)**
— the node stores `{service, body}` opaquely and does not care that `body.text`
is markdown.

## The use case

A creator writes a post. They type, they hit **Bold** and the words go bold,
they pick a heading from a menu and the line becomes a heading. They never see
`**`, `#`, or any syntax — the editor *is* the result. They post. A fan opens
the post and sees it **set in type**: a display-font title, a body with real
headings, lists, code, links, blockquotes — a post that looks like it was
typeset, not pasted. That is the whole feature. The bar (design.md §1, D20):
it must hold next to a Notion doc or a WordPress post, not read as "someone's
first try at a social app."

## The model: markdown under the hood, WYSIWYG on top

The load-bearing fact: **the post body is markdown; the user only ever sees a
rich editor and a rendered view.** Three layers, one source of truth:

| Layer | What it is | Who sees it |
|---|---|---|
| **Storage** | `body.text` = a markdown string | the node (opaque), the data layer |
| **Write** | a WYSIWYG editor (Tiptap / ProseMirror) | the creator — they see rich text, never syntax |
| **Read** | a markdown → HTML renderer with a type scale | the fan — they see a typeset post |

The editor and the renderer are **two different programs that share one
format** (markdown). The editor serializes its document to markdown on save;
the renderer parses markdown to HTML on load. They never talk to each other
directly — markdown is the interchange. That is what makes it clean:

- **Portable.** The body is a plain string. It diffs, it greps, it survives a
  client rewrite, it can be imported/exported, it can be indexed. A binary
  rich-text blob (ProseMirror JSON, Word, Google Docs) is none of those.
- **Zero node surface (D60).** The node already stores `body.text` opaquely
  (D82 added `title` the same way). Markdown is *content inside an existing
  field*, not a new column, table, endpoint, or contract. The node does not
  know or care that it is markdown.
- **Zero migration.** A post written before this change has no markdown
  syntax in its `text`. The renderer parses it as plain text (a paragraph) and
  renders it exactly as today. Old posts are valid markdown (the empty set of
  syntax). Nothing to migrate, nothing to backfill.
- **The user never learns markdown.** The editor is the entire authoring
  surface. A fan who hand-edits a post via the API *can* write markdown, but
  the product never asks them to.

### Why markdown and not a structured document (ProseMirror JSON / HTML)

The alternative is to store the editor's native document (ProseMirror JSON) or
raw HTML. Both lose:

- **ProseMirror JSON** is editor-locked. It is a schema owned by one library
  version; a future editor (or the marketing app, or an importer) must
  understand that exact JSON. It does not diff readably, does not grep, and is
  not a stable interchange. Markdown is the *export* of that document — the
  portable form.
- **Raw HTML** is a security liability stored on the wire. The whole trust
  model of this feature is "render untrusted user content safely." Storing
  HTML means the stored data *is* the attack surface; storing markdown means
  the stored data is inert text and the **render** is the single, locked,
  sanitized choke point (below). Markdown is the smaller, safer, more portable
  representation.

So: **store markdown, edit visually, render safely.** The editor's structured
document is a transient in-memory object; the markdown string is what outlives
the session.

## The write side: the WYSIWYG editor

The composer's caption becomes a **rich text editor** (Tiptap, ProseMirror
under the hood — the same engine Notion-class editors use). The creator sees a
document, not a syntax box:

- **The toolbar** is a slim row of buttons (bold, italic, strikethrough,
  heading, bullet list, numbered list, code, link) that call the editor's
  chain API to wrap the selection or toggle a block. It is styled with tokens
  + Lucide icons (design.md §8). **No block inspector, no per-block style
  panel, no "Elementor."** That is the WordPress foot-gun (the right-side
  Typography / Color / Drop-cap / Advanced panel) and it is *rejected* — it is
  the complexity that made WordPress heavy. The toolbar is the *only*
  formatting surface. The **`@` mention** is not a toolbar button — it is an
  inline autocomplete that fires as you type `@` (the social token, below).
- **On save:** `editor.getMarkdown()` → the markdown string → `createPost`'s
  `text` (the existing D82 field). One line.
- **On edit (load):** `editor.commands.setContent(post.text)` → the editor
  reconstructs the document from the stored markdown. The creator re-opens a
  post and sees the same rich document they wrote.
- **The title stays a plain input** (D82). A `title` is a *headline* — one
  short line, not rich text. It is not a markdown document; it is a string.
  Giving it the editor would be over-structure. (Its *treatment* — display
  font, the violet caret, the focus glow — is the composer pass, below.)

The editor is **client-side only** (D60). It runs in the browser, serializes to
a string, and hands the string to the existing `createPost` / `updatePost`. No
node change.

### The composer UX patterns (what Facebook / Notion / Twitter do right)

The layout (the title treatment, the toolbar, the post button) is the *skeleton*.
What makes these editors feel flagship is a set of **interactions** — small,
consistent, always-on behaviors the user never thinks about but feels. A composer
that has the right skeleton but none of these reads as "someone's first try"
(the exact problem the operator flagged). This is the checklist the composer
pass must hit; each is a designed state, not an afterthought (design.md §1:
every interactive element has all its states).

- **The composer is a stage, not a form.** The whole surface signals "you are
  about to publish." The avatar anchors the left; the text area is the hero, not
  a field in a box. The operator's "partiful" feeling is this: composing should
  feel like performing, not filling out a form. The focus glow (the
  `--color-glow-intense` halo) is the "the stage is lit" moment.
- **The caret is a brand moment.** A custom `caret-color` (the violet
  `--color-brand-400`) on the title and the body. The cursor is the first thing
  the user sees when they start typing; making it the brand color is the cheapest
  "this is *ours*" signal there is. Zero effort, high feel.
- **The title is a headline you are writing.** Display font (Space Grotesk),
  large, no box. The placeholder ("Add a title…") is in the *same* display face,
  dimmed — so the empty state looks like a headline waiting to be written, not a
  gray input. The moment you type, it *is* the headline. This is the "oooh I'm
  typing a title" beat.
- **The body auto-expands.** The caption grows with the content (no fixed
  height, no internal scroll until it's genuinely long). A fixed-height textarea
  with a scrollbar is the #1 "form" tell. The composer should feel like the
  page is making room for you.
- **The placeholder is a prompt, and it's specific.** "What's on your mind?"
  (or the repost's "Add a comment…") — a question that invites the post, not a
  field label. It disappears the instant you type (no lingering gray text).
- **The toolbar is quiet until you want it.** A slim row of icon buttons (the
  formatting controls + attach + visibility + pin-ad), muted, that brighten on
  hover. It is *below* the text, not above it — the text is the hero, the tools
  are the instrument panel. No block inspector, no per-block panel (the
  WordPress foot, rejected). The toolbar is the only formatting surface.
- **The Post button is honest.** Disabled (muted, no glow) until there is
  something to post (text, a title, or media). Enabled (the brand fill, the
  glow) the moment there is. The button's state is the composer's state — you
  always know if you can post. The label is the verb ("Post" / "Repost"), and
  it shows the in-flight state ("Posting…" + spinner) while the write runs.
- **Media previews before you post.** Attached media renders as a tray of
  thumbnails *inside* the composer (with remove + the video's edit control), so
  you see exactly what will post before you do. No "did it attach?" anxiety.
  (The composer already has this — `MediaTrayItem`; the pattern is to keep it.)
- **The composer expands, it doesn't jump.** In the compact (collapsed) mode
  the composer rests as a single line and expands to the full form on focus or
  on content — no layout shift, no yank (design.md §1: nothing shifts). The
  Discover surface uses this so the video wall, not the composer, is the hero.
- **Keyboard is first-class.** Cmd/Ctrl+Enter posts (the power-user shortcut,
  what Twitter/Notion do); Tab/Shift+Tab move through the toolbar; Esc blurs.
  The composer is fully operable without a mouse (design.md §11).
- **The @mention (the social-specific one).** Typing `@` opens an autocomplete
  of people you can mention (the DM compose already does a debounced profile
  lookup — `lookupUserProfile`, 3.114.0 — the same seam). A mention renders as a
  highlighted, tappable handle in the body (the renderer's one social-specific
  token, on top of the markdown). This is what separates a *social* composer
  from a document editor — it is the "partiful" social beat.
- **The character count (when there is a limit).** A quiet counter appears only
  as you approach the cap (the last N characters), in `muted-foreground`, turning
  `warning` at the limit. No counter when you're nowhere near it — it is a
  guardrail, not a HUD.
- **The focus state is the brand.** Focusing the composer draws the brand
  gradient line (the top hairline the composer already has) + the glow. The
  unfocused state is calm; the focused state is lit. That transition is the
  "the stage is yours" moment.

These are the patterns. They are not one big feature — they are the
accumulation of small disciplines (design.md §1: "the difference between a
prototype and a product is never one big thing, it's the accumulation of small
disciplines"). The composer pass is done when the composer *feels* like the
Facebook/Notion/Twitter composers, which is when all of these are present and
none of them are a browser default.

### The supported syntax (the editor's output is the renderer's input)

The editor's toolbar defines what the user can produce, which defines the
markdown the renderer must handle. The set is deliberately small — the
GitHub-flavored core, not a document framework:

| Control | Markdown | Rendered as |
|---|---|---|
| Bold | `**text**` | `<strong>` |
| Italic | `*text*` | `<em>` |
| Strikethrough | `~~text~~` | `<del>` |
| Heading (H2 / H3) | `## ` / `### ` | display-font heading (the type scale) |
| Bullet list | `- ` | `<ul>` |
| Numbered list | `1. ` | `<ol>` |
| Inline code | `` `code` `` | mono, tinted |
| Code block | ` ``` ` | mono block, `surface` bg |
| Blockquote | `> ` | brand left-border |
| Link | `[text](url)` | the existing link treatment (below) |
| Line break / paragraph | blank line | `<p>` |
| Mention | `@[username](web10:username)` | a highlighted, tappable handle (the social token, below) |

**What it rejects (the editor does not offer, the renderer does not render):**
tables, images-in-body (media is the `media_refs` path, not markdown — D82's
media `caption` is a different thing), nested/complex layouts, and any raw HTML
(the sanitizer strips it, below). The body is *prose with light structure*, not
a page builder.

**The mention (the one social-specific token).** A mention is the one thing a
*social* composer has that a document editor doesn't. Typing `@` opens an
autocomplete (the DM compose's debounced `lookupUserProfile` seam, 3.114.0);
picking a person inserts a mention that the editor stores as
`@[username](web10:username)` — a markdown link with a `web10:` scheme (not a
URL, so the sanitizer's `javascript:`/`data:`/http rules don't apply to it, and
the renderer recognizes the scheme and renders it as a highlighted, tappable
handle instead of a link). The handle navigates to `/u/:username` (the same
destination every other surface's author click uses). It is the "partiful"
social beat — the composer is a *social* composer, not a document editor.

## The read side: the renderer + the type scale

Every read surface renders `post.text` through **one shared component**
(`<PostBody>`): markdown → HTML, then a **type scale** that sets it in the
brand's faces. One component, one scale, every surface — the "whole styling
system" is this component plus the layout, not per-screen hacks.

**The pipeline (the security line):** `react-markdown` + `remark-gfm` (the
GitHub-flavored syntax above) → `rehype-sanitize` with a **locked schema** →
React elements. The sanitizer is the choke point: it strips `<script>`, every
`on*` event handler, `javascript:` / `data:` URLs, and any tag or attribute not
on the allow-list. The stored markdown is inert; the render is the single
place untrusted content becomes DOM, and that place is locked. This is the
whole XSS story — there is no other path from a post body to the DOM.

**The type scale (design.md §5, tokens only):**

| Markdown | Rendered |
|---|---|
| H2 | Space Grotesk 500, the `h2` step (1.5rem) |
| H3 | Space Grotesk 500, the `h3` step |
| body | Inter, the app body step (0.9375rem / 1.5) |
| inline code | JetBrains Mono, `brand-muted` tint, `--radius-sm` |
| code block | JetBrains Mono, `surface` bg, `border`, `--radius` |
| blockquote | `foreground` text, 2px `brand` left-border, `muted` indent |
| list | `foreground`, `brand-300` markers |
| link | the existing link treatment (below) |

**Links reconcile with the existing `TextWithLinks`** (`LinkEmbed.tsx`): today
a post's raw URLs are auto-extracted and rendered as embeds (YouTube / Vimeo
players) or external-link chips. The renderer keeps that: a markdown link (and a
bare URL) routes through the same `isEmbeddable` / `extractLinks` logic, so a
YouTube link in a markdown post still becomes a player, not a plain `<a>`. The
renderer *adds* the type scale on top of the link behavior it already has.

**The two render densities (the card vs. the detail):**

- **Feed cards** (`PostCard`, `DiscoverCard`, `HomeCard`) render **light
  markdown** — inline bold/italic/code/links only — and keep their existing
  `line-clamp` / truncation so a card never blows up in height. A card is a
  teaser; it is not the place for a code block.
- **The detail surfaces** (the lightbox, the watch page, the post permalink)
  render **full markdown** — headings, lists, code blocks, blockquotes — at a
  reading measure (`max-w-prose`, ~65–75ch, design.md §5). This is the
  "beautiful Notion" surface.

## The composer title treatment (the "oooh I'm typing a title" moment)

The `title` input (D82) is restyled from a gray form field to a **headline you
are writing**:

- **Display font** — Space Grotesk (the `--font-display` token), the `h2` step
  (~1.5rem), tight tracking. The caption stays Inter. The title *is* a headline
  by type alone, and it rhymes with the quote cards (3.179.0) that already set
  the title in Space Grotesk.
- **Kill the box** — drop the `bg-elevated` input chrome. The title sits on the
  composer surface like text on a page, with a hairline that draws in under it
  on focus (echoing the brand gradient line the composer already has at top).
- **The violet caret** — `caret-color: var(--color-brand-400)`. On focus, a
  `--color-glow-intense` halo (the token exists for "focused composer glow,"
  design.md §4). Type and it feels like lighting something up.
- **Placeholder** in a dimmed display face, so the empty state looks
  intentional.

No new deps. One component. This is the "partiful" feeling the operator is
after, and it ships independently of the editor.

## The post-detail styling system (the Facebook-grade structure)

The "someone's first try" problem is not one ugly thing — it is four small
absences stacking (the lightbox today, `PostLightbox.tsx`): a 320px column
floating in an 896px modal with dead space on the right; no author identity
row; a title the same size as the body; and an icon-only action bar with the
owner actions as a flat list. The fix is **one post-detail layout** that every
"read a post in full" surface shares — the lightbox, the watch page, the post
permalink — so it is a system, not a per-screen patch:

- **Identity row** — avatar + name + `@handle` + `·` timestamp + privacy glyph.
  One row, the small type step. (The Facebook move the lightbox is missing.)
- **Title** — Space Grotesk, the `h2` step, tight tracking.
- **Body** — `<PostBody>` (full markdown) at a reading measure.
- **Media** — as today.
- **Stats row** — a quiet "N likes · M comments" line above the actions.
- **Action bar** — **labeled** (Like / Comment / Share), icon + text, hover
  states, counts. Not bare icons.
- **Owner actions** — a `⋯` menu, not a flat list jammed under a divider.
- **Sizing** — the modal sizes to content. A text-only post gets a centered
  reading-measure column, not 320px-in-896px.

This is design.md §12 territory (the screenshot test, tokens only, all states)
and it is where the lightbox stops reading as a first try.

## The one preview touch: the link preview strips markdown

The OG / Twitter-card for a post permalink is built in the social app's
**preview server** (`marketing/web10-social/preview/card.mjs`) — not the node
(the node's `share.py` was deleted in 3.91.0). `postCard` puts the post's
`text` into the card's `title` + `description`. With markdown, that leaks `**`
and `#` into link previews. The fix is a **markdown → plain-text strip** (a
tiny generic util — `preview/markdown.mjs`, `stripMarkdown` — "render this
string as plain words": bold / heading / link / code → the words, the syntax
gone) applied to the post's `text` **before** `truncate`. It is **generic, not
a social concept** (D60): it is "render this string as plain text," usable by
any app, not "understand a post." Emphasis is stripped only when the markers
**flank** the words directly (no whitespace inside the markers, per CommonMark)
— so intentional literal `**` / `***` / `* word *` / `!` show as the user typed
them, while real `**bold**` / `*ital*` is still stripped. One function, one
test. The I3/D41 privacy
floor is unchanged — a non-public post still renders the generic card with no
content. `profileCard` / `groupCard` use `display_name` / `bio` / `name` /
`description` (not markdown) — untouched.

## What it rejects

1. **A custom templating engine.** "Do our own thing" is the trap. Markdown is
   a solved, portable, toolable format; a bespoke DSL is a maintenance sink with
   no ecosystem. Markdown is the answer.
2. **A per-block style panel (the WordPress inspector).** Typography / Color /
   Drop-cap / Advanced per block is the complexity that made WordPress heavy.
   The toolbar is the only formatting surface; the type scale is fixed by the
   brand, not per-post.
3. **A node column / endpoint / contract.** D60: markdown is content inside the
   existing opaque `body.text` (D82). The node does not parse it.
4. **Raw HTML in the body.** The stored format is markdown (inert); the render
   is the single sanitized choke point. Storing HTML puts the attack surface in
   the data.
5. **Showing the user markdown.** The editor is WYSIWYG. The user sees rich
   text and a rendered post, never syntax.
6. **Rich text in the `title`.** A title is a headline — one line, a plain
   string. The editor is for the `text` body only.

## The seam

- **Editor:** `marketing/web10-social/src/components/Feed/PostComposer.tsx`
  (the caption `Textarea` → the Tiptap editor + toolbar; `getMarkdown()` on
  save, `setContent()` on edit). Deps: `@tiptap/react`, `@tiptap/starter-kit`,
  `@tiptap/extension-link` (the social app — the flagship; the marketing app
  adopts later).
- **Renderer:** a new shared `<PostBody>` (markdown → sanitized HTML + the type
  scale), consumed by `FeedScreen.tsx` (`PostCard`), `PostLightbox.tsx`,
  `WatchScreen.tsx`, the post-permalink route, `ProfileFeed.tsx`, and the shared
  `HomeCard` / `DiscoverCard` (light density). Reconciles with
  `LinkEmbed.tsx` (`TextWithLinks` / `extractLinks` / `isEmbeddable`). Deps:
  `react-markdown`, `remark-gfm`, `rehype-sanitize`.
- **Title treatment:** `PostComposer.tsx` (display font, caret, focus glow) —
  tokens only, design.md §4/§5.
- **Post-detail system:** `PostLightbox.tsx` first, then `WatchScreen.tsx` +
  the permalink route (identity row, stats row, labeled actions, `⋯` menu,
  content-sized modal).
- **Link preview:** `marketing/web10-social/preview/card.mjs` (the social app's
  preview server builds the OG / Twitter card) + `preview/markdown.mjs` (the
  markdown → plain-text strip, `stripMarkdown`) — the strip is applied to the
  post's `text` before `truncate` so the card's `title` / `description` carry
  plain words. Client-side, zero node surface (D60).
- **Data:** unchanged. `PostRecord.text` (D82) is now markdown; `createPost` /
  `updatePost` / `fromV3DocToPost` already carry it opaquely.

**KB:** `social/rich-text.md` (this doc), `social/ads.md` (the post body shape —
an ad is a `posts` doc, so an ad's `text` is markdown too and inherits the
renderer for free), `social/shorts.md` + `social/discover-card.md` (the
card-density render), `social/share-preview.md` (the node touch).
