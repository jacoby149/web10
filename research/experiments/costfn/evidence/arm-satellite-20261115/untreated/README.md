# Untreated satellite-arm inventory — 15 November 2026

This is Step 0 on the fresh, approved realism copy, **not Config P performance**.
The main failed, so follow-up probes use independently selected canonical IDs.
No completed feed, output parity, measured trial or satellite gate is claimed.

| Shape | HTTP | Native rows, all attributed reads | Native logical bytes | Client observation |
|---|---:|---:|---:|---:|
| Main | 400 / native159 | 362,776,086 | 24,236,154,643 | 11,321ms |
| Reactions | 400 / native159 | 21,495,822 | 2,074,559,330 | 12,761ms |
| Comments | 400 / native159 | 24,600,590 | 2,378,438,407 | 10,119ms |
| Views | 200 | 93,908,796 | 8,423,361,483 | 70,426ms |

The views success is not a budget pass. The original
`content_event_views_for_docs` calls `client.query` without an explicit
`max_execution_time`; its native query took70,392ms. That original path does
not enforce the required ten-second measured-read envelope. Preserve this
diagnostic discrepancy rather than calling it a compliant completed cell.
No timeout was raised by this experiment. The Phase 1.6 replacement conflict
remains OPEN; no view-counter treatment is activated.

Actual compiler scopes after the existing read gate contain21 groups per
main service and22 for each engagement follow-up (Discover is additional).
Canonical membership supplies the profile's ordinary reader group list;
this is not a new browser/session-discovery acceptance test. No observer SQL
runs inside the four HTTP windows. Totals include every attributed initial
query, not just the failed principal SELECT; logical bytes are not disk IO.

`inventory.json` retains raw native queries/IDs/hashes and observed scopes.
`requests.json`, `spans.json` and `observations.json` retain request and API
metadata. `report.json` binds those artifacts and the executing driver by
SHA-256; its source hashes match the executing local profile modules.
The separately retained first setup attempt failed before a profile request
because the Compose overlay was missing. Copying the additive source repaired
setup; the original host deadline15:38:32UTC was not extended.

The reported Step 0 unlocks count setup/T1 only. It does not establish T1,
T2, lifecycle/rebuild parity, storage/maintenance cost, budget success or any
fanout admission. Config P measured reads retain the ten-second/10M-row gates.
