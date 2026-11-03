# H01 Node-Ad Current Discover Attachment Repair

02.11.2026. Base `099e066a9388c74b23b0e904d087371604cde6af` plus local diff.
Author and fresh reviewer: separate `openrouter/openai/gpt-6.1-sol` contexts.
Local repair only; no protocol L1 PASS or deployment claim.

## Orient And Reproduction

Checked plan/lane/changelog: evidence #1337 merged, node attachment repair open.
Reused the [node evidence](h01-node-attachment-proof.md) actual-loader/ASGI route,
compiler current-link fragment and independent real synthetic SigV4 harness.
Public inventory is intentional under D57/D75; no viewer membership or owner-only
restriction is authorized by this finding. Correct uploader provenance alone does
not establish a current Discover attachment.

Convert both removed-link evidence cases to no-node-ad/no-signer and add isolation
and tie controls. On unchanged runtime, seven denial cases fail after independently
verifying a real synthetic URL: ordinary/group-uploader removal, both timestamp-tie
insertion orders, unrelated-document/group live rows and a live alternate group.
This is the red gate, not a hypothetical SQL warning.

## Bounded Repair

`get_active_node_ads` ranks doc_groups history per `(doc_id, group_id)` before
filtering removals. Restricting to canonical Discover before ranking preserves all
versions of each relevant pair. Deletion wins timestamp ties. Other live group
attachments cannot substitute for Discover. Metadata-only started/completed/failure
logs contain no creative content, object key or credential.

No document tag/deletion filter, status/density/overwrite policy, membership gate,
writer, schema or SDK change. Independent group-author/Bob-uploader context stays
unchanged. The existing document prefilter candidate remains OPEN.

Twelve node-link cases cover active, removed, reattached, never attached, active/
removed group-uploader, both tie insertion orders, unrelated-document/group live
rows, alternate-group-only eligibility after detach, and an unrelated-document
tombstone that must not suppress active inventory. The compiler reference is not
a tie-policy oracle; tied cases assert route/signing denial directly.

## Verification

```sh
# from api/
uv run pytest tests/test_media_read_url_owner.py tests/test_node_ads.py tests/test_ads.py -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k node-link -q
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

169 focused tests pass. Twelve node-link cases pass on both SQLite and isolated
network-none ClickHouse-local Memory tables. Full API: 1,886 passed plus eight
subtests, one opt-in lifecycle test skipped. Full Ruff lint/format pass.
Fresh reviewer independently ran twelve SQLite node probes, pinned-focused
selection and the node-ad suite; no blocking code/test finding.

## DESIGN-INTENT REVIEW

1. Intent: public current Discover inventory serves at configured density,
   independently of creator ads, with no explicit per-viewer membership needed.
2. Delta: historical removed Discover links no longer deliver creatives or mint
   fresh capabilities. Active and newer reattached inventory still delivers.
3. Conflict: none with D41/D57/D75; service-agnostic public inventory, canonical
   Discover, uploader attribution and independent revenue layers remain intact.
4. Standard deviation: none introduced; owner-only/private gating would be an
   unwanted product change, not a repair of attachment freshness.
5. Untested intent: production writer/merge precision and concurrency, anonymous
   routing, metadata/HLS and connected density/overwrite interactions remain OPEN.

Same-model review only, not diverse-family three-dry assurance. Snapshot fixtures
are not DateTime64/ReplacingMergeTree lifecycle, production driver or executed
detach/reattach writes. No real object retrieval or revocation of old URLs before
TTL. Document delete/detag history, inventory provenance, broader pinned roles/app/
service/visibility, CI/rollout and protocol L1 remain OPEN; L2 stays gated.
