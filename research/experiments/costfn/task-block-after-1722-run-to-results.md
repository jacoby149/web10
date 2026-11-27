# Sustained DAU after #1722

Use one `c-32` at the admitted 28/22 GiB ClickHouse limits, with a 24-hour
failsafe and $25 compute cap. The existing provider snapshot `255003176` is
retained. DigitalOcean has the image in `nyc3` and the admitted SKU in `nyc1`;
add regional availability for the same image ID without deleting the source.
Boot that image on the one c-32 so no second paid host is necessary.

1. Stop inherited snapshot processes. Verify the exact frozen input manifest,
   independent validation, original restore and paired fixture hashes. From
   the source copy export only the fixture documents, attachments, policies,
   member rows and already-existing fixture-origin consent records to Parquet.
   Receipt native finishes and byte hashes; stop that source stack.
2. Rebuild a fresh owned project from the verified frozen Parquet and bank
   its original counts. Census and freeze 150 qualifying readers before the
   fixture is applied. Append the SHA-verified fixture using only disjoint
   keys and verify every transferred column in both directions against the
   received Parquet. Do not recreate fixture grants or call the consent API.
3. Verify retained fixture coverage, settle the store, certify the indexed
   composition and each reader scope, then follow calibration, warm-up,
   peak/average and drain from the sustained contract with the real 1 post/s
   stream. Reuse only validated checkpoints on repairs.
4. Supervise about every 600 seconds, keep the run log, bank a contract
   receipt or a pre-declared stop, verify private archives by SHA-256 off-host
   before deleting owned temporary resources, and retain the source snapshot.
   Publish no figures on a parity divergence. Amend draft v8 only for a banked
   sustained result.

Separate provider transfer/storage from the compute receipt. Source tests and
regional image availability are not a native fixture or capacity result.
