# design.md — the web10 design standard

**If your change touches anything a user sees — `ui/`,
`marketing/marketing-ui/`, `marketing/web10-social/`, any screen, any
component, any color — you read this file first, every time, before
writing code.** AGENTS.md points here; PRs that touch UI
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
   at the first post, an empty studio points at the
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

- **Dark-first.** The brand's native habitat is dark. Its original logo
  assets are white-on-transparent, with derived dark counterparts; creator/streaming
  culture (Kick, Twitch, OBS, Discord) lives in dark mode; and dark
  is where the violet accent reads as electric instead of corporate.
   The console, social and marketing follow the
   device by default, with remembered System / Light / Dark choices (D108).
   Both palettes are built from tokens; media stages retain dark controls.
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
| **Dark counterparts (D108)** | `marketing/marketing-ui/public/brand/logo-lockup-dark.png`, `marketing/web10-social/public/keys-mark-dark.png` | Zinc-900 copies with exactly the original dimensions/alpha | Light-mode lockup and square mark; never put a dark backing behind them. White originals remain unchanged. |
| **Share-card images (D109)** | `marketing/web10-social/public/og-image.png` (1200×1200, keys mark on `#09090b` + subtle violet glow), `marketing/marketing-ui/public/brand/og-image.png` (1200×630, lockup on `#09090b` + subtle glow; the shared copy is `.context/brand-assets/og-image.png`) | Opaque `og:image` assets for link previews | Share surfaces only (the app-root static tags + the social crawler card's brand fallback). Opaque ON PURPOSE: the receiving app composites `og:image` onto its own (white) card frame, so the image bakes in its own dark background — a transparent white mark is invisible there. Never use them in-app (in chrome, the transparent marks + the page's background are correct). |

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
- Never stretch, outline, shadow, rotate or apply runtime color filters to the marks.
- Use the white original on dark surfaces and its zinc-900 transparent
  counterpart on light surfaces. D108's follow-up explicitly rejects a
  black backing tile in light chrome. Derive the dark PNG from the original
  alpha geometry; do not redraw it or use the unrelated white-label fixtures.
  Square pair: social `/keys-mark{,-dark}.png`; lockup pair: marketing
  `/brand/logo-lockup{,-dark}.png`. `marketing/marketing-ui/scripts/render-theme-brand.mjs`
  reproduces the dark assets. Keep image dimensions and alpha unchanged.
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

The brand originates in two white PNGs. Generate further formats from the
existing files (do not invent a new mark):

1. **SVG vectorization** of both marks (trace or rebuild) — PNGs don't
   scale to hero sizes cleanly.
2. **Dark-on-light variants** — implemented by D108 for marketing/social;
   zinc-900 transparent PNGs preserve original alpha/size. Print/vector
   counterparts still follow the original geometry.
3. **Icon set**: favicon.ico + 192/512 PNG + apple-touch-icon per app,
   all from the square mark on `#09090b`, replacing every squatter above.
4. **One shared og-image** (1200×630): full lockup on `#09090b` with
   the violet glow treatment (§4), used by all three apps.
   *Paid (D109, 10.11.2026):* the marketing share surface is that asset —
   the lockup on `#09090b`, glow cut so the background reads black; the
   social share surface got its own square `public/og-image.png` (keys mark
   on `#09090b`) because its card crops near-square. Both are opaque (a
   share image must own its background — D109). The authenticator has no
   share surface; its debt is the §3 icon set, not an og-image.


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
**Never load fonts from Google's CDN** — the app's own face is a core
rendering dependency, and it does not depend on a third party for it
(reliability + control, no external request on the critical path).
Telemetry scripts (GA4/Hotjar, D56) are a different category: an
intentional, disclosed, env-gated product decision — not a rendering
dependency. Today all three apps silently fall back to system-ui
(social declares Inter but never loads it); actually loading the fonts
is part of the level-up.

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

### Permission approval (operator, 13.11.2026)

Use **App permissions** and **Group permissions** in visible authenticator
navigation, headings and messages, not “contracts”. The app-request moment is
a calm OAuth-style review: identifiable site, “would like to”, readable scopes,
generous spacing and clear Allow/Deny choices. Match both themes. Group identical
operation sets only, keeping every data type visible; own/all and wildcard access
must remain explicit. Technical details hold exact origins, names/codes and grant
differences. The request list scrolls, while continue/skip actions stay available
in a short phone viewport. Do not change approval, identity or token behavior.

Keep the primary permission review in ordinary English with quiet neutral
data-type chips. The operator rejected the colored literal-service code badges
after seeing them: they made the screen feel like a developer tool. Exact keys
and codes belong in Technical details, not repeated violet badges in sentences.
Unknown names remain visible, and wildcard scope still means “All data types”.

### Social action recovery (operator, 12.11.2026)

