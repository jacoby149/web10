# The Design-Intent Gate — the maintains-product-functionality review

[← back to AI Security Theory](../README.md)

The security method answers **"is it safe?"** — the invariants, the repro gate,
the convergence review. This doc answers the other half of the question:
**"does it still work as intended?"** A security change can close a real hole
and still break the product — by over-securing, by applying a conventional
standard that this project deliberately does not follow, or by quietly changing
a behavior the KB says is by design. The test suite catches the first kind only
when the intended behavior happens to be pinned by a test; it cannot catch a
change that is *consistent with every test* and *inconsistent with the design*.

> **The one assumption:** *a security fix is not done when the exploit is
> denied — it is done when the exploit is denied **and** the app still behaves
> like the product the KB describes, not like a generic hardened service.*

This is the **maintains-product-functionality review**: a short, forced
brainstorm that runs *on top of* the existing security review (the repro gate,
the convergence review) — not a replacement for it. The repro gate proves the
hole is closed; this gate proves the fix didn't move the goalposts.

## Why this is a separate gate (and not just "the orient")

The [orient](../the-orient/README.md) already reads the learnings KB and checks
recession — but it is aimed at *security knowledge*: the invariants, the
findings, the considered-and-declined list. It does not ask the product
question: *what is this code supposed to do for a user, and does this change
preserve that?* The invariants (I1–I6) are C+I guarantees; they say nothing
about the creator platform, the 100% delivery promise, the PWA, the
readable-node model, or the telemetry line. A change can satisfy every
invariant and still break the product. This gate is the missing second lens.

It is also the answer to **"we are doing different, not standard."** web10
deliberately violates conventional security norms (node-readable by design, no
default e2e, token in the body, no HttpOnly, heavy telemetry). A scanner or
reviewer trained on conventional standards will flag those as vulns. The gate
forces the distinction to be made *explicitly, in writing, per PR*: is this a
real break, or a by-design deviation from a standard we chose not to follow?

## When it runs

