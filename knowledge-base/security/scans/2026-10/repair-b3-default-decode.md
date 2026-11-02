# B-3 Verified Decode Default

01.11.2026. Base `30f9d49fc15b0b3cca0d928b129216f67b21fa69` plus local
source repair. Author and separate reviewer: `openrouter/openai/gpt-6.1-sol`.
**Default footgun locally repaired. Not merged/deployed or protocol L1 PASS.**

## Intent And Delta

I2 requires verified claims on authority paths. Deliberate unsigned parsing for
metadata is different: bug-report attribution remains untrusted, and the legacy
remote-provider helper selects a destination without local verification. The
latter's destination/status trust is L1-B-01 debt, not accepted safety.

`decode_token` now defaults `private_key=True`, retaining its existing configured
signature and non-anonymous custom-expiry validation. The two previously implicit
metadata reads now explicitly pass `False`. No token shape, key, anonymous expiry,
standard PyJWT `exp`, provider/client policy or access gate changed. No extra
decoder/helper, compatibility branch, UI or protocol was introduced.

Orientation checked the auth KB, learnings, current index, plan/lane/changelog
and S3 constraints. B-3's default was still unsigned; existing authoritative
callers already passed True. The gap is an unsafe default, not a newly proven
reachable unsigned authorization bypass. Historical B-3 prose must not be used
to assert that existing endpoints trusted the omitted flag.

## Repro And Tests

New `api/tests/test_decode_default.py` uses synthetic signing keys and the actual
decoder. Initial **9 failures/22 passes** comprise eight behavioral acceptances
and one signature-default assertion, not nine endpoint exploits. Behaviors:
wrong-key forged username, `alg=none`, expired/missing/null/malformed custom
expiry, and expired standard `exp` for user/anonymous claims.

Final **31 new tests pass**. Controls retain valid local and signed-anonymous
custom-expiry exemptions, explicit-False wrong-key/stale metadata and actual
remote-helper/bug-handler behavior with inert HTTP/storage/delivery boundaries.
Provider mismatch and missing/active delegated-client tests establish that decode
is not certify: full certification/access policy remains required.

Commands from `api/`:

```sh
uv run --frozen pytest tests/test_decode_default.py tests/test_token_freshness.py tests/test_auth_services.py tests/test_main.py -q
uv run --frozen pytest -q --tb=short --disable-warnings
uv run --frozen ruff check .
uv run --frozen ruff format --check .
```

Results: **175 focused / 1,457 full API tests plus four subtests pass**; lint,
format (110 files) and `git diff --check` pass. Parent reran the full suite.
No real credentials/network/DB, deployment or production-exposure test.
Code/test delta is 120 changed lines: three replacements and a 114-line test file.

## Call Inventory And Review

Separate same-model review found **13 production calls**, all explicit:
11 True (certify/admin, three auth_helper calls, account/access/appstore/OAuth/
groups and ClickHouse `_verified_username`), two False (remote destination and
bug-report attribution). No production alias, callback/partial, dynamic lookup
or default introspection found by repository inventory. External Python users
and runtime injection are outside that static inventory.

Reviewer independently restored the old default in memory and reproduced exactly
9 failures/22 passes; reran 175 focused cases with sockets blocked. No new defect.
DESIGN-INTENT REVIEW: intent is verified authority versus explicit metadata;
delta is the safe internal default; no by-design conflict found; unsigned
metadata is intentional but remote destination trust remains an open weakness;
external Python consumers and real report/registry/deployment integration remain
untested intent. No diverse-model three-dry credit.

## Acceptance And Open Gates

Accepted locally on 01.11.2026: undocumented out-of-repository Python callers
that relied on omitted-flag unsigned decoding must explicitly select metadata
parsing. All inventoried production callers preserve behavior. Reopen on added
implicit callers, decode used as a substitute for certify/access gates, metadata
claims entering authority, or changed decoder/signature/expiry semantics.

B-1/issuer keys, L1-B-01 remote trust, class-wide authority audit, historical
exposure, CI, integration/deployment and required diverse sign-off remain OPEN.
This closes neither those guarantees nor protocol L1. No commit or PR created.