Upload/post failures offer approval and retry beside the draft, preserving text
and selected files in the open composer. Describe the needed action with its
exact service in inline code, e.g. “create `posts`”; keep the API reason in
details. Open sign-in only from a direct tap. Blocked windows, skipped approval
and repeated denials retain a usable next step; opening a window is not proof
of approval and never automatically publishes the draft. Reuse a completed
upload only for the same account, service, file and metadata.

This recovery change includes simple username hints explaining the existing
1–30 character letters/numbers/hyphens rule, no spaces/underscores or leading/
trailing hyphen. It does not change validation, sign-in or approval policy.
The broader authenticator language/layout redesign is separate work.

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
  social loads a FA kit script from a third-party CDN (render-blocking
  + an uncontrolled third-party dependency) and marketing-ui uses `fa`
  classes without loading FA at all (invisible icons). Both go.
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
Theme-aware, cinematic, restrained: hero = full lockup + one declarative line
in the manifesto voice + one CTA; a reach-gap proof section (the
1M-subs-300k-views mechanic, shown as a simple chart, not adjectives);
real product screenshots in device frames; docs pages stay light-on-
reading-comfort (prose measure, mono code blocks); App Store cards on
the house Card primitive. Education-era imagery and university logos:
deleted. If it isn't true, it isn't on the site.

### `ui/` — the node console (lane B)
**Provider setup correction (operator, 13.11.2026):** PostHog, SendGrid and Twilio
use the existing paste-credentials setup, not a new OAuth connection. Put direct
official credential-console links and exact permission/type hints beside the
fields. PostHog needs the region-matched public project ingest token, not a
personal API key; SendGrid needs Mail Send permission and a verified sender;
Twilio's existing adapter needs Account SID, Auth Token and Verify Service SID.
Open fixed provider destinations in a new tab without opener/referrer access or
credentials in the URL. Preserve manual Save, masked secrets and existing policy.

**Authenticator entry polish (operator, 13.11.2026):** use a compact brand header,
one clear primary action and a visible create-account path. Signup appears
directly under the heading, before saved accounts or password fields; Use another
account reveals the URL-owned password view. The account server
stays identifiable but secondary to username/password. Credential entry scrolls
with the page, not inside a phone card; consent review keeps its bounded list and
pinned actions. Existing authentication, verification and consent handlers stay
unchanged. No automatic account confirmation or approval.

Use another account is a full-width bordered action row with a violet plus icon,
foreground label and trailing chevron, not a muted text link (operator references,
13.11.2026).

Create an account gets a full-width violet-tinted bordered button with an account
icon and arrow under a foreground New to web10? invitation. It must not read as
muted footer copy; Continue remains the only solid-violet primary action. The
operator reports phone/email sign-in is not working yet: do not promote that
shortcut. Existing explicit password recovery stays available; removing the
shortcut does not fix or disable the underlying contact/verification handlers.
Inside Use another account only, show email and phone as visibly disabled
Coming soon options, with username/password usable below. No provider setup or
live delivery activation in this visual PR (operator scope correction).

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
are your permissions") — one column, generous space, zero clutter.

### `marketing/web10-social/` — the flagship (lane D)
The job: the screenshot that goes in the deck next to Kick and Twitch.
Media-forward feed (images/video lead, chrome recedes), tight
avatar/name/timestamp system on the small type step, a composer that
feels like publishing rather than filling a form, DMs with presence
polish, profile as a creator page (banner, stats row, grid). First-run
empty states are the story: point at the first post. Fix the wiring
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

**Posts invitation (operator, 13.11.2026):** the first slot in the signed-in
Discover/Following post column is a personal-photo, input-shaped invitation:
“Share something! :)” (operator-selected copy). It is a real button opening the existing composer
modal, never an inline input/editor or separate draft. Place it after feed
controls where the first post would start; it scrolls away normally, never
sticky/fixed. Hide it for signed-out readers and outside Posts. Keep the quiet
floating New post shortcut as the complementary scrolled-down entry.


### Social navigation glass — first pass (11.11.2026)

Video sound (operator, 13.11.2026): sound-on by default, one in-memory video
mute choice across Posts/Video/Shorts and shared video renderers. Never persist
it or couple it to Music; reload starts sound-on. Browser-blocked audible
autoplay needs a play action, not a silent fallback to muted. Changing mute
never resumes paused media. Shorts tiles hide the still play badge whenever
the real preview controls are shown, including touch-dwell—not CSS hover alone.

