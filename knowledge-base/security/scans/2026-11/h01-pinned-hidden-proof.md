# H01 Pinned-Ad Hidden-Creative Evidence

07.11.2026. Pin `80a8a1f2285e6b9bd6feceb527fd93ae582a247f` plus test-only
probe extension. Author: `openrouter/openai/gpt-6.1-sol`. Evidence only;
runtime unchanged, visibility-policy discrepancy and protocol L1 OPEN.

Follow-up: [operator-approved policy and fourteen-case evidence](h01-pinned-hidden-policy.md)
settle the policy blocker below; this receipt preserves the original #1416 state.

## Intent And Orientation

A moderator hides a creative from a group. Ordinary group-query reads exclude
it, but does that curation also govern a pinned creative served with a carrier
from another group? This replay makes the discrepancy concrete; it does not
assume hiding makes content globally secret. Unhiding and unrelated hides are
positive controls, not a complete specification of pinned-ad visibility.

Checked plan, lane and changelog before continuing H01-AD-AUTHORITY. Prior
membership, attachment and node-document repairs are already present. Read
the learnings, thesis, checklist, group moderation and ad-dissemination contracts.
Onboarding: membership and uploader ownership are necessary but do not establish
visibility. Recession: the older pinned attachment repair does not evaluate moderator
hides. Obvious gap: the ad loader's separate read can skip filters applied to
ordinary document reads. Public ads and node-readable storage remain intentional;
this evidence does not propose owner-only delivery or a new service restriction.

## Exact Scope

File-local review: `api/app/v3/services/clickhouse.py:3265-3329`,
`resolve_pinned_ads` and `attach_pinned_ads`, at the pin above. Context exercised:
`safe_query._boundary_cte_sql`, registered `/v3/read` enrichment and the existing
uploader-scoped resolver/signer. Context is not a new full-file/L2 scan receipt.

| Checklist class | Local result |
|---|---|
| Access control | Pinned loader checks current membership/attachment, but has no hidden-document predicate. The replay below demonstrates the mismatch, not missing membership or global unreadability. Role/class/app policy remains separate. |
| Injection | Target and reader values use SQL parameters. No eval, shell, template or filesystem sink in these functions. |
| Boundaries/transport | No outbound fetch, cookie or message boundary here. Returned media capabilities are exercised downstream with synthetic keys only. |
| Availability | Batch size/query cost belongs to the separate reliability track, not an I1–I6 finding. |
| Lifecycle | Current membership/attachment ranking repairs remain; hide/unhide state is entirely absent from this loader. Document timestamp ties remain separate debt. |
| Hygiene | Logs contain target/result counts, not bodies, credentials or media URLs. No secret literal in the reviewed runtime range. |

## Reproduction

Six `pinned-hidden-*` cases extend `tests/test_media_read_url_owner.py`.
Alice remains a current member of the creative's group; one current Bob creative
has an active attachment, a raw Bob-owned synthetic MinIO key and a readable
carrier containing only its pointer. The group-author variant retains Bob as
`posted_by`, independently of Alice's carrier and the group author's identity.

Execute the entire actual compiler boundary for `posts`, Alice and the creative
group on the same snapshot used by the actual pinned-loader SQL. All unrelated
visibility tables are present and empty. Add only the named hide/unhide history.
The actual group predicate permits Alice in all cases. Registered `/v3/read`,
verified synthetic JWT, actual pinned attachment/resolver and real botocore signing
then produce the inline creative. An independent HMAC verifier checks synthetic
SigV4 path, credential scope, timestamp, expiry and signature.

| History | Compiler boundary returns creative | Inline creative | Verified capability |
|---|---|---|---|
| No hide | Yes | Yes | Yes |
| Current hide in its sole readable group | **No** | **Yes** | **Yes** |
| Newer unhide tombstone | Yes | Yes | Yes |
| Hide another document | Yes | Yes | Yes |
| Hide in another group | Yes | Yes | Yes |
| Current hide, group author / Bob uploader | **No** | **Yes** | **Yes** |

