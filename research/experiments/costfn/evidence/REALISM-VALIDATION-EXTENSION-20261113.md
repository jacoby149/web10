# Bounded extra validation time — 13 November 2026

The operator asks to use the planned performance-node memory envelope for
validation and clarifies that “lenient” means allowing enough execution time,
not weakening the correctness checks. A separate explicit question offers
up to four more hours on the **same existing host**, keeping the **$5 total
compute ceiling** and unchanged **400-GiB Volume**. The operator selects
**“Approve 4h (Recommended)”**.

## Implemented and applied: time only

`realism_cloud_lease.validate` now admits one exact four-hour validation
extension only after the genuine initial fourteen-hour approval. Its preceding
deadline must equal the original creation clock plus fourteen hours; approval
must be a real numeric timestamp within that original lifetime. It cannot mix
with the older two/eight-hour extension history or exceed eighteen hours.
Creation still refuses cancelled, cleanup-verified or expired leases. Twelve
lease controls pass, including missing/late/excessive/incorrect-clock approval
and closed-lease refusal cases.

Operational identity remains run `3ef3634d8983`, droplet `618505005`, approved
NYC3 8-vCPU/32-GiB shape. No new resource, provider credential export or global
production configuration change occurs.

- Old compute deadline: **02:50:22 UTC Nov 13**.
- New compute deadline: **06:50:22 UTC Nov 13**.
- Same lifetime compute ceiling: **$5**.
- Full eighteen-hour estimate at $0.25/hour: **$4.50** compute, excluding the
  separately approved prorated volume cost and existing billing limitations.
- Same retained volume and separate deletion/retention decision.

The original private lease is preserved before modification. Replace the scoped
launchd watchdog source atomically **before** updating the lease to the newly
accepted bound. Record the operator's choice, scope, approval time and exact
preceding deadline; do not fabricate earlier legacy extensions.

On the host, arm `web10-prep-approved-validation-stop.timer` for **06:50:22 UTC**
and verify its next activation before stopping the old 02:50 timer. Readback
confirms the new timer is active. The local watchdog remains the scoped provider
deletion mechanism; host poweroff does not itself stop billing. Existing
workstation/network/provider-loss limitations remain, not a hard provider cap.
Local operational receipt: `.context/validation-lease-extension.json`.

## Explicitly not completed by this change

The worker remains **failed/stopped** after documents import exits 241.
Readback still reports **12-GiB service MemoryMax**; validator source still has
the old **2-GB query memory** setting. The approved **22-GiB ClickHouse / 28-GiB
process** profile is the target of the next repair, not deployed functionality
or proof that later queries cannot exhaust memory.

The full 1.6B-event import, doc_groups, cohorts and app contracts have count-
verified completion markers. Keep those data and their source lineage intact.
Before restarting under a new resource policy, verify compatible importer
semantics and actual UUID/count/input bindings; do not simply relabel old
checkpoints with new source hashes or discard the completed heavy import.
Full 1M validation, private storage copies, statistics review, connected-node
acceptance and experiments remain open. No validation restart, resize, upload
or experiment is performed by this lease-only change.
