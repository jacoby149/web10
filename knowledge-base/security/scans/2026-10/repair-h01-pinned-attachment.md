# H01 Pinned-Ad Current Attachment Repair

02.11.2026. Base `70f6255154dd666558b38d2469ef1f66851874fa` plus local diff.
Author and fresh reviewer: separate `openrouter/openai/gpt-6.1-sol` contexts.
Local repair only; not a protocol L1 PASS.

## Evidence And Repair

Checked lane, plan, changelog, thesis, learnings and ad-dissemination intent.
Replayed the four historical attachment probes successfully, including the old
positive-disclosure assertion. Converted removal to denied-ad/no-signer and added
history controls. Before repair, five removal probes independently verified a real
synthetic SigV4 capability before failing denial. The first expanded run also
exposed a fixture incorrectly revoking membership in the attachment-only alternate
case; corrected that fixture. The compiler reference's timestamp-only ordering is
not a tie-policy oracle, so tie probes assert route denial, not reference parity.

`resolve_pinned_ads` now ranks doc_groups versions per `(doc_id, group_id)`
before filtering removals. Deletion wins timestamp ties in either insertion order.
The existing exact-group join to current reader membership remains unchanged.
Target filtering occurs inside the ranked subquery without excluding tombstones.
No writer, schema, node-ad, role, app-contract or service-policy change.

The actual loader SQL and registered ASGI read route compose with synthetic JWTs,
real offline botocore signing and independent HMAC verification. Twelve attachment
cases retain active, newer reattachment and alternate-group access, deny removed,
never-attached, both tie orders, unrelated document/group and crossed grants, and
preserve group-author/Bob-uploader behavior. Crossed grants retain live membership
only where the attachment is removed, and a live attachment only where membership
is revoked: neither authorizes the creative. Ten existing membership cases remain.

## Verification

From `api/`:

```sh
uv run pytest -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned -q
uv run ruff check .
uv run ruff format --check .
```

1,865 API tests plus eight subtests pass, including SQLite route probes. All 22
pinned probes pass on isolated network-none ClickHouse-local Memory tables.
Full Ruff lint and formatting pass. Initial concurrent full-suite/ClickHouse runs
hit the 120s tool timeout; serial reruns completed (94s and 358s respectively).
Code/test diff is 54 changed lines, below the 500-line one-finding gate.

## DESIGN-INTENT REVIEW

Fresh same-model reviewer found no blocking runtime defect and independently ran
the initial 21 pinned probes. Suggested crossed-grant coverage was then added.

1. Intent: pinned creatives are generic documents, delivered through the fan's
   own current group access; an inaccessible creative does not hide its carrier.
2. Delta: obsolete creative attachments no longer deliver or mint fresh media;
   newer reattachments and independent live alternate grants still work.
3. Conflict: none with D41 or D75; readable-node design never grants stale fan
   access, and no app-specific policy or service restriction is added.
4. Standard deviation: no new one; existing membership-first policy is retained.
5. Untested intent: production merges, writer precision, connected detach/reattach
   lifecycle and multi-target batches remain unverified, not accepted by this review.

## Open Gates

Reduced Memory/integer snapshots are not production ReplacingMergeTree,
DateTime64, driver or executed API write lifecycle evidence. Compiler tie ordering
and other readers remain separate follow-up; no blanket all-path tie guarantee.
Creative identity, role/class/app/service/visibility and node-inventory authority,
existing URL TTL, real-object retrieval, CI, rollout, diverse three-dry review and
protocol L1 remain OPEN. The operator subsequently requested PR publication;
publication does not establish deployment or close the remaining assurance gates.

## Publication Reconciliation

PR #1335 targets dev. Merge incoming dev at `96899439e`, preserving both security
learning histories and incoming attachment API/social work. Renumber only this
branch's changelog/plan/lane release to 3.257.1 after collision. Post-merge API
verification: 1,874 passed plus eight subtests, one opt-in ClickHouse test skipped;
full API Ruff lint/format and whitespace checks pass. Historical 22-probe
ClickHouse-local evidence above predates this merge; no new lifecycle claim.
