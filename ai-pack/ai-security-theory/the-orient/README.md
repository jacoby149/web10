# The Orient — security Phase 1 (before you scan)

[← back to AI Security Theory](../README.md)

The use-theory's Phase 1 is *orient* — load the KB, check it against the code,
repair the mismatch *before* spending tokens on the fix. Security has the same
phase, and it is the part that makes the theory a *method* instead of a *procedure*.
**You do not start by scanning. You start by reading what is already known, and
letting it tell you where to look and what you might be missing.**

The security KB — the **learnings** record (for web10,
`knowledge-base/security/learnings.md`) — is the root of trust for security
*knowledge*: the invariants as they've evolved, every finding→fix as a dated
learning, the known gaps, and the "considered and declined" list. (The **ledger**
is a different root of trust — it records *coverage*, what was scanned and when.
The learnings record *knowledge*, what we've figured out.)

## The three prompts (run them, in order, before the first scan)

### 1. Onboarding — what has been considered security-wide?

Read the learnings record. The question: *what does this project already know about
its own security?* You are not re-deriving the threat model from scratch — you are
standing on every scan, every fix, and every decision that came before. This is
what makes a new agent (or you, six months later) productive on day one: the
terrain is already mapped.

### 2. Recession — did any of these recede?

The learnings record is a list of things that were *considered and handled*. The
question: *has any of them quietly become vulnerable again?* Two kinds of recession:

- **Code recession** — a previously-fixed vuln regressed. The **pinning tests**
  catch this mechanically (a red pinning test = a receded fix).
- **Conceptual recession** — the code is unchanged, but the *consideration* eroded.
  "We used to treat X as a threat; do we still?" (A feature got added that
  re-opens a path we'd closed. An assumption we'd documented is no longer true.)
  The pinning tests can't catch this — only the orient can, by comparing "what we
  decided to guarantee" against "what the code does now."

Recession is the security analog of the use-theory's "the target moved" — the
invariant is the same, but the code drifted away from it.

### 3. The obvious gap — are we not considering something serious?

This is the most valuable prompt and the hardest to fake. The invariants are a
**closed list** (I1–I6). The gap is the space between *what we've decided to
guarantee* and *what could actually go wrong.* The method is **assumption
enumeration**, not a vague "any gaps?":

> For each invariant, **enumerate the assumptions it depends on.** Then ask:
> *which assumption, if false, breaks the invariant?* The gap is a **broken
> assumption** — and those are enumerable.

Worked examples:

- **I1** (verify the issuer) *assumes* a trusted key source. Assumption false →
  the federation key model (HS256 shared key) → that was the real gap (D7).
- **I3** (no cross-user read) *assumes* every read path goes through the gate.
  Assumption false → a read path that bypasses the gate → the crown-jewel break.
- **I5** (scoped, expiring, revocable) *assumes* tokens are always verified.
  Assumption false → an unsigned decode on an auth path (B-3).

And the gap can be a **whole missing class**, not just a broken assumption. The
invariants I1–I6 are all *confidentiality + integrity* of the **node's own code and
data** — but they assume the **dependencies are trustworthy**. A compromised
`react-markdown`, a malicious transitive dependency, a poisoned lockfile — that is a
C+I break the invariants don't name. That is the shape of a class-level gap: not
"one assumption is false," but "there is a whole category of threat the closed list
doesn't even consider." (Note what is *not* a security gap: **availability / DoS** —
unbounded query, fan-out, upload, ReDoS. That is *reliability*, a different
discipline. It is out of scope for the security invariants, not a hole in them. If
DoS ever becomes a real concern it is its own track, not an invariant to add.)

The gap prompt's output is either a new **BP-n** (a threat we weren't considering)
or a confirmation that the closed list is still closed. Either way, it is *recorded
in the learnings* — so the next orient starts smarter.

## The write-back (what makes the next orient smarter)

This is the piece that makes the theory *lean on the KB* the way the use-theory
does. **Every result writes back to the learnings record** — a fix *and* a failed
exploit. When a fix PR lands:

- the finding + the fix is appended as a **dated learning** ("on `<date>`,
  `<unit>` had `<vuln>`; fixed by `<change>`; pinned by `<test>`"),
- if the fix revealed a **new assumption** or a **new threat class**, the
  invariants / checklist are updated,
- if the fix **retires** a concern, it moves to the **considered-and-declined** list
  (so the next orient doesn't re-raise a decided question).

**A failed exploit writes back too — as a *negative* learning.** When the scanner
suspects a vuln, builds the exploit, and **it fails**, that is a **confirmed
non-vulnerability**, not a discarded false positive. It is recorded as: "on
`<date>`, `<unit>` looked like `<vuln>`; exploit attempted; **failed** because
`<reason>`; **confirmed not vulnerable** (as of `<commit>`)." Two things fall out:

- **It is the anti-sycophancy check in the other direction.** The scanner can't wave
  things away ("looks fine") *or* claim things ("looks vulnerable") — it has to
  *try*, and the result is the evidence either way. A suspicion with no attempted
  exploit is noise; a suspicion with a failed exploit is a *learning*.
- **It is the recession early-warning.** A negative says "this was safe *because
  of* `<reason>`." If a later change removes that reason, the negative is stale —
  and that is exactly the conceptual recession prompt 2 catches. So the learnings
  map is not just "what's vulnerable," it is **"what we've proven safe, and why."**

The learnings record is therefore *not* a static doc — it is the **accumulated
memory of every security decision, positive and negative**, and it is what the
orient reads. Scan → (fix *or* failed exploit) → write-back → next orient is
smarter. That loop is the security version of the use-theory's "the KB is the root
of trust, keep it aligned."

## Why orient-first (and not scan-first)

Scanning first is the 1157/1159 failure in miniature: you claw at the surface
without knowing what's already been handled, so you re-find known things, miss the
recessions, and never ask "what class are we not even looking for?" Orient-first
inverts that: you read the map, you check the map against the code (recession),
you find the edge of the map (the gap), and *then* you scan — aimed, not blind. The
scan is cheaper and the coverage is more honest, because the ledger rows you write
are *informed* by what the learnings already say.
