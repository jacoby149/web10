# Refutations: AI Use Theory

The strongest objections to the theory, and how it stands against them. A theory
that can't survive its own refutations is a slogan. This is the stress test: each
entry is a real objection, the answer, and the verdict — **Revised** (the theory
changed) or **Holds** (the theory stood, often sharpened). When a refutation wins,
[`ai-use-theory.md`](./ai-use-theory.md) changes and this entry records why. New refutations are appended
here as they get settled.

[← back to README](./README.md)

---

## R1. The pyramid ordering is arbitrary — stack modernization doesn't belong

**Objection.** The pyramid put "modernize the stack" at Step 3, behind logging.
But stack modernization is a pure translation task — the LLM's best job, lowest
risk. If you're going to rewrite 2021 React into 2026 TypeScript, adding dense
logs to the *old* code first is work you then throw away. And not every codebase
needs modernizing at all. A step that's optional and sometimes-wrong doesn't
belong in the foundation.

**Answer.** Conceded. Stack modernization is a translation task (it fits the
LLM's strength) but it is **opportunistic, not foundational**. You do it when a
codebase actually needs it, not as a gate every build must pass through. Logging
code you're about to rewrite is wasted signal.

**Verdict: Revised.** Stack modernization is removed from the pyramid. The
pyramid is now four steps: **knowledge base → Logs → Tests → Features.** Modernization
survives as a note — a translation task you take on when it's actually needed,
not a step of the foundation.

---

## R2. "LLMs can't debug" is too binary

**Objection.** The headline framing — "give it open-ended debugging and it
destroys" — oversells a clean split. The evidence undercuts it: with tests and
logs, LLMs debug well (TDFlow hits 88.8% on SWE-Bench Lite). So the real claim
isn't "LLMs can't debug."

**Answer.** Agreed. The precise claim is: **LLMs can't debug *without signal*.**
The pyramid does not make the LLM a better debugger. It **converts debugging from
an open-ended reasoning task** — where the LLM overtries and burns tokens —
**into a signal-grounded verification task** — where it reads the break from the
logs, fixes it once, and a test confirms it. The LLM still does the fixing; the
pyramid removes the guessing. A second, related trait does the explaining: the
LLM is **shy about signal**. Left to itself it writes minimal logs and sleek
abstractions, then speculatively debugs the code it just made opaque. It will not
instrument its own code or write the tests that catch its own mistakes unless a
process forces it. That is why the pyramid is a *directed plan* (AGENTS.md,
prompts, review gates), not a suggestion the LLM would choose on its own.

**Verdict: Holds, sharpened.** The thesis is restated as "convert debugging into
a verification task," and the "shy about signal" trait is added as the reason the
plan must be imposed rather than left to the model.

---

## R3. The cost numbers have false precision

**Objection.** "$125", "easily exceeds $200", "150 loops/hour" — the figures are
presented with more certainty than they deserve, and they didn't quite agree with
each other ($10/hr in one place, $12/hr in another).

**Answer.** Handwavy is fine **as long as it's consistent.** The numbers are now
standardized on ~$10/hour/thread and ~$125 for five threads stuck 2.5 hours. The
argument never rested on the absolute dollar figure — it rests on the **ratio**:
with the pyramid the same debug drops to $5–$10, a 10–20x difference. The order
of magnitude is the point, not the cents.

**Verdict: Holds, made consistent.** Figures standardized across the doc; the case
is the ratio, not the total.

---

## R4. "Perfect knowledge base first" is dogmatic, especially for greenfield

**Objection.** "Write a perfect knowledge base before any code" is impractical for a new
project. It reads as a high bar you must clear before you're allowed to build.

**Answer.** The knowledge base is an **asset**, not just a debug aid — and its prime purpose
is the same reason every company keeps one for human employees: **onboarding.**
It is a textual map of what the code is supposed to do and where everything
lives. An LLM with no context is the exact metaphor for a new hire with no
context; the only difference is the LLM onboards in seconds instead of weeks.
That makes the knowledge base a double-purpose object: a shareable resource you can send to
people and pitch with, *and* the signal that makes the next debug cheap. Even
greenfield it pays off immediately — you are writing the codeplan as you go, and
the LLM reads it back before it builds. Building the knowledge base first is not dogmatic;
it is the cheapest way to make every later session start oriented instead of
guessing.

**Verdict: Holds, strengthened.** The knowledge base step now leads with the
onboarding-asset framing rather than "perfect it or the AI guesses."

---

## R5. No stopping rule — "max the logs" is infinite

**Objection.** "Perfect the knowledge base", "max the logs", "tests for everything" are all
superlative and infinite. There's no "good enough" bar, so Steps 1–3 can defer
Step 4 (the product) forever — boiling the ocean.

**Answer.** The stopping rule is not a fixed bar and not "saturate the whole
repo." It is: **log the contact surfaces, and add them incrementally as you
work.** You don't pre-decide "enough"; you add seam logs per-spot as you're in
that area, and the saturation happens organically where debugging actually
happens. This is bounded (there are a finite number of system boundaries) and it
defers nothing — you build the feature and log its seams in the same pass.

**Verdict: Revised.** "Max the logs everywhere" is replaced by "log the seams,
incrementally." The contact-surface focus is both the stopping rule (bounded)
and the anti-flooding guardrail (see R8).

---

## R6. No amortization horizon — the setup cost is invisible

**Objection.** Building dense logs + full tests + a real knowledge base costs time and tokens
up front. The pyramid only pays off on a long-lived, frequently-debugged
codebase. A 2-week spike never recoups. The theory reads as universally free.

**Answer.** Partially conceded. **Incremental seam-logging** (R5) removes most
of the upfront log cost — you pay for logs as you debug each area, not in a big
pre-build push. The main remaining upfront cost is the **knowledge base conversation** (R10),
which is a one-time human investment that pays off on every future session
(onboarding) and every future debug (signal). The theory should state the
precondition plainly: the pyramid amortizes over repeated debugging of a living
codebase; for throwaway code it's overkill.

**Verdict: Holds, with the precondition stated.** Incremental logging amortizes
the log cost; the knowledge base is the real upfront investment and it doubles as an
onboarding asset.

---

## R7. The real axis is verifiability, not translation-vs-debugging

**Objection.** The actual discriminator in the evidence is *does a cheap oracle
exist* (compiler, type-checker, failing test, linter) — not whether the task is
"translation" or "debugging." A translation task with no oracle doom-loops like
debugging; a debugging task with a great oracle is trivial.

**Answer.** Agreed, and the contact-surface insight (R5) is its concrete form:
**a system seam is exactly where there is no cheap oracle** — the AI can read
both sides but cannot see what crossed the wire. So the pyramid's real job is to
*install oracles* (tests) and *oracles' oracles* (seam logs that tell you which
test to run and what the boundary actually did). "Translation vs debugging" is a
useful proxy; "has a cheap oracle vs doesn't" is the real variable.

