# Messages screenshots — how to capture them (read this before you try)

## People/Groups directory mixer

`SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/directory-mixer" node screenshots/directory-mixer.mjs`
boots/stops both actual apps and intercepts all external data. It checks separate
creation-date sorts and reload, the shared server editor, real two-source page
budgets, read-only foreign cards and all-muted reload. Both themes at
1440/375/768/1280; captures and receipt stay under the requested `.context/`.
This is synthetic public-browser evidence, not independent HTTPS nodes or
authenticated foreign app grants.
The compact sort chips are exercised through native radio arrow keys and visible
label taps, with focus/44px-target/history checks.

## System / Light / Dark appearance

Navigation glass trial: `SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/navigation-glass" node screenshots/navigation-glass.mjs`
boots/stops its own server and captures light/dark desktop/375px shell and menus.
Checks 768/1280 bounds, navigation from Appearance, focus, 44px dock targets,
extreme-backdrop neutral-label contrast, simulated safe-area/compose/music
clearance, opaque fallbacks, signed-out controls and hidden immersive-Shorts dock.
Real Chromium/CSS with isolated data; not Safari, physical-phone or production proof.

Refraction pixel gate: `SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/refraction" node screenshots/refraction.mjs`.
Compares actual rendered dock pixels with the configured displacement versus zero over
synthetic straight stripes, requires changed rim pixels and unchanged center,
checks normal-map regeneration on resize and a non-Chromium engine-hint fallback.
Set `REFRACTION_FRAMES=1` to also export 24 moving-pattern frames for a demo GIF.
Pattern motion is fixture-only; the app lens/filter never animates or captures
the page. This is current Chromium rendering evidence, not Safari/phone/frame-rate proof.

`SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/appearance" node screenshots/appearance.mjs`
boots and stops its own server. It drives real radio keyboard selection,
live device changes, remembered overrides/reload, two-tab synchronization,
signed-out entry points, light-token AA contrast and theme/native/browser colors at desktop/375px,
with responsive checks at 768/1280. Blocking-startup cases hold React back
entirely. Captures include Settings/Appearance in both palettes and light
Posts/Music/profile/watch/Shorts. Data is isolated fixtures, not a connected
node, deployed release or physical-phone receipt.

Marketing's actual-app counterpart (run from `marketing/marketing-ui`):
`SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/marketing-appearance" node scripts/appearance-browser.mjs`.
It intercepts network data, captures landing/docs/Appearance in both palettes,
drives the real Learn/mobile navigation and checks transparent theme artwork,
decoded PNG alpha/size parity, selected borders, AA and 768/1280 bounds.
`node scripts/render-theme-brand.mjs` reproduces the two derived dark assets
from the canonical white originals without changing geometry or dimensions.

PR screenshots for the **messages screen** (the Chat view) are
produced by ONE command, with **no docker stack and no login**:

```bash
cd marketing/web10-social
bun run screenshots        # writes screenshots/{chat,settings}-{desktop,375}.png
```

One-off view (a screen you're PRing that isn't in the default set) — no
file edits needed:

```bash
node screenshots/capture.mjs --name my-view --ready '[data-testid="my-view"]'
node screenshots/capture.mjs --name settings --route /settings --ready h1
# --toggle '<selector>' clicks a toggle before waiting
```

Then LOOK at the six PNGs in this folder before you call the task done
(design.md §12 — desktop + 375px, all states).

If it errors with a missing browser, install it once:
`bunx playwright install chromium`.

## Why the obvious approach fails (this is the wall agents hit)

If you `bun run dev` and point a browser at the app, two things bite you:

1. **The port is 3000, not 5173.** `vite.config.ts` pins `server.port: 3000`
   (falls back to 3001/3002 if taken). Vite's *default* 5173 is never used
   here. Read the "Local:" line the dev server prints — don't assume.
2. **`/messages` redirects to the login screen.** The app gates every route
   behind `adapter.isSignedIn()`, which needs a real wapi cookie token from
   the full node stack (api.localhost signup + `/web10token`). Navigating to
   `/messages` logged-out silently renders `<LoginScreen>`. If you screenshot
   that, you've screenshotted the login page — not the view. (This is exactly
   how a bogus "chat-desktop.png" of the login screen got committed once.)

## How the harness dodges both

`screenshots/capture.mjs` boots a dedicated Vite server on port **4500** using
`screenshots/vite.config.ts`, which:

