// web10-social service worker — the keystone of the PWA (D72, pwa.md).
//
// The browser only offers to install a PWA when it meets the installability
// bar: a valid manifest + HTTPS + a REGISTERED, FUNCTIONING service worker
// with a fetch handler. This file is that worker. It is what unlocks the
// `beforeinstallprompt` event the install prompt (src/lib/pwa.ts) intercepts.
//
// THE INVARIANT (pwa.md): the cache is the app SHELL, never the content. No
// posts, no DMs, no media, no feed data — the feed is always re-read from the
// node. Caching the shell never means serving a fan stale or another
// creator's data. This keeps the PWA honest with D41 (the node is the source
// of truth) and D56 (content is never held client-side past the session).
//
// Bump VERSION on a deploy that changes the shell — the versioned cache names
// make the old shell get garbage-collected on activate.

const VERSION = 'v1';
const STATIC_CACHE = `web10-social-static-${VERSION}`;
const RUNTIME_CACHE = `web10-social-runtime-${VERSION}`;

// The known shell. The hashed Vite build assets (/assets/index-<hash>.js) are
// unknown at authoring time, so install() ALSO parses /index.html and precaches
// whatever it references — that is what makes a FRESH install work offline,
// not just a revisit.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico',
  '/keys-mark.png',
  '/apple-touch-icon.png',
  '/hls.min.js',
  '/wapi.js',
];

// Paths that are dynamic / user content / API — NEVER cached (the invariant).
// The API origin is a separate host (origins.ts), so same-origin scoping
// already excludes most of it; this is defense-in-depth for any same-origin
// proxy path.
const DYNAMIC_PREFIXES = [
  '/api',
  '/v3',
  '/telemetry',
  '/media',
  '/share',
  '/pwa_listing',
  '/web10token',
  '/auth',
  '/import',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Add individually so one 404 (e.g. a missing icon in a partial dev
      // build) can't fail the whole install.
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})),
      );
      // Precache the hashed build assets referenced by the current index.html.
      try {
        const html = await (await fetch('/index.html', { cache: 'no-cache' })).text();
        const assetUrls = new Set();
        const re = /(?:src|href)="(\/assets\/[^"]+)"/g;
        let m;
        while ((m = re.exec(html)) !== null) assetUrls.add(m[1]);
        if (assetUrls.size) {
          await Promise.all(
            [...assetUrls].map((url) => cache.add(url).catch(() => {})),
          );
        }
      } catch {
        // index.html not fetchable at install — the runtime cache covers it.
      }
      // A new deploy reaches already-installed clients on their next load
      // instead of a stale worker holding the scope.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete every cache that isn't the current version (the old shell).
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      // Take control of all open clients immediately (no waiting for reload).
      await self.clients.claim();
    })(),
  );
});

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isDynamic(url) {
  try {
    const path = new URL(url).pathname;
    return DYNAMIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
  } catch {
    return false;
  }
}

// A same-origin static asset: the hashed build output, fonts, or images.
// (The hashed /assets/ names mean a new deploy is a new URL — no stale hazard.)
function isStaticAsset(url) {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    if (u.pathname.startsWith('/assets/')) return true;
    return /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(u.pathname);
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!isSameOrigin(request.url)) return;
  if (isDynamic(request.url)) return;

  // Navigations (SPA routes — /shorts, /u/:username, …): network-first,
  // falling back to the cached index.html when offline. This is what makes a
  // deep link load offline to the shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/index.html')),
        ),
    );
    return;
  }

  // Same-origin static assets: cache-first with a background refresh.
  if (isStaticAsset(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const refresh = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || refresh;
      }),
    );
  }
  // Everything else: pass through (no caching).
});