**Verdict: Holds, sharpened.** The thesis gains a more general framing: the
pyramid installs oracles where they're missing, and the seams are where they're
most missing.

---

## R8. Each layer has a failure mode that makes debugging more expensive

**Objection.** knowledge base/logs/tests aren't pure upside: log flooding (AI drowns in
signal), test-weakening (AI deletes a brittle test), stale knowledge base (AI builds to the
wrong spec *confidently*). All-upside is the tell of a slogan.

**Answer.** The failure modes are real, but they are the **price of making debugging converge**, and that's the point. Pre-AI, a bug could spin a human
for weeks with no guarantee it would ever end. The pyramid's deepest value is
not "cheap" — it's that **debugging converges**: the knowledge base is the target, the tests are the
measurable distance to done, and the logs are the direction, so a capable model
makes forward progress toward the intention and reaches the fix. The only way it
fails to converge is a corrupted measure (a stale knowledge base is the wrong target, a
weakened test is a fake altitude) — a signal-integrity failure, and exactly what
the guardrails prevent. Thoroughness is a ratchet toward clarity. Each failure mode has a
guardrail (seam-scoped logs prevent flooding — R5; a review gate stops
test-weakening; the knowledge base is human-owned so it can't silently drift into
confident-wrong — R10). The net is strongly positive because convergence is
exactly what was missing.

**Verdict: Holds, reframed.** The product is *convergence*, not just
cost savings. Failure modes are the bounded price; each has a guardrail.

---

## R9. The signal decays — one-time setup but it rots

**Objection.** Logs go stale, tests drift, the knowledge base falls behind the code. "Build
from the bottom up" reads like a one-time pour of concrete, but the real cost is
maintenance. A stale knowledge base is worse than no knowledge base.

**Answer.** Conceded that decay is real — but **seam logs are the most
staleness-robust signal you can buy.** The durable part of a contact-surface log
is not the payload (which changes) but the **sequence of communications** (A
called B, B returned, A called C) — and that sequence is stable long after the
details rot. So the highest-value logs are also the slowest to go stale.
Maintenance still matters (the knowledge base especially), but the theory's core signal is
more decay-resistant than "logs rot" implies.

