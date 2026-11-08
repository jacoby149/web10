# Server mixer component — a control, not yet a connected feed

The reader should be able to turn a server down without deleting their follows.
This unit supplies the horizontal faders and relative page-budget arithmetic;
subscription discovery and actual remote fetches remain separate integration.

## Hardware, not a settings form

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
never deletes creator follows or memberships. Addition defaults to credential-free
public reads; authenticated routing requires separate destination approval/grants.
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
