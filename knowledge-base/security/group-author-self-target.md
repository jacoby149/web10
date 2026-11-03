# Group Author Self-Target Receipt

## Intent Before Repair

Date: 02.11.2026. Scope: document creation and explicit delegated self-target
update continuity. Model: openai/gpt-6.1-sol.
The group-as-author spec lives in `strategy/group-as-author.md`; there is no
`web10-v3/groups/group-as-author.md` in this checkout. Strategy/shared security
records remain owned by the coordinating agent.

The original two-gate description left self-target authorization unspecified:
groups are not automatically members of themselves. The operator-requested narrow
rule is: after verifying the human token, existing acting group and current
human `create` grant for the requested service in that group, an explicit target
exactly equal to `author_as` is writable without a self-membership row. Ownership
alone or a different service grant is insufficient. Authority is the existing
effective union: direct role plus `anyone`/legacy `anon`/`authenticated` classes,
including wildcard service grants. Explicit human membership is not required.
Removing one membership denies only if no other effective create authority remains.

Every other target retains the existing acting-group membership/principal-class
write gate. Never borrow the human's unrelated memberships. Discover is just an
external target under that rule, not a node-side special case. Preserve target
filtering: attach only writable requested targets; deny before insert if none
are writable. Do not implicitly add self or Discover. App contracts remain human
scoped and `posted_by` remains the verified human, not client-supplied metadata.

Lifecycle continuation authorized by the operator after fresh review: an explicit
delegated update with live service `updateOwn` may retain an already-stored exact
self attachment without `create`. A new self attachment requires both live
`updateOwn` and effective human `create` for that service; a group self-member row
cannot substitute. All external targets retain the existing write check, even
when already stored. Omitted targets retain existing behavior. This exception is
limited to explicit `author_as`; legacy poster-lookup behavior is unchanged.

## Evidence And Open Gates

The initial 15-case actual `/v3/create` suite ran before the runtime edit:
6 failed / 9 passed. Self-only returned the exact reported 403; authorized
self-plus-Discover returned only Discover. The revocation replay failed at its
initial legitimate create, not because revocation was bypassed.

Repair: `api/app/v3/endpoints/documents.py` accepts exact self-target equality
only after the existing live delegation and human app-contract checks. External
targets still execute the unmodified `can_write_group`. Diagnostic logging adds
only requested/writable counts, not tokens, principals or document content.

`api/tests/test_group_author_self_target.py` now contains 41 cases. Real signed
synthetic token decoding, ASGI routing, effective role merging and write predicates
execute; group/member reads, insert/attachment and app-contract lookup are doubles.
An owner role with a live service create grant can self-target without a
self-member row. Discover composes via group membership, `anyone`, or
`authenticated` create grants; without one, only self survives. Human-only
unrelated, foreign and ungranted external targets deny before insertion. No grant,
owner role without create, service mismatch, bystander, foreign acting group,
missing group and between-request loss of all effective authority deny. Forged top-level/body audit
values cannot replace the server human column. Human app denial still denies;
empty requested targets add neither self nor Discover.

Fresh-review continuation reproduced 3 failures / 32 passes before the update
repair: omitted groups allowed editing with update-only authority, explicit
unchanged self denied; new self denied despite create+update, while a self-member
row incorrectly allowed adding self without human create. The same tests now
pass. Lifecycle storage doubles carry actual create insert arguments/attachments
into the actual update route; mutation and attachment sinks are asserted. Tests
pin immutable audit arguments, revoked/wrong-service update denial, human app
denial, human-only/near-match target denial and rechecking stored external targets.
Additional create controls cover nonmember principal-class authority, remaining
authenticated-class authority after explicit membership removal, non-owner service
writers, wildcard grants and full-ID near matches. No owner-role-name gate added.

Further fresh security re-review identified stale attachment authority in
`get_doc_groups`: filtering `deleted = 0` before version selection lets detached
self attachments pass the update-only retention exception. Six SQL-backed route
cases ran before repair: 5 failed / 1 passed. Four histories returned HTTP 200
instead of 403 (detach, both tie insertion orders, and unrelated-document live
attachment); newer reattachment also returned duplicate IDs. The active control
passed. This is a demonstrated local unauthorized reattachment authorization,
with mutation/attachment sinks doubled, not proof of durable deployed writes.

The generic helper now ranks all versions per `(doc_id, group_id)` by
`updated_at DESC, deleted DESC`, then selects rank one and filters tombstones.
Actual helper SELECT and detach INSERT/SELECT execute over synthetic SQLite;
only driver parameter syntax is translated and `now()` supplies controlled
timestamps. Create attachment inserts are doubled into that history. Detached
and tied deletions now deny before mutation/replacement, a strictly newer live
reattachment and unchanged active attachment permit update-only retention, and
other documents cannot supply authority. All six cases pass after repair.

Generic repair avoids duplicating current-attachment policy. Callers inspected:
single-document group exposure, explicit self-update retention/update responses,
HLS authorization and direct media-thumbnail authorization. Their existing focused
tests pass. Other direct `doc_groups` readers and attach/detach writers are not
rewritten or certified by this helper fix. In particular, real ReplacingMergeTree
merge/timestamp-tie persistence and replacement lifecycle remain connected gates.

Verification on 02.11.2026:

```sh
cd api
uv run --frozen pytest -q tests/test_group_author_self_target.py tests/test_acting_identity.py tests/test_v3_endpoints.py tests/test_v3_access.py tests/test_v3_clickhouse.py tests/test_hls.py tests/test_thumbnail.py
# 635 passed; dependency/deprecation and existing synthetic-key warnings
uv run --frozen pytest -q
# 1796 passed plus 8 subtests (six more cases than coordinator's prior 1790)
uv run --frozen ruff check app tests
# All checks passed!
```

Scope accounting: L1 changed create/update/helper slices and L2 direct auth/effective-role/
target-write helpers inspected; no whole-file L1, L3 service or L4 project scan
claimed. The original create repair restores legitimate functionality; the
subsequent SQL replay demonstrates a local stale-attachment authorization flaw.
Neither constitutes independent security PASS or whole-storage assurance.

Fresh same-model re-review after the helper repair found no remaining actual
findings in the bounded change and passed its five-question design-intent gate.
The reviewer independently reran all 635 focused tests, including 41 self-target
cases. This is not model-diverse convergence or whole-surface security sign-off.

OPEN: real ClickHouse membership/tombstone visibility, persisted attachment/audit
round trip, concurrent revocation timing, browser own-group-plus-Discover publish
and rendering, connected app-contract enforcement, CI/release/deployment and
independent model-diverse security review. Coordinator reports authoritative KB/model
wording reconciled and prior full social suite 1652 passed; this backend turn did
not rerun social tests. Full API and API lint were rerun after the final helper
change as recorded above. No credentials, production changes, commits or pushes.
Shared changelog/plan/parallel/AGENTS/learnings and strategy spec were not edited
by this agent. No social-specific API surface added; generic helper consumers now
receive current attachments rather than historical live rows.
