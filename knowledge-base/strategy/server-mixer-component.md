# Server mixer — shared controls and source-read integration

The reader should be able to turn a server down without deleting their follows.
The approved component supplies horizontal faders and page-budget arithmetic.
The current integration adds real source reads across Feed, Shorts, Music and
marketing boards; connected-node acceptance remains separate, not implied.

## Source-editor implementation contract (08.11.2026)

Operator: keep the elegant rack clean; an **Edit servers** button reveals its
management controls, and **Done** hides them. Ranking knobs and sources belong
inside one Feed Advanced chassis. Advanced/edit state is URL-owned; closing
editing does not reset weights. No permanent add/remove chrome in normal mode.

FM3's first live unit saves a bounded personal source catalog through existing
`settings` CRUD in a dedicated closed, undiscoverable, hidden-membership group
with exactly the human owner. Never reuse the followers group, save JWTs, send
credentials merely because an origin was saved, or repair an unsafe group. Check
current client/credential scope before and after asynchronous work, verify ACL
and document owner/attachments, and fail rather than overwrite duplicate catalogs.
This reuses the existing app-granted settings service; no API/SDK grant expansion.

Operator correction: private content does not require a separate feed pipeline.
Every selected node receives the same authenticated engine query; it certifies
the home token, checks its existing app contract and group roles, and returns
authorized rows. The faders control actual per-node quotas; the client assembles
a weighted round-robin feed with separate cursors/buffers, not a global cursor.
Zero mutes; empty catalog pauses. Errors stay source-specific; never retry a
denied credential anonymously or label every foreign source feature-pending.

Source data is not credential-dispatch authority. A catalog row alone (including
one changed by another settings-authorized app) cannot authorize token forwarding.
Manual Add/Approve explicitly confirms the exact HTTPS origin for the current
credential. Keep a separate tab-local approval keyed by a SHA-256 digest of that
credential, never the JWT itself; a changed token, account, target or removed
source invalidates dispatch/late results. The receiving node still grants all
read/write authority, not this preference. Cross-tab catalog CAS is not promised.

## Component split contract (5.3.0; historical scope)

Operator review: "those knobs dont look like an fl studio mixer, like really
tight ... the feed tuning circle knobs look right out of fl studio design wise
... i am looking for this to look like some dj shit". Use the existing rotary
rack's hardware language, not three spacious cards: one compact chassis,
numbered channel strips, engraved ticks, recessed horizontal travel, beveled
metal caps and small illuminated readouts. Retain horizontal per-server faders
and a 44px touch surface. Lit elements show selected weights, not invented audio,
measured throughput or node health. Tokens only; keyboard/native range semantics,
muted/empty states and explicit preview labeling remain intact.

`ServerMixer.tsx` is controlled: the caller supplies only subscribed origins,
weights and allocated counts. Zero pauses a source; all-zero intentionally pauses
the set. The pure allocator conserves the requested budget, excludes muted rows
and rotates tied remainders between pages. It does not claim that every node has
enough inventory to fill its quota. The URL codec rejects unknown destinations
and malformed weights; it grants no credentials or server enrollment.

The component does not create a page, store settings or change Following today.
Its owner must bind URL > saved settings > defaults, identity-generation changes,
real fetch quotas/cursors, availability/error/retry states and source-qualified
cards/actions/media before activation. No fake server choices are added to the app.

## Split acceptance

Focused allocation/render controls and the full social suite/build are required.
Fresh self-booting Chromium preview at 1440 and 375px exercises the actual
component/theme, keyboard Home/End, preview URL reload/back/forward, all-paused
and empty states, overflow and page errors. The URL owner in that scratch preview
is not production customizer/settings wiring. Six images are inspected desktop
then mobile; assembly workspace receipts are `.context/split-mixer-{desktop,375}.png`,
`split-mixer-paused-{desktop,375}.png`, `split-mixer-empty-{desktop,375}.png` and
`split-mixer-browser.log`. Screenshots stay outside tracked source.

