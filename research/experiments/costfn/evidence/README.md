# K1000 Paper Evidence

`k1000-report.tar.gz` retains `report.json` from the Davao workspace's connected
1,000-creator trial. It contains cell accounting and phase summaries, not raw
per-request samples or credentials. The source narrative, `../K1000-RESULTS.md`,
is imported unchanged from PR #1313 at
`46e53548e2851318cd40acdf67bcef9bab8b948c` (Git blob
`631cdc151259878082bb5148e7c924ae497c236d`). This imports evidence, not the PR's
unrelated branch history or a new experiment.

The manuscript uses the later trial's internally consistent K10/100/1000 sweep.
The earlier 100-creator trial remains separate; its samples are not pooled with
this dataset. The archive is a summary receipt, not a claim that raw observations
or independently repeated trials exist.

SHA-256:
- Archive: `17c7c0da35d08888b1216f7f83096b37ad44937e6b8d0c29bfcf3c4b20994874`.
- Extracted `report.json`: `05b3f36adcad7dd459e280c24a2a14cfd7e4a7963d34e548f8f96030e7007160`.

Check all 48 table values, sample accounting and narrative ratios:

```sh
node research/experiments/costfn/check-paper.mjs /path/to/extracted/report.json
```
