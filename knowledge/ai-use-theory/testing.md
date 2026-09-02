# Testing — Anti-Tests and Repair Scope

[← back to README](./README.md)

The pyramid says "tests are altitude." This doc covers two things the main theory underspecifies: what kind of tests actually catch system bugs, and how far the repair phase reaches when you find one.

## Anti-Tests: The KB With Teeth

The knowledge base says "revoked contracts must return 403." That's a wish. A doc entry. Nothing enforces it.

An **anti-test** is the same statement, executable. It *fails* when the invariant breaks. It's the KB with teeth.

```typescript
// KB says: "Revoked app contracts must deny access."
// Anti-test proves it:
test('revoke contract → CRUD fails with 403 → re-create → works', async () => {
  // Setup: user with contract
  // Revoke via API
  // Attempt CRUD → expect 403
  // Re-create contract
  // Attempt CRUD → expect 200
});
```

The anti-test doesn't test "does the happy path work." It tests "does the *security model* hold when something goes wrong?" It's the negative space. The happy path is assumed. The anti-test proves the boundary.

### What makes a good anti-test

1. **It starts from a broken state.** Revoke a contract. Delete a group. Expire a token. Corrupt a record. The test begins where the system is *already wrong* and verifies the system *stays wrong* (denies access, returns empty, shows the error UI).

2. **It verifies the denial, not just the error code.** Not just "status is 403." But "the UI shows the fix button," "the read returns empty," "the document is not created." The anti-test verifies the *consequence*, not just the signal.

3. **It verifies recovery.** The anti-test doesn't just prove the break. It proves the system can heal. Revoke → 403 → re-create contract → works. Delete group → empty reads → re-create group → reads work. The full cycle.

4. **It's fast.** Anti-tests are API-level (no browser) when possible. The browser anti-test (fix button appears) is one per critical flow. The API anti-test (403 on revoked contract) is fast and runs on every PR.

### The rule: every KB invariant gets an anti-test

If the KB says it, the test proves it. If the test fails, the KB is wrong (or the code is wrong — usually the code). This closes the loop between the orient phase (read the KB) and the compare phase (run the test). The KB and the test suite are two representations of the same invariants. If they disagree, something is broken.

### Anti-tests vs. unit tests

Unit tests test *logic*. "Given input X, the function returns Y." They're fast, isolated, and catch typos and regressions in pure functions.

Anti-tests test *system properties*. "Given a revoked contract, the API denies access." They're slower, require the full stack, and catch integration bugs that no unit test can see.

Both are necessary. But for the kind of bugs that burn debug sessions (tombstone semantics, contract enforcement, permission gates), anti-tests are the ones that catch them. Unit tests for `get_app_permissions` would pass — the function logic is correct in isolation. The bug is in how it *interacts* with the tombstone insert pattern. Only the full-stack anti-test sees that.

## The Two Pyramids

The main theory implies a single pyramid shape: unit → integration → E2E. That's right for *logic* bugs. Wrong for *system* properties.

**Logic pyramid** (typical software):
```
        E2E (few, slow)
      Integration (some)
    Unit tests (many, fast)
```
Base is unit tests. Most bugs are logic bugs. Unit tests catch them cheaply.

**System pyramid** (security, permissions, data integrity, timing):
```
        Unit tests (few, logic-only)
      Integration (some)
    E2E anti-tests (many, fast, API-level)
```
Base is E2E anti-tests. Most system bugs are invisible to unit tests. The anti-test *is* the unit test for system properties.

This project is a system. Security invariants, contract enforcement, tombstone semantics, group membership gates — all system properties. The test pyramid is inverted: the base is the E2E anti-test suite, not the unit tests.

## The Seam Rule: A Test Must Drive What It's Named For

The test name is a promise. A test called "auth popup round-trip" must actually open the popup, deliver the contract, capture the consent, and assert the token comes back. If it pre-seeds the state under test — drops a valid cookie, grants the contract via raw API — and then loads the page, it is not testing the seam. It is testing that the seam can be skipped.

