# Indexed K20 baseline retry: slice copied, oracle gate STOP

**No indexed K20 baseline request was measured.** The root-seed repair built
and activated all three slice tables. The ordinary unsliced-versus-sliced
canonical oracle then stopped at the exact ordered prepared-row check. The
paired sliced oracle, composition setup following the slice, indexed baseline,
challengers and fault suite did not run. This is not feed-cost or hybrid evidence.

## Binding and observed slice

- Executing source: merged [#1625](https://github.com/jacoby149/web10/pull/1625),
  `ab1761d58f6ebf0c16dff559e97e8a89c9634e3a`; the earlier
  [slice construction timeout](https://github.com/jacoby149/web10/pull/1624)
  remains a separate outcome.
- Owned DigitalOcean droplet `622735501`, `nyc3`, `s-8vcpu-32gb-amd`, ClickHouse
  `26.10.4.207`, 32/28/22 GiB. Lease `23 Nov 23:09:51` to `24 Nov 03:09:51 UTC`;
  verified snapshot `255003176`.
- Main scope selected **80,078** post IDs; **13,853,282** historical comment
  IDs were selected for those roots and **59,714,731** bare IDs were finally
  retained. The seed repair prevented the earlier global seed, but the
  dependency closure still retains a large fraction of the source.

| Lane | Retained physical rows | Parts at copy census |
| --- | ---: | ---: |
| Documents | 59,714,732 | 64 |
| Attachments | 59,795,062 | 64 |
| Content events | 897,139,143 | 858 |

## Exact divergence

The archived ordinary oracle output has exactly the same 21 ordered full keys,
ordered lower page, follow-up results, readable views scopes and non-`node_ad`
fields on both sides. The eligible ad inventory is the same multiset of 300
creatives. Only the **15th** result selected a different `node_ad` creative;
both outputs include a placement in that slot and both selected creatives
belong to the unchanged eligible inventory. No oracle gate was overridden.

The setup oracle's legacy node-ad comparison (`arm_satellite_ad_parity.py`)
allows differences in creative choice while requiring exact placement and a
canonical eligible creative. The slice fence demands exact row equality even
for this legacy field. Before another lease, bind the same legacy choice for
both independent setup-oracle calls, or explicitly apply the existing legacy
policy at that setup fence only. Keep exact creative identity for the later
deterministic billboard composition and exact ordered K20 response parity.
This is a source diagnosis, not a pass or authorization to retry.

## Custody and cleanup

Both original archives verified off-host before deletion. Raw evidence stays
private. Owned droplet, firewall and SSH key absence verified on 24 November at
`00:02:59.002731 UTC`; owned tag removed, snapshot `255003176` retained. Estimated
compute **$0.221389**, not invoice.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| State and receipts | 93,529 | `03c01fa33eaa07ea8eb997a2e32f161c38d2bba585c6d3b8b9890813f62b215f` |
| Stopped ClickHouse query-log parts | 18,070,966 | `fc0c9773651f897f2439ab1a1b06fc98ab545d786f2bbd58afda42430ba033d5` |
