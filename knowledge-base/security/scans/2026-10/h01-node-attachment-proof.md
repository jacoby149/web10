# H01 Node-Ad Attachment Authority Evidence

02.11.2026. Source pin `c6d11a57c5efbd7244d15e698c07a862c29b748c` plus
test-only extension. Author, read-only node scanner and fresh reviewer use
separate `openrouter/openai/gpt-6.1-sol` contexts. Finding OPEN; no runtime repair.

## Orient And Scope

Checked lane/plan/changelog before continuing H01-AD-AUTHORITY. The prior pinned
attachment repair is merged as #1335; its green CI does not repair node inventory.
Read security learnings, thesis, node/ad dissemination intent, prior store-B/P-C2
warnings, compiler boundary and registered read/query enrichment. Onboarding: I3
has no storage ACL backstop. Recession: pinned membership/attachment fixes leave
the independent node loader unchanged. Obvious gap: correctly binding the media
uploader does not prove current public-inventory eligibility.

Bounded comparison, not exhaustive file/call-graph coverage:

| Path | Actual boundary | Disposition |
|---|---|---|
| Pinned creative | Current document, current exact reader membership and current attachment | Earlier repairs retained; service roles/public classes/app and visibility still need explicit evidence/intent reconciliation |
| Node creative | node_ad tag, active body, any historical live Discover link | Public inventory is intentional; stale-link delivery reproduced below |
| Read carrier | App/service/effective-group gates before ad enrichment | Carrier access does not certify creative eligibility; probe doubles carrier reads |
| Query prepare | Canonically rebind carrier before ad loaders, mint if media requested | Rebinding carrier alone does not repair loader inventory; query route not exercised here |

`get_active_node_ads` at pin lines 3293-3307 prefilters document tags/deletion
before ranking, then accepts raw nondeleted Discover attachments without ranking
them. `attach_node_ads` at 3353-3371 attaches inventory by configured density,
independent of creator preference. Read group route at documents.py:389-392 then
resolves media. Resolver at clickhouse.py:3705-3711 uses the creative's own uploader.

Do not relabel intentional public inventory as a missing viewer membership gate.
D57/D75 permit public service-agnostic node creatives regardless of carrier ad_mode.
Operator-only inventory provenance is not established by tags alone, but reachable
non-admin injection is NOT proved by these fixtures. Document delete/detag
prefilter ordering is a separate source candidate, not executed exploit evidence.

## Six Synthetic Replays

Extend `test_media_read_url_owner.py` with node-link cases, reusing isolated real
botocore signing and independent HMAC verification. One current active node-tagged
creative has a Bob-owned raw MinIO key. Carrier belongs to Alice, is readable and
unpinned. Density is 100%, overwrite disabled, canonical DISCOVER_GROUP_ID used,
and no explicit reader memberships exist. Vary only creative attachment history.

Execute actual loader SQL, not selected mock rows. SQLite adapts placeholders,
JSON tags/has; optional ClickHouse-local executes the same statements in disposable
network-none Memory tables. Execute the actual compiler's extracted dg attachment
subquery on the same snapshot; it is a current-link reference, not full HTTP denial.

| History | Current link | Inline node ad | Fresh capability |
|---|---|---|---|
| Active | Present | Present | Verified |
| Removed, older live retained | Absent | Present | Verified disclosure |
| Newer reattachment | Present | Present | Verified |
| Never attached | Absent | Absent | No signer |
| Active, group author/Bob uploader | Present | Present | Verified Bob key |
| Removed, group author/Bob uploader | Absent | Present | Verified disclosure |

Registered ASGI /v3/read, verified synthetic JWT, real attachment/resolver and real
synthetic SigV4 compose the response. Passing removed probes deliberately assert
disclosure, not desired policy. Future repair must convert those same assertions
to no-node-ad/no-signer. No real object retrieval or production storage claim.

## Verification And Fresh Review

```sh
# from api/
uv run pytest tests/test_media_read_url_owner.py -k 'node-link or pinned' -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k node-link -q
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

28 focused SQLite probes pass; all six node probes pass on ClickHouse-local.
Full API: 1,880 passed plus eight subtests, one opt-in lifecycle test skipped.
Full Ruff lint/format pass. Fresh reviewer independently reran all six SQLite node
probes and found no blocking evidence defect. Same-model only, not diverse/three-dry.

## DESIGN-INTENT REVIEW

1. Intent: public current Discover inventory serves at configured density as an
   independent node revenue layer; no explicit per-viewer membership is required.
2. Delta: tests only. Removed-link cases expose existing delivery, not a repair.
3. Conflict: none with D41/D57/D75; public delivery is intended, historical removed
   placement is not current placement. Do not impose owner-only creative reads.
4. Standard deviation: none introduced; service-agnostic and public behavior kept.
5. Untested intent: real merge/writer lifecycle, concurrency, anonymous routing,
   metadata/HLS, density/overwrite interactions and broader creative policy remain.

## Next Gates

Separate H01-NODE-LINK-REPAIR: rank current document/group attachments before
removal filtering, convert both stale-link signing probes to denial, and preserve
active/newer reattached public inventory and independent uploaders. Add pair and
alternate-group isolation controls; <=500 code/test lines, fresh intent review,
KB write-back and every CI check green.

Reduced schemas/integer history are not DateTime64/ReplacingMergeTree merges,
production driver or executed detach lifecycle. No timestamp-tie assurance here.
Document deletion/detag history, inventory provenance, pinned role/class/app/service/
visibility semantics, real object access, rollout and diverse sign-off remain OPEN.
H01-AD-AUTHORITY is partial, protocol L1 remains OPEN and L2 stays gated.
