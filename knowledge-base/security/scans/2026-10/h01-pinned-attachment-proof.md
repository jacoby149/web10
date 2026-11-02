# H01 Pinned-Ad Attachment History Evidence

02.11.2026. Pin `5a3d5bbde9026c23ea3b9c512084bbc8d37f19a5` (#1322 merged)
plus test-only probe extension. Author/fresh reviewer: separate
`openrouter/openai/gpt-6.1-sol` contexts. Finding OPEN; no runtime repair.

## Orient And Scope

Checked plan/lane/changelog and merged membership repair. Read learnings,
ad-dissemination intent and the all-path tombstone invariant. The remaining
pinned loader still joins raw doc_groups history with pg.deleted=0. Membership
history now ranks correctly; that does not establish current creative attachment.

Scope: resolve_pinned_ads/attach_pinned_ads, the compiler's attachment boundary,
the inspected detach/replace writer, and registered read enrichment. The writer
appends removal tombstones; the attachment boundary selects latest history before
filtering deletion. No node-inventory or broader role/app-policy determination.

## Reproduction

Extend the existing isolated synthetic signer harness with four pinned-link cases.
Alice remains a live member in every case. One current Bob creative carries a
raw Bob-owned MinIO key; the readable carrier fixture contains only its pointer.
Vary only the creative's attachment: active, removed, reattached, never attached.
Histories have strictly increasing integer version timestamps.

Parse the actual safe_query._boundary_cte_sql output and extract its dg subquery
AST. Execute that actual compiler attachment fragment, narrowed to the synthetic
creative/group, on the same fixture snapshot as the actual loader SQL. This is
a current-link reference, not a copied policy query or full direct-read decision.
The actual group predicate confirms membership remains allowed throughout.

Actual ASGI /v3/read, synthetic JWT verification, pinned attachment, uploader
resolution and real synthetic botocore signing compose the output. Independent
HMAC verification checks scope, path, expiry, timestamp and signature.

| Attachment history | Compiler current link | Inline creative | Capability |
|---|---|---|---|
| Active | Present | Present | Verified |
| Removed, old live row retained | Absent | **Present** | **Verified disclosure** |
| Reattached | Present | Present | Verified |
| Never attached | Absent | Absent | No signer |

The removed case reports `current_attachment=False inline_ad=True`, despite the
now-correct membership history logic. Passing that positive-disclosure assertion
means evidence, not desired policy. Convert it to denied-ad/no-signer in repair.

## Backends And Limits

Default: actual production statements execute in SQLite with parameter-placeholder
translation and fixture tag conversion. Optional H01_AD_CLICKHOUSE=1: the same
statements execute in disposable network-none ClickHouse-local 24.8.14.39 Memory
tables, one CPU/512 MB cap, no mounts. Image provenance/fixtures follow the
[membership proof](h01-pinned-membership-proof.md#two-execution-backends).
Each query recreates the same controlled snapshot; no concurrent lifecycle claim.

Carrier readability and group-role context remain doubled. Reduced schemas and
fixed fixture parameter interpolation are not the production driver, DateTime64,
ReplacingMergeTree/merge timing, or an executed detach/reattach API lifecycle.
The writer was inspected, not called; its timestamp precision is separate debt.
No direct HTTP-denial comparison, real object retrieval, production IAM or rollout.
Requests omit Origin/delegated client; no app-contract bypass is established.

## Verification And Review

From api/:

```sh
uv run pytest tests/test_media_read_url_owner.py -k pinned-link -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned-link -q
H01_AD_CLICKHOUSE=1 uv run python tests/test_media_read_url_owner.py pinned-link-removed
uv run pytest -q
```

Four attachment probes pass per backend. Reviewer also ran all ten retained
membership controls on both backends successfully. Full API **1,759 passed plus
eight subtests**; full API Ruff, focused formatting and whitespace checks pass.
Initial full-suite and combined reviewer ClickHouse invocations timed out; complete
reruns passed. Initial ClickHouse reference-count checks exposed JSON UInt64
strings (including "0"); converting counts to int corrected that test adapter.

Fresh same-model review found no blocking evidence defect and independently
confirmed current attachment absence versus inline creative/signature presence.
No different-family or three-dry sign-off. Design-intent review: independent
creative access is required, delta is tests only, D41/D75 do not authorize stale
attachments, no new standard deviation, and future repair must retain active/
reattached/alternate-group access and uploader identity. No product behavior changed.

## Next Gate

Separate bounded repair of pinned doc_groups history: rank current document/group
versions before removal filtering, deny the retained removed-link replay before
creative/signing, and retain legitimate current links. Add isolation, reattachment,
alternate live-group and uploader controls, fresh intent review and KB write-back;
keep <=500 code/test lines and require every CI check green.

Timestamp ties/writer precision, other attachment readers, creative identity,
role/class/app/visibility policy and node-inventory semantics remain separate
evidence/repair obligations. Existing capability TTL, real-schema lifecycle,
CI/rollout/diverse review and protocol L1 remain OPEN; L2 stays gated. No PR or
runtime repair created for this evidence slice.