- renders the **real** `Layout` + `DmsScreen` (full app chrome, real Tailwind
  tokens) via `harness/entry.tsx` — so the shots are deck-quality, not mocks;
- aliases **only the data layer** to seeded, in-memory fakes:
  - `@/data/wapi` → `harness/mock-wapi.ts` (a token that makes `isSignedIn()`
    return true — no backend, no login);
  - the exact `@/data` barrel → `harness/mock-data.ts` (five contacts with
    notes + DM threads). `@/data/types` and everything else under `@` stay
    real.
- scopes `optimizeDeps.entries` to the harness html, so Vite does NOT crawl
  the app's own `index.html` (which imports many `@/data` functions the mock
  omits and would otherwise error the pre-bundler).

Playwright then loads each view, waits for its `data-testid`, and
screenshots at 1440×900 and 375×812.

## If you change the messages views

- New `@/data` functions used by DmsScreen → add a stub to
  `harness/mock-data.ts` (or the pre-bundler errors "No matching export").
- New view or renamed testid → update the `VIEWS` array in
  `capture.mjs`.
- Want different seed content → edit `PEERS` in `harness/mock-data.ts`.

## People-tag autocomplete matrix

The self-booting real-UI matrix covers Posts/Following, Discover, Video/watch,
Shorts, Music-native comments, profile/group feeds, post detail and the caption
editor at desktop and 375px. It selects and submits tags using mouse/touch,
checks focus/caret and menu bounds, exercises reply/edit targets, and replaces
an already selected caption tag without keeping its old recipient. The data
is isolated screenshot fixtures; this is not production or connected P2P.

```bash
SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/mentions" node screenshots/mentions-smoke.mjs
# Optional narrow picker iteration:
MENTIONS_SURFACE=caption SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/mentions" node screenshots/mentions-smoke.mjs
```

The separate API floor creates and removes only its own disposable ClickHouse
24.8 container. It runs actual FastAPI signup/login/CRUD/query and the exact
three source notification queries, public non-member and private/revoked
controls, directory visibility and removed-parent-tag recovery. No storage
uploads, app-consent/browser authentication, P2P or production connections.
Run from `api/`:

```bash
PYTHONPATH=. uv run --frozen python ../marketing/web10-social/screenshots/mentions-api.py
```

The receipt lands in `.context/mentions-api-receipt.json` after verified cleanup.

## Discover identity-loading captures

Cross-site expiring-image recovery matrix (run from the social app):

```bash
SCREENSHOT_OUTPUT_DIR="$PWD/../../.context" node screenshots/media-recovery.mjs
```

Fifty-six synthetic renderer/site-config/viewport cases use actual HTTP expiry,
150 ms latency and 100 KiB/s downloads, scroll lazy images into demand and
require one original read plus one shared renewal with decoded images (40
cases), bounded HTTP 403/404/503/manual Retry (12), and offline/reconnect (4). Named
Music/Shorts cases test artwork, not their full transports. The separate Music
MP3 and preview-budget scripts retain their narrower transport receipts. The
JSON matrix and all PNGs go to the specified `.context/` output. This is not
actual-node permissions or physical-phone/production acceptance.

Actual full/immersive HLS decoding and mid-playback renewal:

```bash
SCREENSHOT_OUTPUT_DIR="$PWD/../../.context" node screenshots/hls-recovery.mjs
```

Requires ffmpeg. Eight Chromium cases use generated twelve-second H.264/AAC
HLS, a real segment 403 and one original-read renewal in both app configurations
at desktop/375px. Capture metadata/playing traces and require renewed playing
positions not to restart at zero. Files, JSON receipt and eight PNGs remain in
the specified output directory. It does not use actual-node authorization,
real films, production credentials or native Safari.

`node screenshots/media-surface-inventory.mjs` checks both sites and the shared
package for unowned raw image/video renderers; it also runs before `test:run`
and `check`. Only shared primitives, bundled branding, local bug attachments
and the local editor are explicit exceptions.

For the shared marketing/social **preview downloader budget**, run from the
social app with output in the workspace's `.context/`:

```bash
SCREENSHOT_OUTPUT_DIR="$PWD/../../.context" node screenshots/preview-budget.mjs
```

This self-booting fixture uses each app's real Vite configuration, theme and
shared HoverVideo with actual vendored hls.js. Synthetic HTTP segments stall
until the preview loses its slot; desktop/375px checks require their requests
to be aborted, at most one segment downloader, and zero active after offline.
Screenshots retain the synthetic poster while buffering. The receipt is
`preview-budget-receipt.json`. This is shared-component/network evidence, not
full-tab, video-decoding, actual-node authorization or production acceptance.

