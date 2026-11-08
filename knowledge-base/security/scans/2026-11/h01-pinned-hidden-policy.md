# H01 Pinned-Ad Group-Hide Policy And Evidence

07.11.2026. Base `c420b6f4c68a6465179ef527cdf0412212c2aca1` plus test/docs
diff. Author: `openrouter/openai/gpt-6.1-sol`. Runtime unchanged; protocol L1 OPEN.
This follows merged [PR #1416](https://github.com/jacoby149/web10/pull/1416)
and its [original six-case receipt](h01-pinned-hidden-proof.md).

## Operator Rule

The operator selected **Honor group hides** in this session:

> A hidden attachment cannot authorize pinned-ad delivery. Another current,
> readable, unhidden group attachment can still authorize it.

That resolves the original classification blocker. A creative hidden in its
only readable group must not appear inline, whether its carrier comes from the
same group or a different group. A different visible attachment may authorize it
only if that same group's current reader grant also permits access. Membership
in hidden group A and an unhidden attachment in unreadable group B cannot combine.
Newer unhide restores eligibility. Hiding is still group curation, not deletion
or global secrecy (D59); arbitrary creative services remain supported (D75).
Contract and dated D59 clarification are updated before runtime work.

## Scope And Orientation

Checked current plan/lane/changelog: H01-AD-HIDDEN-PROOF is merged; do not redo
its scan. H01-AD-HIDDEN-POLICY is the next open bite. Read security learnings and
the previous fresh review. Onboarding: actual query exclusion and fresh inline
signing were demonstrated, but policy was unresolved. Recession: retained
membership/attachment repairs do not consult hide state. Gap: the right predicate
is a correlated visible attachment, not a global doc-id veto or a union of
unrelated attachment/membership facts.

Runtime scope is unchanged from #1416: pinned loader/attachment at
`api/app/v3/services/clickhouse.py:3265-3329`; context is the actual full compiler
boundary and registered `/v3/read`/resolver/signer. No new full-file/L2 scan claim.
All six checklist classes retain the original disposition: demonstrated local
visibility omission; parameterized SQL; no local outbound/message boundary;
availability separately scoped; hide history absent; safe count-only runtime logs.
New test fixtures use synthetic literals only, never production credentials.

## Fourteen-Case Matrix

Extend `tests/test_media_read_url_owner.py` with eight controls, retaining six.
Persist the synthetic carrier and its attachment in the same snapshot; execute
the actual full compiler boundary to confirm that the carrier remains visible.
Use actual `can_read_group` checks to choose the creative's candidate readable
groups and independently check the carrier's group membership. The original
group contract double remains; it is not live app-contract/consent proof.

For every row the current pinned loader and registered read return the creative
and a freshly minted, independently HMAC-verified synthetic SigV4 capability.
The boundary and approved policy allow exactly seven rows, denying seven.

| Case | Carrier group | Creative visible / policy permits |
|---|---|---|
| Active | Other | Yes |
| Hidden | Other | **No** |
| Newer unhide | Other | Yes |
| Hide another document | Other | Yes |
| Hide another group | Other | Yes |
| Hidden, group author / Bob uploader | Other | **No** |
| Active | Same | Yes |
| Hidden | Same | **No** |
| Newer unhide | Same | Yes |
| Hidden, group author / Bob uploader | Same | **No** |
| Hidden original + visible, readable alternate | Other | Yes |
| Hidden original + alternate membership revoked | Other | **No** |
| Hidden original + alternate attachment removed | Other | **No** |
| Hidden original + unhidden alternate without membership | Other | **No** |

**Classification:** confirmed pinned-ad group-curation bypass under the approved
policy. It affects creative body delivery and fresh capability issuance; it is
not a claim that hidden content is globally private or denied by direct-by-ID
reads. The seven denied-policy rows still assert actual delivery as evidence;
they are not passing denial regressions or a repaired security gate. The separate
fix must replay them as denied-ad/no-signer while retaining the seven allowed rows.
Group-authored creative tests retain Bob as uploader, Alice as reader/carrier
author; carrier ownership must never replace creative upload ownership.

## Verification And Limits

From `api/`:

```sh
uv run pytest tests/test_media_read_url_owner.py -k pinned-hidden -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned-hidden -q
uv run pytest -q --disable-warnings
uv run ruff check .
uv run ruff format --check .
```

SQLite matrix: fourteen pass; fresh review is recorded below. Full API: **2,072
passed plus eight subtests, one opt-in skip**, with 2,440 existing warnings.
Full Ruff lint/format and whitespace checks pass. Local full-suite log:
`.context/h01-pinned-hidden-policy-api.log`. ClickHouse-local results are recorded
after completion. The initial combined ClickHouse matrix exceeded the
120-second outer command timeout after eight successful cases. Restrict alternate
group probes to cases that actually have alternate attachments, then rerun with
no outer timeout; each child probe and container query retains its own timeout.
No incomplete run is counted as a matrix pass.

The HTTP carrier reader and `readable_groups` are still doubled, even though
carrier persistence, actual membership and full-boundary visibility are checked
independently. No actual production group-read helper, Origin/delegated-app gate,
moderation API write or connected browser proof. ClickHouse-local recreates
reduced Memory tables with integer versions per query, not production drivers,
DateTime64/ReplacingMergeTree merges, writer precision or concurrent lifecycle.
Synthetic signature verification is not object existence/retrieval or production
IAM. Same-timestamp hides, service/class/app policy, direct-by-ID, other visibility
predicates, node inventory, deployment and model-diverse sign-off remain separate.

## Fresh Design-Intent Review

Separate same-family `openrouter/openai/gpt-6.1-sol` context,
session `ses_e47088f3cffekFWgo0kX7jB6gm`, independently passes all fourteen
SQLite cases (31.04 seconds), plus direct crossed-grant, alternate-visible and
same-group/group-uploader probes. Boundary/policy results are false/true/false;
all still return verified synthetic capabilities. No blocking test/policy defect
or correction requested. Reviewer did not run ClickHouse-local or the full API.

### DESIGN-INTENT REVIEW

1. **Intent:** creative authority comes from its own qualifying attachment;
   hiding disqualifies only that attachment. Other readable visible attachments,
   arbitrary creative services and independent upload ownership remain.
2. **Delta:** test/docs only; clarified same/cross-group policy, no runtime change.
3. **Conflict:** none with D59 group curation, D75 service agnosticism or D41
   node-readable storage. No global secrecy or direct-by-ID/node-inventory change.
4. **Standards:** no new deviation; group hiding is not a global confidentiality
   promise. The approved curation rule is explicit rather than conventional guesswork.
5. **Intent risk:** carrier HTTP readers/app gates, moderation writes, real storage
   lifecycle and anonymous/class/arbitrary-service execution remain unproven.
   Repair must retain allowed controls and add hide/unhide ties and group isolation.

Crossed grants demonstrate hidden-original-group delivery, not that the existing
loader actually combines unrelated grants. The actual compiler refuses that
combination; the repair must not accidentally introduce it. This is one bounded
same-family review, not model-diverse convergence, protocol L1 closure or PASS.

## Next Bounded Repair

**PROTOCOL-01/H01-AD-HIDDEN-REPAIR: honor current pinned-creative hides** - own
only the pinned-loader hide-history SQL hunk in `api/app/v3/services/clickhouse.py`,
focused `api/tests/` controls and security KB. Require one current readable
attachment not hidden in that same group; rank hide history before tombstone
filtering, deletion-winning ties. Convert seven policy-denied deliveries to
red -> denied green/no-signer; retain seven allowed cases and add hide/unhide tie
and alternate-group isolation controls. Gates: fresh design-intent review, full
tests/lint, KB write-back, <=500 changed lines and every PR check green. Acceptance:
same/cross-group hides deny only the affected creative authorization, not the
carrier or legitimate visible alternatives; preserve independent uploaders and
arbitrary services. No global hide veto, owner-only/service restriction, new
schema/endpoint, direct-by-ID/node-ad policy change or L2 advancement.

## Publication Preparation

Merge `origin/dev` at `f51d72317` before PR creation; incoming research and link
unfurling work changes no API runtime or tests. Retain both release histories and
renumber only this branch's entry/plan/lane from 4.12.16 to 4.14.1 above dev's
4.14.0. Restore the changelog entry boundary without rewriting incoming entries.
Original base pin and local evidence remain explicit; normal PR checks are a
separate gate.
