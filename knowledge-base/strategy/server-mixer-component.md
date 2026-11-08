# Server mixer component — a control, not yet a connected feed

The reader should be able to turn a server down without deleting their follows.
This unit supplies the horizontal faders and relative page-budget arithmetic;
subscription discovery and actual remote fetches remain separate integration.

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
