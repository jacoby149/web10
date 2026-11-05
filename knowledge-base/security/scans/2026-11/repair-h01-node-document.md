# H01 Node-Ad Current Document Repair

05.11.2026. Base `fabfed6dccaf95a5b851ba5067d98b95bedf3941` plus local diff.
Author: `openrouter/openai/gpt-6.1-sol`. Local repair only; protocol L1 OPEN.

## Intent And Reproduction

An operator must be able to delete a creative or remove its node_ad tag without
the next read serving an older version. Public current Discover inventory stays
public; this is not a reason to add per-viewer membership or owner-only checks.
Checked plan/lane/changelog and the security learnings before taking the open
H01-NODE-DOC-REPAIR bite. The attachment repair is already present; the document
prefilters remain. Recession: current-link correctness alone does not guarantee
current document eligibility. Gap: uploader provenance also does not establish
eligibility. Broader ad authority and real lifecycle evidence stay separate.

Reuse the [retained evidence](../2026-10/h01-node-document-proof.md): actual
loader SQL, registered `/v3/read` enrichment, actual resolver and botocore signer,
with independent HMAC verification of synthetic SigV4. Canonical Discover links
remain live, carrier reads are doubled and no viewer membership row exists.

Convert disclosure assertions to no-node-ad/no-signer; add equal-timestamp
deletion in both insertion orders, active group-author and unrelated-document/
author tombstone controls. Against unchanged runtime: five fail after a real
synthetic capability is independently verified; eight permitted/control cases
pass. Red log: `.context/h01-node-doc-red.log` (local, not a shipped artifact).

## Narrow Repair

`get_active_node_ads` ranks all document history per `(doc_id, author_key)`, then
filters `rn = 1`, deletion and node_ad eligibility. Deletion wins timestamp ties.
Status filtering, current Discover links, service-agnostic public distribution,
density/overwrite, uploader contexts and existing safe metadata logs are unchanged.
No new endpoint, schema, SDK, writer, credential or TTL behavior.

Thirteen document cases cover active, deleted, detagged, paused, reactivated,
restored, retagged, deleted/active group-author with Bob uploader, unrelated doc/
author deletion and both deletion-tie insertion orders. Ordinary histories also
execute the actual compiler document subquery as a reference. Its timestamp-only
ordering is not a tie oracle: tied cases assert route/signing denial directly.

## Verification

From `api/`:

```sh
uv run pytest tests/test_media_read_url_owner.py -k 'node-doc or node-link or pinned' -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k node-doc -q
uv run pytest tests/test_media_read_url_owner.py tests/test_node_ads.py tests/test_ads.py -q
uv run pytest -q --disable-warnings
uv run ruff check .
uv run ruff format --check .
```

The first selection passes 47 cases. All thirteen document probes pass on
isolated network-none ClickHouse-local 24.8 Memory tables as well as SQLite.
The full focused selection passes 182 tests. Full API: 2,058 passed plus eight
subtests, one opt-in lifecycle skip. Full Ruff lint/format and whitespace checks
pass. Local logs live under `.context/h01-node-doc-*.log`. Runtime/test diff is
50 added/deleted lines, below the 500-line budget; committed-PR CI is not run.

## Review And Limits

Fresh read-only reviewer: separate `openrouter/openai/gpt-6.1-sol` context,
session `ses_e542bce75ffeN1wQwg1lvcoKfb`. Independently passes 25 SQLite
document/link and thirteen ClickHouse-local document probes. An in-memory-only
substitution restores original loader SQL and reproduces all five denial failures
after verifying the synthetic capabilities. No blocking defect or overhardening
found. Its initial driver expected source text in an exec traceback; correcting
that diagnostic assertion yields the five expected failures, without file edits.
This is bounded same-family review, not three-dry/model-diverse convergence or
whole-node-ad PASS.

### DESIGN-INTENT REVIEW

- Intended behavior: publicly serve current active Discover inventory at the
  configured density, preserving service-agnostic selection and independent uploaders.
- Changed behavior: operator deletion/detag stops stale delivery/fresh signing;
  the fan still receives the carrier. Newer restoration/retagging/reactivation
  remains. Other authors/documents are isolated; group authors retain Bob's upload.
- By-design conflict: none found; no membership/owner-only restriction added.
- Conventional standard violated intentionally: no new deviation; cross-user
  public distribution remains the existing Discover model, not a privacy failure.
- Tests cover the delta: five red-to-denied-green signing replays plus positive
  lifecycle, uploader, tie-order and identity-isolation controls.
- Untested intent risk: real writer/merge precision/concurrency, anonymous routing,
  other-service inventory, density/overwrite, HLS and provenance remain release
  gates, not accepted as production proof. Ranking full history may increase query
  cost; accept this bounded correctness change locally, require representative
  latency/load measurement before rollout, revisit if inventory reads degrade.
- KB write-back: dated learning, contract, security record, AGENTS and plan/lane
  updated; no architectural decision reversed.

Reduced integer-version Memory/SQLite snapshots are not production DateTime64/
ReplacingMergeTree merges, actual delete/detag writes, concurrency, driver
binding or object retrieval. Existing capability URLs remain valid until TTL.
Inventory provenance, broader pinned/node-ad app/service/group/visibility policy,
anonymous routing, real lifecycle, CI/rollout and protocol L1 remain OPEN.
No L2 advancement, production changes or deployment.

## PR Publication Follow-Up

PR #1402 merges `origin/dev` at `2461effa1`, preserving #1400's people-tag
implementation, release entries and security learning. Resolve the adjacent
learnings insertion by retaining both; restore the changelog entry boundary and
renumber only this branch's release/plan/lane from 4.10.5 to 4.12.1 above dev's
4.12.0. No API runtime/test changes arrive from dev. Earlier receipts remain
pre-merge evidence; post-merge checks and normal PR CI remain separate gates.