For Posts (`--route /hot-gossip`) or Video (`--route /video`),
`--extra 'discover-face-state=pending'` holds the synthetic personal identity
lookup indefinitely while content remains visible. Wait/scroll to
`[data-testid="post-author-avatar-loading"]` or
`[data-testid="home-author-avatar-loading"]`. For resolved synthetic identities,
use `--extra 'discover-prepared-faces=1'`; group faces remain separate in both.
These fixture states verify rendering, not production query timing or real auth.
Write outputs to `.context/` through `SCREENSHOT_OUTPUT_DIR`.

## Music captures

Social library acceptance (public curator → playlist → save live bookmark →
return → song reaction/save → ordered playback/comments) runs real Chromium at
desktop/375px with isolated in-memory data:

```bash
SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/music-social" node screenshots/music-social-library.mjs
```

The receipt and eight screenshots are UI evidence, not actual-node persistence,
private-target denial or physical-phone verification.

The ordinary Discover audio-card fixture is separate from the dedicated queue:
`--route /hot-gossip --extra 'discover-inline-audio=1' --ready '[data-testid="audio-player"]'`.
It returns one group-authored post with a real one-second silent WAV data URL.
This verifies the inline renderer, not the reported production recording.
Add `discover-inline-art=1` to include the synthetic cover; use
`--route /posts-following` with the same flags to exercise the Following feed.
Wait for `[data-testid="audio-artwork"] img.opacity-100` to capture loaded art.
Without the art flag, the same post exercises the deliberate disc fallback.

Music uses the real app-level `MusicProvider` and `MusicPlayer`, with seven
synthetic tracks (six inline-SVG-artwork audio tracks on a short silent WAV
data URL + one MUSIC VIDEO — a real one-second H.264 MP4 data URL, `music-7`),
inline SVG artwork and a short silent WAV data URL. Restoring
a track URL selects it without autoplay. Audio duration reflects the one-second
fixture, not the synthetic catalog metadata; these are not playback evidence.
Collection saves, removals and creation remain in memory until page reload.
For playlist cover failure, capture `/music-playlists` with
`--extra 'playlist-art-regression=1'` and wait for
`button:has-text("Tour Sets") [data-testid="music-artwork-fallback"]`.
The grid includes valid fixture art, a deliberately missing image and no cover;
it does not inspect the reported account's private playlists.
Tour Sets deliberately preserves collection order and skips two nonmusic or
unavailable references.

Run from `marketing/web10-social` (set `SCREENSHOT_OUTPUT_DIR` to an existing
directory to keep PNGs outside the source tree):

```bash
node screenshots/capture.mjs --name music --route /music --ready '[data-testid="music-screen"]'
node screenshots/capture.mjs --name music-saved --route /music-saved --ready '[data-testid="music-track-card"]'
node screenshots/capture.mjs --name music-playlists --route /music-playlists --ready '#playlist-name'
node screenshots/capture.mjs --name music-player --route /music-player --ready '[data-testid="music-player"]'
# The panel's designed loading state (5.16.1): a deep-linked track whose home
# read never settles — the skeleton + "Loading your track…" stays on screen
# instead of the empty "choose a track" session. Opt-in fixture flag only.
node screenshots/capture.mjs --name music-track-pending --route /music-track-pending --ready '[aria-label="Loading track"]'
node screenshots/capture.mjs --name music-queue --route /music-queue --ready '[data-testid="music-player"]'
node screenshots/capture.mjs --name music-playlist --route /music-playlist --ready '[data-testid="music-track-card"]'
# The music-video track (music.md: a video CAN be a track) on the panel's
# video stage — the session's own <video> element, borrowed into the frame:
node screenshots/capture.mjs --name music-video-player --route /music-video-player --ready '[data-testid="music-video-stage"]'
```

`capture.mjs` turns `--route` into a harness screen key, not a literal app URL.
The keys above map to `/music`, `?view=saved`, `?view=playlists`,
`?track=music-1&panel=player`, `?track=music-1&panel=queue`,
`?track=music-7&panel=player` (the music video), and the seeded
Tour Sets collection respectively. Each command writes desktop and 375px PNGs.

