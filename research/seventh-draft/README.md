# Draft v7 — Your Data, Your Rules, One Query

This is Jacob Hoffman's named working manuscript, with **Independent** as the
sole affiliation. [Open the built PDF](main.pdf). [Draft v6](../sixth-draft/main.tex)
remains untouched. From the repository root, rebuild with
`tectonic research/seventh-draft/main.tex`. The working manuscript is not a
double-anonymous submission artifact.

## Drafting checks

- **Peak rate.** The bounded lookup checked [van Mierlo (2014)](https://www.jmir.org/2014/2/e33),
  the realism contract's governing authorship study. It measures posting
  concentration, not intraday read traffic. It neither supplies nor contradicts a
  read-traffic peak multiplier. The paper uses a parameterized budget with an
  operator-assumed example at 15 reads/s, not a sourced traffic measurement.
- **CPU.** The SHA-256-verified PR #1618 state archive contains 75 captured
  native statements in `pin-index/cells/all-fixes-uniform-K20/measured.json`.
  Their `query_duration_ms` totals 1,332; neither those rows nor the associated
  request-tagged export contains CPU counters. The separately verified stopped
  query-log parts declare a `ProfileEvents` map, but matched CPU values were not
  extracted from the binary parts. The draft therefore omits a quantitative
  CPU verdict. It does not use summed native duration as CPU time or as an
  upper bound on multithreaded CPU time.
- **Storage budget.** The separately referenced
  `task-block-paper-storage-bandwidth-budget.md` was not supplied and is not
  present in the worktree. The draft uses the [banked findings](../experiments/costfn/HYBRID-K20-FINDINGS.md)
  and [preflight envelope](../experiments/costfn/HYBRID-K20-PREFLIGHT.md) for the
  worked example. The full-store projection is arithmetic on logical bytes;
  it cannot establish a physical disk-budget pass. Reconcile any additional
  requirements from the companion block when available.
- **Evidence scope.** The D117 draft uses the exact receipt examples and rejection
  rule rather than treating “30× to 220×” as a range spanning the separate
  fat-payload control. The hybrid's generation fence is an application-side
  investigation target, not a separately timed cause of the entire wall-time
  increase. Both scope decisions leave the original findings intact.

## Venue and submission gates

The [official SIGMOD 2028 research call](https://2028.sigmod.org/calls_papers_sigmod_research.shtml)
confirms Round 1: **January 10, 2027** for the abstract and conflict declarations,
and **January 17, 2027** for the paper, both **11:59 PM AoE**. It allows 12 pages
excluding references and a separate review-only appendix for essential details.
The call also requires double anonymity, public ORCID, CMT registration, and an
institutional CMT address or a justification if unavailable. Confirm how CMT
accepts the sole independent author's justification, prepare the anonymous
paper and artifacts, and have Jacob verify the methods disclosure before any
submission. Do not add another affiliation or author to this draft.

Sequence after rejection: PVLDB, then CIDR if needed, never simultaneously.
Respect the SIGMOD embargo on returning to its research track. The
[submission strategy](../../knowledge-base/strategy/paper-submission.md) owns
the venue schedule; this draft authorizes no submission or experiment.
