# People and Groups: choose the servers, then sort

**D111, 13.11.2026:** marketing's People/mixer replica is retired; old
`/trending/people` links hand off to social `/people`. The directory contract
below now applies to social only. Shared reader/control code remains for social;
there is no marketing directory-parity gate.

The reader may want newly arrived people from one server and established groups
from another. The server rack chooses the sources; a simple sort chooses the
order. Likes, comments, a Balanced preset and power-mean ranking do not belong here.

## Operator contract (12 November 2026)

- Reuse the existing web10 server mixer, source catalog, approvals and faders in
  social People and marketing People. Profiles and Groups remain separate tabs.
- Profiles: **Sort by → Most followers / Newest**. Groups: **Sort by → Most
  members / Newest**. Popularity remains the default. Newest means account/group
  creation, never a profile edit, face-document date or recent posting activity.
- Present that choice as two compact preset chips matching the other boards,
  not a dropdown, dial or separate boxed panel. Profiles say Most followers;
  Groups say Most members. Both options stay visible, touch-sized and
  keyboard-operable; this is a discrete sort, not a blended ranking weight.
- Keep independent `peopleSort` and `groupSort` URL parameters. `section`, search,
  graph filters and URL-owned server editing survive sort changes and history.
- Keep Sort by visible, then the same left-aligned **Advanced / Hide controls**
  disclosure used on post/video/music boards (sliders icon and rotating chevron).
  The server rack is tucked inside it, collapsed by default, never a separate
  Servers button. `tune=1` or `editServers=1` restores the open state; hiding
  clears only disclosure/editor confirmation state, not sources, weights or sort.
- Sorting happens at each source **before** its limit/offset. Faders determine
  per-source page budgets, just as on post boards; sort the selected page by the
  chosen signal with source-qualified deterministic ties. This is a sorted
  weighted selection, not an exhaustive global top-N query across every server.
- Each source owns its offset. Failed sources do not advance. Zero mutes;
  all-zero/empty sources pause. Changes in source weights, sort or identity start
  a new paging session and discard old completions. A failed source is retryable
  without replacing successful cards. Search covers the loaded selection.

## Authority and rendering

Use the existing owner-private social catalog and exact current-credential
approval. A saved origin is not token-dispatch authority. Marketing always reads
publicly with no credential or cookies. No denied-token anonymous fallback,
redirect following, foreign response-selected destination or new permission grant.
Reuse bounded SDK transport and shared source-sequence concurrency.

Directory requests extend the existing generic listings with `sort` and canonical
`created_at`: users retain the current readable-profile gate; groups retain
discoverable/latest-before-filter semantics and count current membership before
pagination. No app-specific database columns or new social API concepts.

Cards carry a trusted requested `source_origin` plus source-qualified key; equal
usernames/group IDs on different nodes are different results. Resolve faces only
on their serving node. Home cards retain their current actions. Foreign cards
are explicitly read-only until destination-owned profile/group navigation and
follow/join are implemented; do not invent a social hostname from an API hostname
or route a foreign action through the home node. Personal graph filters and My
Groups retain their existing home-account authority; the rack governs directory
discovery, not a claim of cross-node graph enumeration.

The Followers and Following filters show each listed person's own follower count, never the
viewer's follower total copied onto every card. Use the existing paged follower
count read for that person's username/provider; owner and reserved-principal
rows are not followers. A failed count must not borrow the viewer's total or
prevent the other cards and readable profile faces from loading.
Bare local member keys use the existing current-node provider fallback, not the
username as a hostname. Count failures retain the graph cards' existing zero
fallback; this is not proof that an unreadable audience is actually empty.
Graph rows are deduplicated before count/profile enrichment. Directory pages
upsert cards by source-qualified identity (canonical provider/username for home
rows), never append repeated React keys; pagination offsets count raw server
rows, not the deduplicated display length. Repeated filter switches must retain
one card per identity and ignore abandoned completions. Returning to a cached
graph list clears loading left by the filter being abandoned.

## Verification and remaining gates

5.31.5 visual follow-up: two compact radio chips replace the native dropdown in
both apps. The operator rejected the first dial-and-box design as overkill;
that design is removed, not an additional mode. Preserve native arrow selection,
focus, mobile taps, independent sorts, back/reload and existing server behavior.
Final verification is recorded in the changelog; synthetic browser data is not
connected-node or physical-phone acceptance.
The final chip browser matrix passes in both themes at 1440/375/768/1280,
including keyboard focus/arrows, mobile taps, 44px targets, back/reload and
existing source/mute controls. Inspected desktop/375px captures and receipt:
`.context/sort-chips/`. Both production builds/typechecks pass.

5.30.1 visual follow-up: the server rack now uses the boards' Advanced / Hide
controls disclosure rather than a separate Servers CTA. All 102 social/106
marketing focused controls and both builds pass; actual-app show/hide, sort
preservation, reload, source editing/mixing and mute checks pass in both themes
at all four widths. Collapsed/expanded desktop/375px captures inspected under
`.context/directory-advanced/`; authority/ranking and connected gates unchanged.

Local 5.30.0 receipt (12 November): all 2,528 social, 379 marketing, 319 SDK and
2,268 API tests plus eight API subtests pass (one opt-in skip). Both production
builds/typechecks and changed-file Ruff lint/format pass. The final social suite
passes standalone in 242 seconds after an earlier six-minute concurrent run
times out; no assertion or runner timeout is changed. Earlier integration reds
also include stale popularity-only directory fixtures, a dependency reinstall
overlapping a running suite, and the browser-found face/fader defects above.

`screenshots/directory-mixer.mjs` drives both actual apps with all external
requests intercepted: both themes at 1440/375/768/1280, separate sorts and reload,
the shared server editor, 12/12 two-source group budgets, read-only foreign cards
and all-muted reload without directory requests. Final receipt:
`.context/directory-mixer/receipt.json`; inspected desktop/375px captures include
both tabs and the two-source rack. These are synthetic public reads, not actual
foreign HTTPS grants, real ClickHouse lifecycle or phone evidence. No deployment.

Implementation: shared `directoryMixer.ts`/`useDirectoryMixer.ts` own source
pages; `DirectoryControls.tsx` wraps the existing source editor/rack. Social's
`DiscoverExploreTab.tsx` retains progressive home-directory reads and home graph
lists; marketing's `ProfilesBrowser.tsx` uses public source preferences. A source
must acknowledge its requested sort; unsupported/older nodes show an error, not
a falsely labelled ordering. The SDK keeps the existing group-directory GET's
URL credential-free while user directories use explicit POST credential mode.

Browser-driven repairs: an unreadable marketing group face is a settled fallback
(no endless empty-result fetch loop). Fader edits arriving before router props
commit merge the latest channel weights; a second mute cannot restore the first
channel. Permanent controls cover both cases.

Require canonical-age and audience-order-before-page controls, private/deleted/
unlisted exclusion, real quota/mute/offset/retry tests, source-ID collisions,
stale-generation rejection, no-credential public dispatch and explicit approval
denial. Verify both apps with tests/build and inspected desktop/375px captures,
plus 768/1280 bounds. Synthetic browser evidence is not independent HTTPS-node,
app-grant, physical-phone or production acceptance. No deployment is authorized.
