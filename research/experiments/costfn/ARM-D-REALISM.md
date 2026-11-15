# Arm D on realism — same shortcut, different store

Jacob's 14 November directive pulls forward one additive Phase-0 main-only
cell. The frozen input, baseline and all Arm T receipts remain untouched.
Input: `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.

Build a separate `documents_d` from canonical `documents`, ordered by
`(author_key, created_at, doc_id, updated_at)`. Use external sorting from the
start, verify the exact source row count, consolidate only the new table,
and receipt its pre/post part census before any feed measurement. Build,
consolidation and independent oracle work are setup, never feed cost.

Use the unchanged `arm_d_rewrite.transform` and its structural golden pin.
The only SQL storage substitution is `documents` → `documents_d`. The
ordinary reader is index 1, with 20 follows plus its self followers group,
and LIMIT 21. Report the shortcut's one-owner-per-group enumeration beside
the actual distinct attached authors; they are not interchangeable.

Run native main SQL only, not preparation or the full sequence. First run
the warm-up against the independent canonical oracle for IDs, order and
projected values. A mismatch makes the cell INVALID: stop, retain evidence,
and do not repair the treatment or oracle. Otherwise run three measured
main observations with native query IDs, rows, logical bytes and duration;
retain per-request owner/membership/policy verification cost separately.
Any observation over 10M main rows stops further cells. Every measured main
must be below 500ms and 25,000,000 bytes. Only a parity-and-target pass can
admit the separately scoped K1000 probe; no invented reader fixture.

Reuse the retained isolated DO host within its existing 05:17:51 UTC,
15 November cleanup deadline and original budget. No additional machine,
lease extension, production, §8, fanout, frozen-cell changes or CMT. Envelope
remains 32/28/22/4 GiB, ClickHouse 24.8.14.39 and ten-second measured SQL.
Native observations are not HTTP latency, p95 or full-feed success.
