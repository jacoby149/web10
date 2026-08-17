# design.md — the web10 design standard

**If your change touches anything a user sees — `ui/`,
`marketing/marketing-ui/`, `marketing/web10-social/`, any screen, any
component, any color — you read this file first, every time, before
writing code.** CLAUDE.md and AGENTS.md point here; PRs that touch UI
are judged against this document. It is the law for how web10 looks,
the same way plan.txt is the law for what gets built.

Why it exists: three frontends grew three independent styling worlds
(Tailwind-with-CSS-vars in `ui/`, shadcn-dark in `web10-social`, Bulma
in `marketing-ui`), the "shared" token file was shared only in a
comment, and the repo shipped the React atom and Apple's App Store
glyph as its own logos. This file ends that. One brand, one token set,
one quality bar.


## 1. The bar

D20 set it: **Kick/Twitch-grade slick, never fediverse jank.** The
pitch to creators is "your node is an upgrade to your brand — the cool
thing your audience brags about being early to." If a screen looks
like a protest app, an engineering tool, or a Mastodon instance, the
pitch dies on the first screenshot.

The operational test for every screen, before it merges:

> **The screenshot test.** Put a screenshot of this screen in a slide
> deck between a Kick screenshot and a Twitch screenshot, in front of
> a creator, their manager, and an a16z partner. Does it hold, or does
> someone wince?

That test is not rhetorical. The M0 deliverable is a pitch deck and a
demo video; every M0-facing screen literally will be in that deck.
A screen that can't appear in the pitch isn't done (plan.txt phase 2.5,
final unticked item).

What "slick" means in practice — the difference between a prototype
and a product is never one big thing, it's the accumulation of small
disciplines:

- Every interactive element has ALL its states designed: default,
  hover, focus-visible, active, disabled, loading. No browser-default
  anything — no default-blue links, no default focus outlines, no
  default form controls on showcase surfaces.
- Every async surface has a designed loading state (skeletons, not
  spinners), a designed error state, and a designed empty state.
  Empty states are story beats, not gray voids — a fresh feed points
  at the importer ("import your life"), an empty studio points at the
  first monetization card.
- Nothing shifts. Reserve space for images and async content; no
  layout jump on load, ever.
- Alignment is exact. Everything sits on the 4px grid (§6). "One
  pixel off" is the texture of jank; a16z-pretty is mostly the
  absence of one-pixel-offs.
- No dead or placeholder anything: no lorem, no broken image icons,
  no `fa fa-*` classes whose font never loads, no clipart.


## 2. Brand essence

The mark is **keys on a keyring**. That is not decoration — it is the
entire thesis in one image: *you hold the keys to your own data.*
Every visual choice should reinforce ownership, permanence, and
self-possession. The brand is confident and quiet; it never begs.

- **Dark-first.** The brand's native habitat is dark. The only logo
  assets that exist are white-on-transparent; creator/streaming
  culture (Kick, Twitch, OBS, Discord) lives in dark mode; and dark
  is where the violet accent reads as electric instead of corporate.
  Dark is the default on every surface. Light mode is a later opt-in
  built from tokens, never a hardcode.
- **Voice.** Declarative, restrained, no gush. The fan-facing voice
  lives in `manifesto.md`, the creator pitch in `outreach.md` — match
  them. Never claim what isn't built. Headlines state facts:
  Your audience. beats "Unlock the future of social!!"
- **Never fake it.** No stock photos of smiling people, no invented
  testimonials, no logos of companies that don't use us. Real
  screenshots, real numbers, real mechanics (the reach-gap chart is
  more persuasive than any adjective).


## 3. Brand assets — what the logos ARE and are NOT

This is the canonical inventory. The files named like logos are mostly
not the logos; the real marks have specific names. Get this right —
a wrong logo is worse than no logo.

### Canonical marks (the real ones)

| Asset | File (today) | What it is | Use |
|---|---|---|---|
| **Full lockup** | `marketing/marketing-ui/public/brand/logo-lockup.png` (1200×400, moved from `layouts/images/logo_white.png` by D13) | Keys-on-keyring mark + lowercase thin-outline "web10" wordmark, white on transparent | Navbars, footers, hero, og-image. Dark backgrounds ONLY (it is white). Min height 24px; keep clear space ≥ the height of the "w" on all sides. |
| **Square mark** | `.context/brand-assets/keys-mark-source-transparent.png` (369×389, white on transparent, corrected by D13 — see below) | The keys mark alone, cropped from the full lockup | Avatars, favicons, PWA icons, app-store tiles, anywhere square. Dark backgrounds only. Also the default profile picture in web10-social. |

