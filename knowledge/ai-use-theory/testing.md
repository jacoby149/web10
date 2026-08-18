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