**Verdict: Holds, with a robustness note.** Seam logs decay slowest because
their load-bearing content is the communication sequence, not the payload.

---

## R10. The knowledge base cold-start is circular

**Objection.** "The AI can't write knowledge it doesn't understand" — but it
doesn't understand it *because* there's no knowledge base yet. The clean "human writes the
knowledge base" split undersells the real workflow, and the first knowledge base (no AI help) is the
hardest part.

**Answer.** The knowledge base is **co-authored, and the human is always in the loop.** The
human operator supplies *intent* through interactive conversation (what the code
is supposed to do) — this is the part the AI genuinely cannot do for itself. The
AI supplies the *reading*: it reads the code and the docs that already exist in
the codebase and drafts the knowledge base from both. Neither alone is enough: the human has
the intent but not the time to read every file; the AI has the reading but not
the intent. The conversation is the oracle for intent; the code + existing docs
are the oracle for current state. That breaks the circle — the AI never has to
invent intent, it has to read and draft, which is a translation task (its
strength).

**Verdict: Resolved.** The knowledge base model is now explicit: human conversation (always)
+ AI reading of code and existing docs. The cold start is a translation task,
not an invention task.

---

## R11. The knowledge base needs the human always — but the agents run in parallel

**Objection.** Step 1 says the knowledge base requires interactive human conversation *always*.
This repo runs ~5 autonomous Qwen workspaces. You can't have 5 parallel agents
each blocked on the operator for intent, and nothing says how the knowledge base stays
consistent when two branches both touch it. The theory is written single-threaded
but deployed multi-threaded.

**Answer.** The resolution is to name the one assumption the whole method rests
on: **the knowledge base is correct.** The knowledge base is the root of trust — every other signal
(tests, logs, changelog) is a check *against* it, and the knowledge base is checked only
against the operator's intent, which has no higher oracle. So the human is present
at the **base** (the knowledge base) once, not in every agent's path: the operator verifies
the knowledge base, and the parallel agents consume that verified knowledge base and work autonomously
above it. The human does not scale with agent count — the knowledge base does. The AI reduces
(not removes) the assumption: it drafts the knowledge base, flags internal contradictions,
and flags knowledge-base↔code↔changelog drift, so the operator reviews a scrutinized draft.
The irreducible limit: if the operator's intent is wrong or the knowledge base goes
unreviewed, the error propagates and no downstream signal catches it — a descent
toward a mis-specified target still converges, to the wrong place. That is the
theory's stated boundary, not a bug.

**Verdict: Resolved.** The knowledge base is the single root of trust; the human verifies it
once at the base; agents consume it in parallel; the AI scrutinizes it to reduce
error probability. The one stated assumption — "the knowledge base is correct" — is
irreducible because intent has no higher oracle.

---

## R12. The parallelism problem is sidestepped, not solved

**Objection.** The cost problem is "5 threads on one bug = $125." The pyramid's
answer is "one thread, one loop, done" — i.e. don't run 5 threads. True but
shallow. The real question is why 5 were run at all.

**Answer.** The 5-threads scenario is a *redundancy* failure, not a parallelism
failure: five threads on the same problem is five redundant attempts at one
convergence. Without a gradient they all flail; with a gradient one suffices and
the other four are waste that also collides. The productive use of parallelism is
the opposite — **N threads on N independent problems** (independent spaces, no
shared seams, each with its own knowledge base target / test altitude / log gradient). Each
converges on its own, so ten independent threads give ten times the real
throughput. Parallelize breadth, not depth. This is the lane model: parallelism
is spent across lanes, never within one.

**Verdict: Resolved.** The pyramid's answer to "5 threads on one bug" is not "use
1" as a rule but a consequence: a real gradient makes a single thread converge,
so parallelism is redirected to independent problems where it multiplies
throughput instead of burning it on redundancy.

---

## Proposed mechanism (not a refutation)

**`[llm-debug]` log level.** A dedicated prefix/level for signal added
*specifically* to make code AI-debuggable — distinct from user/ops logs so it is
(a) trivially filterable during diagnosis, (b) self-documenting about why the
line exists, and (c) toggleable as a class. Captured in `ai-use-theory.md`
Step 2 as a proposal; the exact mechanism (log level vs. prefix vs. build flag)
is still open.
