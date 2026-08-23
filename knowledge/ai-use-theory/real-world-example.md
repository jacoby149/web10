# A Real-World Example: The Consent Popup Redesign, End to End

[← back to README](./README.md)

This is the theory in action — one real session, start to finish. It is the
reference example for how the pieces fit together when you make an intentional
change: the problem, the root cause, the decision, the KB and code moving
together, the tests going red, triaging the reds, finding a real bug in the
local logs, discovering the *environment* itself regressed, fixing the
environment, and the suite going green — locally first, then in CI.

The session: making the web10 consent popup stop being glitchy.

## The problem: a popup that was buggy for two weeks

Before the change, there was a real, user-facing problem. When an app wants to
use your web10 data, it opens a small popup (the "authenticator") that asks for
your permission. For two straight weeks, that popup was glitchy:

- It **re-asked on every visit.** You approved once, but the next time you
  opened the app it asked again (the group permission re-showed on every
  return run).
- **"Approve all & continue" felt broken.** You tapped it and got no immediate
  confirmation — out-of-order updates, like nothing happened.
- **The window wouldn't close.** It handed you your token and then just sat
  there, waiting for a "close" signal that never came, so you had to close it by
  hand.
- **It crashed in some browsers.** A cross-origin error when the popup and the
  app were on different domains.

The changelog tells the story: a stream of band-aid fixes, one after another —
the close crash, the cross-origin error, the handshake "actually works now," the
approve-all response, the duplicate rows on a return run. Each fix patched a
symptom. The popup was still glitchy.

## The root cause: one popup doing two jobs

The band-aids kept coming because they treated symptoms, not the cause. The
cause: **one popup was doing two jobs.**

The popup had to handle two different permissions:

- an **app permission** — "can this app talk to your data?" (granted once), and
- a **group permission** — "who can see your notes?" (a privacy setting).

But the popup couldn't know whether a second permission (the group) was coming
after the first (the app). So it held itself open, *waiting* — stuck in a limbo
between the two. That limbo was the source of every symptom: the re-prompt (the
group permission re-showed while it waited), the "all set" dead-end (stuck on a
screen waiting for a contract that might not come), the Close-window tap (you
had to close a window that should have closed itself), and the messaging mess
(out-of-order responses, the token sent but the window not closing).

## The decision: fix the cause, not the symptoms

The fix (recorded as decision D42 in `decisions.md`) attacked the root cause:

- **One popup per permission, each self-contained.** Each popup does one job and
  closes. No more one window doing two jobs.
- **Delete the "all set" screen.** Replace it with a zero-tap automatic
  handshake: if you're already signed in and already granted permission, the
  popup just hands back your token and closes itself. No screen, no button.
- **Make the group permission lazy.** Don't ask for it on every login. Only ask
  when you actually try to read your notes and the group is missing — then a
  button appears, and clicking it opens a second, focused popup just for that.

The result: a return visit is the popup flashing and closing, the notes
loading, done. Zero taps. And because the consent popup is the shared seam
*every* web10 app drives, fixing the root cause makes every web10 app less
buggy down the road — not just the notes demo.

## The target moves: why the tests will go red

This is an *intentional* change — the design is deliberately different. That is
the moment the *target* moves, and it is the whole reason
[Regressions](./regressions.md) exists: when you move the target, the tests
that encoded the old target go red. That red is *expected*, not a surprise —
and the discipline is to treat it as such, not to chase it as a mystery.

## Phase 1 — Orient: the KB and the code move together

The pyramid says the KB is the root of trust, so the KB moves first (or in
lockstep): the consent doc (`web10-v3/auth/consent.md`) is rewritten to describe
the new flow — the zero-tap auto-complete, the lazy group permission, the
identity check. The code follows: the consent view gets the auto-complete, the
interface's "go to app" self-closes, the SDK passes who-it's-acting-for and a
"consent-only" flag (for the group popup), and the notes demo stops sending the
group permission on login.

Orient done: KB and code agree on the new target. The foundation is solid, so
the reds that come next are *measured against a known target*, not against a
guess.

## Phase 2 — Generate: the tests go red

Run the suite. Two "cookie torture" tests go red — these drive the consent flow
with a *persistent* browser (real cookies carried across visits), which is
exactly where the old popup was glitchy:

- **IDENTITY** — a stale popup session for a *different* user must not hijack the app.
- **RE-LOGIN LOOP** — log out then log in must settle, not re-prompt forever.

This is the generate phase producing the signal: a list of reds. The first move
is *not* to fix — it is to **triage**.

## Phase 3 — Compare: the triage question, before touching anything

