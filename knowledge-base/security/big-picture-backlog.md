# Big-Picture Backlog — the L3 debt

The cross-file / architectural findings — the **L3 project-wide-scan** findings.
These are *judgments*, not signatures — they span files, change a design or a
protocol, or force a breaking / coordinated rollout. They are done **one at a time,
after L1 + L2 are 100%**. Format and rules live in the cartridge:
[`ai-pack/ai-security-theory/the-scope-ladder/`](../../ai-pack/ai-security-theory/the-scope-ladder/README.md).

> **Why this file exists:** in the first hardening pass (1157/1159) the
> architectural risks got buried under the sprawl and surfaced only as
> "historical-exposure follow-ups remaining open." This backlog keeps them
> **counted and ordered**, not hidden.

**Ordering:** by dependency, then severity. An item that blocks others goes first;
a critical invariant break beats a hardening nicety.

| ID | Status | Item | Invariant | Why L3 | Plan | Deps |
|---|---|---|---|---|---|---|
| **BP-1** | open | **Federation signing: HS256 → RS256/EdDSA + JWKS** (D7) | I1 | Cross-node protocol change; asymmetric per-node keypair; breaking | Per-node keypair, public keys at a well-known JWKS URL, offline verify; dual-verify during migration, then drop HS256 | blocks BP-4, BP-5 |
| **BP-2** | open | **Scoped app-management delegation** | I5 | New trust primitive; management grants must intersect current person authority | Signed-origin revocable delegation; exact grants ∩ caller authority | — |
| **BP-3** | open | **RTC admission / certify gate** | I5 | Cross-service (RTC ↔ API) trust boundary; one-use tickets | One-use pre-upgrade RTC tickets; fail-closed certify; `CERTIFY_BASE_URL` | — |
| **BP-4** | open | **Historical exposure + credential rotation** | I1, I5 | Residual: keys/creds that were in source or symmetric; needs a deliberate rotate + re-login decision, not a code edit | Rotate all long-lived creds; force legacy-session re-login; document the exposure window | after BP-1 |
| **BP-5** | open | **Coordinated 4.0.0 rollout** | — | Breaking change spanning API/RTC/SDK/consumers; must deploy atomically or the guarantee is broken | Version-gated deploy; explicit key/credential provisioning runbook; legacy re-login | after BP-1, BP-4 |
| **BP-6** | open | **Independent external security audit** | all | The internal scan is self-reported; an external review is the claim that makes "secure" mean something to a third party | Commission after BP-1..BP-5 land; feed findings back into the ledger + checklist | after BP-1..BP-5 |

## Rules

- **Numbered and stable** — `BP-n` references survive reordering; ledger rows and
  fix PRs point at an item by ID.
- **Every item has a `why-L3`** — the one-line reason it is architectural
  (project-wide), not a line-level finding. This is the gate that keeps L1/L2 and
  L3 from bleeding together.
- **One item = one bounded PR (or a sequence of ≤500-line PRs).** The *decision*
  is one item; the *implementation* is small PRs that all reference it.
- **L3 staleness is on architectural change, not a file commit** — an item re-opens
  when a decision lands or a boundary moves, not on every commit. See
  [`the-ledger/staleness-and-cadence.md`](../../ai-pack/ai-security-theory/the-ledger/staleness-and-cadence.md).

## The gate

The L3 backlog is "done" when every item is closed **and** BP-6 (the external
audit) has run and its findings are in the ledger. Until then, the honest claim is
*scanned and hardening*, not *secure*.