The bounded playback regression uses ffmpeg to generate an eight-second MP3,
native Chromium Audio and intercepted HTTP 403/fresh responses. It checks caption
titles, broken-art fallback, one-shot recovery, a persistent failure and explicit
retry on desktop/375px. Data reads still use screenshot mocks: this is not node
authorization, real signed-expiry, phone or background-playback evidence.

```bash
SCREENSHOT_OUTPUT_DIR="$PWD/../../.context" node screenshots/music-recovery.mjs
```

The script boots and stops its own server (port 4501 by default), writes recovery
and unavailable-state PNGs plus synthetic MP3 into that directory, and requires
ffmpeg and Playwright Chromium. Music's direct module and barrel reads both use
the same fixture so player recovery does not accidentally call a real node.

## Upload-flow UI preview

This is an interactive **simulation**, isolated from live posting. The real
composer hands off an in-memory draft only when Post is pressed; no file bytes
or posts are sent to the API. The preview currently accepts one video per post.
The queue survives internal navigation, not an actual browser restart. "Simulate
reopen" exercises the original-file picker without claiming durable recovery.

Run from `marketing/web10-social`, with `SCREENSHOT_OUTPUT_DIR` pointing to
the workspace `.context/` directory:

```bash
node screenshots/capture.mjs --name upload-active --route /uploads --ready '[data-testid="upload-card"]' --scroll '[data-testid="upload-card"]'
node screenshots/capture.mjs --name upload-recovery --route /uploads --extra 'scenario=needs-file' --ready '[data-testid="upload-card"]' --scroll '[data-testid="upload-card"]'
node screenshots/capture.mjs --name upload-processing --route /uploads --extra 'scenario=processing' --ready '[data-testid="upload-card"]' --scroll '[data-testid="upload-card"]'
node screenshots/capture.mjs --name upload-browse --route /upload-browse --extra 'scenario=paused' --ready '[data-testid="upload-indicator"]'
node screenshots/capture.mjs --name upload-compose --route /upload-compose --extra 'scenario=empty' --ready '[data-testid="post-composer"]'
```

`scenario` also accepts `paused`, `offline`, `processing-failed`, `publishing`,
`publish-failed`, `published`, `cancelled` and `empty`. Open "Test a scenario"
for connection loss, simulated file loss and server completion/failure controls.
Use "Browse while uploading" to test the persistent indicator; it returns to
the exact task. "Simulated account" tests owner partitioning and signout/return;
these identities are synthetic, independent of the app header's acting-author
picker. Returning to a previous owner requires file reselection. The simulation
rejects retained callbacks from old sessions/attempts; it is not an auth gate.
Use `--extra 'signed-out=1'` to capture its signed-out screen.
Preview publication never invents a post link. Production
callers, upload transport, notification behavior and size cap are unchanged.

## Composer paste-to-attach capture

Paste-to-attach (5.15.0: Cmd/Ctrl+V with pixels on the clipboard attaches the
image to the post composer's tray, the same seam as picker/drag-drop) is
verified with real Chromium against the real `PostComposer`:

```bash
SCREENSHOT_PORT=4502 SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/composer-paste" node screenshots/composer-paste.mjs
```

Per viewport it (A) writes a canvas-drawn PNG to the page's clipboard via
`navigator.clipboard.write` and presses a real Meta/Ctrl+V — the operator's
exact flow; (B) if the headless build refuses to deliver the keyboard paste,
dispatches a real `ClipboardEvent('paste')` with a real `DataTransfer` + `File`
on the composer root (stated in the receipt, never silent). It then requires
the tray to settle (real in-browser downscale/encode), the preview image to be
decoded, and the Post button enabled. Outputs:
`composer-paste-{desktop,375}.png` + `composer-paste-receipt.json` (written even
on failure). Isolated harness data; not node upload, deployment or
physical-clipboard proof.

## Capture diagnostics

`capture.mjs` buffers the page's console + uncaught errors and dumps them on
any failure, with hints. You do NOT need to hunt for dev-server logs — the
failing run prints everything. The two drift classes, both self-explaining:

- **`mock-wapi.ts` drift** (real `WapiWrapper` gained a method): impossible to
  miss — the mock is `satisfies WapiWrapper`, so `tsc --noEmit` fails at
  compile time and points at the mock file. Add the stub in the same commit.
- **`mock-data.ts` drift** (the `@/data` barrel grew an export the harness
  views import): the run errors with `No matching export named 'X'` followed
  by the exact file to stub. Add `X` to `harness/mock-data.ts`.