The tell is a workaround that routes around the integration point. `popup.close()` plus a `// fragile in headless` comment is not a pass — it is the test admitting it can't reach the seam and choosing to look away. When you see that, the seam is untested, full stop. The "fragile" thing was never fragile; it was untested, and the workaround became the test.

## The Fork Rule: One Goal, Many Paths

The seam rule above is about the **wire seam** — the boundary between systems (client ↔ server, frontend ↔ popup). A UI feature has a second kind of seam that framing misses: the **fork seam**.

The condition is not special — it is the default state of any real interface. A user goal is almost always reachable through more than one path. Approve a request: the button, "approve all," a keyboard shortcut, a right-click menu. Delete a note: the button, the trash, a swipe, the API. Navigate: the link, the keys, the URL. That redundancy is *good* UX — power users take the shortcut, casual users take the button. But each affordance is a separate code path that converges on the same wire seam. Two controls that "do the same thing" are two functions. Testing one path does not test the others, even though they look identical from the user's chair.

The tell is two affordances that reach the same outcome through different code. "Allow" and "Approve all & continue" both approve a contract, but `approveContract` (single) and `approveAll` (batch) are two different functions sharing the postMessage round-trip. That is the *simplest* fork — two buttons on one screen. Real forks span modalities: the button vs. the keyboard shortcut vs. the context menu vs. the deep-link vs. the raw API call.

This is exactly how the approve-all bug shipped. The round-trip E2E drove the seam through the single "Allow" button only. `approveAll` was a separate path that never got driven, and it had a real bug: the app-contract branch never sent the approval response back to the opener, so the opener's callback only fired late, mis-delivered from the group contract's response. The single-approve test could never see it, because the bug lives only in the approve-all code path. A green that drives one path and calls the feature "covered" is a corrupted measure wearing a fork's mask — it looks like seam coverage, but it is seam coverage for one path only.

### The rule

**A feature is tested when the seam is driven through every path that reaches it, not just the convenient one.** Before declaring a UI feature done, enumerate every affordance that reaches the goal — button, keyboard shortcut, context menu, drag, deep-link, API call, mobile equivalent, second tab — and drive each one through the seam at least once. The happy-path demo naturally exercises one affordance (the one its own flow leads to); the rest stay untested until you deliberately drive them.

### How to enumerate the forks

It is not a blind "click every button." It is a targeted question, the same shape as the repair-scope question below:

- "What are the ways to reach this goal?" — every affordance: the buttons, the keyboard shortcuts, the context menus, the drags, the URLs, the API calls, the mobile equivalents.
- "Which of them take a different code path?" — same outcome, different function. Those are the forks.
- "Which forks does a test actually drive?" — the gap is the untested path.

In practice:
1. List the affordances on the surface (the `data-testid`s map the buttons; the shortcut handlers, menu items, and route params map the rest).
2. For each, name the code path it takes (the handler → the function it calls).
3. Mark which paths a test actually drives.
4. The unmarked ones are the audit. Each gets a test that drives it through the real seam, with the diagnostic dump on failure.

The approve-all fork got its test this way: `data-testid="consent-approve-all"` was on the surface, its handler (`approveAll`) was a different path than `consent-approve-0` (`approveContract`), and no test drove it. The test that drives it asserts the thing only that path can get wrong — that the app-contract response arrives *before* the group contract is even requested.

### Fork rule vs. repair scope

Repair scope (below) is *reactive*: you found a bug, so look for the pattern elsewhere. The fork rule is *proactive*: before you call a feature done, find the untested paths. They are the same instinct pointed at different times — "the code has more surface than the one spot you touched." Repair scope applies it after the break; the fork rule applies it before the claim of done.

## The State Rule: First Run and Return Run Are Different Code Paths

The seam rule is about the **wire** — the boundary between systems. The fork rule is about the **paths** — one goal, many affordances. A feature has a third dimension the other two miss: the **state**. The same flow, the same wire, the same button — run once on an empty system and run again on a populated one — takes different code paths.

