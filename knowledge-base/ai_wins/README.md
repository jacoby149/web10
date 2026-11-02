# AI Wins

What did we actually improve after introducing AI Use Theory?

This folder collects the answers from the changelog, after its 14 August 2026
introduction in #615. Each row says what changed in plain words.

| Date | ID | PR | Type | Changed | Human description |
| --- | --- | --- | --- | --- | --- |
| 30.08.2026 | AUG-098 | #738 | revolutionary | code, tests | Switched group contracts to per-service roles and public/member grants. |
| 07.09.2026 | SEP-042 | #811 | evolutionary | code, tests | Removed the remaining Mongo and FerretDB runtime after the earlier ClickHouse migration. |
| 03.09.2026 | SEP-021 | #790 | revolutionary | KB, code, tests | Let apps query and join their readable data through the SDK. |
| 23.08.2026 | AUG-032 | #664 | feature | code, tests | Built a feed demo that combines posts from the creators a person follows. |
| 07.09.2026 | SEP-054 | #820 | fix | code, tests | Made Discover videos play instead of remaining static thumbnails. |
| 05.10.2026 | OCT-025 | #1122 | fix | code, tests | Fixed group photos and covers showing the oldest upload instead of the latest. |

## The Collection

| Changelog dates | Fix | Feature | Evolutionary | Revolutionary | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| [August 14-31](2026-08.md) | 46 | 48 | 7 | 3 | 104 |
| [September](2026-09.md) | 128 | 146 | 11 | 2 | 287 |
| [October through 28 October](2026-10.md) | 76 | 82 | 9 | 0 | 167 |
| **Total** | **250** | **276** | **27** | **5** | **558** |

These are collected changes, not 558 new product features or first-try successes.
They include written decisions, tests, follow-up fixes and changes later replaced.
A feature and a later repair remain visible as separate work. The labels are human
judgments, not scores. Sources and qualifications are in the monthly files.

## Read A Row

`date || improvement ID || PR || fix, feature, evolutionary, revolutionary || KB, code, tests || human description`

- **Date:** the changelog date, which can differ from the merge date.
- **ID:** a reference within the month, such as `SEP-042`.
- **PR:** a verified number; `not recorded` means we could not establish it.
- **Revolutionary:** fundamentally replaced the system's basic model, backend or way people operate it.
- **Evolutionary:** substantially changed an existing backend or shared mechanism without replacing the basic model.
- **Feature:** added something useful, including knowledge or test coverage.
- **Fix:** repaired something broken or incorrect.
- **KB / code / tests:** what changed; a changelog tick is not a KB improvement, and running existing tests is not changing tests.

The earlier draft picked nine examples and called them outcome families. That
was unnecessary jargon, not nine classes of work. This list replaces it.

See [AI Use Theory wins](ai-use-theory-wins.md) and [adding entries](measurement.md).

[Security wins](security-wins.md) is a separate list: 15 actual repair outcomes
from the later October L1-L4 campaign, not security-related work from the whole
AI Use Theory period. It excludes scans, plans and older development work.
Overlapping October records are not extra improvements to add to the total above.

July's repeated fixing is in the [older changelog](../changelogs/changelog-archives/2ba7fa98-17.08.2026.md).
The original MongoDB-to-ClickHouse rebuild predates this collection; September's
removal of the remaining Mongo runtime is a later, separate change.

This records what happened after adoption, not proof the method caused every
change or a measurement of money saved. Missing PRs, replaced changes and
incomplete checks stay visible. The security campaign still has open work.
