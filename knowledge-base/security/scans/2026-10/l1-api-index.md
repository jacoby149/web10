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

`Recorded` means the receipt is included in this branch's documentation, not that
the code passed security review. Pending rows claim no published coverage yet.
Receipt names below live alongside this index.

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
| M | ClickHouse 1-790 | 790 | `l1-api-m.md` | Recorded |
| N | ClickHouse 791-1615 | 825 | `l1-api-n.md` | Recorded |
| O | ClickHouse 1616-2412 | 797 | `l1-api-o.md` | Recorded |
| P | ClickHouse 2413-3218 | 806 | `l1-api-p.md` | Pending |
| Q | ClickHouse 3219-4093 | 875 | `l1-api-q.md` | Pending |
| R | ClickHouse 4094-4944 | 851 | `l1-api-r.md` | Pending |

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