**Correction (D13, 19.07.2026):** this table used to point the square mark
at `marketing/web10-social/public/alternative.png` (842×854). That file
does **not** contain the keys mark — it's an unrelated white-line
illustration of a person playing guitar (white on transparent, so it
renders as a blank square on a white background, which is how the wrong
asset went unnoticed). Never use `alternative.png` as a logo. The
corrected square mark above was derived by cropping the keys glyph out of
the full lockup, trimming to its bounding box, and padding to a square —
"from existing files," not a redrawn approximation. `web10-social`'s
default profile picture / PWA icons still need to be repointed at this
file or a proper crop of it (lane D12/B5 — D13 doesn't edit those apps'
code, only dropped ready-made icon PNGs in `.context/brand-assets/`).

Rules of use:
- Never stretch, recolor, outline, shadow, or rotate the marks.
- Never place the white marks on light backgrounds — if a light
  surface needs a logo, that surface should probably be dark, or use
  the (to-be-generated) dark variant below.
- Never typeset "web10" in a way that imitates the wordmark. In
  running text it is plain lowercase `web10` in the current font. If
  a heading needs the brand set as type, use the display font (§5) in
  lowercase — it will rhyme with the wordmark without counterfeiting it.

### Boilerplate and squatters (NOT logos — purge on sight)

| File | What it actually is | Action |
|---|---|---|
| `ui/public/logo512.png`, `logo192.png`, `marketing/web10-social/public/logo512.png`, `logo192.png` | **The React atom.** Create-react-app boilerplate. | Replace with exports of the square keys mark at 192/512. |
| `ui/public/hub.png`, `ui/public/hub.jpg` | **Apple's App Store logo.** A trademark we have no right to ship, referenced as `apple-touch-icon` in `ui/index.html`. | Replace immediately with the keys mark. This is a legal fix, not an aesthetic one. |
| `ui/public/home.png` | Clipart house. | Delete; use a Lucide icon. |
| `*/public/favicon.ico` | Unverified boilerplate. | Regenerate all three from the square keys mark. |
| `marketing/marketing-ui/public/layouts/images/*` (berk, cmu, mit, stan, gonzaga, thumbnail, back*.jpg, sky, mountains…) | The "web10 for education" era — old pitch, old fonts, old navy palette, university logos. | The marketing rebuild (§10) decides per file; default is delete. University logos are other people's trademarks — same rule as hub.png. |
| `ui/public/YourOrgsLogo/*` (key_white/black, generic_school_logo) | Feature fixtures — placeholder art for a provider's own branding slot. Not web10 brand assets. | Keep, but they are white-label placeholders; label them as such where shown. |

### Asset debt (queued work, lane D unless noted)

The brand currently exists ONLY as two white PNGs. Generate, from the
existing files (do not invent a new mark):

1. **SVG vectorization** of both marks (trace or rebuild) — PNGs don't
   scale to hero sizes cleanly.
2. **Dark-on-light variants** (black/zinc-950 fills) for the rare
   light surface and for print/docs.
3. **Icon set**: favicon.ico + 192/512 PNG + apple-touch-icon per app,
   all from the square mark on `#09090b`, replacing every squatter above.
4. **One shared og-image** (1200×630): full lockup on `#09090b` with
   the violet glow treatment (§4), used by all three apps.


## 4. Color

One palette, defined once, consumed as tokens everywhere. Dark-first:
these are the `:root` values. Hardcoded hex in a component is a review
rejection — if a color isn't a token, it doesn't exist.

### Neutrals (zinc — cool, never brown, never pure black)

| Token | Value | Role |
|---|---|---|
| `--color-background` | `#09090b` | Page background. Never `#000` — pure black is harsh and crushes the violet. |
| `--color-surface` / `--color-card` | `#111113` | Cards, panels, one step up. |
| `--color-elevated` / `--color-muted` | `#18181b` | Hover fills, popovers, inputs-at-rest, second step up. |
| `--color-border` / `--color-input` | `#27272a` | 1px borders. Elevation in dark UI is borders + background steps, not shadows (§6). |
| `--color-muted-foreground` | `#a1a1aa` | Secondary text. ~7.4:1 on background — safe for body copy. |
| `--color-foreground` | `#fafafa` | Primary text. Never `#fff`. |

