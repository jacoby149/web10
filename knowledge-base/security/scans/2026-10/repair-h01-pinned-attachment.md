# H01 Pinned-Ad Current Attachment Repair

02.11.2026. Base `7837c51348ce60add97978b91aaff0dc4740ece3` (#1327 merged).
Local source repair; no commit, PR or deployment. Author/fresh reviewer: separate
`openrouter/openai/gpt-6.1-sol` contexts, not different-family convergence.

## Orient And Repro Gate

Checked plan/lane/changelog and merged attachment evidence. Read learnings,
ad-dissemination intent and the tombstone invariant. The
[historical proof](h01-pinned-attachment-proof.md) isolated creative attachment
history while keeping membership live. Preserve that separation from the merged
membership repair, writer precision and broader creative policy.

Convert removed-link disclosure to denied-ad/no-signer and add eight attachment
controls. Before runtime changes, SQLite and actual ClickHouse-local each report
**5 failed, 7 passed**. The five failures independently verify real synthetic
SigV4 before denying: later removal, tied removal, unrelated document link,
unreadable other-group link and a group-authored creative. Positive/control cases
already pass. No blanket owner-only or all-ads-disabled workaround.

## Minimal Repair

Only the pinned loader's doc_groups subquery changes. Restrict to the bound target
IDs, rank all retained versions per `(doc_id, group_id)` with
`updated_at DESC, deleted DESC`, then require pg.rn=1 and pg.deleted=0. Membership
ranking and the existing reader-specific join remain intact. Safe count logs are
renamed pinned access rather than membership to describe the combined read.

Removal in one group is not a global creative veto: another current linked group
with live reader membership still authorizes delivery. A strictly newer
reattachment works. Other document/group tombstones do not suppress a valid pair.
Independent creative author_key/posted_by remain unchanged; a human uploader's
namespace still supplies group-authored media signing.

## Verification

Twelve link cases pass on SQLite and ClickHouse-local. The five denial cases return
no creative and create no signing client. Active, reattached, never-linked,
alternate live group, active group-author and positive pair-isolation controls
remain. The positive cross-document test was strengthened to batch two target
IDs, so target filtering cannot mask a wrong document/group partition; its second
carrier has no creative document and must have no ad. This is not proof of two
independently resolving existing creatives.

The extracted shared compiler fragment remains a comparison for strictly ordered
history. It lacks a deletion tie-breaker, so the tie case deliberately does not
claim that fragment is deterministic authority. Pinned-loader tie denial is tested
directly; shared compiler/other-reader tie semantics remain separate.

From api/:

```sh
uv run pytest tests/test_media_read_url_owner.py -k pinned-link -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned-link -q
uv run pytest tests/test_media_read_url_owner.py -k 'pinned-link or pinned-member' -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k 'pinned-link or pinned-member' -q
uv run pytest -q
```

Full API: **1,767 passed plus eight subtests**. Full API Ruff, focused formatting
and whitespace checks pass. Fresh same-model reviewer independently ran all 22
attachment/membership cases on both backends and the structural SQL test; no
blocking defect found. No three-dry or diverse-family sign-off.

Actual SQL executes in isolated network-none ClickHouse-local 24.8.14.39 Memory
fixtures as in the proof. Carrier/role fixtures, reduced UInt64 schemas and fixed
parameter binding remain doubles. No production driver/DateTime64/MergeTree
lifecycle, executed detach/reattach writer, concurrent visibility, production IAM,
real object bytes or full direct-read HTTP-denial comparison is certified.

## DESIGN-INTENT REVIEW

1. Intent: inline pinned creative access requires a current creative/group link
   and the reader's current membership, not just a readable carrier (D41/D75).
2. Delta: removed historical links no longer issue creative bodies/capabilities;
   current links, alternate groups and newer reattachments retain delivery.
3. Conflict: none identified; node readability and generic service-agnostic ads
   stay intact. No new role/app/node-ad policy is introduced.
4. Standards: no new deviation; apply the documented latest-state invariant.
5. Risk: production timestamp precision, detach persistence, merges/concurrency,
   real-driver binding and performance at realistic history sizes remain open.

## Remaining Boundaries

The detach writer, other attachment readers, shared compiler ties, creative
identity and broader role/class/app/visibility/node-inventory rules are unchanged.
Existing signed capabilities retain their TTL; this does not revoke old URLs.
Real-schema lifecycle, CI/publication, rollout and required different-family
review remain OPEN. This is local pinned attachment read repair only, not
whole-ad/media/prepare assurance or protocol L1 PASS. L2 stays gated.
