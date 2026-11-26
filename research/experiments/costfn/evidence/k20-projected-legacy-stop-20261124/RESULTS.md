# Projected K20: old-clock attempt closed before measurement

The operator superseded the four-hour scheduling rules and authorized stopping
the old attempt. Droplet `622859486` ran PR #1631 at
`f7fa5e4f684d82efde9b8db363c21d8bff73fa45`. Its first attempt stopped before SQL:
the SSH launch umask made the public checkout's bind-mounted ClickHouse
configuration unreadable to the daemon. A separate attempt on the same lease
fixed only checkout permissions and retained the first STOP.

The second attempt passed the unsliced oracle and exactly matched the banked
document, link and event counts and hashes. It completed migration, billboard
fixtures and tally preparation. At the operator stop (`11:16:45 UTC`), 228
of 318 daily seed slices had recorded PASS; the next was STARTED. The event
aggregate was not reconciled. Neither indexed nor projected measurement ran,
so this attempt publishes no latency, read-cost or pruning result.

Off-host receipts verified before owned cleanup at `11:17:53.891 UTC`.
Snapshot `255003176` was retained. Estimated compute: **$0.781173**, not an invoice.

| Private archive | Bytes | SHA-256 |
| --- | ---: | --- |
| Initial restore STOP | 172,712 | `cd25a0266a6a665a0ec33c3a6939d7ab2d41bf15ea5884911dd8e43e7340e9d0` |
| State and receipts | 7,138,476 | `ccc3a0018e1f54f7939ec2c1109d23bddaed45404dd9fdaba952e26a6b3ae3ba` |
| Stopped query-log parts | 41,790,773 | `fe891abd7be1a8ede083ad03aba74bb3e1991ad6e80c6abac047bd601441c562` |
