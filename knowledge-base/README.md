# Knowledge Base — the web10 brain

Everything you read to get up to speed on web10. This is the per-repo brain —
what web10 **is**, where it's **going**, what it has **shipped**, and what must
**never break**. The *method* for working with AI (the four-phase flow, the
pyramid, how to write docs) is not here — that's the portable cartridge in
[`ai-pack/`](../ai-pack/).

> **AI agents:** the operating method (orient → generate → compare → repair;
> KB → logs → tests → features) lives in
> [`ai-pack/ai-use-theory/`](../ai-pack/ai-use-theory/). How to *write* docs
> lives in [`ai-pack/AGENTS.md`](../ai-pack/AGENTS.md).

## The Folders

- **[`web10-v3/`](./web10-v3/)** — the implementation map. What web10 **is**:
  the db model, auth, security, telemetry, groups, media, social. We're on v3.
  Earlier iterations (`web10-v2/`, `web10-v2-to-v3/`, `web10-social-v3/`,
  `v3-initial-ideation-archive/`) and the next one (`web10-v4/`) sit alongside.
- **[`strategy/`](./strategy/)** — where web10 is **going**. The plan, the
  decisions (D-numbers), the design standard, the manifesto, the timeline, the
  execution lanes.
- **[`changelogs/`](./changelogs/)** — what web10 has **shipped**. The memory,
  newest first.
- **[`security/`](./security/)** — what must **never break**. Written security
  (WS): the invariants (I1–I6), the security record (the coverage record), the
  big-picture backlog, and the scan records. The *method* for how security work is
  done lives in the cartridge:
  [`ai-pack/ai-security-theory/`](../ai-pack/ai-security-theory/).

## Reading Order

**19 November design decisions:** [D115–D120 map and receipt ledger](./web10-v3/db/design-revolution.md)
records billboard ads, N-ref edges, the row-model direction, storage/export
separation, typed API direction and the over-read principle. DECIDED is intent;
DIRECTION cells are pending. No new storage rollout or native result is implied.

Canonical navigation, without copied benchmark figures:
- [Decision definitions and statuses](strategy/decisions.md) — D114 acceptance remains OPEN on the paired gate.
- [Research directive precedence](../research/experiments/costfn/README.md#directive-precedence-index) — which document governs now; older records are retained.
- [Row-model source runbook](../research/experiments/costfn/ROW-MODEL-RUN.md) — machinery, not a banked native result.
- [All-fixes contract](../research/experiments/costfn/ALL-FIXES-THEN-MEASURE.md) and [queued row-model cell](../research/experiments/costfn/ROW-MODEL-QUEUED.md) — new directive pages recorded with #1592; source preparation and measurement order are distinct.
- [Paper target and provisional dates](strategy/paper-submission.md) — D121 (DECIDED), research track; future dates require re-verification.
- [Named-interface language](strategy/interface-language.md) — name both sides instead of an unspecified interface.
- [Tightening audit](strategy/design-revolution-tightening-report.md) — findings, changes and protected historical instances.
- [Per-occurrence terminology inventory](strategy/design-revolution-boundary-inventory.json) — original locations, replacement excerpts and historical exceptions.

1. **`strategy/plan.md`** — THE STORY at the top + the current priority block.
2. **`strategy/decisions.md`** — the big calls.
3. **`web10-v3/`** — the implementation details for the area you're touching.
4. **`changelogs/CHANGELOG.md`** — the top entries, to see what just shipped.
