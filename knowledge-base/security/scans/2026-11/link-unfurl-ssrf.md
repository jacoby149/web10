# Link-unfurl SSRF surface — L1 scan record

07.11.2026. Branch `jacoby149/non-youtube-links-unfurl`. Base `origin/dev`
(`80a8a1f22`). The scan is local + offline; no production credential, no
production write.

## The surface

`GET /preview/unfurl?url=<attacker-influenced>` on the social app's own
preview server (a small Node process in the social container, nginx-exposed to
every user-agent — `marketing/web10-social/preview/{unfurl,server}.mjs`). The
endpoint fetches the url server-side (the SPA can't — CORS) and returns card
metadata. This is a NEW external-fetch seam on a box that previously fetched
only its own node API + the provider oEmbed-hosts never.

## Orient (the learnings, the scope)

Scope L1 (file) → L2 (call graph): `unfurl.mjs` (the guard + the fetch + the
parse + the cache), `server.mjs`'s route (the transport: the param, the
envelope, the rate limit), `nginx.conf`'s `location = /preview/unfurl` (the
exposure: every UA, same-container localhost). Known risks for this shape
(classic unfurl SSRF): (a) internal/private targets (loopback, RFC1918,
link-local cloud metadata, CGNAT, docker service names), (b) scheme/credential
injection (`file:`, `gopher:`, `user:pass@`), (c) the redirect escape (public
A → private Location), (d) DNS-rebinding (public at check, private at
connect), (e) abuse as a fetch proxy (volume), (f) the oEmbed `html` carrying
a foreign iframe (a stored-redirect to the provider's wall).

## The controls (what was built, replayed by test)

1. **Scheme + shape**: http/https only; credentials refused; single-label
   hostnames refused (docker services + mDNS); `localhost`/`*.local`/
   `*.internal` refused by name.
2. **Address**: IP literals judged in place; names resolved via
   `dns.lookup(all, verbatim)`; EVERY resolved address must be public — the
   private ranges pinned in `previewUnfurl.test.ts` (the v4 table: 0/8,
   10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/28,
   192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4; the v6
   table: `::/128`, `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`,
   `2001:db8::/32`, `64:ff9b::/96`, IPv4-mapped/compatible judged by the
   embedded v4). A host with even one private answer → refused.
3. **Redirects**: `redirect: 'manual'`, ≤ 5 hops, each hop re-validated
   (the replayed exploit: 302 → `http://127.0.0.1:8080/steal` denied before
   the second fetch — `previewServerUnfurl.test.ts` + the module test;
   the fixture's own fake-API port is the target, and its request log must
   stay empty).
4. **Bounds**: 8s/6s per-hop timeouts (AbortController), 750KB/256KB byte
   caps (the truncation hands back the head — the preview tags are the first
   bytes), cache (7d positive / 10m negative; blocked verdicts cached long).
5. **Abuse**: 60 req/min per client IP (rightmost X-Forwarded-For, the
   nginx-appended entry) → 429. Dampener, not boundary.
6. **Parse, never execute**: the oEmbed `html` is regex-extracted to an
   iframe src, entity-unescaped, and allowlisted per-provider on BOTH sides
   (`unfurl.mjs` `EMBED_HOSTS` + the SPA's `unfurl.ts` `EMBED_HOSTS`) — the
   replayed exploit: a Spotify oEmbed pointing at `evil.example.com` ships a
   card WITHOUT the iframe (module test). No `eval`, no `innerHTML`, no
   third-party JS.
7. **The wall is not a card**: bot-challenge walls (Bandcamp's `_fs-ch-`
   "Client Challenge", verified live) are refused as `no_metadata` — never a
   wall-shaped card (module test).

## Reproduction gate (the exploit replayed and denied)

`previewServerUnfurl.test.ts` (the REAL preview process, the real transport,
the SSRF urls handed over the wire — loopback at the fixture API's own port,
`::1`, `10.0.0.1`, the metadata link-local, `localhost`, the docker service
name, mDNS, credentials — every one 403 `blocked` with the fake API's request
log untouched; `file:///etc/passwd` 400; a missing param 400). Module level:
the redirect-to-private replay, the rebinding host (public + private answer →
refused), the redirect loop cap, the oEmbed foreign-src replay.

## Recession (what this does NOT close)

- **DNS-rebinding window**: resolve-then-fetch leaves a TOCTOU between the
  guard and the connect. Mitigations: per-hop re-check, the short negative
  TTL, and blast-radius containment — the preview server holds no
  credentials and its only data reads are anon-public docs via its own node
  API; a slipped rebinding reaches a public address inside the box, never
  user data. Closing it properly (a pinned-socket fetch) needs a custom
  undici dispatcher the dependency-free preview server does not carry —
  recorded, not waived.
- **The oEmbed endpoints themselves** (open.spotify.com &c) are trusted
  third-party hosts pinned in code — a compromise of one is a compromise of
  the provider, out of scope (the same trust as rendering the iframe the
  provider told us to render).
- **The client iframe allowlist** is defense-in-depth on top of the server's
  (both sides must agree on the host) — a client-only bypass is impossible,
  but a server regression could ship a foreign iframe to an old SPA build;
  the session cache pins cards per session, so the exposure is one reload.
- **Live external behavior varies by the fetcher's IP reputation**: the
  Bandcamp edge challenged this scan host's TLS fingerprint (plain link there
  — the wall-refusal, the safe degradation); the production box's
  fingerprint/rep is unmeasured. No production write, no deploy in this scan.

## Commands

```sh
cd marketing/web10-social
bunx vitest run src/__tests__/previewUnfurl.test.ts src/__tests__/previewServerUnfurl.test.ts
node screenshots/media-surface-inventory.mjs && bunx vitest run   # the full suite
# the live matrix (real network, from a dev host):
PREVIEW_PORT=3999 node preview/server.mjs &
curl -s "http://127.0.0.1:3999/preview/unfurl?url=$(python3 -c "import urllib.parse;print(urllib.parse.quote('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',safe=''))")"
```

Status: **local L1 coverage written + replay-gated**. The rebinding window and
the production-box live matrix stay OPEN (the next cadence re-scan, or the
connect-acceptance of the deploy, picks them up).

## Update (07.11.2026, D100): the marketing second consumer (CORS)

The unfurl route gained `Access-Control-Allow-Origin: *` (+ the OPTIONS
preflight) so the marketing site (a different origin) can read the same
answers cross-origin. **The boundary is unchanged**: the answer is public
card metadata (no session, no cookies, no credentials in or out), CORS is
reader access, not a guard — the SSRF replay gate above still pins that
loopback / private / credentialed / non-http(s) targets are 403/400 with no
fetch, and the per-IP damper still applies (a cross-origin browser call
rides the same 60/min budget as any other caller of the route). The new
verdict-with-CORS cases are pinned in `previewServerUnfurl.test.ts` (the
ok:false 200 carries the header; the OPTIONS preflight 204; the 403 blocked
carries the header AND stays blocked). No new fetch surface, no new host
allowlist entry, no credential path — the residual set above is untouched.

## Update (08.11.2026, D101): the challenge-wall stealth retry (the curl subprocess)

Bandcamp's edge walls the undici TLS fingerprint, so a WALL (detected, never
executed) now gets ONE retry through a curl subprocess
(`makeCurlStealthFetch`). The security posture of that seam, pinned by test
(`previewUnfurl.test.ts` — the fake-curl-binary suite + the wall-retry flow):