- **Every trust-boundary PR** (the same scope as the [per-PR
  gate](../the-gauntlet/README.md): auth, tokens, the I3 read gate, federation,
  the SDK's credential surface, the query engine, the render choke point).
- **Any security fix PR** (an exploit-first fix, even one that doesn't touch a
  trust boundary — a log redaction, an origin check, a rate limit).
- **Any PR that changes a by-design behavior** (the considered-and-declined
  list in the learnings KB is the reference: e2e, token transport, cookie
  flags, telemetry, the readable node).

It does **not** run on non-security, non-trust-boundary feature PRs — those are
covered by the normal review + the test suite. The gate is scoped to the
changes most likely to over-secure.

## The five questions (the review)

The reviewer (a fresh agent or a human — same rule as the convergence review:
the author does not review their own fix) answers all five, in writing, in the
PR. "N/A" is a valid answer to a question, but only with a one-line reason.
Skipping a question is a review rejection.

### 1. What was this code supposed to do? (the intent)

Not "what does it do now" — *what was it for?* Read the KB before answering:

- `knowledge-base/strategy/thesis.md` — the product spine (data policy, not
  privacy; the creator owns the audience).
- `knowledge-base/strategy/decisions.md` — the D-numbers that bound the area.
- `knowledge-base/security/learnings.md` — the considered-and-declined list
  (what we decided *not* to do) and the invariants as they've evolved.
- The feature's own KB doc (e.g. `web10-v3/social/…`, `web10-v3/auth/…`).

The answer is 2–4 sentences: the user-facing or app-facing behavior this code
exists to provide. If the answer requires inventing intent that isn't in the KB,
that is itself a finding — the KB is missing the intent, and the fix is to
write it down (the KB is the root of trust; an unrecorded intent is a
corrupted measure).

### 2. What exactly does this change alter? (the delta)

The behavioral delta, not the code delta. "Added an origin check" is a code
delta. "A token delivered from a non-authenticator origin is now dropped, so an
app embedded in a third-party page can no longer receive the token" is a
behavioral delta. For each behavioral change, name the **actor** it affects
(the creator, the fan, the app, the node operator, the federated node) and the
**flow** it touches (auth, feed, media, billing, import, …).

The tell of an over-secure fix: the delta is bigger than the finding. The
finding was "origin not checked on `postMessage`"; a fix that also starts
validating the token's `target` claim against a hardcoded allowlist has a delta
the finding never asked for. Every extra delta needs its own justification —
or it gets cut.

### 3. Does this contradict a by-design decision? (the conflict check)

Check the delta against the **considered-and-declined list** in the learnings
KB and the D-numbers in `decisions.md`. The known by-design deviations from
conventional security (the ones a conventional reviewer will flag):

| By-design choice | The conventional standard it violates | The decision |
|---|---|---|
| The node reads content (discovery, search, auditability) | "the server should be blind to user data" / e2e-by-default | D41 |
| No default e2e encryption | "encrypt everything by default" | D41 |
| Token in the request body, not a header | "credentials in headers" | by design (CORS defense) |
| Cookie is not HttpOnly | "HttpOnly on every auth cookie" | by design (the SDK must read it) |
| GA4 + Hotjar on every surface | "minimal telemetry" / privacy-by-default | D56 |
| PWA, not a native app | "native app for a product this serious" | D41 |

If the delta contradicts one of these: **stop.** The PR is not a security fix —
it is a proposal to reverse a decision. It needs (a) an explicit operator
decision recorded in `decisions.md` as a new D-number (reversing the old one),
or (b) the delta cut. A security PR that silently reverses D41 or D56 is a
review rejection, even if every test is green.

If the delta does *not* contradict a by-design decision but *does* violate a
conventional standard in some other way, say so explicitly (question 4) — the
point is that the deviation is a **decision**, visible and dated, not an
accident.

### 4. Which conventional standard are we violating, and is that intentional?

The inverse of question 3: even when there is no by-design conflict, name the
conventional standard the change deviates from (if any) and state the intent.
Two valid answers:

- **"Intentional — this is how web10 works."** Cite the KB (a D-number, a
  thesis line, a learnings entry). The deviation is recorded; a future scanner
  reading the learnings won't re-raise it.
- **"Not covered — needs a decision."** The KB is silent on this deviation.
  The PR either parks the deviation (reverts to the conventional behavior) or
  files the question as a decision item. A silent deviation is the failure
  mode this gate exists to kill: the code drifts from the standard without
  anyone having decided to.

This is what makes "we are doing different, not standard" *auditable*: every
deviation is either cited or decided, and the learnings KB accumulates them so
the next orient (and the next scanner) starts knowing which standards this
project does not follow and why.

### 5. What could break that the tests won't catch? (the intent risk)

The brainstorm. The reviewer lists the behaviors this change could degrade that
are **not pinned by a test** — the UX flows, the creator/fan expectations, the
PWA constraints, the node-readable model, the telemetry line, the app-contract
expectations. For each, one of:

- **Pin it** — add the test (the use-theory's anti-test: the KB statement made
  executable), or
- **Accept it** — state why the risk is acceptable and record the acceptance in
  the learnings KB (a dated note, the same shape as a failed-exploit negative:
  "on `<date>`, `<change>` could degrade `<behavior>`; accepted because
  `<reason>`; revisit when `<condition>`").

An empty answer here is allowed only when the reviewer can say, specifically,
*why* there is no untested intent risk — not "looks fine." This is the
anti-sycophancy rule applied to the product lens: the reviewer has to *try* to
find the untested break, and the attempt (and its result) is the evidence.

## The output (the PR block)

The review lands as a fixed block in the PR description. The [per-PR
gate](../the-gauntlet/README.md) checks for its presence on trust-boundary PRs
(the same way it checks for the repro test and the security record row):

```text
DESIGN-INTENT REVIEW
- Intended behavior: <2–4 sentences, from the KB>
- Changed behavior: <the behavioral delta, per actor + flow>
- By-design conflict? <no | yes → D-number / decision filed>
- Conventional standard violated intentionally? <no | yes → cited | not covered → decision filed>
- Tests cover the delta? <yes | no → what's pinned now>
- Untested intent risk: <none (and why) | list, each pinned or accepted>
- KB write-back: <learnings entry appended? decisions entry added?>
```

A trust-boundary PR without the block is a review rejection — the same
enforcement shape as "no repro test, no merge."

## The write-back (what makes the next review smarter)

Same loop as the [orient's write-back](../the-orient/README.md): the review is
not a one-off. When the PR lands:

- A **new by-design deviation** (question 4, "intentional") is appended to the
  considered-and-declined list in the learnings KB, with the D-number or the
  reasoning — so the next orient and the next scanner know the standard is
  deliberately not followed.
- An **accepted intent risk** (question 5) is recorded as a dated note — the
  same shape as a failed-exploit negative: what it looked like, why it was
  accepted, and the condition that would re-open it. When a later change
  removes that condition, the orient's recession prompt catches it.
- A **missing intent** (question 1, the KB didn't say what the code is for)
  gets its KB entry written — the root of trust fills in.
- A **reversed decision** (question 3, "yes") is a new D-number in
  `decisions.md` that explicitly supersedes the old one. The old decision is
  not deleted — it is marked reversed, with the date and the new D-number.

## What this gate is NOT

- **Not a substitute for the repro gate.** The repro gate proves the hole is
  closed; this gate proves the fix didn't move the goalposts. Both are
  required. A PR with a green repro gate and no design-intent review is
  half-done — the same way a PR with the review but no repro test is half-done.
- **Not a product review of the feature itself.** It does not judge whether
  the feature is good product — it judges whether the *security change*
  preserves the feature's intent. Feature judgment is the normal review's job.
- **Not a conventional-standard compliance check.** It does not push the code
  *toward* the standard. Its job is the opposite: to make sure a deviation from
  the standard is a **decision**, not an accident. A project that "passes"
  this gate by conforming to every conventional standard may have just broken
  its own product.
- **Not an oracle.** Like the convergence review, it is bounded, evidenced
  uncertainty: "a fresh reviewer checked the change against the KB's intent,
  answered the five questions, and the result is in the PR." The KB is the
  oracle's stand-in — and the KB is only as good as its alignment with the
  code, which is the use-theory's job to keep.

## How it fits the method

| The method says | This gate adds |
|---|---|
| The repro gate: the exploit is replayed and denied | The intent is replayed against the KB and preserved |
| The convergence review: three dry passes by a fresh reviewer | The design-intent review: a fresh reviewer answers the five questions |
| The orient reads the learnings before scanning | The gate writes back to the learnings after fixing |
| The security record records coverage | The PR block records the intent check, per PR |
| The considered-and-declined list stops re-raising decided questions | The gate feeds it — every intentional deviation lands there |

The security record records *coverage*; the learnings record *knowledge*; this
gate is where the two meet the **product** — the third thing a security change
can break, the one neither the invariants nor the test suite names.