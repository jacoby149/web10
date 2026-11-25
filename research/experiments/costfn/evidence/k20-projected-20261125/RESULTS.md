# K20: payload pruning observed; no complete-read saving

The indexed and projected arms each passed the same independent complete
response oracle in warmup and measurement. The measured requests also shared
identical quiet delivery history. The fixed slice agreed with the unsliced
oracle and reproduced the prior document, attachment and event censuses.

| Measured complete sequence | Indexed | Projected |
| --- | ---: | ---: |
| Captured native rows read | 8,942,938 | 8,967,514 |
| Captured logical bytes read | 620,851,039 | 622,458,125 |
| Captured summed native duration (ms, not CPU time) | 1,118 | 1,106 |
| Largest individual statement memory (bytes) | 98,133,611 | 92,165,155 |
| Complete HTTP wall time (ms) | 6,014.100 | 6,020.980 |
| Separate request-tagged auxiliary logical bytes | 6,840 | 6,840 |

Projection adds 1,607,086 captured logical bytes (+0.26%), with no material
HTTP change in these fixed-order samples. Neither arm meets 500 ms. These
are not a latency distribution, physical disk bytes, or a hybrid result.

| Targeted work (logical bytes) | Indexed | Projected |
| --- | ---: | ---: |
| Resolution with counts, including its body seeks | 240,762,306 | 241,796,915 |
| Preparation, including its body seek | 303,819,000 | 304,391,477 |

The projected key statements omitted `body` in their native receipts. They
still read 240,391,529 and 204,377,849 logical bytes, respectively. The three
actual body seeks read 1,405,386 and 890,879 logical bytes in total for the
two stages. Each of the three selected one granule. The projected resolution
plan selected 323 and 54 `doc_groups` granules, versus two granules per
canonical document lookup. The projected preparation key plan selected 323
`doc_groups` granules and two canonical document granules. Plan granules are
not additive per-table actual bytes. The remaining canonical creative
preparation query also read 98,434,862 logical bytes. Prioritize the attachment
history access pattern, not another body-column rewrite. The indexed arm is
the complete-read control for Step 3.

## Task and custody

The run started on merged `7f8fc1e1d9a5a315848ee68958d1e273921a84fb`,
droplet `622910856`, ClickHouse `26.10.4.207`, 32/28/22 GiB. The first
attempt encountered a tally verifier name collision before measurement.
Repair `93806d5c6bd7560032c4d17c98a2fa20af630c39` resumed the original
admission, validated the five completed setup stages, and did not reissue
confirmed slice or tally writes. All four composition gates passed. Step 2
completed at approximately `02:14 UTC` on 25 November.

Step 2's private state/receipt archive verified off-host: 15,156,627 bytes,
SHA-256 `28e789faf21ae266fc7301e65c5b49e49939eee8bac408f6b081a066e9cffd45`.
The store stays on the owned host for the Step 3 handoff; this is not final
cleanup, a compute invoice, or a six-case admission.
See the [Step 3 successor](../k20-attachment-20261125/RESULTS.md) for final task
custody, cleanup and the hybrid verdict.
