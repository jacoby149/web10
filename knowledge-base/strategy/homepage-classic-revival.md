# Classic homepage revival + landing A/B

Status: DECIDED + shipped-locally (25.11.2026, D125). Lane:
`homepage-classic-revival` in `parallel-execution.md`.

**Operator decision (25.11.2026):** the classic page is the marketing page,
shipped directly at `/` — no observation window, no A/B. Rationale (verbatim):
the current creator-pitch landing is "not working", "influencers dont bring
their audience, people have to feel like this shit is just cool", "that
revolution was cool shit". Phases 3–5 (observe / A-B / decide) are RETIRED by
this decision; measurement falls back to the observational before/after
comparison ab-testing.md prescribes (Phase 0 baseline still wanted). The
creator pitch survives, demoted, at `/audience`. Follow-up calls the same
day: the actual 2022 type and layered treatment, the founder photo back in a
3-column team grid (square crops,
first card anchored left, "not in the middle", built to grow), single entry
CTA **"Enter web10 social" → SOCIAL_ORIGIN** (supersedes the dual CTA below:
"should JUST be Enter web10 social"), and no hairline dividers — sections
separate by color blocks, the "serious style" of 2022.

**Visual reference:** the 2022 original is `home/index.html` and
`home/layouts/styles/{framework,layout}.css` at `f3d695394`, not the later
Bulma port described below. It paired regular, all-caps Georgia headings with Lineto
Brown Pro body text and used a dark translucent overlay on `back2.jpg`,
a sky-blue heading accent and a simple solid sky-blue CTA. Restore Georgia
and use self-hosted OFL Jost for the geometric body face; the archived
Brown Pro binaries have no verified redistribution license. Keep the current
copy, destination and content, but carry the navy treatment into the homepage
header and use distinct, borderless section bands. The fractal stays visible
on phones without fixed attachment.

The bundled founder portrait uses the shared `ReliableImage` renderer.
It lazy-loads at its original square size, and a retry requests only the
same local asset. It does not need a renderer-inventory exception.

The pledge uses the archived `home/layouts/images/sky.jpg`, served from
`/pledge-sky-2022.jpg` so the original broken relative link is not repeated.
The archive's 65% black overlay and the ink fallback keep the text readable.

