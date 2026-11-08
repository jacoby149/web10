# H01 Pinned-Ad Group-Hide Repair

07.11.2026. Base `7381d872d950be036741c88a8e73bdcc07684b42` plus local diff.
Author: `openrouter/openai/gpt-6.1-sol`. Local repair only; protocol L1 OPEN.

## Intent And Reproduction

Merged #1420 settles the [approved policy and fourteen-case evidence](h01-pinned-hidden-policy.md):
hidden attachments cannot authorize pinned creatives; another current readable
unhidden attachment can. Hiding remains group curation, not global secrecy.
Check plan/lane/changelog: evidence/policy are done, repair is still open. Orient
against learnings: membership and attachment alone omit hide state; the gap is
one qualifying document/group pair, never a global doc-id veto or crossed grant.

Convert the seven prior prohibited deliveries to denied-ad/no-signer controls.
Add eight cases: equal-time unhide in both insertion orders, newer rehide,
unrelated document/group unhides, hidden alternate with visible primary, and
active/hidden non-posts creatives (`scores`). Every case independently checks
visible carrier/membership; media stays under the creative uploader, not reader.
Actual compiler boundary/loader SQL, registered read, verified synthetic JWT and
real synthetic botocore SigV4 compose the replay. Carrier HTTP retrieval and
contract remain doubled, not an integrated authorization claim.

Against unchanged runtime: **11 fail, 11 pass**. Each failing case independently
verifies the issued synthetic capability before asserting no inline ad. Red log:
`.context/h01-pinned-hidden-repair-red.log`. Tie cases explicitly assert
unhide-winning hide tombstones as well as agreement with the compiler boundary.

## Narrow Repair

Within `resolve_pinned_ads`, exclude current hidden `(pg.doc_id, pg.group_id)`
pairs from the existing current member/attachment authorization subquery. Rank
all target hide history per document/group by updated_at DESC, deleted DESC,
then keep only the current live hide. Here `deleted=1` means **unhide**, so its
timestamp-tie victory restores eligibility. A newer live hide suppresses it again.

Correlation stays inside that same group; current visible alternatives survive.
The carrier, other creatives/groups, creative service selection, uploader ownership,
TTL, app/role checks, direct-by-ID and node inventory are unchanged. Query target
parameters remain bound; no schema/endpoint/dependency/SDK change. Existing safe
count-only before/after logs remain, without content/credential logging.

## Verification

From `api/`:

```sh
uv run pytest tests/test_media_read_url_owner.py -k pinned-hidden -q
uv run pytest tests/test_media_read_url_owner.py -k 'pinned-member or pinned-link or node-link or node-doc' -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k pinned-hidden -q
uv run pytest -q --disable-warnings
uv run ruff check .
uv run ruff format --check .
```

SQLite: **22 pass**, eleven denied before signing, eleven permitted. All 47
retained membership/attachment/node cases pass. Full API Ruff lint/format pass.
ClickHouse-local matrix, full-suite and fresh review results are recorded when
complete; no uncompleted run is counted as passing. Logs live under
`.context/h01-pinned-hidden-repair-{red,api,clickhouse}.log` locally.

## Limits And Remaining Gates

Reduced SQLite and isolated network-none ClickHouse-local Memory snapshots use
integer versions and fixed synthetic bindings, not production driver/DateTime64/
ReplacingMergeTree merges, actual moderation writers or concurrent lifecycle.
Synthetic capability verification is not real object retrieval or production IAM.
No Origin/delegated-app/consent/browser/anonymous/class-policy assurance. The
non-posts probes pin generic selection, not complete arbitrary-app authorization.
Existing issued capabilities remain valid until expiry; this stops fresh issuance.
Other visibility predicates, creative app/service/class policy, provenance,
representative query cost, connected acceptance, CI/rollout and model-diverse
convergence remain OPEN. No whole-ad/whole-prepare or L1 PASS, L2 advancement,
production request, data migration or deployment.