The **first run** is the cold start: a fresh user, no cookie, no approved contracts, no data. Everything is empty, nothing conflicts, nothing has to be restored. It answers "can the system do the thing from scratch?"

The **return run** is the warm start: the user comes back carrying a token cookie, already-approved contracts, groups they already created, and data they already wrote. Now the system has to *restore* the session, *not re-prompt* for consent it already gave, *not clobber* the group it already created, and *read back* the data it already wrote. It answers "does the system actually persist and respect state?"

These are not the same path with different data. They are different branches. The cold start never calls the session-restore code; the return run never calls the first-time setup code. A test that only drives the cold start is a corrupted measure wearing a state's mask — it looks like coverage of the feature, but it only covers one of the two fundamental states the feature lives in.

This is exactly the shape of the notes-app return bug. The gauntlet drove the cold start: a fresh user, a pre-seeded group and contract, create a note, reload, verify — every assertion green. But the *return* run — a user who has used the app, logs out, and logs back in through the real flow — was never driven. On the return run the demo re-sends the group-creation contract on every login, and `create_group` is not idempotent: it inserts a second `group_contracts` row and a second `group_members` row for the same `group_id`. The read query dedupes, so the note survives at the API level — but the duplicate rows are real, they accumulate on every single visit, and any query that does not dedupe (or any future change to the read) turns the return run into the "my notes disappeared" report. The cold-start test could never see it, because the cold start only ever creates the group once.

### The rule

**A feature is tested when the flow is driven in both states — first run (cold) and return run (warm) — not just the one the happy path happens to take.** The return run is where persistence, idempotency, and session restore actually live, and it is the state a real user is in almost all the time. A user who has used your app once is a returning user forever after; the cold start is the exception, not the rule. "It worked the first time, then it broke" is a return-run bug by definition — no cold-start test can produce it.

### How to drive the return run

It is not "run the test twice." It is a targeted question, the same shape as the fork enumeration:

- "What state does the first run leave behind?" — the token cookie, the approved contracts, the created groups, the written documents.
- "What does the second run do with that state?" — restore the session, re-request (or skip) the consent, re-create (or find) the group, read back the data.
- "Which of those is a different code path?" — the restore branch, the idempotency branch, the already-approved branch. Those are the return-run seams.
- "Does a test actually drive the second run?" — the gap is the untested state.

In practice:
1. Drive the first run to completion through the *real* flow (cold start).
2. Leave the state it leaves behind — do not wipe it.
3. Drive the second run through the *same* real flow (not a pre-seed; a pre-seeded cookie is the cold-start shortcut, not the return run).
4. Assert the invariants the return run must hold: the data is still there, the consent is not re-prompted (or is auto-approved), the group is not duplicated, the session is restored without a fresh login.

The return run is the harder test to write — it needs the first run to have actually run, and it needs the real flow. But it is the test that catches the class of bug the user actually hits.

### State rule vs. fork rule

The fork rule is about *breadth within a run*: the same goal through many paths. The state rule is about *depth across runs*: the same path through many states. A feature can have every fork tested and still be broken on the return run — the approve button works on first use, but the consent is re-prompted (or the data is clobbered) on every use after. They are the same instinct — "the code has more surface than the one spot you touched" — pointed at different axes. The fork rule asks "what other buttons reach this goal?" The state rule asks "what does this look like the second time?"

## The Corrupted Measure: A Green That Skips the Seam

A green test that doesn't touch the seam is worse than no test. It teaches the operator to trust "green" — and then a real green gets doubted and a real red gets dismissed. This is the "fake altitude" from the main theory, made concrete with two real examples:

- The changelog said the round-trip was "verified, logs asserted on both sides." The spec only captured the main page and never attached to the popup. The memory claimed a coverage the code did not have.
- A "fix" added a `JSON.stringify` replacer to mask a cross-origin `Window`. It was a no-op — `JSON.stringify` reads `value.toJSON` *before* any replacer runs, and that read throws a `SecurityError` cross-origin. The changelog line said "fixed." It was not. The next session inherited a false green and a broken flow.

