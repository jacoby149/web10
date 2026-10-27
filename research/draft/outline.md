# Draft — web10 Paper

*Markdown-first. Convert to the venue's LaTeX template (CIDR/WWW) at submission
time. Do not start filling sections until `brief.md`'s claim is locked and
`related-work.md`'s gap check is [YES].*

## Section outline

1. **Abstract** — the claim + the headline evaluation number. 150 words.
   *(Write last, not first.)*
2. **Introduction**
   - The problem: platform silos, coarse access, no ownership, no
     creator monetization.
   - The move: bring IAM-grade group/role contracts to the front of a
     user-owned social data platform.
   - The claim (one sentence, from `brief.md`).
   - The contribution list (only #1 is the contribution; the rest are
     system/app/future-work).
   - The headline result (one production number).
3. **Background & Motivation**
   - Why user-owned data.
   - Why the access model is the hard part (the gap, from
     `related-work.md`).
   - Why now.
4. **System Overview**
   - The data model: single ClickHouse `documents` table,
     `(author_key, doc_id)`, `doc_groups`, `group_contracts`,
     `group_members`.
   - The two contract types: app contracts (infrastructure trust, CORS) and
     group contracts (social access, role-enforced).
   - The token: scoped, expiring, revocable; `{username, site, target,
     provider, expires}`.
   - The node stays generic (D60): universal primitives only; app concepts
     live client-side.
5. **The Access Model (THE CLAIM — the deep section)**
   - Fine-grained group/role contracts as the user-facing primitive.
   - How "IAM to the front" works: the user (not the platform) holds the
     contract.
   - Publicness as a role grant (an `anyone`/`authenticated` member row with a
     `readAll` role) — no node endpoint, expressed through the primitives.
   - Revocability and its bound.
   - The security invariants (I1–I6) and how the model enforces them.
6. **Evaluation** — from `evaluation-plan.md`.
   - Scale. Access-decision latency. Cost model. Social-app case study.
     Conformance suite. Methodology.
7. **Related Work** — from `related-work.md` (decentralized social, cloud IAM,
   conventional social, DB tenant isolation, creator economics).
8. **Discussion & Limitations**
   - What the per-collection model gives up.
   - What's out of scope (the monetization deep-dive → future EC paper; the
     formal security proof → future CCS paper).
9. **Conclusion**
10. **References**

## Writing rules (from the project's KB method)

- One claim. If a paragraph doesn't serve the claim, cut it or move it to
  future work.
- The evaluation is the load-bearing wall — real numbers, not adjectives.
- Be transparent that web10 Inc. built and runs this. No hiding the COI.
- Keep the KB aligned: the system described here must match the code + the
  `knowledge-base/` docs. If the paper says something the KB doesn't, fix one
  of them.
