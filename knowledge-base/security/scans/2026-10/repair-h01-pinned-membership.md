# H01 Pinned-Ad Current Membership Repair

02.11.2026. Base `58b0ebf329a3109ad5ecf9f22b7405e1f4fdaf32` (#1321 merged).
Local working-tree repair, no PR or rollout. Author/fresh reviewer: separate
`openrouter/openai/gpt-6.1-sol` contexts, not different-family sign-off.

## Orient And Repro Gate

Checked plan/lane/changelog and merged evidence PR. Read learnings, pinned-ad
intent and the tombstone invariant. The [baseline proof](h01-pinned-membership-proof.md)
established that historical live membership can attach a creative after removal.
No new role/app/service/node-ad policy is authorized by this repair; Shadowguard
remains deferred v4.

Convert the retained revoked assertion to require no ad and no signer. Add six
history controls. Before runtime edits, both SQLite and actual ClickHouse-local
report **5 failed, 5 passed**. The five denial cases independently verify a real
synthetic SigV4 capability before failing: later tombstone, tied tombstone,
another member remaining, unrelated-group membership and group-authored creative.
Permitted/control cases already pass, so the red result is not blanket denial.

## Minimal Repair

Only the pinned loader's membership subquery changes. Restrict to the bound
reader, rank by `(group_id, member_key)` with `updated_at DESC, deleted DESC`, then
require rn=1 and deleted=0 before the creative attachment join can authorize it.
Do not pre-filter tombstones. Safe start/completion logs expose counts only.
No API, schema, SDK, uploader or node-inventory behavior changes.

The carrier stays readable when the ad is denied. A strictly newer rejoin still
works. Current membership in another group attached to the creative still grants
delivery; removal in one group is not a global veto. Group-authored creatives
retain their human posted_by for signing, not the reader/carrier/group identity.

## Verification

Same ten probes after repair: **10 passed** on each backend. Denied cases return
no creative and never create a signing client. Positive cases verify actual
synthetic signatures; active/rejoined/never-member and independent owner behavior
remain covered. The structural SQL test now checks the current-history boundary.

From `api/`:

```sh
uv run pytest tests/test_media_read_url_owner.py -k pinned-member -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned-member -q
uv run pytest tests/test_media_read_url_owner.py tests/test_ads.py tests/test_node_ads.py tests/test_v3_clickhouse.py -q
uv run pytest -q
```

Focused **365 passed**; full API **1,755 passed plus eight subtests**. Full API
Ruff, focused formatting and whitespace checks pass. Fresh same-model reviewer
independently reran both ten-case backends and the structural test; no blocker.

Actual SQL executes in ClickHouse-local 24.8.14.39, disposable network-none
Memory tables, as in the baseline receipt. Controlled carrier/role fixtures,
fixed parameter substitution and reduced UInt64 history schemas remain; this is
not the real driver, production ReplacingMergeTree/DateTime64 lifecycle, removal
API replay, concurrent revocation latency, production IAM or real object retrieval.
Old signed URLs are not revoked before their existing expiry by this repair.

## DESIGN-INTENT REVIEW

1. Intent: attach a pinned creative only through the reader's own current creative
   group membership, preserving generic service-agnostic delivery (D41/D75).
2. Delta: retained historical membership no longer returns creative bodies/new
   capabilities. Active, rejoined and legitimate alternate-group access survive.
3. Conflict: none found; node readability is not permission for a removed reader,
   and this does not silently replace membership-first reads with role-only reads.
4. Standards: no new deviation. Current-state evaluation repairs the documented
   tombstone invariant inside the existing model.
5. Risk: real storage/timestamp/concurrent visibility and query cost at realistic
   history sizes remain unverified. These are open integration/release obligations.

## Remaining Boundaries

Publication preparation: merged `origin/dev` at `bd9b87ec2` (documentation-only
incoming changes), retained its changelog entries and renumbered only this repair
to 3.254.12. API source/tests remain identical; the full 1,755 tests plus eight
subtests pass again on the combined branch.

The doc_groups attachment subquery is unchanged; attachment tombstone history can
still require its own evidence/repair. Group/app/service/visibility/class rules,
node-ad inventory, stored media provenance and old capability TTL remain separate.
Local source repair is not whole-pinned-ad, whole-media, whole-prepare or L1 PASS.
CI/publication, rollout and required diverse review remain OPEN; L2 stays gated.
