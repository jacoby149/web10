# Remaining Backend L1 Coverage Index

**Historical snapshot:** D91 subsequently removes the marketing API source,
packaging and workflow and edits deployment wiring. MA/MB/MC below are retained
as pinned history, not present-day runtime assurance. Refresh the live inventory;
do not count deleted files as scanned or operationally decommissioned. Current
scope disposition: [retirement record](../../marketing-api-retirement.md).

Source pin: `db325cd3ca242774ed0afdaf743fdf35419da1e7`, date 2026-10-18.
Scanner fleet: OpenCode `gpt-6.1 sol` (API ID `openrouter/openai/gpt-6.1-sol`).

[Inventory](l1-backend-inventory.md) selects **109 files / 16,362 newlines**
outside the prior API app denominator. It reconciles all 1,482 tracked paths
into disjoint selected/prior/excluded/deferred categories at this pin. Inventory
is not a scan. Counts are newlines; reads must include an unterminated final line.

## Receipt Integration

All rows below are merged after every PR check passed. Integration records
source coverage, not security PASS. Whole-file manifests are in each receipt.

| Scope | Files | Newlines | Logical lines | Receipt | Integration |
|---|---:|---:|---:|---|---|
| RTC runtime/packaging, including lock declarations | 5 | 492 | 492 | `l1-rtc.md` | Merged #1212 |
| B1 root compose/schema/bootstrap | 9 | 729 | 732 | `l1-backend-b1.md` | Merged #1212 |
| MA marketing import/writer/validation | 3 | 657 | 657 | `l1-marketing-a.md` | Merged #1213 |
| MB marketing import mappers | 4 | 727 | 727 | `l1-marketing-b.md` | Merged #1213 |
| MC marketing app/payment/reporting endpoints/models | 9 | 712 | 712 | `l1-marketing-c.md` | Merged #1213 |
| PREVIEW shipped Node preview adapter | 3 | 422 | 422 | `l1-preview-backend.md` | Merged #1214 |

Snapshot included coverage: **33 distinct files / 3,739 newlines / 3,742 logical
lines**, including all 16 marketing API app Python files/2,096 lines. Three B1
files have unterminated final lines; full EOF was read. RTC
lockfile review concerns declarations, not external implementation/advisory safety.
Marketing API packaging, API migration tools/locks, Ubuntu, CI, root scripts,
edge/build packaging and operator/CLI tooling remain selected inventory debt:
**76 selected files / 12,623 newlines**, not silently marked scanned.

## Evidence And Limits

RTC preserves existing **BP-3**: fake dependencies demonstrate token-selected
verifier routing/status trust and close paths, not actual pre-admission signaling,
JWT validation, impersonation or network reachability. B1 expands existing **B-2**
static credential-default evidence; values are withheld and validity/deployment
activation untested. No new duplicate IDs allocated for these issues.

Marketing's retired HTTP/v2 importer remains code, not proof of deployed or active
node-importer behavior. MA expands B-2 defaults; MB transformations are handoffs,
not SSRF/XSS/path or publication exploits. MC's L1-MC-01/02 demonstrate local
payout cancellation and conversion-accounting mutation/replay with fake stores/
persistence. No Stripe provider call, money movement, durable production change,
settlement consumer or forged webhook event is demonstrated. The webhook only
acknowledges without state mutation. These findings stay OPEN.

The preview adapter reads anonymously and composes renderer specifications over
fixed-origin generic APIs. Synthetic markup/URL propagation is not browser XSS,
SSRF or private-content disclosure; actual renderer/grant behavior remains L2+.
The ghost-post generic-card HTTP 200 differs from the KB-required 404; this is
recorded correctness debt, not a proven confidentiality failure.

Fresh same-model reviewers independently checked source/count accounting and
replayed applicable safe probes with inert sinks. Review corrections incorporated;
no runtime changes, production secrets, network or live DB used. The review is
not three-dry/model-diverse verification, an L2 pass, or security sign-off.
No finding closes when its receipt merges. Existing API app coverage is unchanged.

## Next Boundary

Current next task is exhaustive SDK L1 (L1-008). D91 cancels the removed marketing
packaging scope rather than scanning it. The historical API packaging/migration
tools (7 files/684 excluding the separately split lock), then remaining lock,
Ubuntu/CI/scripts/edge/operator scopes. Preview files, once recorded above, must
not be recounted inside inventory B9; that leaves six root scripts/440 newlines.
Client/shared source, copied bundles, artifact integrity, deployed state and
dependencies remain explicitly separate debt, not excluded as inherently safe.

## Closeout

Inventory/RTC/B1 merged #1212; all marketing app Python receipts merged #1213;
shipped preview merged #1214. Mechanical pin comparison confirms all 33 source
files unchanged and disjoint, with full logical EOF coverage. This closes only
the inventory and bounded receipt tasks, not the remaining 76 selected files,
broader client/artifact surfaces, open findings, L2 handoffs or required sign-off.
No production credential exposure assessment or runtime remediation occurred.