1. **The guard runs before the spawn, not around it**: the retry re-enters
   `guardedFetch` (scheme/shape/credentials/DNS-public re-validated — the
   exploit urls stay 403 with no curl ever spawned for them; the loopback
   fixture target is unreachable from the retry exactly as from the default
   fetcher).
2. **No redirect following in curl** (`--max-redirs 0`): a 3xx + Location
   comes BACK to the guard loop, which re-validates the next host before any
   fetch — the classic redirect-to-private escape is unchanged (pinned: the
   fake curl returns 302 → the location is not fetched).
3. **No shell**: `execFile` with an argument array — the validated url is a
   single argv entry, never interpolated (injection by url content is not a
   thing).
4. **Bounded**: `--max-time` + the execFile timeout + the abort-signal kill
   (all three), `maxBuffer` 8MB (the guard's 750KB cap still applies to what
   the card consumes), the retry is once-per-unfurl (a second wall stands —
   pinned: default 1 call + stealth 1 call, no hammering).
5. **The binary is image-pinned** (`apk add curl`, the social Dockerfile — a
   known package, not a download); `UNFURL_CURL_BIN` (env) exists only as
   the test seam (the container never sets it; the production singleton
   resolves the image's /usr/bin/curl).

Residual: the curl PROCESS is a new way to reach a validated public url —
its compromise vector is the binary itself (the apk supply chain, the same
trust as the nodejs package the preview server already runs) — not the
unfurl logic. The wall-retry can only ever fetch what the guard would have
fetched; it adds no url, no host, no credential.
