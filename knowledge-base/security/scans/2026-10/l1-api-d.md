# L1 API D: Identity Endpoints and Models

Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63`; HEAD matched and owned-path diff empty.
Coverage complete: 695/695 assigned lines; disposition **OPEN**. No runtime changes or independent review/signoff.

## Exact Coverage

| Whole file | Lines | Symbols/ranges inspected |
|---|---:|---|
| `api/app/v3/endpoints/access.py` | 1-145 (145) | intent/imports/router 1-30; _check_token 33-62; verify_access including all verdict/action branches 65-145 |
| `api/app/v3/endpoints/account.py` | 1-95 (95) | imports/router 1-16; change_pass 19-26; change_phone/set_email 29-42; verify_phone/email 45-58; profile 61-68; send_code 71-80; set_recovery_phone 83-95 |
| `api/app/v3/endpoints/auth.py` | 1-70 (70) | imports/regex/kosher 1-18; _require_contact 21-27; signup 30-49; login 52-70 |
| `api/app/v3/endpoints/auth_helper.py` | 1-30 (30) | imports/user 1-12; user_or_anon 15-30 |
| `api/app/v3/endpoints/blocking.py` | 1-23 (23) | imports/router/block/unblock |
| `api/app/v3/endpoints/recovery.py` | 1-193 (193) | intent/imports/constants 1-42; digits/contact/key/rate 45-76; verification mint/check 79-99; contact binding 102-107; login mint 110-117; request/verify/complete 120-193 |
| `api/app/v3/endpoints/users.py` | 1-25 (25) | imports/router/list_people_directory |
| `api/app/v3/models/auth.py` | 1-57 (57) | Signup/Login/ChangePass/ChangePhone/SetEmail/VerifyCode/SetRecoveryPhone/RecoveryRequest/RecoveryVerify/RecoveryComplete |
| `api/app/v3/models/blocking.py` | 1-18 (18) | BlockUser/BlockUserInGroup/SetSharing |
| `api/app/v3/models/session.py` | 1-25 (25) | VerifySession and defaults |
| `api/app/v3/models/users.py` | 1-14 (14) | ListPeopleDirectory |

## Orient

- Onboarding: AGENTS, strategy inventory/thesis/plan/lanes/changelog, security learnings/record, I1-I6, security method/checklist/design-intent gate and backend audit read. Endpoint layer remains scan debt; middleware/settings not redone.
- Recession: verified signature does not automatically validate custom `expires`. The old backend assertion that every request checks expiry is contradicted by local principal-helper execution. B-3 remains unsigned-decode footgun, not the name for this different verified-token defect.
- Gap: separate token authenticity, freshness, provider/purpose and account authority. Contact storage/verification calls cannot be pronounced safe or unsafe solely from helper names or delegation.
- Intent: unauthenticated contact+OTP recovery, anon public discovery, body-token transport, node readability and accepted B-7 lifetime remain intentional. No fresh independent design review claimed.

## Checklist Dispositions

| Class | Local disposition |
|---|---|
| 1 Access / I1-I3,I5 | L1-D-01/D-02 below. Login authenticates through CH; signup/contact recovery are public intentionally. Account/block/directory principal gates are present. Storage ownership/contracts/purpose enforcement unverified. Recovery complete locally verifies signed recovery purpose and account-contact equality before password change/login mint. |
| 2 Injection | No local SQL/shell/eval/pickle/template/path execution. Regexes bounded in shape, values enter uninspected CH helpers. No SQL-binding or rendered-XSS assurance inferred. |
| 3 Boundaries/transport | No local cookie/postMessage/fetch/credential-URL sink. Signing uses imported settings (existing B-1 context); request models use body tokens by design. Provider separation is incomplete locally and needs caller/storage tracing. |
| 4 Availability | Separate reliability: per-worker mutable send-rate map, unbounded contacts/model strings/list inputs, unrestricted directory pagination. No DoS classified as C+I. |
| 5 Lifecycle | Recovery verify token has 5-minute exp/purpose, but check does not require exp claim and complete has no local consumption store. Actual OTP TTL/atomicity and concurrent contact changes delegated/unverified. Token reuse policy needs design confirmation, not automatic vulnerability designation. |
| 6 Hygiene | No literal production credentials. Logs in access:90,109 include store exception text; secret-bearing production errors not demonstrated. Signup rejects blank password, change_pass does not locally validate new_pass; downstream effects unverified. |
| I4/I6 | Node readability respected. No cross-store federation query in assigned lines; issuer/purpose boundaries and delegated directory I3 filters require L2+. |

## Confirmed Findings

**L1-D-01 (OPEN): principal helpers accept expired signed user tokens.**
`auth_helper.py:5-12,15-30` verifies signature via decode_token but never checks custom expires/provider. Using actual shared decoder and a synthetic signed token whose custom expires was yesterday, both user and user_or_anon returned fixture-user. Control: real certify rejected the exact same token with TOKEN. Thus freshness fails at these principal-producing boundaries (I5), distinct from merely accepting a long B-7 lifetime. `account.py:86-94` similarly decodes directly by source observation only; that endpoint was not executed. Account/block/directory call these helpers by source observation, but no actual database mutation/cross-user read or contract bypass was tested; downstream safeguards remain unresolved.

**L1-D-02 (OPEN): session oracle reports null/malformed custom expiry valid; omitted-claim case source-inferred only.**
`access.py:55-62` skips falsy expires and swallows ValueError parsing malformed strings. With actual signature verification and synthetic claims explicitly containing expires=None or `invalid-date`, real _check_token returned valid in both cases. An omitted expires claim was not probed; acceptance is source-inferred from TokenData.populate_from_payload using payload.get and the falsy check. This is a bounded integrity failure in the session-health classification, not proof the oracle grants CRUD access. Foreign-provider handling is a separate unverified caller-boundary concern.

## Probe Reproduction

Executed `python3 - <<'PY' ... PY` combined B/D probe. Reuse the B receipt's exact loader, model setup, synthetic settings and `a` dictionary, then:
```python
load('api/app/services/auth.py',['anon_token','certify'],a)
# B receipt t is signed with fixture key and custom expires yesterday.
try:
    a['certify'](m['Token'](token=t))
