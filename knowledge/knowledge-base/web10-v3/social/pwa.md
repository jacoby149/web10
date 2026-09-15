# PWA — making web10-social a serious installable app

`shorts.md` settled the surface where the web experience genuinely lacks on a phone: the full-screen, vertical, swipe-between-posts feed. The browser is the wrong container for it — the chrome eats the viewport, autoplay-with-audio is blocked until the first tap, the back button yanks you out of the scroll-snap feed, and there is no offline. D41 already made the call that the client is a **PWA, not a native app** ("we are making the PWA the thing" — `thesis.md`). This doc settles what that actually requires: a **real service worker** (the keystone) + an **install prompt fired at the moment of value**, never on a timer. Decision: **D72**.

## The use case

A fan opens Shorts on their phone. They're three clips deep, the feed is exactly where they want to be. The app offers to **install** — one tasteful, dismissible surface: "install to keep your feed + go offline." They tap it. The next time they open web10, it's a full-screen app on their home screen, not a tab in a browser with a URL bar. The reel experience is now native-feeling, without an app store.

That is the whole goal. Everything below is in service of it.

## A PWA is only as real as its service worker

The load-bearing fact: **the browser will not offer to install a PWA unless it meets the installability bar.** The bar is three things, and web10-social shipped with only one of them:

| Requirement | Status before D72 |
|---|---|
| A valid `manifest.json` (`display: standalone`, 192/512 icons, `start_url`) | **Already there** (`public/manifest.json`). |
| Served over HTTPS (or `localhost`) | **Already there** (the node serves TLS; nginx in prod). |
| A **registered, functioning service worker** with a fetch handler | **The missing tooth.** `public/serviceWorker.js` was a stub — `const assets = []`, no real caching, no offline. |

So the app was *technically* a PWA (it had a manifest) but **not installable** in any browser that enforces the bar. The only "install" path was the user finding the browser's buried "Add to Home Screen" menu — a ~2% funnel. That is the gap D72 closes.

**The service worker is the keystone.** It is not a nice-to-have; it is the thing that unlocks the install prompt. No functioning SW → no `beforeinstallprompt` event → no install surface. The prompt is downstream of the SW.

## The service worker

`public/serviceWorker.js`. Three jobs, one invariant.

### The invariant: the cache is the shell, never the content

The offline cache stores the **app shell** — the built JS/CSS/HTML, the manifest, the icons, the vendored `hls.min.js` + `wapi.js`. It **never** stores user content: no posts, no DMs, no media, no feed data. The feed is always re-read from the node. Caching the shell never means serving a fan stale content or another creator's data. This is what keeps the PWA honest with D41 (the node is the source of truth; the client is a stateless frontend) and with D56 (content is never held client-side in a way that outlives the session).

### Precache (install)

On `install`, the worker precaches the known shell:

- `/` and `/index.html` (the SPA entry — the offline fallback target),
- `/manifest.json`, the icons (`logo192.png`, `logo512.png`, `favicon.ico`, `keys-mark.png`, `apple-touch-icon.png`),
- the vendored libs (`/hls.min.js`, `/wapi.js`),
- **the hashed build assets** — Vite emits `/assets/index-<hash>.js` / `.css` whose names are unknown at authoring time, so the worker fetches `/index.html` at install, regexes out the `/assets/...` references, and precaches those too. This is what makes a *fresh* install work offline, not just a revisit.

### Runtime (fetch)

- **Navigations** (SPA routes — `/shorts`, `/u/:username`, …): **network-first**, falling back to the cached `/index.html` when offline. This is what makes a deep link load offline to the shell.
- **Same-origin static assets** (`/assets/*`, fonts, images): **cache-first** with a background refresh. The hashed names mean a new deploy is a new URL, so there is no stale-asset hazard — the old URL simply 404s and the new one is fetched fresh.
- **Everything else** (API calls, media, cross-origin): **pass through**, never cached. The API origin is a separate host (`origins.ts`), so same-origin scoping already excludes it; the path guard (`/api`, `/v3`, `/telemetry`, `/media`, `/share`, …) is defense-in-depth.

