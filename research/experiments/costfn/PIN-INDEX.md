# Find billboard pins by exact post key

Jacob requests a skinny app-shaped lookup and a rerun, not a new document
model or a platform API change. At the research reader -> ClickHouse boundary,
`billboard_pin_refs` has just `(author_key, ref_value, doc_id)`, in that order.
The table represents `placements`, so it does not repeat the type on each row.
`author_key` identifies both the post and the pin's author under the existing
pin eligibility rule. The two IDs identify the post root and the candidate pin.

The table is derived from every historical placement on the frozen disposable
canonical copy, not from setup UUIDs or just current/live rows. A signed exact
edge census rejects omissions, extras and duplicates; parts freeze before serving.
The lookup returns every matching edge for exact full post keys, with no body or
LIMIT. The canonical query reads complete histories for those exact full pin IDs,
resolves their latest versions with deletion winning ties, then checks live
placement, current root and SQL `post_author` omission. An old edge cannot serve
a deleted, moved or retyped pin. One pin can have two historical edges on the
same page; the canonical winner still decides. D124 and the creative fetch retain
the existing validation and read authority.

Admission explicitly chooses this path. The ads gate requires exact B attachment
response parity on both actual pages, the independent setup oracle, full index
census and immutable-part checks. B remains available as the control, not a
silent fallback. The measured cells separately capture index discovery, canonical
materialization, all auxiliary reads and unchanged creative work. Bank build and
census cost separately. The table is a research access path, not production
storage, an app-deployed index, a live maintenance promise or a generic API change.

## Compare to the banked B observation

Measured uniform B: 8,847,767,874 captured logical bytes. Pin selection alone
reads 8,724,652,469 bytes and peaks at 779,239,804 bytes native query memory;
body materialization reads 53,769 bytes. Non-pin reads total 123,061,636 bytes
in that sample; warmup delivery history separately reads 2.08 GB. Reducing pin
cost may materially improve the full feed, but these inputs do not predict a
native outcome. Compare exact response parity, both pin stages, full warmup and
measured feed costs, peak memory and latency. The operator wants the best observed
tradeoff, not a 25 MB stop/acceptance requirement. No p95 or capacity inference.

Finish and preserve the active B run. After this source patch merges with all
checks green, bind the rerun to exact source and unchanged experiment gates and
resource bounds. Keep off-host receipts and verified owned cleanup. Do not add
the treatment to the already-running B worker or silently reuse old verdicts.
