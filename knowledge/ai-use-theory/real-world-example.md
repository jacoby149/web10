# A Real-World Example: The D42 Consent Redesign, End to End

[← back to README](./README.md)

This is the theory in action — one real session, start to finish. It is the
reference example for how the pieces fit together when the target actually
moves: a decision changes the design, the KB and code follow, the tests go red,
you triage the reds, you find a real bug in the local logs, you discover the
*environment* itself regressed, you fix the environment, and the suite goes
green — locally first, then in CI.

The session: the "notes app unreliable" work — the D42 consent-handshake
redesign, and the two red cookie-torture tests that were the last of it.

## The target moves: a decision, not a bug report

It starts with a **decision**, not a bug report. The operator watched the notes
demo re-prompt on every return run and made D42: the consent popup becomes an
automatic handshake — one self-contained popup per contract, the "all set"
screen deleted, group contracts lazy.

This is the moment the *target* moves. The design is deliberately different,
and everything downstream (KB, code, tests) has to follow. It is the whole
reason [Regressions](./regressions.md) exists: an intentional change moves the
target, and the tests that encoded the old target go red. That red is
*expected*, not a surprise — and the discipline is to treat it as such, not to
chase it as a mystery.

## Phase 1 — Orient: the KB and the code move together

The pyramid says the KB is the root of trust, so the KB moves first (or in
lockstep): `web10-v3/auth/consent.md` is rewritten to describe the new flow —
the zero-UI auto-complete, the lazy group contract, the identity check. The
code follows: `ConsentView.tsx` gets the `allSettled` auto-complete,
`Interface.tsx`'s `goToApp` self-closes, the SDK passes `?as` (identity) and
`?handoff` (consent-only group popup), and the notes demo stops sending the
group contract on login.

Orient done: KB and code agree on the new target. The foundation is solid, so
the reds that come next are *measured against a known target*, not against a
guess.

## Phase 2 — Generate: the tests go red

Run the suite. Two cookie-torture tests go red:

- **IDENTITY** — a stale popup session for a *different* user must not hijack the demo.
- **RE-LOGIN LOOP** — log out then log in must settle, not re-prompt forever.

This is the generate phase producing the signal: a list of reds. The first move
is *not* to fix — it is to **triage**.

## Phase 3 — Compare: the triage question, before touching anything

For each red, the triage question from [Regressions](./regressions.md):

> **Did I mean to change what this test asserts?**

- **IDENTITY** — the test drove the removed Close-window button
  (`consent-close-window`). D42 deliberately deleted that button. So *yes*, I
  meant to change what it asserts. **Expected regression** → re-align the test
  to the new flow (drive the handoff via "Approve all & continue"), keep the
  invariant (the demo is still user A — the SDK identity check is the seam).
- **RE-LOGIN LOOP** — the test waited for a consent row, but the new flow
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
popup's console showed `contractReceived: undefined` on every render. The bug:
`I._contractReceived` was a plain property on the per-render `I` object, and
the contract listener — attached once, capturing the first render's `I` — set
the flag on a **stale object** that `ConsentView` never read. So `allSettled`
was always false, and the auto-complete was dead.

The fix was one line of intent: make it React state (`setContractReceived`) so
it survives the re-render. The local run went green. This is "logs are the
gradient" — the break was read from the local signal, not speculated, and the
fix was one targeted change instead of a doom loop of guesses.

## The env regression: the stack, not the code

With the consent reds fixed, the suite was *almost* green — except three media
tests, red with a `500 DataNotFoundError`. The instinct is "another code bug."
The [local-is-the-gradient](./testing.md#local-is-the-gradient-ci-is-the-gate)
discipline says: read the local signal *before* you touch code.

The API traceback pointed at `boto3.client("s3")`. The code was innocent — the
media endpoint and its `boto3`/`botocore` deps were unchanged (the static check
said so). `docker inspect` on the API container showed the break: its bind mount
pointed at a *different, now-deleted Conductor workspace* — a detached mount, so
botocore's data lookup died. **The red was the stack, not the code.**

The fix was local and took no code: recreate the container against the correct
workspace mount (and reset the in-memory ClickHouse, which had corrupted on the
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

1. **The target moves** (a decision, D42) — the reason the tests will go red.
2. **Orient** — KB and code move together to the new target.
3. **Generate** — the suite goes red; the reds are the signal.
4. **Compare / triage** — the triage question splits *expected* (re-align the
   test) from *unexpected* (fix the code), **before** touching anything.
5. **Repair** — the local two-sided dump finds the real bug (logs are the
   gradient); the test re-alignment keeps the invariants intact.
6. **The env regresses too** — a red that is the *stack*, not the code; read the
   local signal, fix the environment locally.
7. **The gate** — CI confirms the fix holds in a clean environment.

The load-bearing moves were the ones the theory *forces* and the LLM would not
do on its own: triaging before fixing, reading the local dump instead of
speculating, and asking "is the *stack* broken?" before "is the *code*
broken?" Those are the serious holes the theory fills — and this is the session
where they got filled by practice, not by a rewrite.