**Marketing follow-through (D126):** the App Store and the rest of marketing
adopt the same typography and blue palette, including a cool Light mode.
The homepage keeps the fractal. The header shows Home, App Store, Freedom,
Docs and Appearance directly. Trending and Join are no longer tabs; their
old links still work. The Everything App pitch is retired; `/everything`
redirects home. See [design.md §13](design.md#marketing-wide-revolution-styling).

## Why

The marketing homepage was rebuilt on 19.07.2026 (D13, 1.0.63) from the
original “web10 Revolution” landing into the current creator-pitch page
(“Your audience.” + the reach gap). The operator (17.11.2026) recalls the
original own-your-data page as the stronger organic-signup surface — the
deep-blue, sciency one — and wants it back, tested rather than assumed.

The strategic case is real, not just nostalgia:

- **D41 / thesis.md** — web10 is a data-policy platform, not a privacy
  platform. “Own your data” is the thesis. The current hero sells the summer
  creator pitch, which D112 (15.11.2026) demoted to the archived
  creator/influencer track; the dominant GTM is now org-to-org.
- **The old page asked for an account.** Its CTA (“Enter web10”) went
  straight to the authenticator signup; the current primary CTA (“Explore
  web10”) routes to anonymous social browsing (D111). Part of the remembered
  signup difference is probably the *ask*, not the *pitch* — the test must
  expose that, and Phase 5’s optional split exists to measure exactly it.
- **PostHog only (D103, 5.0.0+)** — account-level measurement, the signed
  campaign handoff and atomic account-row signup context are already wired,
  so landing-page experiment attribution needs no new infrastructure.

## What the original page was (recovered from git history)

Source of truth for the revival: `marketing/marketing-ui/src/pages/Home.tsx`
and `src/components/Navbar.tsx` at commit `e01e4b6c3^` (pre-D13, 1.0.62). All
assets are still in history (`marketing/marketing-ui/public/layouts/images/`).

| Element | Original |
|---|---|
| Hero | Dark, fixed-attachment background `back2.jpg` — electric-blue fractal on deep navy (~260 KB) — “The web10 **Revolution**” with skyblue accent |
| Sub | “Use a web10 app. Sign up for an account. Get a domain name to start owning your photos, music, and data on the internet.” |
| CTA | “Enter web10” → `https://auth.web10.app` (signup) |
| Features | Peer to Peer / Own Your Data (“your data isn't stuck anymore, it's on your domain on your terms”) / Data Freedom |
| Stats band | Registered Users / Registered Apps / Total App Visits / Data Liberated, live, on `#1a1a2e` navy |
| Quote | “We pledge to make an internet space in which users lead their internet destiny.” — web10 Team, 2022 |
| Team | Founder + advisor cards, university-logo strip |
| Footer | Deep navy; “We are currently raising capital” line |

The page that replaced it (still live today): “Your audience.” hero,
reach-gap bars, How-it-works, stats bar (users / apps in the store / data
liberated), CTA “Explore web10”.

## Shape of the work

Client-side only (D60): marketing-ui page + design tokens + telemetry
events + one experiment flag. No API, auth, SDK or node change. No API
surface for “total visits” — the stats band uses the existing
`POST /v3/stats` fields (users, app_count, storage).

### Phase 0 — Baseline (operator + docs, no code)

Capture from the PostHog project (operator access; external collection is
default-off, so confirm ingestion is enabled on the www origin first):
`/` views, signup completions attributable to marketing landings, and the
view → CTA-click → signup funnel per page (`/`, `/freedom`, `/everything`,
`/join`), for the last 4–8 weeks. Record the numbers in the “Baseline”
section below.

Exit: numbers recorded + ingestion confirmed. They decide the Phase 3
window and whether Phase 4 is runnable as a formal A/B (see the
sample-size table).

### Baseline (fill in)

| Page | Views | CTA clicks | Signups | Window |
|---|---|---|---|---|
| `/` | … | … | … | … |
| `/freedom` | … | … | … | … |
| `/everything` | … | … | … | … |

### Phase 1 — Classic design tokens

- **design.md §13**: add the classic palette as tokens (proposal, names/
  values final in the PR):
  `--color-classic-background: #1a1a2e`,
  `--color-classic-foreground: #fafafa`,
  `--color-classic-electric: <blue measured from back2.jpg>`,
  `--color-classic-sky: <skyblue measured from the hero accent>`.
  Document the dark-only exception for the classic surface (the media-stage
  “retain dark controls” precedent, §4) and the fractal hero image as the
  one permitted decorative flourish (§4).
- **marketing-ui `src/index.css @theme`**: mirror the tokens; the
  “SOURCE OF TRUTH” header stays.
- **Hero asset**: restore `back2.jpg` from git history into `public/`,
  web-optimized (≤ ~300 KB). No fixed-attachment parallax on mobile
  (<640 px): plain navy + the classic electric glow instead — fixed
  attachment is janky on iOS and the flourish budget is one element.
- AA contrast checks for every text-on-navy pairing.

Gate: design.md + tokens + asset PR merged; a screenshot shows the palette
resolving from tokens.

### Phase 2 — The classic page at `/revolution`

New deep-linkable route (name: operator may rename), built on modern bones
— current stack, current stats endpoint, current handoff wiring, D108-aware
shell — and faithful in soul:

- **Hero**: fractal background (desktop), “The web10 Revolution”,
  **operator-approved sub copy (25.11.2026)**: “Use a web10 app. Sign up
  for an account. Get a domain name to start owning your photos, music,
  and data on the internet.” (An added “that only you control” clause was
  drafted and cut as too much.)
  Reading: “domain name” = the user’s **own web10 address**
  (the `web10.app/jacoby149`-style profile URL they get at signup), not a
  DNS purchase — web10 does not sell or issue domains (the D41 property
  that the address stays the user’s is what makes the metaphor hold).
  Evolution: the 2022 original (“Get a domain name to
  start owning…”) was first kept as-is, then the operator tightened it to
  the vault-key line, then restored the original the same day (25.11.2026)
  — the operator prefers the original line’s voice, “even though it is a
  little less accurate”; a TXT-record rewrite (“Point your domain at it
  with a TXT record…”) was discussed and rejected as harder to understand.
  The
  real-DNS-domain claim (a TXT record at `web10.<yourdomain.com>`
  attaching the user’s own domain; repointing the record moves the vault
  between nodes without changing the address) remains a separate, deeper
  feature, documented in `web10-v3/identity/domain-identity.md` +
  `web10-v3/setup/custom-domain.md` — not the hero’s pitch, and do not
  “correct” the sub copy toward a registrar/DNS framing. Two CTAs:
  primary **“Enter web10” → AUTH_ORIGIN** (the signup ask, through the
  existing decorated handoff) and secondary **“Explore web10” → SOCIAL_ORIGIN**
  (D111 preserved).
- **Features**: Peer to Peer / Own Your Data / Data Freedom — original
  copy. The Own Your Data body keeps the pre-D13 “it’s **on** your domain
  on your terms”: an operator tightening to “with” (the domain as vault
  key, not storage) was reversed the same day (25.11.2026) — the operator
  prefers the original line’s voice, “even though it is a little less
  accurate”.
- **Stats band**: classic navy, live `POST /v3/stats` — users / apps in the
  store / data liberated (existing fields only).
- **Pledge quote** (2022) — kept.
- **Team + universities + “raising capital”**: default **drop** (dated; the
  capital line is definitely out) — operator may veto the drop.
- **Surface**: always-dark scoped palette; the rest of the site keeps D108
  system/light/dark theming.
- **Telemetry**: `revolution_view` pageview + `revolution_enter_click` +
  `revolution_explore_click` — allowlisted properties only, no content
  (D56/D41 terms-level).
- **Placement**: footer link (“The original pitch” → `/revolution`);
  navbar unchanged (operator may ask for a nav entry).

Gate: desktop + 375 px screenshots reviewed; tokens-only colors pass the
renderer guard; all marketing tests + build + typecheck; refresh/deep-link
restores the route (URL owns the state).

### Phase 3 — Observe (2–4 weeks)

No flag, no split — just measure. PostHog funnel comparison, `/revolution`
vs `/`: views, CTA clicks, signups.

Exit (first to trigger):
- `/revolution` signups ≥ `/` signups at equal-or-lower traffic → Phase 4
  with high confidence;
- clearly worse → one iteration of copy/CTA on the route, one more window,
  then decide with the operator;
- traffic too thin to compare → extend once, then fall back to
  observational comparison indefinitely (state it plainly).

### Phase 4 — The A/B on `/`

PostHog feature-flag experiment on the landing route only:

- Flag `home_classic`, 50/50. Variant `classic`: `/` renders the classic
  hero + features + stats + pledge composition (the full classic page,
  minus what Phase 2 dropped). Variant `current`: unchanged.
- The flag is evaluated client-side by the PostHog SDK; the variant is
  attached to pageview/funnel events; signup attribution rides the existing
  campaign handoff + account-row signup context. No node involvement.
- **Pre-declared decision rule** — written into this doc *before* the first
  visit of the window: primary metric = completed signups; window =
  max(N days, M visits per arm); minimum lift to ship; **no peeking** —
  one read at the end.

Sample size (two-sided 95 % confidence, 80 % power, signup share of
landing views):

| Baseline | Lift to detect | Visitors per arm |
|---|---|---|
| 2 % | 3 % (+50 % rel.) | ~4,000 |
| 3 % | 5 % (+67 % rel.) | ~1,500 |
| 5 % | 8 % (+60 % rel.) | ~1,100 |

If Phase 0’s baseline shows one arm can’t be collected within ~8 weeks, a
formal A/B is not runnable — stay on `/revolution`, use observational
comparison, and say so rather than fake significance.

Gate: rule written + operator-approved; flag PR merged with variant
controls (unit: both variants render; each CTA set carries its correct
destination; events fire with allowlisted properties only).

### Phase 5 — Decide and ship

- The winner renders at `/` (flag retired, code simplified to the winner).
- The loser stays at `/revolution` if it has ongoing value (org-to-org
  visitors, docs cross-links) or is retired.
- Record the outcome + the decision in `decisions.md` (new D number); tick
  the lane.
- Optional follow-up (only if the classic wins): a second experiment
  splitting *pitch* vs *ask* — classic hero with the current “Explore
  web10”-only CTA — to know whether the story or the signup ask did the
  work.

## Non-goals

- No API/SDK/auth change (D60; marketing is client-side).
- No revival of the “Import Your Life” page (D94 cut it; migration is a
  commodity).
- No GA4/Hotjar (D103: PostHog only).
- No event content, no credentials in events (D56/D41 terms-level tracking).
- No production deployment until operator-approved rollout (separate gate).
- No changes to `/freedom` or `/everything` in this lane — they keep their
  own own-your-data angle; `/revolution` is the revival of the original
  home.

## Open questions (operator)

1. What are the monthly `/` views and the current signup rate? (Phase 0)
2. Route name: `/revolution`, or something else?
3. Team/university section: drop (default) or keep?
4. Footer-only link, or a navbar entry too?
5. CTA set: both “Enter web10” + “Explore web10” (default), or one?