### Update flow

The cache names are versioned (`web10-social-static-v1`, `web10-social-runtime-v1`). Bump the version constant on a deploy that changes the shell. On `activate`, the worker deletes every cache that isn't the current version and calls `clients.claim()`; `skipWaiting()` on install means a new deploy reaches already-installed clients on their next load without a stale worker holding the scope.

## The install prompt

The browser fires `beforeinstallprompt` (Chrome/Edge, desktop + Android) when the installability bar is met. The app **intercepts** it (`preventDefault()`), stashes the event, and decides *when* to surface it — because the moment matters more than the mechanism.

### The trigger policy: value, not a timer

The prompt shows **at the moment of value**, never on a timer, never a modal wall:

| Trigger | When | Why |
|---|---|---|
| **Shorts** | a phone user opens `/shorts` and stays ~3s | the reel surface is where the web gap is widest; they've already signaled "this is the thing I'm here for" |
| **Engagement** | the user follows a creator | following is the strongest "this is my place" signal in the app |
| **Manual** | the user taps an explicit "Install app" affordance | the desktop path (the browser's own prompt is the desktop default); always available |

**The anti-pattern is the on-load nag.** A prompt that fires on page load, on a timer, or more than once per session reads as an ad and trains the user to dismiss it — it fails the screenshot test (`design.md` §1). The rule: **one tasteful, dismissible surface; dismissal is remembered (localStorage) so it never re-nags the same user; never a modal wall.** That is the Meta-grade move — aggressive about *retention*, not about *interruption*.

### The surface

One component (`InstallPrompt`), two shapes:

- **Mobile:** a bottom sheet (the `AdPicker` idiom) — app icon, name, "install to keep your feed + go offline", an **Install** button, an X to dismiss.
- **Desktop:** the explicit "Install app" affordance drives the browser's own prompt (the `beforeinstallprompt` path). No floating card nagging a desktop user.

**iOS is the special case.** Safari does not fire `beforeinstallprompt` — iOS install is Share → "Add to Home Screen", which cannot be triggered programmatically. On an iOS device the surface shows **instructions** (Share → Add to Home Screen) instead of a button that does nothing. The `isIOS` detection (user-agent + `maxTouchPoints` for the iPadOS 13+ masquerade) picks the variant.

### The state

- `canInstall` — `beforeinstallprompt` fired and hasn't been consumed (Chrome/Android/desktop with a functioning SW).
- `isIOS` — the device is an iPhone/iPad (show instructions, not a button).
- `dismissed` — the user dismissed the surface (persisted in `localStorage`, so it never re-nags).
- `installed` — `appinstalled` fired (the prompt is done forever).

## The line it does not cross (D56)

The install flow is a **UX affordance, not a data-collection event** — but the *signal* that it happened is telemetry, and it obeys the D56 line exactly:

- `pwa_install_prompt_shown` — a content-free GA4 action: a count + the **trigger context** (`shorts` / `engagement` / `manual`). No user content, no PII, no post text, no media URL.
- `pwa_installed` — a content-free GA4 action: a count.

The trigger context is the only payload. It tells the operator *where* the prompt converts (Shorts vs. a follow), which is the signal that tunes the trigger policy — the same "compete with Meta/TikTok on UX" reasoning as the rest of D56, with the same content-blind guarantee.

## What this is not

- **Not a native app.** D41 — the client is a PWA. No app store, no phone-as-keychain, no `mobile/encryptor`. The PWA *is* the mobile client.
- **Not an offline-first content store.** The cache is the shell. The feed is always re-read from the node. "Offline" means "the app loads and you can navigate," not "you see cached posts."
- **Not an aggressive install funnel.** No on-load modal, no timer, no re-nag. One dismissible surface at the moment of value.

## Reference

- The decision: `../../../strategy/decisions.md` (D72)
- The reel surface it serves: `shorts.md`
- The PWA-is-the-client call: `../../../strategy/thesis.md` (D41)
- The telemetry line it obeys: `../telemetry.md` (D56)
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
- The app-store PWA-manifest model (the per-app listing this complements): `../app-store/overview.md`