Passing delivery assertions are **evidence, not a security denial gate**. If the
policy decision requires excluding hidden-only creative attachments, a separate
repair must turn the two hidden cases into denied-ad/no-signer controls while
retaining independently permitted delivery. No such policy change is made here.

## Execution And Limits

From `api/`:

```sh
uv run pytest tests/test_media_read_url_owner.py -k pinned-hidden -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned-hidden -q
uv run python tests/test_media_read_url_owner.py pinned-hidden-hidden
uv run pytest -q --disable-warnings
uv run ruff check .
uv run ruff format --check .
```

All six cases pass on SQLite and isolated network-none ClickHouse-local 24.8
Memory tables (one CPU/512 MB; no mounts). The same actual statements run on both;
SQLite translates parameter placeholders and tag arrays, while ClickHouse uses
fixed synthetic parameter interpolation. Neither is the production driver.
Full API: **2,064 passed plus eight subtests, one opt-in skip**; existing 2,440
warnings remain. The 47 retained pinned membership/attachment and node
attachment/document controls also pass. Full API Ruff lint/format and whitespace
checks pass. Full-suite and recession logs are retained locally under
`.context/h01-pinned-hidden-{api,recession}.log`; no PR/CI run is claimed.
Fresh review is recorded separately below.

The carrier readability path and group contract are doubled; this is not a full
direct creative HTTP-denial comparison or real app-contract/consent receipt.
Reduced schemas/integer versions do not establish DateTime64/merge timing, actual
moderation API writes, concurrency, real object retrieval or production IAM.
No secrets, production requests, runtime repair, rollout, model-diverse sign-off,
whole-ad/whole-prepare assurance or L1 advancement. Other visibility predicates,
alternate readable creative groups, anonymous/class/app/service policy and node
inventory authority remain separate obligations.

## Fresh Review And Design-Intent Gate

Separate same-family `openrouter/openai/gpt-6.1-sol` context,
session `ses_e4728e075ffe5Xdul0u6aM5h3u`, independently passes all six cases on
both engines and directly inspects all twelve probe outputs. No blocking fixture
defect found. Initial system-Python invocation lacked cryptography; workspace
virtual-environment reruns pass. This is one bounded review, not three-dry or
model-diverse security sign-off.

### DESIGN-INTENT REVIEW

1. **Intent:** pinned creatives ride their own reader access and independent
   uploaders (D75). Group hiding is curation, preserving the author's copy and
   other groups; D59 does not promise global secrecy.
2. **Delta:** tests/docs only. Actual query exclusion versus pinned enrichment
   and fresh signing is reproduced, with carrier reads from another group doubled.
3. **Conflict:** a global hide veto would conflict with group-scoped curation.
   The KB does not explicitly settle pinned enrichment across group contexts.
   The current direct-by-ID reader also omits hide filtering, so query exclusion
   is not proof of global unreadability or an I3 confidentiality violation.
4. **Standards:** no new deviation. D41 does not waive audience access rules,
   but a conventional assumption that hidden means globally secret is also wrong.
5. **Intent risk:** before repair, settle the policy and add same-group carrier,
   alternate visible group and crossed-grant controls; persist/authorize the
   carrier for connected acceptance. Preserve independent uploaders and arbitrary
   creative services. Do not hardcode posts or infer authority from a hidden row.

Reviewer blocks security classification and repair on the unresolved rule and
missing same/alternate-group controls, not on the reproducibility of the mismatch.
Write-back incorporates that distinction; no unauthorized-private-media claim.

## Next Bite

**PROTOCOL-01/H01-AD-HIDDEN-POLICY: settle pinned-ad group-hide semantics** - own
focused evidence tests and security KB; runtime read-only. Obtain the operator's
rule for same-group and cross-group pinned enrichment under D59/D75; add same-group,
alternate-visible-group and crossed-grant controls, preserving unhide, unrelated
hides and independent uploaders. Gates: explicit KB policy, synthetic SQL/signing
evidence, fresh design-intent review, <=500 changed lines and every PR check green.
Acceptance: classify the discrepancy without equating hidden with globally secret;
queue a separate one-finding repair only if required. Broader H01-AD-AUTHORITY and
protocol L1 remain OPEN; no L2 advancement or blanket owner-only/service restriction.
