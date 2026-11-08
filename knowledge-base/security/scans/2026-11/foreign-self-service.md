# Certified foreign self-service — split backend unit, 08.11.2026

Status: bounded route evidence; integration and broader security review OPEN.
Author: GPT-6.1 Sol. Intent: `strategy/federated-feed-mixer.md` FM1 and serving-node
app-grant prerequisite of FM2; no SDK, mixer or DNS implementation in this PR.

## Boundary and repro

`groups.py` self-service routes and `contracts.py` own-grant routes call existing
`principal()` certification, keeping bare local keys and exact qualified foreign
keys. Foreign group-list never heals a local namesake's owner row. Privileged
group management is not expanded. Foreign delegated grant mutations deny; the
existing trusted-authenticator Origin predicate and normal read gates remain.

The preserved assembly's fresh API review found request-policy join → self-accept
converted `pending` into membership. Permanent local/foreign registered-route
controls replay it: accept now requires the exact current `invited` row; manager
review of pending requests is preserved. Original evidence is retained in the
workspace `.context/foreign-request-accept-red.log`; the split repeats the repro
against the unchanged merged-dev handler and the candidate, without modifying dev.

Fixtures encode home and receiving-node tokens with different synthetic keys,
but outbound certification is a Boolean double. They establish handler routing,
namesake isolation, denied/expired/malformed token handling, local compatibility,
membership removal/regrant, app-grant add/list/revoke and group-read denial.
They do not independently establish actual remote signature verification/TLS,
ClickHouse lifecycle, browser consent or concurrent revoke/accept atomicity.

## Split validation and review

Fresh reviewer `ses_e44fcf71bffeaXB6A7K7KCTNYQ` also reproduced inherited
revoke-all failing delegated contracts: the tombstone INSERT/SELECT omitted
`client_id`, leaving the real delegated key active after a 200 response. The
helper is identical on merged dev; this is inherited local debt newly exposed to
the foreign self-service path, not an invented new regression. The bounded repair
retains `client_id` in both projections. Six permanent route/real-helper-SQL
controls replay local/foreign all/origin/client revocation and preserve another
principal's grants. SQLite substitutes for ClickHouse with only parameter/clock
translation. Red: two revoke-all cases fail, four controls pass; repaired: all six
pass. Logs: `.context/split-backend-revoke-{red,green}.log` in the assembly workspace.

`cd api && uv run --frozen --no-sync pytest -q`: **2,147 passed, eight subtests,
one opt-in skip**, 60.94s after the repair. Ruff lint/format pass. A detached
unchanged-dev replay also retains the local invitation failure (200 instead of
401) in `.context/split-backend-invite-red.log`; the exact candidate test passes.
Earlier assembly totals are not reused as split-branch results. Source base is
merged #1426 (`9e744b039`); code/test budget is 435 changed lines, no exemption.

Fresh post-repair reviewer `ses_e44f8d6d0ffey792mk6sqmDtTQ` independently runs all
58 focused cases, replays original invitation/revoke-all functions in memory and
finds no demonstrable blocker. DESIGN-INTENT REVIEW: exact qualified foreign
self-service/local bare compatibility and manager admission are preserved;
revocation now addresses the real delegated grant key. No by-design conflict or
new conventional deviation; local handler/SQL delta covered, actual
issuer/TLS/ClickHouse/browser/concurrency/author-as risks remain unproven. This is
the first same-family dry review after repair, not diverse three-dry convergence.

## Refreshed-base merge review

After merging dev `c75758a2a` (#1422), the full API suite passes **2,171 tests
plus eight subtests**, one opt-in skip; Ruff lint/format and the 435-line method
gate pass. First post-merge CI passes every executed check, including all four
e2e shards; later documentation-only head changes must pass fresh CI too.

Two additional fresh reviewers, `ses_e44eaa7a7fferMpUT54nWmhKDF` and
`ses_e44e99606ffeiv52yA3WmLo7g2`, each independently run all 58 focused cases
and find no new demonstrable blocker. Their extra synthetic controls cover
no-Origin foreign delegated mutation denial, personal cleanup dispatch, actual
effective-role exact/service/author-as isolation and invitation histories with
denial/approval/tombstones/deletion-winning ties. These supplement, not replace,
the permanent tests and do not prove live storage/concurrency or issuer TLS.

DESIGN-INTENT REVIEW: all three post-repair scoped reviews preserve generic
primitives, exact foreign identity, local bare compatibility, manager-controlled
admission and serving-node app/group authority; no new by-design conflict or
conventional deviation identified. Three consecutive same-family scoped dry
passes support the operator-requested foundation merge, not model-diverse
convergence or authorization to activate the full federated feed.

Remaining: actual-node/browser/storage controls, delegated author-as list intent,
successful cleanup/real merge lifecycle, diverse convergence and full L1–L4
coverage. No deployment, credential migration, audience move or security PASS.