For each red, the triage question from [Regressions](./regressions.md):

> **Did I mean to change what this test asserts?**

- **IDENTITY** — the test clicked the "Close window" button. The redesign
  deliberately deleted that button (the popup now closes itself). So *yes*, I
  meant to change what it asserts. **Expected regression** → re-align the test
  to the new flow (drive the handoff via "Approve all & continue"), keep the
  invariant (the app is still the original user — the identity check is the
  seam).
- **RE-LOGIN LOOP** — the test waited for a consent screen, but the new flow
  auto-completes. *But* — and this is the tell — the auto-complete wasn't
  actually happening. The popup sat on an empty screen. That is not "the target
  moved"; that is "the code is broken." **Unexpected regression** → fix the
  code.

The triage split the two reds correctly *before* a line was changed. That is
the discipline working: the same red suite, two different responses. A session
that "fixed" both by updating both tests would have updated away the real bug
and shipped a dead auto-complete with a green suite.

## The repair: the logs are the gradient

The RE-LOGIN red needed the break *found*, not guessed. The local two-sided
dump (the [Diagnostic Dump](./testing.md#the-diagnostic-dump)) did it: the
popup's console showed a flag (`contractReceived`) was `undefined` on every
render. The bug: that flag was a plain property on an object the UI recreates on
every render, and the code that set the flag held a reference to the *first*
render's object — so it set the flag on a stale object the UI never read. The
auto-complete's condition was therefore always false, and the auto-complete was
dead.

The fix was one line of intent: make the flag real React state so it survives
the re-render. The local run went green. This is "logs are the gradient" — the
break was read from the local signal, not speculated, and the fix was one
targeted change instead of a doom loop of guesses.

## The env regression: the stack, not the code

With the consent reds fixed, the suite was *almost* green — except three media
tests, red with a server error. The instinct is "another code bug." The
[local-is-the-gradient](./testing.md#local-is-the-gradient-ci-is-the-gate)
discipline says: read the local signal *before* you touch code.

The server's traceback pointed at the AWS S3 client. The code was innocent — the
media endpoint and its dependencies were unchanged (the static check said so).
Inspecting the container showed the break: its file mount pointed at a
*different, now-deleted workspace* — a detached mount, so the S3 client's data
lookup died. **The red was the stack, not the code.**

The fix was local and took no code: recreate the container against the correct
workspace mount (and reset the in-memory database, which had corrupted on the
unclean restart). Same media tests, green. This is
[broken-stack-is-fixable-locally](./testing.md#a-broken-stack-is-a-fixable-local-state-not-a-reason-to-give-up-on-local)
— the environment is part of the debugging surface, and a stack-red is a
fixable local state, not a reason to give up on local testing or to blame the
code.

## The gate: CI confirms

Local green is not CI green (local drift). So the fix goes to CI to confirm it
holds in a clean environment — fresh stack, no local drift, the real browser.
The full e2e suite passes; every check green; merge state clean. CI is the
*altitude* check, not the *gradient* source — it confirmed what the local logs
already showed.

## What this demonstrates

One session, the whole theory, in the order it is meant to run:

1. **The problem** — a real, user-facing bug (the glitchy consent popup), with a
   changelog full of band-aid fixes.
2. **The root cause** — one popup doing two jobs; the band-aids treated
   symptoms, not the cause.
3. **The decision** — fix the cause: one popup per permission, zero-tap
   auto-complete, lazy group permission.
4. **The target moves** — an intentional change; the tests *will* go red.
5. **Orient** — KB and code move together to the new target.
6. **Generate** — the suite goes red; the reds are the signal.
7. **Compare / triage** — the triage question splits *expected* (re-align the
   test) from *unexpected* (fix the code), **before** touching anything.
8. **Repair** — the local two-sided dump finds the real bug (logs are the
   gradient); the test re-alignment keeps the invariants intact.
9. **The env regresses too** — a red that is the *stack*, not the code; read the
   local signal, fix the environment locally.
10. **The gate** — CI confirms the fix holds in a clean environment.

The load-bearing moves were the ones the theory *forces* and the LLM would not
do on its own: finding the root cause instead of stacking band-aids, triaging
before fixing, reading the local dump instead of speculating, and asking "is
the *stack* broken?" before "is the *code* broken?" Those are the serious holes
the theory fills — and this is the session where they got filled by practice,
not by a rewrite.

And the payoff is broader than one demo: the consent popup is the shared seam
every web10 app drives. Fixing its root cause — one popup, one job, lazy group
— makes every web10 app less buggy down the road.
