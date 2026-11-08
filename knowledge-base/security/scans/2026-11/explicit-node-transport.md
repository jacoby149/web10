# Explicit-node transport — isolated SDK split, 08.11.2026

Status: bounded local module, integration/diverse security review OPEN.
Author: GPT-6.1 Sol. No production import, root export or cookie-aware client change.

The owner supplies an exact approved HTTPS origin, explicit credential or public
mode, generation predicate and abort signal. Approval is a caller prerequisite,
not something this module establishes. The server still certifies identity and
checks app/group grants. An approved malicious node can replay the bearer token:
this module does not cryptographically audience-bind an existing credential.

Fixed actions, no redirects/cookies/referrers/registration/refresh, 256 KiB request
and 1 MiB streamed-response limits, four-active/64-queued per instance. Timeout
aborts transport but cannot release an ignored-abort live operation early. The
caller must share a separate global fan-out budget before feed integration.

Fresh assembly review demonstrated root `toJSON` replacing the transport-owned
credential and inserting a token in public mode. The retained controls reject it
before dispatch using root-hook rejection and a null-prototype envelope; private
callback/serialization/fetch exceptions become safe errors. Original red evidence
is preserved at `.context/federated-transport-review-red.log` in the assembly
workspace. Split validation replays an intentionally vulnerable scratch variant,
never editing the production baseline or weakening assertions.

Fresh split reviewer `ses_e44fce14fffe55HPCktDln0iOK` reproduced an external
exception named `Oversized node response` escaping unchanged with synthetic
request/token/cause fields. The added exact control fails before repair
(`.context/split-sdk-error-red.log`); a private stream-size sentinel and fresh
outward ordinary errors replace message-based exception passthrough. This is a
local JavaScript error-boundary control, not remote code execution or evidence of
a production disclosure. Fresh commands and repair confirmation follow below.
Split commands: `cd sdk && bun run test:run` passes **316 tests in seven files**;
`bun run typecheck` passes. The new impersonation regression fails before repair
and passes with the unchanged assertions afterward. Receipts in the assembly
workspace: `.context/split-sdk-tests.log`, `.context/split-sdk-error-red.log`.
Original root-hook red evidence remains separately retained, not overwritten.

Fresh post-repair reviewer `ses_e44fa6c6dffeBugoV07RZkRLPG` independently runs
27 transport tests and finds no demonstrable blocker. DESIGN-INTENT REVIEW:
explicit approved-origin dispatch remains a caller-owned primitive, with server
authorization unchanged; no by-design conflict or new conventional deviation.
The local credential/lifecycle/error delta is covered; real consent/CORS/grants,
malicious-approved-node bearer replay and global bounds remain activation risks.
This is one same-family dry review after the repaired finding, not diverse
three-dry convergence or connected acceptance. The PR stays draft for that review.

Full browser consent/grant/revoke, actual TLS/issuer/storage and diverse L1–L4
coverage remain OPEN. No backend change, deployment or full-feature/security PASS.
