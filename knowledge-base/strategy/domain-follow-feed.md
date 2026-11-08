# Domain follows → one feed read per node

The fan follows an address, not a landlord. A creator moving a domain from A to B
must not require every fan to follow again. DNS chooses the destination; it does
not carry private-group membership with it.

## Current state (08.11.2026)

PR #1426 batches authorization work **inside** a node. It does not route social
queries to other nodes. `readFeedPage` and the SDK's `query` still use one API
origin. Normal follows are membership rows, not reader-owned domain bookmarks.
The D97 research client demonstrates domain portability, but is not wired into
Following. Its client/DNS components still have open PRs #1372/#1373.

The broader private-federation lane remains A → C → D: canonical principal
migration, cross-node membership, then authenticated feed fan-out. Phase B's
issuer certification and isolated two-node receipts do not complete those gates.

## Implement in bounded bites

1. **PF1 — public resolution/batching primitive.** App-owned module, configured
   HTTPS node allowlist and DNS-over-HTTPS resolver. Accept fixed account pointers
   and domain-only pointers, resolve each distinct domain, verify the destination
   account's existing public domain alias, deduplicate accounts and group them by
   provider. Read public posts once per destination via `/v3/read`, then merge a
   bounded chronological preview with provider/author/document provenance.
   No SDK instance, cookies, bearer or token payload reaches the resolver or nodes.
   Bounded network/response/cache work, TTL-aware single-flight resolution, explicit
   partial/unavailable results and caller-generation checks are acceptance gates.
   This primitive is not the production feed and is not enabled by importing it.
2. **PF2 — reader-owned subscriptions.** Persist domain-only and explicit fixed-node
   subscriptions in a private app-named service on the reader's home node using
   existing CRUD. Confirm app grants/service visibility; pin account/acting identity
   during reads/writes. Add follow/unfollow/status/retry entry points with URL-held
   panel state. Preserve existing local membership follows; no silent conversion.
   Gates: PF1 tests/review, private-list denial, account-switch lifecycle controls,
   full social tests/build and inspected desktop/375px captures.
3. **PF3 — Following integration and pagination.** Combine local authorized feed
   results with independently authorized public-node reads. Retain source-node
   provenance throughout cards, media renewal, permalinks, reaction/comment/save
   destinations, and all React/state keys; bare `doc_id` is insufficient. Implement
   per-node cursors plus unconsumed buffers, deterministic tie-breaking and one
   ranking clock. No single global score cursor or dropped overfetch rows. One
   failed node must remain visible/retryable without hiding successful nodes.
   Gates: PF2; same-ID cross-node collision, tie/paging/no-loss and delayed-session
   tests; real browser/mobile and actual two-node public/private-denial receipts.
4. **PF4 — private cross-node follows.** Complete existing federation A/C gates,
   then add explicit destination credential authority to SDK query/group methods.
   DNS discovery alone never authorizes forwarding a home token. Verify foreign
   grant/removal/regrant, namesakes, app contracts, independent signing keys and
   account-switch cancellation before authenticated fan-out. Global engagement
   aggregation remains the separate federation E task, not an inferred PF3 count.

## PF1 contract

`createPublicFollowingReader` in `marketing/web10-social/src/data/publicFollowing.ts`
is an explicit library seam. Nothing calls it from the live Following screen yet.
The caller supplies trusted node origins/resolver, saved pointers and a live
`isCurrent` predicate. At most four transport operations run per reader instance;
queue admission is bounded. Instances belong to one owning screen/session, not
one per creator. Requests omit browser credentials/referrers and reject redirects.

DNS uses the existing `web10.<domain>` TXT format
`web10.v=1;provider=<configured-provider>;user=<username>`. Exactly one matching
claim is required, including split TXT chunks; unknown versions/ambiguous claims
fail closed. The destination's public alias must name the same domain and be
verified. Cache lifetime is the smaller of the matching DNS TTL and 60 seconds,
measured before lookup; TTL zero does not cache and expired pointers never fall
back to old destinations. No public-DNS propagation or absolute-ban-proof promise.

The output is a **first-page public preview**, not a paged/ranked feed. It retains
source-qualified keys, distinguishes unavailable domains/nodes from empty reads,
and reports nodes whose raw page may be truncated. It never persists follows or
grants, joins a group, enriches through the home node or changes backend policy.
Connected DNS/ClickHouse/browser acceptance, independent security review and
PF2–PF4 remain open; offline transport tests do not close them.
