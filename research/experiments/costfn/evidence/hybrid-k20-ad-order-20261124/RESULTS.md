# Indexed K20 retry: setup oracles PASS, fingerprint handoff STOP

**No indexed K20 request was measured.** Both canonical setup oracles matched
their unsliced references exactly, but serving-table setup stopped when the
tally builder attempted to read `before-projection-fingerprint.json`. The
indexed baseline, challengers and fault suite did not run.

## Run and first failure

- Executed merged [#1627](https://github.com/jacoby149/web10/pull/1627),
  `cf5278bc86dbd8241dafb080a2c40a6ccd4a33da`, on owned DigitalOcean droplet
  `622760991` (`nyc3`, `s-8vcpu-32gb-amd`). ClickHouse `26.10.4.207`,
  32/28/22 GiB, retained snapshot `255003176`. Original lease `24 November
  00:55:17`–`04:55:17 UTC`.
- The three copied lanes retain 59,714,732 document rows, 59,795,062 attachment
  rows and 897,139,143 event rows. The slice manifest records
  `SOURCE_ORACLE_PARITY` for both ordinary and paired setup profiles using
  `author-key-doc-id-v1`. The [prior legacy ad STOP](https://github.com/jacoby149/web10/pull/1626)
  remains unchanged; it is not retroactively a pass.
- Restore, slice, migration, and billboard fixture construction banked PASS.
  The tally packet says `verified: true` and `independent_page_and_sample_parity:
  PASS` before the furniture stage stopped. This is not the later composition
  verification gate or a serving result.
- In `hybrid_k20_run_current.Actions.base_infrastructure`, the sliced generation
  fingerprint was computed and used to bind and verify its certificate but not
  saved under the existing handoff filename. The unchanged full-store constructor
  writes that file; `engagement_tally_build.run` requires it when refreshing the
  certificate. The worker stopped with `FileNotFoundError` at that read.

The next source fix is to bank the fresh sliced fingerprint before certificate
binding and cover the producer/consumer handoff offline. Do not substitute a
snapshot fingerprint, waive the later composition checks, or relabel this
attempt. A retry needs its own admission, source and lease binding.

## Custody and cleanup

Both raw archives were verified off-host by SHA-256 before deletion and remain
private. Owned droplet, firewall and SSH key absence verified `02:59:38.837980
UTC`; tag removed, snapshot retained. Estimated compute **$0.518183**, not
invoice. No retry, extension or second host followed.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| State and receipts | 6,613,601 | `c86a267b47fea4938f31958d0977d4c93de8d2323f82929a2edf5209ac44f6c6` |
| Stopped ClickHouse query-log parts | 20,445,013 | `66ba95f22a31126e90d85ae249b7ddb6e0e0114b1cfbd790ca21d974c59d8190` |