Full multi-node feed, consent, private source catalog, DNS continuity, composite
paging/provenance, actual per-node request budgets and connected two-node proof
remain OPEN. Backend and SDK transport changes are independent split PRs.

Fresh component review reproduced URL weight 1 being accepted by allocation but
rounded to 0 by Chromium's former step-5 input. The permanent render control and
scratch browser control fail before repair; step 1 now matches every accepted
integer and keyboard adjustment. Red receipts: `.context/split-mixer-step-red.log`
and `.context/split-mixer-step-unit-red.log`. This does not change saved weights
or allocation policy; it makes the rendered fader honor that existing policy.

Split validation: all **2,219 social tests in 145 files** pass with one worker;
all 14 focused controls and production typecheck/build pass. Initial worktree
test run with a linked external node_modules failed Vite's ffmpeg file allowlist;
frozen local dependency installation resolves that fixture/environment problem
without an application/config change. Original failure log is retained separately
as `.context/split-mixer-social-symlink-failure.log`, final suite/build logs as
`split-mixer-social.log` and `split-mixer-build-final.log`.

Independent component reviewer `ses_e44fa5353ffehs9OdjoEPNNDvq` confirms the
step-1 repair and independently reruns all 14 focused controls. No remaining
blocker in the standalone component/helper scope; production activation and
connected acceptance are not covered by that confirmation.

## Approved hardware revision and next control flow

The operator approves the dense rack: "this is PERFECT!" One compact chassis
now replaces the separate cards; the native step-1 range retains keyboard/touch
behavior beneath a decorative beveled SVG face. Selected weights illuminate
ticks/readouts, never simulated audio or server-health meters. Four-width real
Chromium preview checks (375/768/1280/1440) cover pointer/touch, 44px hit areas,
density, integer restoration, keyboard, preview reload/back/forward and states.

Final scoped reviewer `ses_e44c452c9ffexh21qG93GpzTuQ` independently passes all
16 focused cases and 11,520 allocation probes. Two new retained red controls
prove muted/lower-priority positions biased equal remainder groups; rotation now
occurs inside each tied active group, retaining quota conservation and mute.
This is bounded component evidence, not live-feed integration.

Next operator request: "missing how to add or remove a server from the feed now
though...." Keep this approved rack; add **+ Server** in its header and a removal
control per channel only with a real owner-private saved source catalog (FM3),
not fake buttons or preview-only enrollment. Removal stops that node's reads,
never deletes creator follows or memberships. Superseding the earlier public-only
proposal, social queries use the current credential only after separate exact-node
approval; marketing remains public. Receiving nodes enforce their own live grants.
Dialog state belongs in the URL; persist subscriptions on the home node, never
tokens. Account-switch, removal/queued-read invalidation and reload/retry controls
are required before claiming the source-management flow implemented.

Fresh hardware-revision validation on the merged-dev validation worktree plus
exact four candidate UI files passes **2,200 social tests in 145 files** (127.61s),
all 16 focused cases and production build/typecheck. Browser logs:
`.context/mixer-hardware-browser-final.log`; full suite/build:
`mixer-hardware-full-social.log` and `mixer-hardware-build.log`. The initial new
root preview lacked the newly merged telemetry dependency; frozen installation
and the refreshed browser run pass without changing application/test config.
CI's earlier source-head HTTP504 happened while downloading Bun, before tests;
the final candidate still requires all fresh checks, with no waiver.

## Cross-surface integration (08.11.2026; workspace PR candidate)

The user wants the rack across Feed, Shorts, Music and marketing content boards:
the same controls must change actual reads, not decorate a capped home-node pool.
Ranking knobs select node SQL order; server faders allocate a twenty-post page.
Shared smooth quotas carry fractional credits so weight 1 beside 100 still gets
two posts over two hundred slots. A source may underfill; counts are budgets,
never a promise of inventory or node health.