Signed-in phone navigation (operator, 13.11.2026): Posts, Video, Shorts, Music,
More. Messages moves into More, retaining its unread count both on the More
entry and its Messages row, direct routes and active destination indication.
Desktop and signed-out navigation retain their existing destinations.
More begins with a distinct personal profile card: resolved profile photo (or
initial fallback), name, username and View profile, before Appearance or utility
rows. The header avatar opens a profile-first menu; Change posting identity is
secondary and reveals the existing confirmed chooser only when requested.
Keep the header's Acting as label, current name/avatar and visible expand arrow
on phones and desktop. The first menu action is View profile; Change identity
is the visible second action and needs another tap to open the existing picker.
Profile navigation never changes the selected posting identity or grants authority.
The small profile menu is a compact, collision-aware popover anchored beneath
the header trigger on phones as well as desktop, not a bottom sheet. Use two
tight 44px-or-larger action rows without a repeated heading/close/card stack.
Only the full identity chooser uses the phone bottom sheet after the second tap.
Below the profile card, More's action order is People, Messages, Appearance,
Settings, Monetization, then admin-only Node Settings. Keep the card premier;
People is the first ordinary navigation row.

The social shell may use Apple-inspired frosted chrome: a floating mobile dock,
smoked dark / milky light headers, sidebar and navigation menus. Content, forms
and media keep their existing reading surfaces. This is a bounded visual trial,
not a platform-wide redesign or an optical-refraction claim. Use shared
`--chrome-*` material tokens derived from the current palette: surface tint,
foreground edge highlights, violet ambient light and a floating shadow. Blur is
static, never animated; controls keep their focus rings and 44px touch targets.
Without backdrop-filter, with reduced transparency or forced colors, use opaque
surfaces. Reserve the floating dock plus device safe area in scrolling content,
compose and music-player positioning. No navigation or appearance behavior changes.

**Music-player correction (13.11.2026):** keep the glass navigation capsule, but
replace the phone player's edge-to-edge square strip with an inset rounded
surface, matching the dock's 12px side clearance and leaving 12px above it.
Use a quiet frosted bed with a 90% tint to keep secondary text AA over extreme
backdrops. Operator follow-up (13.11.2026): remove the player's refractive border;
two simultaneous refractive widgets are too much. Keep the navigation dock's
approved refraction unchanged, and preserve opaque accessibility fallbacks.
Use a designed seek track; compact secondary
controls must not squeeze the title or fall outside the card. Previous,
play/pause, next and close stay in the phone mini-player; full-player/queue
navigation belongs inside Music. Desktop retains its bottom transport bar; lift New post above
the measured player height there too, so playback never covers the posting entry.
Playing an ordinary audible video stops and dismisses the music player; a
music-tagged video stays in Music's own transport. Muted previews do not dismiss
it. X means stop and dismiss, not hide music that continues playing invisibly.
Outside Music, the mini-player is only a remote control: no title/artwork or
queue link can pull the reader off their current page. Full player navigation
is available only after explicitly entering Music through app navigation; Queue
is a labelled action in that full player, not a tiny target on the bar.
Both Previous and Next stay visible on phones too. Disable a skip when the
actual queue/traversal cannot perform it; Previous may restart after three
seconds. A newly selected feed song uses the eligible music already loaded on
that board as its ordered queue; never fetch recommendations or additional pages
to manufacture a next track.

**New post control (operator, 13.11.2026):** replace the oversized violet
gradient orb with a quiet 48px neutral frosted control. Mobile keeps a compact
plus; desktop adds a readable New post label in a pill. No saturated fill,
persistent glow ring, bounce or refraction. Retain keyboard focus, hover/pressed
feedback, theme/accessibility fallbacks and clearance above the music player.
Remove the broad floating shadow and inset highlight from this control: they
leave an unwanted dark halo. Keep only the thin border at rest and an explicit
2px outline during keyboard focus; other glass surfaces retain their shadows.

**Operator correction, same day:** retain the pill dock but remove the broad
painted gradient, particularly in dark mode. Trial a real SVG displacement
filter on the dock's narrow rim only, with undistorted controls above it.
Generate only a rounded-lens normal map, never a screenshot or copy of page
content. Enable the experimental backdrop URL path only on tested Chromium
engines; other engines retain ordinary frosted glass. Prove displacement with
an actual rendered-pixel on/off comparison, not CSS parsing alone. Reduced
transparency/forced colors remain opaque. This is a local experiment, not an
Apple-equivalent rendering, Safari support or phone-performance claim.

**Visual approval:** the operator recognizes the apparent edge circles/streaks
as content behind the glass and explicitly requests the original refraction,
not the briefly tried softened variant. Retain the original 18-unit displacement,
unblurred rim input and 8px inner bed inset in both themes. No scratch texture.

**Persistent-ring correction:** the dock must not refract its own border or
highlight into extra gray arcs. Paint its outline/shadow above the optical
layers, not into their backdrop input. Keep the approved lens strength and
inset; on a uniform backdrop, displacement must add no lines.

### Authenticator mobile navigation glass (11.11.2026)

