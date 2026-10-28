# API L1 Coverage Index

Source: `8af7e0fce922cada30002dff190a5bb3abcf4f63`, 2026-10-18.
First-party tracked `api/app/**/*.py`: **59 files, 13,236 lines**, including
comments, blanks and empty package initializers. Tests outside this directory,
deployment/configuration, dependencies, RTC, marketing API, SDK and frontends
are excluded, not silently counted as covered.

Middleware/settings have prior pinned receipts (283 lines); their source is
unchanged at this pin. The remaining 57 files/12,953 lines are assigned below.
The import worker and ClickHouse module are split at function boundaries.
Each receipt lists its exact owned files/ranges; context reads do not add coverage.

## Receipt Inventory

27.10.2026: this remains historical coverage at the pin, not current-dev assurance.
[Current read pass](l1-current-index.md) now refreshes all changed API paths and
accounts for unchanged historical files. Findings, repair/sign-off and publication
remain open; B-8's [local repair](repair-b8-settings.md) is a separate overlay.

All A-R receipts are merged in #1202-#1207 after every PR check passed. This
records completed line coverage, not security PASS. Receipt names below live
alongside this index.

| Scope | Owned surface | Lines | Receipt | Integration |
|---|---|---:|---|---|
| Prior | Middleware/settings, complete files | 283 | `l1-middleware.md`, `l1-settings.md` | Merged #1199/#1201 |
| A | App assembly/system/docs/exceptions/empty packages | 794 | `l1-api-a.md` | Merged #1202 |
| B | Shared auth/config/models/Twilio | 622 | `l1-api-b.md` | Merged #1202 |
| C | Media/HLS/transcode/thumbnail services | 675 | `l1-api-c.md` | Merged #1203 |
| D | Identity/access/recovery/blocking/user endpoints/models | 695 | `l1-api-d.md` | Merged #1202 |
| E | Group/contract endpoints/models | 826 | `l1-api-e.md` | Merged #1204 |
| F | Document endpoint/models | 614 | `l1-api-f.md` | Merged #1204 |
| G | Query endpoint/shared schemas | 530 | `l1-api-g.md` | Merged #1204 |
| H | Media/import/preview endpoints/models | 614 | `l1-api-h.md` | Merged #1203 |
| I | Router/appstore/moderation/logs/bug reporting | 705 | `l1-api-i.md` | Merged #1203 |
| J | Import worker 1-532 | 532 | `l1-api-j.md` | Merged #1205 |
| K | Import worker 533-1028 + parsers | 867 | `l1-api-k.md` | Merged #1205 |
| L | Entire safe-query compiler | 535 | `l1-api-l.md` | Merged #1205 |
| M | ClickHouse 1-790 | 790 | `l1-api-m.md` | Merged #1206 |
| N | ClickHouse 791-1615 | 825 | `l1-api-n.md` | Merged #1206 |
| O | ClickHouse 1616-2412 | 797 | `l1-api-o.md` | Merged #1206 |
| P | ClickHouse 2413-3218 | 806 | `l1-api-p.md` | Merged #1207 |
| Q | ClickHouse 3219-4093 | 875 | `l1-api-q.md` | Merged #1207 |
| R | ClickHouse 4094-4944 | 851 | `l1-api-r.md` | Merged #1207 |

## Assurance Limits

Six internal scanners read disjoint scopes in one workspace using
`gpt-6.1 sol` (OpenCode; API ID `openrouter/openai/gpt-6.1-sol`). Three fresh
same-model reviewers checked the receipts, source boundaries and safe probes.
Their corrections were incorporated before integration. This is **not** model
diversity, three-dry convergence, an L2 pass, deployed exploit testing or a PASS.

Coverage accounting was mechanically checked against the pinned Git tree:
59 files/13,236 lines; A-R sum to 12,953; no range gaps or overlaps; empty files
included. Accounting does not validate security judgments. No runtime code was
changed. Confirmed local findings, conditional sink evidence and UNVERIFIED L2+
handoffs remain distinct in receipts. No live secrets, network or DB used.

## Disposition

New scoped finding IDs are stable within receipts; they do not reuse B-1..B-8.
No finding closes by merging documentation. Repairs need separate bounded PRs,
red -> denied-green evidence and design-intent review. Handoffs require actual
caller/sink/schema context at L2, not automatic promotion to vulnerabilities.
Broader backend/runtime and later client surfaces remain separate inventory debt.

## Open Work Map

| Local scoped finding | Receipt | Remaining obligation |
|---|---|---|
| L1-A-02 | A | Manifest destination/JSON proxy primitive; validate deployed reach and fix without breaking legitimate listing. |
| L1-B-01 | B | Unsigned remote-helper destination/status trust; no production reference found, so establish need/reach before any rollout or broad issuer rewrite. |
| L1-D-01 / L1-D-02 | D | Expired-token principal production and weak session expiry classification; prove/deny at real entry points while preserving anon/public flows. |
| L1-E-01 | E | Account bearer in group-detail query parameter; coordinate existing S7 transport work. |
| L1-G-01 | G | Caller SQL reaches INFO logs; preserve useful nonsecret diagnostics and flexible queries. |
| L1-H-01 | H | Identity-discarding object-signing handler; source concern and fake-sink proof are not live object retrieval; preserve legitimate cross-user media. |
| L1-J-01 | J | Cross-job trace attribution; isolate records without discarding durable per-job diagnostics. |

Existing B-1..B-8 and BP items keep their own dispositions. A-01 secret-bearing
error sink remains an UNVERIFIED protected-data disclosure until a real reachable
protected source is demonstrated. Other receipt candidates are L2+ investigation
debt, not silently promoted findings or accepted safety claims.

A final fresh same-model documentation reviewer verified accounting, source
immutability, finding calibration and record consistency. No blocking issue;
this is not an additional security rescan or three-dry/model-diverse sign-off.