### Brand (violet — the electric thread)

| Token | Value | Role |
|---|---|---|
| `--color-brand-300` | `#c4b5fd` | Brand-tinted TEXT on dark (links, highlighted copy). Body-text safe. |
| `--color-brand-400` | `#a78bfa` | Hover text, icons, chart accent. |
| `--color-brand` | `#8b5cf6` | THE brand color. Primary buttons, active nav, focus rings, the glow. 4.5:1 on background — fine for fills, large text, and UI, not for small body text (use 300). |
| `--color-brand-600` | `#7c3aed` | Pressed/active states of brand fills. |
| `--color-brand-muted` | `#2e1065` | Brand-tinted backgrounds: active-nav pill fills, selected rows, badge backgrounds. |

### Glow — ambient light (social flagship only)

These tokens exist so the social app (`web10-social`) can have ambient energy
without hardcoded hex values. The console (`ui/`) and marketing site stay
restrained; the social flagship is the deck screenshot and earns the extra
light. See §10 for per-app direction.

| Token | Value | Role |
|---|---|---|
| `--color-glow` | `rgba(139, 92, 246, 0.15)` | Soft ambient glow behind active nav pills, card hover halos, section anchors. |
| `--color-glow-intense` | `rgba(139, 92, 246, 0.35)` | Focused composer glow, active CTA halos, live indicator pulse. |
| `--color-glow-danger` | `rgba(239, 68, 68, 0.25)` | Like-burst animation, heart-pop afterglow. |

Usage discipline (social only): violet is still an accent, not wallpaper.
But the social flagship may use glow liberally as ambient light — a soft
`brand` blur behind active elements, a colored `box-shadow` on card hovers,
a pulse on interactive feedback. The rule shifts from "one flourish per
screen" to "glow is the texture, not the content." If the feed looks like
a dark spreadsheet, add glow. If it looks like a purple laser show, pull
back. The middle is Kick-grade: energy without chaos.

### Glow — ambient light (console & marketing)

The node console (`ui/`) and marketing site (`marketing-ui`) remain
restrained: one decorative glow per screen maximum (§4 original rule).
The console is an operator tool; it reads calm.

### Semantic

| Token | Value |
|---|---|
| `--color-success` | `#22c55e` |
| `--color-warning` | `#f59e0b` |
| `--color-danger` / `--color-destructive` | `#ef4444` |
| `--color-danger-muted` | `#450a0a` (danger-tinted background) |

Semantic colors mean things; never use them decoratively. Money/
monetization surfaces (the Studio) use `success` green for revenue
numbers ONLY — everything else in the Studio stays neutral + brand.

### Contrast rules (non-negotiable)

- Body text: ≥ 4.5:1 (AA). `foreground` and `muted-foreground` on any
  neutral surface pass; `brand-300` passes; `brand` (500) does NOT —
  it is for fills, rings, icons, and large display text only.
- UI components & large text: ≥ 3:1.
- Never light-gray-on-slightly-less-light-gray. If you're reaching for
  a fourth gray, the hierarchy is wrong, not the palette.


## 5. Typography

Three families, self-hosted via `@fontsource-variable/*` packages.
**Never load fonts from Google's CDN** — a privacy-first product does
not leak its users' IPs to a tracking company for a font. Today all
three apps silently fall back to system-ui (social declares Inter but
never loads it); actually loading the fonts is part of the level-up.

| Family | Package | Role |
|---|---|---|
| **Inter Variable** | `@fontsource-variable/inter` | Everything: UI, body, forms. Weights 400 / 500 / 600 only. |
| **Space Grotesk Variable** | `@fontsource-variable/space-grotesk` | Display: marketing headlines, hero numerals, section titles, the brand set as type. Weights 500 / 700. Its slightly techy geometry rhymes with the thin-outline wordmark. |
| **JetBrains Mono Variable** | `@fontsource-variable/jetbrains-mono` | Code in docs, tokens/IDs in the admin UI, terminal snippets. |

