# Remaining Backend L1 Coverage Index

Source pin: `db325cd3ca242774ed0afdaf743fdf35419da1e7`, date 2026-10-18.
Scanner fleet: OpenCode `gpt-6.1 sol` (API ID `openrouter/openai/gpt-6.1-sol`).

[Inventory](l1-backend-inventory.md) selects **109 files / 16,362 newlines**
outside the prior API app denominator. It reconciles all 1,482 tracked paths
into disjoint selected/prior/excluded/deferred categories at this pin. Inventory
is not a scan. Counts are newlines; reads must include an unterminated final line.

## Receipt Integration

Only Recorded/Merged rows claim published source coverage. Pending rows are
assignments, not evidence. Whole-file manifests are in each receipt.

| Scope | Files | Newlines | Logical lines | Receipt | Integration |
|---|---:|---:|---:|---|---|
| RTC runtime/packaging, including lock declarations | 5 | 492 | 492 | `l1-rtc.md` | Recorded |
| B1 root compose/schema/bootstrap | 9 | 729 | 732 | `l1-backend-b1.md` | Recorded |
| MA marketing import/writer/validation | 3 | 657 | 657 | `l1-marketing-a.md` | Pending |
| MB marketing import mappers | 4 | 727 | 727 | `l1-marketing-b.md` | Pending |
| MC marketing app/payment/reporting endpoints/models | 9 | 712 | 712 | `l1-marketing-c.md` | Pending |
| PREVIEW shipped Node preview adapter | 3 | 422 | 422 | `l1-preview-backend.md` | Pending |

Current included coverage: **14 distinct files / 1,221 newlines / 1,224 logical
lines**. Three B1 files have unterminated final lines; full EOF was read. RTC
lockfile review concerns declarations, not external implementation/advisory safety.
Marketing API packaging, API migration tools/locks, Ubuntu, CI, root scripts,
edge/build packaging and operator/CLI tooling remain selected inventory debt.

## Evidence And Limits

RTC preserves existing **BP-3**: fake dependencies demonstrate token-selected
verifier routing/status trust and close paths, not actual pre-admission signaling,
JWT validation, impersonation or network reachability. B1 expands existing **B-2**
static credential-default evidence; values are withheld and validity/deployment
activation untested. No new duplicate IDs allocated for these issues.

Fresh same-model reviewers independently checked source/count accounting and
replayed applicable safe probes with inert sinks. Review corrections incorporated;
no runtime changes, production secrets, network or live DB used. The review is
not three-dry/model-diverse verification, an L2 pass, or security sign-off.
No finding closes when its receipt merges. Existing API app coverage is unchanged.

## Next Boundary

After pending receipt integration, follow the exact remaining manifests in the
inventory: marketing packaging (3 files/911 newlines), API packaging/migration
tools (7 files/684 excluding the separately split lock), then remaining lock,
Ubuntu/CI/scripts/edge/operator scopes. Preview files, once recorded above, must
not be recounted inside inventory B9; that leaves six root scripts/440 newlines.
Client/shared source, copied bundles, artifact integrity, deployed state and
dependencies remain explicitly separate debt, not excluded as inherently safe.
