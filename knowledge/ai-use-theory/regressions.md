# Regressions — When the Target Moves, the Altitude Changes

[← back to README](./README.md)

The pyramid says "tests are altitude." Altitude is a distance — but a distance
*from what*? From the target. The knowledge base is the target. Every green test
is a measurement of "the code is at the target." Every red test is "the code is
not at the target."

Now make an **intentional change** — a feature, a redesign, a decision (a D-number
in `decisions.md`). You have *moved the target*. The KB now describes new
behavior. The code is being moved to the new target. And the tests — which were
measuring distance to the *old* target — start going red.

That red is **expected**. It is not a surprise, it is not a failure, and it is
not (necessarily) a bug you introduced. It is the target moving. A test that
asserted the old behavior *should* fail now — it is measuring a target that no
longer exists. Fixing those regressed tests is a normal, anticipated part of any
intentional change. This doc is the discipline for doing that without corrupting
the measure.

## The Two Kinds of Red

When the suite goes red after an intentional change, every red test is one of
two things. Telling them apart is the whole game.

**1. Expected regression — the target moved.** The test was asserting the *old*
behavior that your change deliberately altered. Its assertion was correct for the
old target; it is now measuring the wrong target. The test is not broken — the
world it described is gone. **You update the test to the new intent.** You do not
"fix" it to pass the old way; you re-align it to the new KB.

**2. Unexpected regression — you broke something.** The test was asserting
behavior your change was *not* supposed to alter. It should still pass. It fails
because your change introduced a bug on a path you didn't mean to touch. **You
fix the code.** The test is right; the code is wrong.

The danger is treating one kind as the other. Treating an *unexpected* regression
as an *expected* one means you "update" a test that was actually catching a real
bug — you weaken the assertion, the bug ships, and you've built a corrupted
measure. Treating an *expected* regression as an *unexpected* one means you chase
a phantom bug in code that is correct, burning a doom loop trying to make the old
behavior come back.

## The Triage Question

For each red test, ask one question before touching anything:

> **Was this test asserting the old behavior I deliberately changed?**

- **Yes** → expected regression. The test described the old target. Update it to
  the new intent.
- **No** → unexpected regression. The test describes behavior that should still
  hold. You broke it. Fix the code.

The answer comes from comparing the test's assertion to *what you actually
changed*. Not "is it red?" (it is, that's why you're looking) but "does this
assertion describe the thing I set out to change?" A test that waits for a UI
element you deliberately removed is asserting the old behavior. A test that drives
a flow you didn't touch and now fails is asserting behavior that should survive.

## The Rule

**A regressed test is not a bug report. It is a question: "did I mean to change
what this test asserts?" Answer that against the KB before you touch the test or
the code.** The KB is the oracle. After an intentional change the KB describes the
new target. A regressed test that asserted the old target is now *out of alignment
with the KB* — the same misalignment the orient phase checks for, applied to the
tests. Updating it is re-aligning it to the KB. "Fixing" it by loosening the
assertion is moving the target back to match a bug.

## How to Triage

In practice, when the suite goes red after an intentional change:

1. **List the reds. Don't fix yet.** Get the full list of failing tests. The
   shape of the list is signal — a cluster of reds around the flow you changed is
   expected regressions; a scattered red in an unrelated flow is an unexpected
   one.
2. **Triage each red against the change.** For each, answer the triage question.
   Mark it *expected* (update the test) or *unexpected* (fix the code). Write the
   mark down — a comment, a todo, a line in the changelog draft.
3. **Fix the unexpected ones first.** They are real bugs. Fix the code, not the
   test. These are the ones that, if missed, ship a regression.
4. **Update the expected ones to the new intent.** Re-write the test to drive the
   *new* flow and assert the *new* invariants. The new assertion must match the
   new KB — if you can't point at the KB line the new assertion proves, you've
   updated it to the wrong intent.
5. **Re-run the suite.** New reds may appear (a fix for one unexpected regression
   can surface another). Triage them the same way.
6. **Record both in the changelog.** The intentional change *and* the test
   re-alignment. "Updated the consent-fork tests to the D42 flow" is a load-
   bearing line — it tells the next AI the tests were re-aligned to a new target,
   not weakened. A changelog that says "fixed failing tests" without saying *why*
   they failed is a corrupted measure waiting to happen.

The order matters: unexpected before expected. If you update the expected tests
first and get a green, you may stop before fixing the real bug hiding in the
unexpected reds. The green from updated tests is not a green from a fixed system.

## The D42 Example

