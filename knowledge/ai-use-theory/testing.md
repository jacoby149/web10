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

## The Diagnostic Dump

A failing integration test should hand you the break, not make you guess it. When the seam test fails, dump the signal from *both* sides of the boundary — the full console (all levels) plus uncaught exceptions (`pageerror`) from each page. That is what turned a "the contract never shows up" mystery into a one-line fix: the dump showed the contract *arriving* at the popup (`contract message received`) and then the handler dying on a `SecurityError` before `setPendingContracts`. No dump, you re-read both sides and speculate. With the dump, you read the break.

The pattern: capture `page.on('console')` (all levels) and `page.on('pageerror')` on *every* page in the flow, and include them in the failure message. The durable part is not the payload — it is the *sequence* of communications across the seam, and that sequence is what localizes the break. A test that fails silently (a bare timeout) is a corrupted measure too: it tells you *that* it broke, not *where*.

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

Both additions come from the same root: the LLM is shy about scope. It fixes the thing that failed and stops. It doesn't naturally ask "is this broken elsewhere?" The process has to force it. AGENTS.md says: "when you find a bug pattern, check the rest of the subsystem." The anti-test suite says: "here are the invariants that must hold. If any of them fail, the repair isn't done."
