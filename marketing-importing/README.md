# marketing-importing — OPS

The pipeline that imports a creator's Instagram presence into web10: their
account, their profile (name / PFP / bio / website), and their content,
chronologically — plus the ongoing sync of new posts.

> **Why this exists:** creators join web10 with an existing Instagram
> audience. Their history *is* the product. This is how a managed profile
> gets from zero to "his whole feed, in order," and stays current after.

## The three skills

| Skill | What it does | Doc |
|---|---|---|
| `web10identify <name>` | Registers the **mapping** (IG handle ↔ web10 username) in the repo; resolves loose names to the closest identified person | [`skills/web10identify.md`](skills/web10identify.md) |
| `web10import <person>` | **First-time import**: creates the web10 account if missing, sets the profile (name/bio/website/PFP from Instagram), posts every IG post oldest→newest | [`skills/web10import.md`](skills/web10import.md) |
| `web10accountsync <person>` | **Ongoing sync**: re-scrapes Instagram, posts only what's new | [`skills/web10accountsync.md`](skills/web10accountsync.md) |

`<person>` is the registry key (e.g. `adam_malev`). When the operator names a
person loosely ("adam malev", "that adammalev guy"), run
`identify.mjs resolve "<name>"` and confirm with them on a low score.

## How it actually works

- **Instagram side** — public-profile browsing. The `instagram:user`
  yt-dlp extractor is broken (upstream, as of 09.11.2026), so
  `ig-inventory.mjs` renders the profile in headless Chromium, reads the
  header (name, bio, link, PFP — the bio website can be bare text, not an
  `<a>`; truncated bios get their "…more" expanded) and the grid (post
  permalinks, newest first), scrolling until the grid settles. Per post:
  `yt-dlp` for videos (metadata + media). **Photo posts/carousels break
  yt-dlp** ("No video formats found" per slide) — for those the DOM
  fallback in `core.mjs` takes over: caption from the server-rendered
  `og:description`, and every slide's full-res URL by dispatching the
  carousel's Next button in-page (real mouse/touch swipes don't trigger
  it) while collecting the *union* of slide URLs — the carousel is
  virtualized (~3 slides in the DOM at once), so counting DOM images is a
  false signal. Private profiles are out of scope: public only.
- **web10 side** — the real app UI, driven headlessly
  (Playwright/Chromium against `social.web10.app` + `auth.web10.app`):
  one-tap login (consent popup; auto-completes when the app contract is
  already granted), signup for new accounts, profile edit (name/bio/website
  inputs; PFP via the file-chooser event), and posting through the **New
  Post sheet** (the same surface a human uses). Nothing is posted by raw API
  calls — the app's own validation, encoding and fan-out all run.
  - **Detached file inputs:** the app's avatar/banner upload spawns an
    `input[type=file]` via `document.createElement` and clicks it while it's
    NOT in the DOM. Headless Chromium won't open a file chooser for that.
    `import.mjs` works around it with a `context.addInitScript` that attaches
    any created file input to `<body>` — keep that whenever a new upload
    surface appears.
- **Ordering** — Instagram's grid is newest-first; we reverse it so web10
  receives the profile chronologically.
- **Captions** — the Instagram description is the post body, verbatim.
- **Carousels** — every image in a post becomes one web10 post with all
  media attached, in Instagram's order.
- **Visibility** — public (the import mirrors a public profile).

## Layout

```
marketing-importing/
├── README.md                  ← you are here (OPS)
├── .gitignore                 ← media + logs stay out of git
├── skills/                    ← the three skills, agent-facing docs
├── people/                    ← THE REGISTRY (identify writes here)
│   └── adam_malev.json        ←    ig handle ↔ web10 username + permission
├── scripts/
│   ├── common.mjs             ← paths, state, creds, headless login/signup
│   ├── identify.mjs           ← add / show / list / resolve
│   ├── ig-inventory.mjs       ← scrape the IG profile → state/<p>/inventory.json
│   ├── core.mjs               ← the shared post loop (dedup, download, UI post)
│   ├── import.mjs             ← web10import (account + profile + everything)
│   └── sync.mjs               ← web10accountsync (new posts only)
└── state/<person>/
    ├── inventory.json         ← last IG scrape (posts newest-first, header facts)
    ├── synced.json            ← web10 post record: { igUrl: {ig_id, files, posted_at} }
    ├── media/<igId>/          ← downloaded files (cached; not in git)
    ├── meta/<igId>.json       ← yt-dlp metadata cache (not in git)
    └── *.log                  ← console captures (not in git)
```

