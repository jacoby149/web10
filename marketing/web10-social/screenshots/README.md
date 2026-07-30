# Messages screenshots — how to capture them (read this before you try)

PR screenshots for the **messages screen** (Chat / Mail / CRM views) are
produced by ONE command, with **no docker stack and no login**:

```bash
cd marketing/web10-social
bun run screenshots        # writes screenshots/{chat,mail,crm}-{desktop,375}.png
```

One-off view (a screen you're PRing that isn't in the default set) — no
file edits needed:

```bash
node screenshots/capture.mjs --name my-view --ready '[data-testid="my-view"]'
node screenshots/capture.mjs --name settings --route /settings --ready h1
# --toggle '[data-testid="view-toggle-mail"]' clicks a toggle before waiting
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

Playwright then loads each view (clicking the Chat/Mail/CRM toggle), waits for
its `data-testid`, and screenshots at 1440×900 and 375×812.

## If you change the messages views

- New `@/data` functions used by DmsScreen/MailView/CrmView → add a stub to
  `harness/mock-data.ts` (or the pre-bundler errors "No matching export").
- New view or renamed toggle testid → update the `VIEWS` array in
  `capture.mjs`.
- Want different seed content → edit `PEERS` in `harness/mock-data.ts`.

## When a capture fails (read the error — it tells you the fix)

`capture.mjs` buffers the page's console + uncaught errors and dumps them on
any failure, with hints. You do NOT need to hunt for dev-server logs — the
failing run prints everything. The two drift classes, both self-explaining:

- **`mock-wapi.ts` drift** (real `WapiWrapper` gained a method): impossible to
  miss — the mock is `satisfies WapiWrapper`, so `tsc --noEmit` fails at
  compile time and points at the mock file. Add the stub in the same commit.
- **`mock-data.ts` drift** (the `@/data` barrel grew an export the harness
  views import): the run errors with `No matching export named 'X'` followed
  by the exact file to stub. Add `X` to `harness/mock-data.ts`.
