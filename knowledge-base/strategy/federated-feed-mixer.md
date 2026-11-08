# Following across nodes, with a server mixer

Status: operator-authorized implementation, 08.11.2026; not deployed.

## Intent

The reader follows people, not database locations. Resolve a domain-follow's
current location, group targets by serving node, query those nodes directly and
merge their independently authorized rows. Within each node, retain the batched
readable-group gate. Neither DNS nor a remote response grants access.

Operator: "foreign nodes do a curl request to certify but then all the behavior
is the same after that"; "a list of web10 servers they are subscribed to ... a
mixer ... for each web10 server a horizontal knob for how much to fetch from each".
This includes authenticated foreign reads, not a public-only substitute.

## Source findings and the first correction

- Home certification and exact foreign reader keys already exist in
  `api/app/v3/endpoints/auth_helper.py`. Do not invent another credential type,
  share signing keys, disable app contracts or migrate local keys opportunistically.
- Group join/list/leave/invite acceptance still use the local-signature-only
  `user()` helper. Foreign self-service membership must use certified `principal()`;
  foreign list must not heal a local namesake's owner rows. Privileged management
  operations are a separate scope, not a fallback to a bare foreign username.
- `sdk/src/v3.ts` binds one API origin, falls back to an ambient cookie and uses
  a transport that follows redirects. A DNS-selected destination must not receive
  that ambient credential. Exact-origin, explicitly approved credential routing
  needs its own tested transport.
- The social app discovers memberships only on its current node; its feed,
  reaction maps, action links and media recovery assume local document IDs.
  Adding parallel fetches alone would misroute actions and collide IDs.
- Browser `Origin`/delegated-client app-contract checks currently look up the
  exact foreign principal on the serving node. `/certify` certifies identity,
  not an app grant. Retain denial until a real per-node approval path is proved;
  never copy a local namesake's contract or drop Origin to make a request pass.
- D97 is a domain-only public subscription prototype, not deployed social
  integration or private-grant migration. Domain changes never inherit roles.

## Read pipeline

1. Capture home node, human identity, credential generation and acting identity.
   Read the reader-owned source catalog from a private owner-only group; do not
   expose server/domain subscriptions through followers-readable documents.
2. Ordinary subscriptions retain their explicitly approved node/account targets.
   Resolve domain subscriptions through configured DNS-over-HTTPS, deduplicated,
   bounded and TTL-aware. Recheck the destination account's verified alias.
   Missing/ambiguous/expired answers retain the subscription but clear its target.
3. Partition by exact normalized node origin and authority mode. DNS public
   reads remain credential-free unless the reader separately approves the new
   destination and obtains actual grants. Public and authenticated modes may
   require separate requests even on the same node.
4. Allocate a bounded page budget using the server mixer. A horizontal fader
   is a **relative fetch weight**, not a network timeout or authorization knob.
   Zero mutes a source without deleting subscriptions. Defaults are equal;
   all-zero yields an intentional paused state. Explain counts, not fake
   percentages of unavailable inventory. No remote server list from broadcasts.
5. Run bounded per-node request sequences, not per-person feed calls; retain
   per-source cursors and unconsumed buffered rows. A slow/denied source must
   not discard successful sources or become an anonymous retry of a denied token.
6. Merge by the selected app ranking with deterministic ties using trusted
   source origin plus author/document identity. No cross-node SQL joins. Pin
   ranking time per paging session; reject old-generation completions. Keep
   origin provenance on cards, actions, links, engagement and media recovery.

## Implementation queue (separate review-sized units)