`marketing/shared/discover` owns controls, SQL/ranking parity, source allocation,
the reader and a four-active/64-queued destination-sequence budget across reader
generations. An ignored abort does not release a live sequence early. A home
sequence may itself contain parallel follow-ups; this is not a four-HTTP-call cap.
Readers pin the ranking clock, buffer lookahead, preserve per-node delivered
anchors and serialize page reads. `page_cursor` precedes the displayed page;
`snapshot()` follows delivery and is used to resume failed-source retries.
URL history changes restore an owned reader, not the page after the bookmark.

Social sources use the owner-private settings catalog and current-credential
approval described above. Marketing sources are validated browser preferences,
with URL precedence, and always `credential: null`; no cookie-aware client is
imported by the shared reader. Explicit HTTP development-home reads are public
only; other destinations remain HTTPS. The receiving node's normal query gate
decides public/private authority in either case. A denial never causes an
anonymous retry. Removing a node changes neither follows nor group membership.

Source-qualified keys keep colliding node/author/document IDs distinct. Prepared
media paths and HLS capabilities stay on the serving node. Foreign cards and
media expose only implemented read-only behavior: home comments, mutations,
profile navigation, analytics and recovery are not substitute destination APIs.
Marketing text search explicitly covers loaded pages; tags reach source SQL.
People is a directory, not a post board, and does not run the post mixer.

Fresh scoped review reproduced two boundary bugs: a retained approval callback
resurrected removed consent, and URL normalization/percent encoding bypassed the
credential-echo guard. Actual hook/reader regressions fail before repair and pass
after generation/sequence ownership and normalized/decoded URL checks. Receipts:
`.context/server-editor-review-{red,green}.log`. This is bounded local evidence,
not cryptographic audience binding or protection against every transformation an
already-approved malicious node might perform.

Full fresh suites, all-surface browser captures, container builds, independent
review and split-sized PR/CI gates are being checked. Separate real HTTPS nodes,
browser Origin/app grants, revoke/regrant, actual media renewal, domain continuity,
physical phone and approved rollout remain OPEN. Do not mark all FM2–FM6 complete.

Candidate receipts: both frontend builds and original container builds pass;
marketing full suite passes 337 tests before the final removal regression, and
an earlier social full suite passes 2,285 tests. A later assembly run catches the
subsequently repaired stale save plus a Shorts timeout; do not relabel it green.
Latest browser replay drives clean/Edit/Add/keyboard weight 1/Remove/Done on all
six named surfaces at desktop and 375px (12 cases), no page exceptions or viewport
overflow. Images `.context/mixer-*-{clean,edit}-{desktop,375}.png`; receipt
`mixer-capture-receipt.json`. These are synthetic fixtures, not connected nodes or
actual playback. Draft #1440 isolates only the dormant catalog on refreshed dev;
the operator explicitly requests the full current-workspace PR, not that split.
This assembly carries the complete integration; method/CI and connected gates
remain independent and must not be called green merely because a PR is opened.

## Discover and Video boards (5.8.0)

Operator: "not seeing the server mixer on the social app itself ... was thinking
all social surfaces." The default `/feed` tab (Discover/Hot Gossip) and the
Video wall had a knob rack with no mixer. Both now host the same editor and
catalog. A home-only active set keeps the board's offset read (one server at any
weight is the same page); an approved active foreign server switches to the
shared reader with `groupMode: 'discover'`. Foreign rows use the Following tab's
read-only card and are excluded from enrichment, reactions and the Top 10 rail;
board identity is source-qualified. People is a directory and does not read the
board. Profile, group and saved-collection views are single-owner and do not
take the mixer.

Operator: "mixer knobs are just too shiny." The chrome cap gradient is replaced
by a matte top-lit cap using the rotary knob's language, rendered as positioned
HTML so it is not stretched by the track's `preserveAspectRatio="none"`.
