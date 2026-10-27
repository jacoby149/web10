# Evaluation Plan — web10 Paper

*The load-bearing wall. Reviewers reject papers without evaluation, and an
independent author's only defense against "is this a toy?" is real production
numbers. This file lists the exact metrics to pull from the running system.*

**Critical path note:** if we do not already have these numbers, collecting
them is the FIRST task, not the last. Instrument now, draft later. A multi-week
data-collection effort must finish before the draft is frozen.

---

## 0. Do we have the data yet? (answer first)

- [ ] Access-decision latency: already logged, or must we instrument?
- [ ] Scale counters (users/collections/docs): queryable today?
- [ ] Cost data: do we have cloud bills broken down per component?
- [ ] Baseline: is there a conventional-backend version of the social app to
      compare against, or must we build one?

*If any of these are "no," that's a dated engineering task that starts before
any drafting.*

---

## 1. Scale (prove it's real)

Report honest production numbers:
- [ ] Number of users (registered / active)
- [ ] Number of user collections
- [ ] Total documents stored
- [ ] Access decisions per day (the volume of authorization work)
- [ ] Media/blob volume if relevant
- [ ] Uptime / deployment duration (how long it's been running)

*These are the "it's not a toy" numbers. Even modest ones beat a simulation.*

---

## 2. Access-control decision latency (the claim's core metric)

The claim is about the access model, so its performance is the headline:
- [ ] p50 / p95 / p99 latency of an access decision (token verify + contract
      check + group membership check)
- [ ] Latency breakdown: signature verify vs. contract lookup vs. group
      membership lookup (which part costs what)
- [ ] Throughput: access decisions / sec sustained
- [ ] Latency under load (the curve, not a single point)
- [ ] Comparison: access-decision overhead vs. the underlying data read
      (is authz the bottleneck or negligible?)

*This is the number a DB/security reviewer will stare at. Make it good.*

---

## 3. Cost model (per-user-collection vs. shared table)

The architecture choice (collection per user) has a cost story. Tell it:
- [ ] Cost per user / per collection at current scale
- [ ] Cost curve: how does total cost grow as users grow (linear? superlinear?)
- [ ] Comparison to a baseline: the same data in a single shared table with
      row-level authorization — what would it cost?
- [ ] Storage overhead of the per-collection model (duplication of indexes,
      metadata, etc.)
- [ ] The tradeoff made explicit: what we give up (cost/overhead) to get
      (isolation, ownership, clean authz boundaries)

*This is where the "why not just a shared table with RLS?" question gets
answered with numbers instead of vibes.*

---

## 4. The social app on web10 vs. a conventional backend (case study)

web10-social is the proof the model supports a real, demanding app:
- [ ] End-to-end latency for key user flows (load feed, post, DM, group read)
      on web10
- [ ] The same flows on a conventional shared-DB social backend (the baseline)
- [ ] Where web10 wins, where it loses, and why
- [ ] Any capability the conventional backend *can't* express that web10 can
      (e.g. a fine-grained group/role contract that has no RLS equivalent)

*This is the "motivating app pays off" section. It's what makes the access
model concrete.*

---

## 5. Correctness / security conformance (the invariants hold)

web10 has security invariants (I1–I6 in the KB) enforced by a conformance /
permission test suite. Report:
- [ ] The permission-matrix suite: how many cases, all passing
- [ ] The specific invariant that no query returns documents for an
      author_key the token doesn't own (I3) — how it's tested
- [ ] Any negative tests: the exploit replayed and denied (the repro-gate
      pattern from the security KB)
- [ ] Revocability: a revoked token/contract is denied within what bound?

*This converts "we think it's secure" into "here is the test suite that
proves the invariants hold."*

---

## 6. Methodology (how we measured — reviewers will ask)

- [ ] Hardware / cloud instance specs
- [ ] Workload description (real traffic vs. replayed vs. synthetic — be
      honest about which)
- [ ] How many runs, how we report variance
- [ ] What we did NOT measure (limitations section honesty)

---

## The evaluation's one-paragraph promise (for the abstract/intro)

> We evaluate web10 in production: [N] users, [N] collections, [N] documents,
> [N] access decisions/day. Access decisions complete in [X]ms at p99 with a
> [Y]% overhead over the underlying read. The per-user-collection model costs
> [Z] more than a shared-table baseline but provides [isolation/ownership]
> guarantees the baseline cannot express. The permission-matrix conformance
> suite ([N] cases) passes, including replayed-exploit denial.

*Fill the brackets from the numbers above. If a bracket can't be filled, that
metric is on the critical path.*
