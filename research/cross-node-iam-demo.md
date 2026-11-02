# Cross-Node IAM Demo — Spec

**Goal:** demonstrate the decentralized-IAM claim *in action* across a real
node boundary. A foreign principal is granted into a group on node B, reads
through the verified token, then is removed and denied. This is the thing that
turns the paper's "the access model is globally addressable by construction"
from an architecture claim into a demonstrated one.

**Why it matters:** the paper's bold title ("Extending the Decentralized Web")
and its core claim (decentralized *IAM*, not just decentralized *data*) rest on
cross-node being real. Today the demonstrated evidence (the interop demo) is
cross-*app*, single-node. This demo is cross-*node*. Without it, a reviewer who
asks "show me the cross-node read" gets "the model is decided, the runtime is
in-flight" — true, but weaker than the title implies. With it, the title is
airtight.

**Status:** not built. Gated on D84 phases H + A + B + C (see below). Scoped
here so it can be green-lit as a lane if runway allows before the Nov 20
internal freeze.

---

## The demo flow (what "IAM at play" means)

Two nodes: **A** (alice's home node) and **B** (bob's node).

1. **Setup.** alice exists on A. bob exists on B and has a group (e.g. his
   followers group, or a private group) with content.
2. **Cross-node grant.** alice's client (holding her **A-token**) calls
   **B's** join-group endpoint for bob's group. B verifies the A-token,
   resolves the principal to `A/users/alice`, and adds a member row:
   `member_key = A/users/alice`, `role = member`.
3. **Read through the grant.** alice's client reads bob's content from B,
   presenting the A-token. B re-authorizes the read against the verified token
   + the membership row → **allowed**. The content is served.
4. **Cross-node revocation.** bob (or the group owner) removes
   `A/users/alice` from the group (tombstone the member row).
5. **Denial.** alice's next read from B → B re-authorizes, finds no active
   membership → **denied** (403 / empty). The grant is gone; the denial is
   immediate at the metadata-visibility boundary.

**The property demonstrated:** the IAM works *across the node boundary*. The
grant is a row naming a foreign principal; the enforcement is the serving node
re-checking that row against a verified foreign token. This is exactly the
single-node I3 behavior, extended across nodes by the JWKS verification step.
It is the "email let your data leave the building; web10 lets your
*permissions* leave it too" claim, shown.

**What it is NOT:** a scale test, a feed-merge test, or a production
federation. It is a *correctness* smoke test of the cross-node IAM, scoped to
two users and one group. That smallness is the point — it proves the boundary
works, not that it scales.

---

## The blockers (dependency order)

| Phase | What it is | State | Why it blocks |
|---|---|---|---|
| **H** | Two-node harness (`api2.localhost`, separate ClickHouse + MinIO) | **Not built** | You need two *distinct* nodes. A user on A is not a user on B; a token minted by A is rejected by B until B lands. |
| **A** | Canonical principal format `{provider}/users/{username}` + data migration | **Not built** (identity layer still inconsistent: bare `alice` vs `web10.app/users/alice`) | Without it, B can't distinguish `A/users/alice` from `B/users/alice`; the member row collides. The follow-404 and the cross-provider collision are the same disease. |
| **B** | Cross-node token verification (JWKS / RS256) | **Dead scaffolding** — `certify_with_remote_provider` exists (`api/app/services/auth.py:93`) but is never called; `certify()` (`auth.py:105`) hard-rejects `provider != settings.PROVIDER` (line 111) | Today B *rejects* alice's A-token at line 111 before it reaches the group check. The wall is that one line. |
| **C** | Cross-node group membership (the join + remove) | **Not built** | This *is* the demo. |

**Sequencing:** H is independent (land first, de-risks). A and B are
independent of each other but both gate C. C is the demo.

---

## The minimal scope (Option 2 — the demo, not the full federation)

You do **not** need full production federation to show this. The minimal
version:

- **H:** a second node on a separate ClickHouse + MinIO, brought up alongside
  the first. The two-node test harness from the D84 lane.
- **A (scoped):** the canonical format for *the two demo users*, not the full
  cross-cutting migration. The full Phase A migration (every `author_key`,
  every `member_key`, the reader principal, the data migration reversing the
  3.179.1 stopgap) is the risky, cross-cutting part. For the demo, you need
  `A/users/alice` and `B/users/bob` to be the real stored forms for the two
  accounts involved. *Caveat:* if the read gate derives the reader principal
  from the token's provider+username, you may be able to demonstrate the
  cross-node check *without* the full migration, by having the two demo nodes
  agree on the format for the demo principals. Verify this before committing —
  it's the difference between a weekend and a wall.
- **B (minimal):** foreign-token *acceptance* for the demo. The full JWKS/RS256
  migration is the production path. For a two-node demo, the minimal version is
  a verification path that accepts a token from the other node and resolves the
  principal. Even a shared-secret bridge between the two demo nodes (upgraded
  to JWKS later) would demonstrate the *flow* — the grant, the read, the
  removal, the denial — which is what the paper needs. The crypto can be the
  "active build" detail; the IAM-at-play flow is the demonstration.
- **C:** the join + remove, exercised end-to-end with assertions (the member
  row appears, the read is allowed, the row is tombstoned, the read is denied).

**The honest framing if B is a shared-secret bridge:** the demo shows the
*flow* (grant → read → remove → deny) across a real node boundary. The
*cryptographic* verification (JWKS) is the production hardening of that flow.
The paper would say: "the cross-node IAM is demonstrated across two nodes; the
token verification uses a shared secret in the demonstration and is the
per-node JWKS keypair in the production design." That's true and it's enough
for the architecture claim.

---

## What it would add to the paper

If it lands before submission:

- A new §6 subsection, **"Cross-Node IAM"**, with the five-step flow, the
  assertions, and the provenance (two nodes, revisions, the verification
  mechanism used).
- The Future Work "Cross-node enforcement" paragraph tightens from "the next
  evaluation target" to "demonstrated; the production JWKS hardening and the
  feed merge (D) and engagement aggregation (E) remain."
- The abstract can say "with cross-node consent and revocation exercised"
  instead of "the cross-node read path is the active build."
- The title becomes fully airtight: the decentralized-IAM claim is
  *demonstrated*, not just *by construction*.

If it does **not** land: the paper ships on the architecture-level framing
(Option 3 in the thesis doc), which is true and defensible. The demo is an
upside, not a gate.

---

## Decision gate

**Green-light this lane if:** you have 5+ days of runway before the Nov 20
freeze, and the Phase A scoping check (can the demo principals use the
canonical format without the full migration?) comes back yes.

**Do not green-light if:** the Phase A scoping check says the full migration is
required (the read gate can't derive the cross-node principal without it), or
the runway is under 5 days. In that case, ship on Option 3 and file this as the
post-submission experiment.

**Either way:** the paper draft is frozen and shippable *now*. This demo does
not block the submission. It's the difference between "the model is real" and
"the model is real *and shown*."