Operator-approved extension of the social dock to `ui/`'s authenticated mobile
navigation only: floating capsule, frosted bed, narrow refractive rim and a
violet selected pill. Preserve all six admin destinations and four non-admin
destinations, their accessible names and existing navigation handlers. Compact
visible Apps/Groups labels keep six 44px targets readable at 375px. Desktop,
credentials and consent stay unchanged. Reserve dock height plus safe-area and
scroll clearance; use dynamic viewport height for the console shell.

Copy the social lens/material locally (separate apps, §8), retaining the
18-unit displacement, 8px bed inset and outline above the optics. The console
bed uses 90% surface tint so its compact labels stay AA over bright content.
Generate capsule normals only, never page pixels. Chromium gets the tested experimental
refraction; other engines get frost. No-filter, reduced-transparency and
forced-color modes stay opaque/readable. Check actual navigation, keyboard
focus, admin/non-admin and signed-out states, 375/768/1280/1440 layout, safe-area
clearance and rendered rim on/off pixels. Browser fixtures are not live auth,
physical-phone/Safari performance or deployment acceptance.

## 11. Accessibility (part of pretty, not opposed to it)

- Contrast per §4. Focus-visible per §8. Reduced motion per §7.
- Semantic HTML first: real `<button>`, `<nav>`, `<main>`, headings in
  order. Radix handles ARIA for composite widgets — don't hand-roll
  what Radix provides.
- Every image has alt (or `alt=""` if decorative); every icon-only
  button has an `aria-label`.
- Fully keyboard-operable: anything a mouse can do, Tab/Enter/Esc can do.


## 12. Definition of done for UI work

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

### Social, marketing and authenticator appearance (D108)

Social, marketing and the authenticator default to System (`prefers-color-scheme`), follow live device
changes, and offers explicit Light / Dark overrides in Settings and the
public `/appearance` screen (More → Appearance; signed-out phones use the
header's Appearance button). Marketing exposes the same choices at
`/appearance` through Learn → Appearance. The authenticator exposes the same
choices in Settings and on public `?mode=appearance`, linked from login; popup
consent follows this origin's choice without navigating away from its request.
Each preference belongs to
this browser/origin, not an account or acting identity. Store only
`system`, `light` or `dark` under `web10-social:theme`, `web10-marketing:theme`
or `web10-auth:theme`;
synchronize tabs within each site, not across different origins,
and treat missing/invalid/removed preferences as System. Storage denial
must not break switching: keep the choice in memory and say it cannot be
remembered. Appearance is not a URL override; the screen is URL-owned.

Apply the resolved theme before the app module paints, then update the
root theme/class, native `color-scheme` and browser `theme-color` together.
The small blocking startup script is the only non-CSS copy of the two
background values below. Its behavior is checked against the runtime.

Light neutral overrides: background `#fafafa`, foreground `#18181b`,
surface/card/popover `#ffffff`, elevated/muted/secondary/accent `#f4f4f5`,
border/input `#d4d4d8`, muted foreground `#52525b`. Foreground aliases
follow foreground; primary is `#18181b` on `#fafafa`. Light brand text
300/400 is `#6d28d9` / `#5b21b6`, brand/ring `#7c3aed`, pressed
`#6d28d9`, muted `#ede9fe`; brand foreground stays `#fafafa`.
Light success/warning/danger are `#166534` / `#854d0e` / `#b91c1c`,
danger-muted `#fee2e2`. These keep body text ≥4.5:1 on neutral surfaces.
All three apps consume the same framework-free store in `marketing/shared/appearance/`,
with app-local React hooks and startup initializers. Existing text-tile colors
stay dark with tile foreground. Dark media
controls use a locally scoped copy of the original dark tokens, not
inverted images/video. Theme-aware artwork swaps white/dark transparent assets;
there is no black logo tile in light mode. Authenticator white-label brand
artwork uses its configured dark/light logo pair (defaults: canonical
`ui/public/keys-mark{,-dark}.png`, matching social's alpha/dimensions); no credential/account data
belongs in appearance storage. Its glass dock gets palette-derived light edge,
highlight and shadow tokens, retaining the 90% readable center tint.

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

  /* text-tile palette — text-only posts on the 9:16 wall (social app).
     Deep, saturated, dark backgrounds (each reads as a color but stays in the
     dark-first UI) + a bright foreground. A text-only post picks one
     deterministically (hash of the post id) so it renders as a designed card,
     not an empty black box. All pair with --color-tile-foreground (≥4.5:1). */
  --color-tile-violet: #4c1d95;
  --color-tile-indigo: #312e81;
  --color-tile-fuchsia: #701a75;
  --color-tile-blue: #1e3a8a;
  --color-tile-teal: #134e4a;
  --color-tile-rose: #881337;
  --color-tile-foreground: #fafafa;

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
