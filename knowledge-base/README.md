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

1. **`strategy/plan.md`** — THE STORY at the top + the current priority block.
2. **`strategy/decisions.md`** — the big calls.
3. **`web10-v3/`** — the implementation details for the area you're touching.
4. **`changelogs/CHANGELOG.md`** — the top entries, to see what just shipped.
