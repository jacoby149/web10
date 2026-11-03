# H01 Pinned-Ad Membership Evidence

02.11.2026. Pin `860f628cf618f90269c22baadb43b95aa55b6533` (#1317 merged)
plus test-only probes. Author/fresh reviewer: separate
`openrouter/openai/gpt-6.1-sol` contexts. Finding OPEN; no production repair.

Historical baseline receipt. #1321 merged this evidence; subsequent
[local membership repair](repair-h01-pinned-membership.md) converts the disclosure
assertion to denial. The reproduction/results below describe the evidence pin,
not the repaired working tree or whole-ad authority.

## Orient And Scope

Checked plan/lane/changelog; face repair is merged and attached-ad authority is
still open. Shadowguard is deferred v4, not this lane. Read current learnings,
ad dissemination and the tombstone invariant. Independent creative access and
dedup-before-deletion are explicit requirements. Do not conflate this finding
with object namespace provenance, cross-service policy or node-ad publicness.

Bounded source: `resolve_pinned_ads`/`attach_pinned_ads` at clickhouse.py
3182-3237, current membership helpers at 1469-1583, removal writer at 1383-1394
and read-route attachment composition at documents.py 381-384. The loader's
group_members JOIN filters historical deleted=0 rows without latest-state dedup.
The normal membership helper first ranks all versions, including tombstones.

## Reproduction

Extend `test_media_read_url_owner.py` with four isolated subprocess cases:
active, revoked, rejoined and never-member. Fixed synthetic creative/group IDs,
one current creative, one live attachment, no public/authenticated memberships.
Revoked history has an old active membership and a newer removal tombstone.
Actual loader and membership SQL execute against that history, not canned rows.

Actual `can_read_group` computes the reference decision. Group-role context is
doubled; carrier readability and the carrier document are supplied fixtures.
The carrier has only an ad pointer, not the creative body. Actual ASGI `/v3/read`,
synthetic JWT verification, attachment functions, uploader resolution and real
synthetic botocore signing compose the response. An independent HMAC verifier
checks SigV4 scope, path, expiry, timestamp and signature.

| Membership history | Group gate | Inline creative | Synthetic capability |
|---|---|---|---|
| Active | Allowed | Present | Verified |
| Removed, historical live row retained | Denied | Present | Verified |
| Removed then rejoined | Allowed | Present | Verified |
| Never a member | Denied | Absent | No signer |

`direct_allowed=False` is the actual group predicate, not a second HTTP read's
403. No Origin/delegated client is supplied, so no app-contract bypass is proved.
The evidence is a stale-membership authorization failure, not a foreign-key
namespace bypass: Bob's authorized-uploader namespace is used correctly after
the creative was attached without current reader authority.

## Two Execution Backends

Default probes execute the production statements in in-memory SQLite after
translating only parameter placeholders and converting stored JSON tags to arrays.
Standard Python socket/DNS APIs are blocked. No storage retrieval occurs.

`H01_AD_CLICKHOUSE=1` executes the same captured statements via ClickHouse-local
24.8.14.39 in disposable `docker run --rm --network none` containers, no host
mounts, one CPU/512 MB ceiling. Each query recreates fixed synthetic Memory tables
and history; parameters are fixed quoted synthetic strings, not the real driver.
Reduced schemas use UInt64 version ordering, not production DateTime64 or a
ReplacingMergeTree lifecycle. This demonstrates real SQL behavior with coexisting
historical rows, not real-schema persistence, merge timing or revocation latency.

Image ID: `sha256:999a072d6f927d54b32742a0ca619a94786a34d6c39bf90caabf0530ec9b076b`.
Repository digest: `sha256:1ffa82edee000a42c09313bd9f1293d94c570aee74babc1b3ca9983a35fa597b`.
Docker server 27.4.0. No production credentials, mounted data or real objects.

From `api/`:

```sh
uv run pytest tests/test_media_read_url_owner.py -k pinned-member -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned-member -q
H01_AD_CLICKHOUSE=1 uv run python tests/test_media_read_url_owner.py pinned-member-revoked
```

Both four-case suites pass. Direct ClickHouse replay reports:
`state=revoked direct_allowed=False inline_ad=True` after verifying real synthetic
signing. Passing these evidence assertions means reproduction, NOT denial/repair.
Convert the revoked case to a denied-ad/no-signer control in the separate repair.

## Verification And Review

Full API: **1,749 passed plus eight subtests**. Full API Ruff, focused formatting
and whitespace checks pass. Fresh same-model reviewer independently reran both
four-case backends, confirmed SQL-driven results and actual composition, and found
no blocking evidence defect. No different-family or three-dry sign-off.

Design-intent review: intended behavior is a readable carrier with an independently
authorized creative; delta is tests only; D41/D75 do not exempt revoked memberships;
no new conventional-standard deviation; production merge/storage, real retrieval
and broader creative policies remain untested. No product behavior changed.

## Repair Gate And Remaining Work

Next bounded repair: dedup pinned-ad membership history before filtering removal,
deny the retained revoked probe before creative return/signing, and preserve active,
rejoined and never-member controls plus independent uploader attribution. Require
red-to-denied-green replay, fresh design-intent review, KB write-back and all CI
green. Do not repair unrelated role/app-contract/node-ad policy in the same slice.

Attachment/contract/visibility/service-policy authority, node-inventory latest-state
semantics and real-schema removal/rejoin lifecycle need separate evidence. Canonical
group KB role wording and current membership-first implementation also need explicit
reconciliation before asserting a new per-service authorization policy. None of
those is proved or closed here. No runtime change, PR, rollout, actual object-byte
disclosure or protocol L1 PASS; L2 stays gated.
