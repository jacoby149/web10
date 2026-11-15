# Arm D repair: authors narrow the scan; attachments decide inclusion

The realism warm-up returned the right posts and the wrong counts. Its author
shortcut admitted reactions/comments by followed authors even when those
documents were not attached to a selected followers group. Singleton author
sets did not establish equivalent attachment sets.

## The bounded repair

The operator's subsequent “can you fix it?” authorizes a separate correctness
revision. Keep the failed treatment, dataset, baseline and Arm T receipts intact.
No production change, host restart, new machine, lease extension or native rerun
is implied. The cleanup monitor continues on its existing schedule.

`arm_d_attachment_repair.py` starts from the exact pinned canonical main query,
not the lossy rewritten query. It changes the document table to `documents_d`
and pushes an author-set hint before each service's document-version window.
It retains the original attachment join, its version/deletion window, real
`group_id`, all five policy gates and every outer aggregate/profile expression.
There is no owner-to-group CASE and no gate-empty shortcut in this revision.

The input is a group→authors mapping, not a group-owner parser. Multiple authors
per group and authors shared by groups are representable. Every requested group
must have an entry; an actually empty group has an explicit empty list. Empty
overall hints compile to a false document predicate, not an unrestricted scan.
The caller must bind hint completeness to the current immutable store; a missing
author can underfill results and is still INVALID. Hints cannot grant inclusion
without the canonical attachment/policy checks. This pure constructor is not a
production cache or a lifecycle/completeness protocol.

## Regression and result decoding

No-engine relational fixtures replay an author-owned but unattached reaction and
comment: the old SQL shape admits them, the repaired canonical join excludes
them. Positive controls retain genuinely attached engagement, shared authors,
duplicate group attachments and live document/link history. Structural checks
pin every original policy expression and aggregate, plus fail-closed input and
compiler-drift handling. These are constructor/semantic-model controls, not
ClickHouse execution or whole-security assurance.

The new decoder converts only known native UInt64 aggregate fields to integers
before the existing independent projection validator. The base runner uses that
decoder without changing its recorded treatment. This cannot turn15 into0;
the retained real failure still fails after normalization. Raw response receipts
remain unchanged.

## What this does not establish

The author index is still useful for narrowing document scans, but restoring the
canonical link resolution can restore its broad-read cost. No performance win,
native parity pass, K1000 admission or complete-feed success is claimed. Any
future executable revision needs explicit DO operational admission, immutable
hint-completeness binding and query-ID attribution for every runtime hint/
verification read. Do not hide author enumeration in setup merely because the
constructor accepts literals. Warm-up exact parity still precedes measurements;
the original time/byte/anomaly gates remain unchanged.