Scale (rem, on a 16px root — expose as tokens, don't freelance):

| Step | Size / line-height | Use |
|---|---|---|
| display | 3.5rem / 1.1, Space Grotesk 700, tracking −0.02em | Marketing hero only |
| h1 | 2.25rem / 1.2, Space Grotesk 700, −0.02em | Page titles, section heads |
| h2 | 1.5rem / 1.3, Space Grotesk 500 | Card group titles |
| h3 | 1.125rem / 1.4, Inter 600 | Card titles, modal titles |
| body | 1rem / 1.6 (marketing) · 0.9375rem / 1.5 (app UI) | Default |
| small | 0.8125rem / 1.5, Inter 400–500 | Meta, captions, table density |
| micro | 0.75rem / 1.3, Inter 500, +0.04em, uppercase | Overlines, badges, column headers |

Rules: max two families per screen (mono is exempt in code contexts).
Long-form prose (docs, manifesto) sets measure 65–75ch. Numbers in
stats/tables use `font-variant-numeric: tabular-nums`. No font-weight
above 700, no thin weights below 400 in UI (the wordmark is the only
thin thing in the brand).


## 6. Space, radius, elevation

- **4px grid.** Every margin, padding, and gap is a multiple of 4px
  (Tailwind's default scale — use it, never arbitrary `p-[13px]`).
  Component-internal rhythm: 8/12/16. Between components: 16/24.
  Between sections: 32/48. Marketing sections breathe: `py-24`–`py-32`.
- **Radius:** `--radius-sm: 0.5rem` (inputs, badges), `--radius:
  0.75rem` (buttons, cards — the house radius), `--radius-lg: 1rem`
  (modals, hero cards), `--radius-full` (pills, avatars). Nested
  radii: inner = outer − padding, or it reads as a mistake.
- **Elevation in dark UI is NOT shadows.** It is background steps
  (`background` → `surface` → `elevated`) plus 1px `border`. Shadows
  are reserved for things that float: dropdowns, popovers, modals
  (`0 8px 30px rgb(0 0 0 / 0.35)`). The one decorative exception is
  the brand glow (§4).
- Dense surfaces (admin tables, Studio analytics) tighten to the
  small type step and 8px internal rhythm — density is a feature in
  operator tools, as long as alignment stays exact.


## 7. Motion

Motion confirms causality; it never performs.

- **Micro** (hover, press, focus): 150ms, `ease-out`. Transform +
  opacity + color only — never animate width/height/top/left.
- **Panels** (drawers, modals, dropdowns): 200–250ms ease-out in,
  150ms out. Subtle: 4–8px translate + fade, not flying across screen.
- **Marketing reveals**: 400–600ms fade/rise on scroll-into-view, once,
  staggered ≤ 80ms apart. No parallax, no scroll-jacking, no looping
  attention-seekers.
- **Skeletons** shimmer at ~1.5s (gradient sweep, not solid pulse);
  content replaces them in place (no shift). Spinners only where a
  skeleton is impossible.
- `prefers-reduced-motion: reduce` is honored everywhere: transitions
  collapse to instant, reveals render visible.
- App UI (`ui/`, admin surfaces): no spring/bounce easings. The
  console is calm.
- **Social flagship** (`web10-social`) may be 10% springier:
  heart-burst on like (300ms scale + fade), shimmer skeletons,
  glow-pulse on live/presence indicators (2s ease-in-out infinite),
  card-hover lifts with brand `box-shadow`. Still no circus — energy,
  not chaos.


## 8. Components

- **shadcn/ui conventions** (D22): primitives live in
  `src/components/ui/` (Button, Card, Input, Dialog, DropdownMenu,
  Avatar, Badge, Skeleton, Tabs, Tooltip…), built on Radix, variants
  via `class-variance-authority`, composed with `cn()` (clsx +
  tailwind-merge). `marketing/web10-social/src/components/ui/` is the
  reference implementation — extend that idiom; when another app needs
  a primitive, copy it (apps are separate packages; verbatim copies
  with a "keep in sync with design.md" header beat a premature shared
  package).
- **Styling is utility classes referencing tokens.** No inline
  `style={{}}` for anything a token or utility covers (the `ui/` app's
  inline-style habit is debt to burn down). No new one-off CSS files
  per component. No CSS-in-JS (rejected in D22).
- **Icons: Lucide only.** `lucide-react`, 16/20/24px, `stroke-width`
  1.5–2, colored via `currentColor`. **FontAwesome is retired** —
  social loads a FA kit script from a third-party CDN (privacy leak +
  render-blocking) and marketing-ui uses `fa` classes without loading
  FA at all (invisible icons). Both go.
- **Focus**: every interactive element shows `focus-visible` as a 2px
  `--color-ring` (brand) ring with 2px offset. Keyboard users see
  exactly where they are on every screen.
- **Forms**: labels above inputs, always visible (placeholders are
  hints, never labels). Inline validation on blur, error text in
  `danger` under the field, never only a red border.
- **data-testid stays.** The e2e harness (C5) navigates by test ids —
  a beautification pass that strips them breaks CI. Keep existing
  hooks; add them to new interactive elements.


## 9. Responsive

Dogma: **375px phone and 1440px desktop are both first-class.**
Creators will open this on a phone in the middle of a pitch.

- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024,
  `xl` 1280). Design mobile-first; add complexity upward.
- App shells: desktop = fixed left sidebar (`w-64`, `border-r`,
  `bg-surface`); mobile = top header + bottom tab bar (the pattern
  already in `web10-social/src/components/Social/Layout.tsx` — it's
  correct; adopt it in `ui/` too).
- Touch targets ≥ 44×44px on mobile. Hover-only affordances get a
  visible mobile equivalent.
- Tables that matter on mobile become card lists; tables that don't
  scroll horizontally inside their card, never the page.
- Test at 375, 768, 1280, 1440 before calling a screen done. PR
  screenshots (§12) include 375px.


## 10. Per-app direction

### `marketing/marketing-ui/` — the pitch site (lane D)
The job: a creator's manager lands here and in 30 seconds believes
this is a company, not a weekend project. **Bulma comes out entirely**
(D22 already rejected it) — Tailwind v4 + tokens + the shadcn idiom.
Dark, cinematic, restrained: hero = full lockup + one declarative line
in the manifesto voice + one CTA; a reach-gap proof section (the
1M-subs-300k-views mechanic, shown as a simple chart, not adjectives);
real product screenshots in device frames; docs pages stay light-on-
reading-comfort (prose measure, mono code blocks); App Store cards on
the house Card primitive. Education-era imagery and university logos:
deleted. If it isn't true, it isn't on the site.

### `ui/` — the node console (lane B)
The job: the operator/consent surface reads like Vercel or Linear —
calm, precise, trustworthy. This surface holds the **Studio** (B4.5),
the money screen, the highest-stakes UI in the repo: monetization
cards on `surface` with exact alignment, revenue numerals in
tabular-nums with `success` green reserved for money. Burn down the
inline-style habit; delete the dead vendored Bulma in
`ui/src/assets/bulma/`; fix the `SideBar.tsx` bug where a literal
`style={{…}}` string is concatenated into `className`; adopt the
`components/ui` primitive kit and the mobile bottom-nav shell. Auth +
consent screens are the narrative surface ("this is your node; these
are your contracts") — one column, generous space, zero clutter.

### `marketing/web10-social/` — the flagship (lane D)
The job: the screenshot that goes in the deck next to Kick and Twitch.
Media-forward feed (images/video lead, chrome recedes), tight
avatar/name/timestamp system on the small type step, a composer that
feels like publishing rather than filling a form, DMs with presence
polish, profile as a creator page (banner, stats row, grid). First-run
empty states are the story: point at the importer. Fix the wiring
gaps: `@tailwindcss/vite` plugin is missing from `vite.config.ts`
(the build pipeline is half-connected) and Inter is declared but never
loaded. Finish evicting the excluded legacy `rectangles-npm`/
`@chatscope` components.

Vibrancy: the social flagship is the energy surface. Unlike the calm
console (`ui/`), it earns ambient light: glow behind active nav items,
card-hover halos, heart-burst on like, shimmer skeletons, gradient
bubbles in DMs, presence pulses, a living login screen. The tokens
`--color-glow`, `--color-glow-intense`, `--color-glow-danger` exist
for this app. See §4 glow section and §7 social motion. The bar is
Kick-grade: vibrant, alive, never muted.


## 11. Accessibility (part of pretty, not opposed to it)

- Contrast per §4. Focus-visible per §8. Reduced motion per §7.
- Semantic HTML first: real `<button>`, `<nav>`, `<main>`, headings in
  order. Radix handles ARIA for composite widgets — don't hand-roll
  what Radix provides.
- Every image has alt (or `alt=""` if decorative); every icon-only
  button has an `aria-label`.
- Fully keyboard-operable: anything a mouse can do, Tab/Enter/Esc can do.


## 12. Definition of done for UI work

> **TEMPORARY OVERRIDE (30.07.2026):** in Conductor (conductor.build)
> workspaces with the opencode plugin, reading a PNG breaks the agent
> session — items 1-2 are SUSPENDED until the conductor.build fix lands
> and the operator gives the all-clear. Capture may still run (a green
> capture is a useful smoke signal) but agents must never `read`/open
> the PNGs; verify via harness/tests/tsc instead. See AGENTS.md "UI
> verification: screenshots".

A UI PR merges when:

1. **The screenshot test (§1) passes** on every changed screen.
2. **Screenshots are in the PR description**: each changed screen at
   desktop (≥1280) and mobile (375). Reviewers judge pixels, not diffs.
3. **Zero hardcoded colors/fonts/radii** in the diff — tokens only.
4. All interactive states + loading/empty/error states exist (§1, §8).
5. No layout shift, no dead assets, no invisible icons, no
   browser-default controls on the changed screens.
6. `data-testid` hooks preserved/added; existing tests + e2e smoke
   still green.
7. No regression of the security invariants' UI surfaces (consent
   screens must stay explicit about what a token may touch — pretty
   never means vague).

Changing THIS file: token values and brand rules change by PR that
edits design.md itself, with a decisions.md entry if it's a real
direction change. App code never quietly diverges from the doc — if
the doc is wrong, fix the doc, then the code.


## 13. Canonical tokens (copy verbatim)

Tailwind v4 `@theme` block — the single source of truth. Each app
carries a copy in `src/styles/tokens.css` (or its `index.css @theme`
block) headed by: `/* SOURCE OF TRUTH: /design.md §13 — sync, don't
fork */`. `ui/src/styles/tokens.css`'s current light-first blue token
set migrates TO this; `web10-social`'s `@theme` is closest and gains
the missing steps.

```css
@theme {
  /* neutrals — zinc, dark-first (§4) */
  --color-background: #09090b;
  --color-foreground: #fafafa;
  --color-surface: #111113;
  --color-elevated: #18181b;
  --color-border: #27272a;
  --color-input: #27272a;
  --color-ring: #8b5cf6;
  --color-muted: #18181b;
  --color-muted-foreground: #a1a1aa;

  /* brand — violet (§4) */
  --color-brand-300: #c4b5fd;
  --color-brand-400: #a78bfa;
  --color-brand: #8b5cf6;
  --color-brand-600: #7c3aed;
  --color-brand-muted: #2e1065;
  --color-brand-foreground: #fafafa;

  /* glow — ambient light, social flagship (§4) */
  --color-glow: rgba(139, 92, 246, 0.15);
  --color-glow-intense: rgba(139, 92, 246, 0.35);
  --color-glow-danger: rgba(239, 68, 68, 0.25);

  /* semantic (§4) */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-danger-muted: #450a0a;

  /* shadcn compatibility layer */
  --color-card: #111113;
  --color-card-foreground: #fafafa;
  --color-popover: #18181b;
  --color-popover-foreground: #fafafa;
  --color-primary: #fafafa;
  --color-primary-foreground: #09090b;
  --color-secondary: #27272a;
  --color-secondary-foreground: #fafafa;
  --color-accent: #27272a;
  --color-accent-foreground: #fafafa;
  --color-destructive: #ef4444;

  /* type (§5) */
  --font-sans: 'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Space Grotesk Variable', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;

  /* radius (§6) */
  --radius-sm: 0.5rem;
  --radius: 0.75rem;
  --radius-lg: 1rem;
  --radius-full: 9999px;
}
```

White-label note (D22): creator nodes wear their brand by overriding
these CSS variables at runtime — which is exactly why every color in
every component must come through a token. A hardcoded hex isn't just
ugly, it breaks phase-4 theming.