The review gate on tests is not "does it pass." It is "does this test actually touch the seam it is named for?" A green that skips the seam is the single most trust-destroying signal in the pyramid, because it is the one the operator is supposed to be able to sleep on.

## The Test Ladder: Gradually Harder

Build tests in layers, easiest first. The floor is the fast, deterministic, stable layer — API-level calls, no browser, no timing. It is not a throwaway warm-up; it is the diagnostic anchor. Above it is the hard, slow, integration layer — a real browser driving the real UI and the real popup, asserting the round-trip end to end.

Keep both. They are different *resolutions* of the same system, not redundant copies. When the UI test goes red, the API layer tells you whether the break is in the data layer or in the seam — a UI test passing does not say *why*, and a UI test failing does not say *where*. The easy layer is also fast enough to run on every commit, which is what keeps the slow layer trustworthy. The failure is never having the easy layer. The failure is *stopping* at the easy layer and letting the changelog claim the hard one is covered when it is not.

## Test Rot: Testing Ghosts

The slow version of the corrupted measure. A test that hits a removed endpoint (404) or a stale payload shape (422) is no longer testing the current behavior — it is testing a ghost. The endpoint moved, the API changed, and the test kept knocking on the old door.

A suite full of ghosts erodes trust the same way a false green does: the operator stops believing the signal, so a real red gets dismissed as "just the rot." The fix is the same as the seam rule — the test must touch the *current* seam. When an API endpoint is renamed or its payload changes, the tests that hit it are part of the change, not a separate cleanup. A suite that is red only because of ghosts is a corrupted measure wearing a red mask — it looks like a failure but is really a lie about what is being tested.

Test rot is the *accidental* version of a moved target — the endpoint drifted and the test wasn't updated. The *intentional* version — you deliberately changed the behavior and the tests that encoded the old one go red — is a different animal with its own discipline. See [Regressions](./regressions.md): there the reds are expected, and the move is triage (target moved → update the test, you broke it → fix the code), not cleanup.

## The Diagnostic Dump

A failing integration test should hand you the break, not make you guess it. When the seam test fails, dump the signal from *both* sides of the boundary — the full console (all levels) plus uncaught exceptions (`pageerror`) from each page. That is what turned a "the contract never shows up" mystery into a one-line fix: the dump showed the contract *arriving* at the popup (`contract message received`) and then the handler dying on a `SecurityError` before `setPendingContracts`. No dump, you re-read both sides and speculate. With the dump, you read the break.

The pattern: capture `page.on('console')` (all levels) and `page.on('pageerror')` on *every* page in the flow, and include them in the failure message. The durable part is not the payload — it is the *sequence* of communications across the seam, and that sequence is what localizes the break. A test that fails silently (a bare timeout) is a corrupted measure too: it tells you *that* it broke, not *where*.

## Local Is the Gradient, CI Is the Gate

The Diagnostic Dump above is about *what* to capture when a test fails. This is about *where* to run it — and the answer is: **locally, against the real stack, not just in CI.**

The theory says "logs are the gradient." The gradient is only as good as the signal, and the signal is only as good as where you capture it. Locally you can attach to every page in the flow, capture the full console (all levels) plus `pageerror` from *both* sides of the seam, and — the part CI can never give you — add a temporary probe to the code and watch it fire in the same run. The fix → run → read loop is seconds. In CI the same loop is a build, a queue, a run, and a truncated artifact you have to reverse-engineer: minutes per iteration, and the log is a *lossy projection* of what actually happened.

A debug session that needs five iterations is five local runs (minutes) or five CI round-trips (hours). That is the pyramid's cost argument applied to the *source* of the gradient: the local stack is where you read the break; CI is where you verify the fix holds in a clean environment. CI is the *altitude* check, not the *gradient* source.

### The rule

**Debug locally against the real stack; use CI to confirm, not to discover.** When a test is red, run it locally first and read the full two-sided dump (add probes if you need them). Only when the local run is green do you push to CI to confirm the fix holds in a clean environment — fresh state, no local drift, the real browser.