except Exception as e:
    assert str(e)=='TOKEN'
else:
    raise AssertionError('certify accepted expiry')
d=dict(decode_token=a['decode_token'],exceptions=N(TOKEN=RuntimeError('TOKEN')))
load('api/app/v3/endpoints/auth_helper.py',['user','user_or_anon'],d)
assert d['user'](m['Token'](token=t))=='fixture-user'
assert d['user_or_anon'](m['Token'](token=t))=='fixture-user'
x=dict(decode_token=a['decode_token'],jwt=jwt,datetime=datetime,settings=s)
load('api/app/v3/endpoints/access.py',['_check_token'],x)
for expiry in [None,'invalid-date']:
    token=jwt.encode(dict(claims,expires=expiry),s.PRIVATE_KEY,algorithm='HS256')
    assert x['_check_token'](token)[0]=='valid'
```
Results: all assertions passed, exit 0; datetime.utcnow deprecation warning only. Real pinned function bodies and PyJWT/Pydantic, no application startup, DB, network or deployed keys. The reproduction loader does not select bcrypt functions; no bcrypt or credential-service calls. D-02 executed only explicit None/malformed cases, not omission.

## UNVERIFIED L2+ Handoffs / Candidates

- `account.py:45-58` accepts VerifyCode.code but never forwards it to verify_phone/email; local code neither calls Twilio nor compares code. Trace real CH helpers/state before claiming contact verification bypass. `change_phone`, `set_email`, `set_recovery_phone` need verified-contact/recovery linkage tracing, not a delegation-only missing-auth finding.
- Trace endpoint principal -> CH calls for freshness rechecks, app/self/purpose/provider restrictions, blocked-reader filtering, profile ownership and public directory principal classes. No safety established for any uninspected helper.
- Recovery: unsigned account contact attachment at signup, contact equality vs verified flags, require_contact fail-open on config exceptions, verification token replay/required claims and account races need intent/storage context and exploit reproduction. No account takeover claimed.
- B-1 shared symmetric model persists; B-3 unsigned-decode ID is not used for verified-but-expired tokens. B-2/B-4/B-5/B-6/B-8 remain separate scopes; B-7 accepted lifetime is not itself re-raised.
- session model docstring mentions a removed followers-group check; stale documentation, not evidence of a missing generic security gate (D60).