The D42 redesign (a decision — the consent handoff becomes an automatic
handshake, group contracts become lazy) is a live case. It deliberately removed
three things the old e2e tests depended on: the "You're all set" screen (replaced
by zero-UI auto-complete), the "Close window" button (the popup now self-closes),
and the proactive group contract on login (now lazy, sent only when a read 403s).

The reds split cleanly:

- **Expected regressions** — the consent-fork tests (`deny fork`, `skip fork`,
  `all-set fork`, `logout fork`, …). Each one waited for `consent-allset`, clicked
  `consent-close-window`, or expected the group contract to render on login. All
  three are things D42 deliberately removed. These tests asserted the *old* flow.
  They get **updated** to drive the new flow: wait for the auto-complete (token
  lands, popup self-closes), drive the lazy group (read 403s → button → second
  popup), assert the mismatch banner where relevant.
- **Unexpected regression** — `cookie-torture` test 2 (contract revoked between
  visits → Fix access → recover, same user). This is a *return-run* test driving
  the fix-access path, which D42 was *not* supposed to change. It regressed, so it
  is a candidate bug in the D42 code (the fix-access flow after the auto-complete
  change). It gets **investigated for a bug**, not updated.

Same red suite, two different responses. The triage question is what separates
them. A session that "fixed" all the reds by updating every test would have
*updated away* the real bug in test 2 — shipped a broken fix-access flow with a
green suite. That is the corrupted measure the rule exists to prevent.

## The Corrupted Measure in Regression Fixing

The seam rule's corrupted measure is "a green that skips the seam." Regression
fixing has its own, with two faces:

1. **Weakening a real bug into a pass.** The red was an *unexpected* regression —
   a bug you introduced. You "fix" it by loosening the assertion (broaden the
   timeout, drop the specific check, assert less) instead of fixing the code. The
   test goes green. The bug ships. The test is now a corrupted measure — it no
   longer proves what it was named for.

2. **Updating to a phantom intent.** The red was an *expected* regression — the
   old behavior is gone. You update the test, but to an assertion that isn't
   actually the new intent (you misread what you changed, or you assert the new
   flow *looks* right without asserting the new *invariant*). The test goes green.
   It now measures a target that doesn't exist.

Both faces have the same guard: **the KB is the oracle.** An updated test's new
assertion must point at a line in the new KB. A "fixed" unexpected regression must
be a code change, verified by the *original* assertion still holding. If you
can't point at the KB, you're guessing — and a guessed regression fix is how
corrupted measures are born.

## Expected Regression vs. Test Rot

[Testing](./testing.md) names **test rot**: a test that hits a removed endpoint or
a stale payload, testing a ghost. The difference is *intention and anticipation*.

- **Test rot** is the target moving *without you noticing* — someone renamed the
  endpoint, the API drifted, and the test kept knocking on the old door. It is
  accidental. You find it as a surprise red.
- **An expected regression** is *you* moving the target, *knowing* the tests that
  encoded it will fail, and *planning* for it. It is intentional. You predict it
  before you push.

The discipline this doc adds is the anticipation: when you make an intentional
change, **predict which tests will regress** (the ones that assert the old
behavior) and put updating them in the plan *before* you push, not as a surprise
cleanup after. A change that moves the target and doesn't list the tests it
orphaned is a change that hasn't been scoped.

## What This Means for the Theory

The main theory's compare phase says "run the tests, read the signal." This doc
adds: **after an intentional change, the signal is a list of reds, and the first
move is triage, not fixing. Every red is either the target moving (update the
test) or a bug you broke (fix the code). The triage question — "did I mean to
change what this asserts?" — is answered against the KB.**

The main theory's repair phase says "fix in hierarchy: KB, code, logs, changelog."
This doc adds a step to the code/KB layer: **a regressed test is re-aligned to the
KB (expected) or a signal that the code repair is incomplete (unexpected). The
repair isn't done when the suite is green — it's done when every red has been
triaged and the green is from a fixed system, not from weakened tests.**

The main theory's trust rule says "the changelog must never claim coverage the
code does not have." This doc adds: **the changelog must never claim a green that
is from updated tests while a real bug sits in an un-triaged red. "Fixed the
failing tests" is a false line if some of those tests were catching a bug you
then updated away.**

All of it comes from the same root as the rest of the theory: the LLM is shy
about scope and over-eager about green. It sees a red and reaches for the fastest
way to make it green — loosen the test. The process has to force the slower move:
*ask what the red means before you touch it.* The KB is the oracle. The triage
question is the gate. A green you earned by triaging is the one the operator can
sleep on.