### The caveat: local drift

The local stack is not CI. It drifts: a stale container, leftover data from a previous run, a detached bind mount, a service rebuilt under you. A local green is not the same as a CI green — the local stack can sit in a state CI never sees, and a local red can be the *stack*, not the code. That is why you still push to CI to confirm. But the asymmetry is the point: **a local red with the full two-sided log is always more informative than a CI red with a truncated artifact.** When the two disagree, trust the local log for *where* the break is, and CI for *whether the fix holds*. (Telling a stack-red from a code-red is the same "is this pre-existing?" question the [Worktree Rule](#the-worktree-rule-the-working-tree-is-the-deliverable) answers — the static check and the committed checkout, not a guess.)

### A broken stack is a fixable local state, not a reason to give up on local

The drift above is not just a caveat to tolerate — it is part of the debugging surface, and you can usually figure out locally how to make the stack work again. A stack-red has the same shape as a code-red: a local signal that points at the break. The difference is *where* the break is — in the environment, not the code — and the local tools that find it are `docker inspect` (mounts, image, env), `docker logs` (the service's own traceback), and the container state (`Up` / `Exited` / the exit code). You read the signal, you find the broken piece, you fix it locally, and the same test goes green — no CI round-trip, no code change.

The real case: the media e2e tests went red with a `500 DataNotFoundError: Unable to load data for: endpoints` on every presign. The code was innocent (the media endpoint and its `boto3`/`botocore` deps were unchanged — the static check said so). The local signal did the rest: the API traceback pointed at `boto3.client("s3")`, and `docker inspect` on the API container showed its bind mount pointed at a *different, now-deleted Conductor workspace* (`indianapolis/api -> /web10`) — a detached mount, so botocore's data lookup died. The fix was local and took no code: recreate the container against the correct workspace mount (and reset the in-memory ClickHouse, which had corrupted on the unclean restart). Same tests, green, all found and fixed on the local stack.

The discipline: **when a test is red, the first question is not "is the code broken?" but "is the *stack* broken?"** Read the local signal (traceback, mounts, container state) before you touch the code. If the break is in the environment, fix the environment locally and re-run — the test was never a code bug, and a CI round-trip would have told you the same thing you could have read in the local log, an hour later.


## The Worktree Rule: The Working Tree Is the Deliverable

Every rule above assumes you can run a test, read the signal, and try again on a clean slate. In a Conductor workspace you often can't. Each Conductor workspace is a single git worktree, and the working tree in it is not a scratchpad — it is the deliverable. The uncommitted changes sitting in it are the thing you ship. That changes what you are allowed to do to it while you test.

The tell is a git command that mutates shared state or the working tree on the assumption you will undo it. `git stash` is the canonical one: it empties your working tree and writes the changes to the shared `refs/stash`, a ref that belongs to the repo, not to any worktree. If the session dies between the stash and the pop — a timeout, a crash, the operator closing the window — the changes are now in a ref no worktree is pointing at, and the deliverable is empty. The work is not lost (it is in the stash), but the session's ability to finish is, and the next agent inherits a half-messy tree and has to reconstruct what was where before it can do anything.

The rule: **never `git stash` and never `git worktree add`/`remove` in a Conductor workspace.** More generally, never run a git command that mutates the deliverable's working tree, a shared ref, or the worktree structure on the assumption you will undo it. The session is not guaranteed to live long enough to undo it, and Conductor owns the worktree lifecycle.

The compare phase's most common question is "is this failure pre-existing?" — and the instinct is to stash your changes, run the test on a clean tree, and pop. That instinct is exactly what bricks the deliverable. Two safe moves answer the same question without touching it:

1. **The static check** — `git diff origin/dev -- <file>`. If the failing path is in a file your branch did not touch, the failure is pre-existing, done. No checkout, no mutation, nothing to undo. This is the fast path and it answers most of them.

2. **The committed checkout** — for when the failure needs the test to actually run against a clean base. First, commit your work and push the branch (the remote branch is your backup). Then `git checkout origin/dev` in the same worktree → run the test → `git checkout <your-branch>` to come back. This is safe because your work lives in a commit on the remote, not in a fragile ref. If the session dies mid-checkout, the next agent runs `git checkout <your-branch>` and everything is where it was.

**Never create or remove worktrees in a Conductor workspace.** Conductor owns the worktree lifecycle — each workspace is exactly one worktree, and `git worktree add` / `git worktree remove` corrupts that relationship. The committed checkout above gives you the same "run against a clean base" capability without touching the worktree structure.

Both keep the deliverable intact. The stash does not.

## Repair Scope: Look at the Rest of the Subsystem

You find a bug in `get_app_permissions`. The tombstone dedup is wrong — `WHERE deleted = 0` before `ORDER BY updated_at DESC LIMIT 1` makes the tombstone invisible.

The repair is not "fix `get_app_permissions`." The repair is: **look at the rest of the ClickHouse service and ask "could this be broken elsewhere?"**

In this session, the answer was yes — five other functions had the same pattern. `is_origin_allowed`, `get_app_contracts`, `get_provider_service_contracts`, `is_provider_origin_allowed`, and the `group_members` JOIN in `read_documents_in_groups`. Six bugs, not one.

### How to scope the repair

It's not always a blind grep. Sometimes it is. But more often it's a targeted question:

- "I found a tombstone bug in the contract queries. Are there other queries over tombstoned tables?"
- "I found a `now()` precision bug in `delete_document`. Are there other `now()` calls that should be `now64(6)`?"
- "I found a missing permission check in the delete endpoint. Do the other mutation endpoints have the same gap?"

The question is always: **what other code shares the same pattern, assumption, or subsystem as the bug I just found?**

### The rule

When you identify a bug *pattern* (not just a bug instance), the repair scope is all instances in the same subsystem. Not the whole codebase. Not a blind grep across all languages. The subsystem. The file. The module. The set of functions that share the same assumption.

In practice:
1. Fix the instance that failed the test.
2. Look at the rest of the file. Same pattern? Fix it.
3. Look at the rest of the module. Same assumption? Check it.
4. Run the full test suite. If a new failure appears, you found another instance.

The repair phase is not done when the failing test passes. It's done when you've looked at the rest of the subsystem and confirmed the pattern isn't broken elsewhere.

## What This Means for the Theory

The main theory's compare phase says "run the tests, read the signal." This doc adds: **the tests that matter for system properties are anti-tests, and they form the base of an inverted pyramid.**

The main theory's repair phase says "make the fix, verify it." This doc adds: **the fix is not one function. It's the pattern. Look at the rest of the subsystem before calling it done.**

The main theory's seam rule says "the test must drive the seam it is named for." This doc adds: **the seam has forks. One goal is reachable through many paths, and a feature is tested only when the seam is driven through every path that reaches it — not just the one the happy path happens to take.**

The main theory's test ladder says "build tests from the easy floor up." This doc adds: **the ladder has a second axis the floor does not cover — state. The cold start is the easy floor; the return run is where persistence, idempotency, and session restore live. A feature is tested only when the flow is driven in both states, not just the first.**

The main theory says "logs are the gradient." This doc adds: **the gradient is captured locally, against the real stack — not discovered in CI. Local gives the full two-sided dump and same-run probes (seconds per iteration); CI is the clean-environment altitude check you confirm against, not the place you read the break.**

All five additions come from the same root: the LLM is shy about scope. It fixes the thing that failed and stops. It doesn't naturally ask "is this broken elsewhere?", "did I test the other button?", "what does this look like the second time?", or "where is the actual signal?" The process has to force it. AGENTS.md says: "when you find a bug pattern, check the rest of the subsystem." The anti-test suite says: "here are the invariants that must hold. If any of them fail, the repair isn't done." The fork rule says: "here are the paths this feature has. If one of them has no test, the feature isn't done." The state rule says: "here are the states this feature lives in. If the return run has no test, the feature isn't done." The local-gradient rule says: "the break is in the local two-sided log, not in the CI artifact — go read it there."
