# Finished-record validation: 1M accounts

The full synthetic dataset passes all **50 checks** on the approved DigitalOcean
preparation host. This records dataset validation, not a benchmark result.

## Receipt

[`validation.json`](validation.json) is the original final receipt downloaded
byte-for-byte from the persistent work volume. It contains every verdict,
statistics, input sizes/SHA-256 hashes, original import lineage, validator source
pins and engine/resource settings.

- Dataset ID: `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
- Receipt SHA-256: `5d7dabb6e4e322d5a76bed630d053b2340d34e5e5016682ad8bdb175c6afdd94`.
- Engine: ClickHouse **24.8.14.39**, performance profile, four threads,
  **22-GiB query / 28-GiB systemd process cap**.
- Full validation launched **13 November 2026, 05:02:39 UTC**; last check passed
  at approximately **06:02:39 UTC**. Supervisor success was observed at
  **06:07:24 UTC**, with exit status zero and original import markers unchanged.
- No checks were weakened or false verdicts skipped. This successful attempt
  reused verified imports, ran from check 1 and required no repair/restart.

## Headline statistics

| Quantity | Result |
|---|---:|
| Accounts | 1,000,000 |
| Original posts | 4,000,000 |
| Physical delivery events | 1,600,000,000 |
| Document rows, including profiles and engagements | 88,200,300 |
| Likes / comments | 64,000,000 / 19,200,000 |
| Nonposting accounts | 85% |
| Authorship shares: top 1% / next 9% / bottom 90% | 74.7% / 24% / 1.3% |
| Median impressions per post | 50 |
| Median followers / following | 37 / 75.5 |
| Readers per cohort, all eight cohorts | 20,000, all nonempty |

The receipt retains full distributions and positive declared correlations;
these headline values do not replace the complete statistics review.

## What remains separate

The Parquet dataset, detailed logs, per-check timing/recovery sidecars and
predecessor failure evidence remain on the retained DO volume; they are not
copied into Git. The remote receipt is
`/mnt/costfn-work/costfn-prep/checkpoint-restart-20261113-r1/final-receipt.json`.
The full dataset plus this receipt now also exist as the digest-verified private
MinIO copy at
`web10-media/research/costfn/datasets/2d6bbc4d89…/` (11 objects,
19,917,449,209 bytes; two-pass readback, all anonymous reads denied — see
[`REALISM-STORAGE.md`](../../REALISM-STORAGE.md)). The regional Spaces copy is
still pending.

Passing synthetic-record validation does **not** establish node/browser
performance, private/lifecycle acceptance, a connected pilot or full-study
readiness. Operator statistics review and both digest-verified private storage
copies remain open under [`REALISM-STORAGE.md`](../../REALISM-STORAGE.md).
No bulk dataset transfer, public release, new experiment or compute cleanup is
performed by saving this receipt.