- [✓ 5.1.0 merged #1429; connected/diverse OPEN] **FM1 — Certified foreign self-membership lifecycle.** Owns exact
  self-service hunks in `api/app/v3/endpoints/groups.py` and focused API tests.
  Join/request/list/leave/accept/decline use the certified principal; locals
  retain bare keys. Foreign namesakes never borrow membership, pending invites
  or owner healing. Gates: independently signed home tokens, denied/expired
  certification, open/request/closed, local compatibility, removal/regrant and
  exact list keys. No management expansion or permission migration.
  Implemented with registered-route tests and independent certification/storage
  doubles. Review reproduced pending-request self-approval; the same exploit now
  denies for local and foreign callers while actual invitations still work.
- [ ] **FM2 — Explicit per-node app approval and credential-bound transport.**
  Owns a bounded SDK transport module/tests and generic app-contract/consent
  seams only where required. Prove real browser Origin and delegated-client
  grants for the exact foreign principal; certify remains identity-only. Reject
  redirects, invalid origins and unapproved destinations before token dispatch;
  omit cookies/referrers, bound bodies/requests and cancel on identity change.
  Gate: two independent node keys, real HTTPS and grant/revoke/deny controls.
   - [✓ 5.1.0 local] Serving-node add/list/revoke/cleanup now use the certified
    exact principal; foreign delegated mutations deny, and existing trusted
    authenticator Origin checks remain. This is not destination-aware browser consent.
   - [✓ 5.2.0 merged #1428; activation gates OPEN] SDK transport:
     isolated module with explicit credential
    or public mode, fixed actions, exact origin, no redirects/cookies/registration,
    byte ceilings, per-instance four-active/64-queued limits and owned aborts.
     Root serialization-hook/credential override and private-error regressions
     pass. Approval UI, diverse/connected review and global fan-out limits remain open.
- [ ] **FM3 — Reader-owned source catalog and domain resolution.** Owns social
  `src/data/` subscription/resolver modules and tests. Persist node/domain
  subscriptions in an owner-only private group via generic CRUD, with explicit
  add/remove/retarget handling. No JWTs saved. Resolver cache expires by TTL,
  bounds size/work and rejects alias mismatch, ambiguity and old-account results.
  Gate: old node gone, same domain-follow ID, new public posts; private denial
   and zero credentials to resolver/DNS-selected targets remain independently proved.
   Next operator request after approving the hardware rack: "+ Server" in the
   header and a per-channel removal flow, backed by the owner-private catalog.
   Removal stops source reads, never unfollows creators. Add no preview-only
   enrollment, saved JWT or implicit destination credential approval.
- [ ] **FM4 — Destination batching and composite paging.** Owns social data
  orchestration and tests. One main query per destination/authority bucket,
  normal engagement/view follow-ups, bounded concurrency and settled failures.
  Exact per-source cursor/buffer, provenance/dedup, ranking/ties, generation
  invalidation and quotas. Gates: 1,000 targets on three nodes do not become
  1,000 feed calls; colliding IDs stay distinct; no dropped tail or retry skip.
- [ ] **FM5 — Server mixer in the Following customizer.** Owns feed controls,
  subscription management, settings/URL seams and focused UI tests. One labeled
  horizontal fader per subscribed server, mute, keyboard/touch controls, actual
  allocated count and per-source pending/error/retry states. URL > saved settings
  > defaults; reload/back/forward restore state. No fake remote options or
  unwired faders. Gate: real request budgets change, account/route isolation,
  desktop/375px screenshots inspected against `design.md`.
   - [✓ 5.3.0 local component; integration OPEN] UI component PR #1430:
     controlled `ServerMixer` horizontal faders,
    relative budget allocator with tie rotation, mute/all-paused/empty states and
     sanitizing URL codecs and active-tie-only rotation. Operator-approved dense
     hardware face, native keyboard/touch controls and four-width preview checks;
     not yet attached to actual source management or remote fetch budgets.
- [ ] **FM6 — Full source-owned rendering and connected acceptance.** Owns the
  bounded social action/link/media consumers plus disposable test harness.
  Foreign cards never send reactions, comments, edits, analytics or recovery to
  the home node by mistake. Run actual browser with separate nodes/keys, real
  Origin grants, followed private group, revoke/regrant, node failure, domain
  move and per-node paging. Preserve local-feed fixtures and full suites/build.
  No deployment, production DNS/writes or paid infrastructure without approval.

FM1 can land without a blanket local-principal migration. FM2 is mandatory for
authenticated browser federation; certificate success alone does not satisfy it.
FM3's public domain continuity can be tested independently, but full activation
requires FM2–FM6. Each trust-boundary PR remains <=500 code/test lines with a
repro gate, written evidence and fresh design-intent review; stage and review the
units rather than mixing them into the batching-default PR.

## Current handoff

PR #1426 merged into dev on 08.11.2026 after every executed check passed. The
original `feature/server-feed-mixer` branch remains the preserved assembly, not
a single release PR. This backend unit is `feature/foreign-self-service`, based
on merged dev; SDK transport and mixer component have separate branches/reviews.
DNS/public-preview additions remain outside all three foundation PRs.
Backend evidence: `../security/scans/2026-11/foreign-self-service.md`.
Backend #1429 merged as `0753cd879` and SDK #1428 as `ab6185320` after every
executed check passed. SDK's first final-run e2e shard failed before API startup
on fixture ClickHouse authentication; the unchanged failed-shard rerun passed,
without an assertion/config change or pre-existing-cause claim. Isolated review:
`../security/scans/2026-11/explicit-node-transport.md`. This does not activate FM2.
Next: explicit destination-aware browser consent (FM2), catalog/DNS (FM3),
composite paging/provenance (FM4), real customizer wiring (FM5), connected FM6.
