# Social movie playback — bounded local evidence

Date: 03.11.2026. Implementer/reviewer family: OpenAI GPT-6.1 Sol.
Status: local implementation verified; release/security/real-film gates OPEN.

## The use case and boundary

A film is longer than its ten-minute stream signature. The existing shared player
attached the original URL once and treated fatal load errors as terminal. The
social `PostMediaRenewal` provider now re-reads the original carrier post, requires the exact video ID in
its fresh resolved media, and returns the newly minted URL. The player never
extends a signature or substitutes ownership, carrier or audience. Existing node
read/manifest checks remain the authority; unsigned expiry decoding is only a
scheduling hint. Feed/group cards, reposts, lightbox and watch are wired; bare
Shorts/hover/ads/marketing players are not. No upload, feature flag or production
data changes. A separate generic worker-budget reliability repair is below.

The bounded read-only orientation covered `api/app/services/hls.py` mint/verify
and carrier-read behavior, shared player attachment/error callbacks, watch-page
post reads and the auth seam's existing `upload-session-changed` invalidation.
This is not a completed L1/L2/L3/L4 scan or a new server authorization finding.

## Reproduction and repairs

Restore the former fatal-only error handler while retaining the regression:
`bun run test:run src/__tests__/hlsVideoPlayer.test.tsx -t 'renews a denied segment'`
fails: expected one fresh read, received zero. Reinstate renewal: the focused
suites pass. Tests cover concurrent error coalescing, active expiry scheduling,
paused resume, source navigation, native fallback, denied/unchanged/repeatedly
denied replacement, exact carrier/media and auth invalidation.

A fresh same-family reviewer reproduced four delayed-continuation defects:
session validity ended before metadata restoration, native pause was overridden,
and newer speed/seek selections were overwritten. Repair with a session-validity
predicate carried through restoration, native-pause cancellation/autoplay off,
and current speed/seek intent; deterministic regressions pin those seams.
Conservative replacement-generated pauses remain paused rather than forcing play.
The expanded call-site review also found carousel slides forcing completed HLS
back to raw files. Use `sourceFromMedia`, a fill-sized HLS rack and no autoplay
for carousel slides; a film-plus-poster regression pins actual renewal routing.
No model-diverse convergence or broad security PASS is claimed.

## Actual browser evidence

An isolated local fixture serves a 24-second FFmpeg-generated H.264/AAC HLS
stream behind real HS256 six-second capabilities, validating signatures and wall
clock expiry on masters, variants and segments. Chromium runs the actual shared
player and vendored hls.js, with a fixture renewal callback rather than real
web10 post/auth/storage reads. Desktop 1440x900 and mobile 375x812 both exercise
single-video and film-plus-poster carousel playback. Single players make three
fresh reads, carousel players four; all continue beyond 16 seconds and expired
original master requests return 403. Current-generation decoded-frame counts are
152 for both single players and 101 for both carousels; none paused at capture.
All four screenshots inspected. Carousel starts through its actual Play button,
not a forced call to `play()` or autoplay.

Retained carousel screenshots: [desktop](watch-hls-renewal-desktop.png) and
[375px](watch-hls-renewal-mobile.png). These are synthetic fixture captures,
not screenshots of production or Nosferatu.

Local artifacts: `.context/hls-renewal/{run.mjs,entry.tsx,fixtures/,receipt.json,
browser-final.log,single-*.png,carousel-*.png}`. Initial harness attempt failed dependency
discovery/resolution, not player assertions; narrow entry scanning and explicit
shared dependency aliases repair the harness. A later carousel capture tried to
click the underlying video through its control rack; retain the timeout and use
the actual Play button instead. The successful run starts and
closes its own API/Vite/Chromium resources and stores no signing key/token in
receipts. Synthetic browser evidence is not actual node membership/revocation,
Cloudflare, Safari, uninterrupted frame timing or Nosferatu acceptance.

All 1,857 social tests (126 files), 284 marketing tests, both production
typecheck/builds and API Ruff checks pass. Existing jsdom media and bundle
warnings remain. No CI, deployment or PR-readiness claim.

## Worker budget and upload-expiry characterization

The generic worker now budgets each rendition at twice the server-probed source
duration, with a 600-second floor and operator-configured `HLS_FFMPEG_TIMEOUT`
ceiling (default 21,600 seconds). A 91:54 source receives 11,028 seconds instead
of a flat 600. Thumbnails/short clips retain at most 600 seconds; explicit lower
operator ceilings win. Eleven focused tests pin duration/bounds/invalid probes
and the actual subprocess timeout argument. All 2,030 API tests plus eight
subtests pass, one opt-in skip. This is not a measured real-film encode rate,
distributed worker recovery or queue-capacity acceptance.

Disposable local MinIO image
`sha256:8f08aee614800a237906bd48114d733e5ac5bfac4ccdf731f141b0e880d7a253`
accepts a 10,485,760-byte presigned POST that takes 8.37 seconds under a three-second
policy (204, stored SHA-256 matches). A fresh request under that expired form is
403. Thus policy expiry is not an elapsed-transfer cutoff in this provider
receipt; no arbitrary upload TTL increase or whole-file automatic retry is added.
The first 64 MiB tmpfs attempt gets 507 before expiry; increase disposable capacity
only, retain its failed receipt, and verify final container removal. Auto-removal
is asynchronous; a first immediate inspection was premature, later absence was
verified. Successful receipt: `.context/hls-renewal/upload-policy-receipt.json`.
This is not a 500 MiB production upload or proof for every provider/proxy/network.

## Deployment evidence and work still open

Read-only GitHub evidence shows promotion #1378 at
`08ab3ad854f94d1a6a7bf6b6bfdd0a1133daf318` and successful deploy run
`41768856068`. Public `https://web10.app/status.json` reports version `4.6.0`,
commit `08ab3ad8`, deployedAt `2026-11-04T03:44:11Z`. This supersedes the old
"deployment not established" note for that release, not for this unmerged fix.
It does not independently inventory each running backend container or prove a
specific production movie plays.

Operator explicitly defers the film upload; no production writes are authorized.
Still OPEN: actual Nosferatu source/upload/transcode/rendition/seek acceptance;
existing Steamboat Willie and anonymous/non-owner/private/revoked controls;
real-node full-player renewal; native Safari; excluded player surfaces; worker
timings under the new duration-aware budget; large-upload
admission/retry; multipart cleanup/distributed coordination/review/activation;
normal PR checks and explicit production-publication approval. A 300-second
presign is not, by itself, proof that an already-running POST is cut off at 300
seconds; the local MinIO receipt above characterizes that distinction only.