`state/<person>/synced.json` is the source of truth for "what's on web10."
Commit it; it's what makes every run resumable and dedup'd.

## Credentials policy

- **Never in the repo, never in `people/`.** The web10 password travels as
  `WEB10_USERNAME` / `WEB10_PASSWORD` env vars for one run; the skill asks the
  operator for them first.
- Instagram runs without login (public browsing). If a profile ever needs IG
  auth, stop and talk to the operator — no IG credentials in this pipeline.

## Permission policy

`people/<key>.json` must carry a `permission` line naming who allowed the
import and when. `import.mjs` and `sync.mjs` **refuse to run** on a person
without one. This is a gate, not ceremony.

## Deleting a post from a managed profile

The app's own owner flow (no API): profile grid → tile (`profile-post-cell`)
→ lightbox → `⋯` (`post-options-button`) → **Delete post** (`post-delete-button`)
→ type `delete` (`post-delete-confirm-input`) → **Confirm Delete**
(`post-delete-confirm-button`). Headless driver (one-time, kept for reference):
`.context/production-run/delete-post.mjs` in the almaty workspace (09.11.2026).

## Running (short version)

```
# who is this person?
node marketing-importing/scripts/identify.mjs resolve "adam malev"

# register a new person
node marketing-importing/scripts/identify.mjs add --key newguy \
  --web10-username newguy --insta newguy_ig --name "New Guy" \
  --permission "owner granted permission 09.11.2026"

# full first import (ask operator for creds first)
WEB10_USERNAME=newguy WEB10_PASSWORD=*** \
  node marketing-importing/scripts/import.mjs newguy --limit 25

# keep current (ask operator for creds first)
WEB10_USERNAME=newguy WEB10_PASSWORD=*** \
  node marketing-importing/scripts/sync.mjs newguy --dry     # see what's new
WEB10_USERNAME=newguy WEB10_PASSWORD=*** \
  node marketing-importing/scripts/sync.mjs newguy           # post it
```

Requires: `bun install` (node_modules) in `marketing/web10-social` — the
scripts borrow its Playwright install. Screenshots land in
`.context/production-run/` (gitignored).

## Agent flow (list + progressive runs)

The pipeline is deliberately list-driven so any run is short, inspectable
and resumable:

- `state/<person>/inventory.json` — **the list** (every IG post, newest first).
- `state/<person>/synced.json` — **the cursor** (what's already on web10).
- each `import`/`sync` run walks the list oldest-first and stops at the
  first failure; the next run continues right there. `--limit N` chunks a
  run (e.g. 25 posts) so a big import doesn't run unattended for hours.

That's the "AI agent" shape: one post at a time, verify (sheet closed +
state written) before moving on, report the stop point instead of
swallowing it.

## Known constraints

- IG public grid: heavy use gets rate-limited; chunk and retry, don't hammer.
- Node media limits: video ≤ 500 MB / 3 h, image ≤ 20 MB, audio ≤ 50 MB.
- Video posts are playable on the node after its server-side HLS transcode
  (seconds–minutes after posting). Poster shows immediately.
- A just-uploaded PFP can 403 for a few minutes (the protected media
  capability settles after the object lands). Re-check before re-uploading —
  09.11.2026: face-crop avatar 403'd at +1 min, was 200 by +15 min, untouched.
- The app UI's testids are the coupling point: if a screen loses a
  `data-testid`, the scripts break loudly at that step (fix the testid or the
  script — don't silently skip).

## History

- **09.11.2026 — first run, `adam_malev`.** web10 account `adam` created
  headlessly (signup → consent → token handoff); first reel posted; pipeline
  built out (`identify`/`import`/`sync`); that manual reel deleted, full
  chronological import of @adammalev (10 posts, PFP, name, bio,
  adammalev.com) running through `import.mjs`.
