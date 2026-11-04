# Messages screenshots — how to capture them (read this before you try)

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

## Discover identity-loading captures

For Posts (`--route /hot-gossip`) or Video (`--route /video`),
`--extra 'discover-face-state=pending'` holds the synthetic personal identity
lookup indefinitely while content remains visible. Wait/scroll to
`[data-testid="post-author-avatar-loading"]` or
`[data-testid="home-author-avatar-loading"]`. For resolved synthetic identities,
use `--extra 'discover-prepared-faces=1'`; group faces remain separate in both.
These fixture states verify rendering, not production query timing or real auth.
Write outputs to `.context/` through `SCREENSHOT_OUTPUT_DIR`.

## Music captures

The ordinary Discover audio-card fixture is separate from the dedicated queue:
`--route /hot-gossip --extra 'discover-inline-audio=1' --ready '[data-testid="audio-player"]'`.
It returns one group-authored post with a real one-second silent WAV data URL.
This verifies the inline renderer, not the reported production recording.

Music uses the real app-level `MusicProvider` and `MusicPlayer`, with six
synthetic tracks, inline SVG artwork and a short silent WAV data URL. Restoring
a track URL selects it without autoplay. Audio duration reflects the one-second
fixture, not the synthetic catalog metadata; these are not playback evidence.
Collection saves, removals and creation remain in memory until page reload.
Tour Sets deliberately preserves collection order and skips two nonmusic or
unavailable references.

Run from `marketing/web10-social` (set `SCREENSHOT_OUTPUT_DIR` to an existing
directory to keep PNGs outside the source tree):

```bash
node screenshots/capture.mjs --name music --route /music --ready '[data-testid="music-screen"]'
node screenshots/capture.mjs --name music-saved --route /music-saved --ready '[data-testid="music-track-card"]'
node screenshots/capture.mjs --name music-playlists --route /music-playlists --ready '#playlist-name'
node screenshots/capture.mjs --name music-player --route /music-player --ready '[data-testid="music-player"]'
node screenshots/capture.mjs --name music-queue --route /music-queue --ready '[data-testid="music-player"]'
node screenshots/capture.mjs --name music-playlist --route /music-playlist --ready '[data-testid="music-track-card"]'
```

`capture.mjs` turns `--route` into a harness screen key, not a literal app URL.
The keys above map to `/music`, `?view=saved`, `?view=playlists`,
`?track=music-1&panel=player`, `?track=music-1&panel=queue`, and the seeded
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
