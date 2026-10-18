# L1 API B: Shared Auth, Config and Twilio

Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63`; HEAD matched, owned-path diff empty.
Coverage complete: 622/622 assigned lines; disposition **OPEN**. No fix, whole-file safety assertion or independent review/signoff.

## Exact Coverage

| Whole file | Lines | Symbols/ranges inspected |
|---|---:|---|
| `api/app/models/__init__.py` | 1 (1) | Token/TokenData exports |
| `api/app/models/auth.py` | 1-60 (60) | Token 4-11; TokenData/populators 14-31; SignUpForm/TokenForm 34-47; PhoneForm/EmailForm/EmailVerifyForm 50-60 |
| `api/app/models/config.py` | 1-74 (74) | SetupRequest 4-27; SetupStatus 30-34; ConfigUpdate 37-74 |
| `api/app/services/auth.py` | 1-118 (118) | imports/bcrypt 1-33; decode_token 36-43; IP/URL guards 46-73; remote certify 76-81; anon/certify 84-102; check_admin 105-118 |
| `api/app/services/config.py` | 1-252 (252) | imports/default words 1-74; node/get config 77-91; conversions 94-104; CH URL 107-118; effective config 121-185; save/get field 188-200; key generation/storage 203-222; admins/existence 225-252 |
| `api/app/services/twilio.py` | 1-117 (117) | client setup 1-12; contact/channel 15-26; E2E switch/code 29-40; send/check 43-81; recovery prompt 84-94; TwiML responses 97-117 |

## Orient

- Onboarding: AGENTS, strategy inventory/thesis/plan/lanes, changelog, security learnings/record, I1-I6, method/checklist/design-intent gate and backend audit read. No completed middleware/settings work redone.
- Recession: B-1 symmetric verification and B-3 default unsigned decode persist. Backend audit qualifies B-3 as a footgun, not an established live auth bypass; seed record's wording is stronger. B-7 means lifetime, B-8 means settings CLI dump, not new IDs to reuse.
- Gap: `_is_private_ip` does not resolve DNS despite its docstring; remote authenticity cannot be established by an arbitrary HTTP 200. Helper reachability must remain distinct from a public endpoint exploit.
- Intent: operator config, bootstrap admin baseline, body tokens, readable node and accepted lifetime are intentional; no proposed policy reversal. Fresh design review remains coordinator work.

## Checklist Dispositions

| Class | Local disposition |
|---|---|
| 1 Access / I1-I3,I5 | B-1/B-3 below. certify verifies signature/provider/custom expiry for non-anon; absent token becomes anon intentionally. check_admin calls certify then verified decode/admin-list membership. No contract enforcement here; caller authority remains L2+. Token extra fields and admin ConfigUpdate extras do not alone prove unauthorized mass assignment. |
| 2 Injection | No SQL/shell/eval/pickle/template execution or caller file path locally. DB operations delegated. TwiML receives password text; actual serialization/consumer exposure untested. |
| 3 Boundaries/transport | L1-B-01. No local cookies/postMessage/credential URL transport; CH connection URL embeds operator credentials intentionally for admin config. Twilio service destination is operator config, not arbitrary contact URL fetching. |
| 4 Availability | Separate reliability: bcrypt work, unbounded model strings, outbound remote timeout=10, E2E/store resource behavior. No C+I finding allocated for DoS. |
| 5 Lifecycle | Config/key latest-row persistence delegated. Recovery OTP single-use/TTL delegated to Twilio or CH; no claim of safety. Key generation uses secrets. No local key rotation implementation; deployment rotation unverified. |
| 6 Hygiene | SetupRequest:22-23 has repeatable default storage credentials, same B-2 default-credential pattern (static source evidence, no deployment validity claim). E2E fixed OTP explicitly switch-gated, not proof production uses it. No new B-8 CLI dump in scope. |
| I4/I6 | Node-readable config/storage intentional. Remote helper crosses HTTP boundary but uses unsigned provider/HTTP result; no JWKS verification implemented here. No cross-store query in owned lines. |

## Confirmed / Existing Evidence

**B-1 (existing, OPEN): symmetric token trust.** `auth.py:38` verifies with the configured key; `config.py:203-208` generates a symmetric key by source observation only (generation was not executed). With an isolated synthetic HS256 key, minting arbitrary fixture identity and decoding with the same key succeeds. This confirms the local key-holder capability, not deployed key sharing or a live federation exploit. Imported settings defaults were not rescanned.

**B-3 (existing, OPEN footgun, not demonstrated live authorization bypass).** `auth.py:36-43` defaults to signature-disabled JWT decoding; a token signed with an unrelated synthetic key still yields its fixture username. `certify` and `check_admin` explicitly request verification. Remote helper uses unsigned decode; production callers remain unverified, and optional report attribution is not access control.

**L1-B-01 (OPEN local weakness; live impact UNVERIFIED): remote helper trusts unsigned destination and arbitrary remote 200.** `auth.py:46-81` only checks IP literals and selected host suffixes, not DNS resolution or redirects. An attacker-signed provider `http://internal-service:8123` passes the actual guard, receives the token in the fake POST sink at `/certify`, and fake status 200 returns True. This demonstrates local destination/status trust weakness, not live SSRF or an attestation bypass. Static repository Python reference search (`grep` tool pattern `certify_with_remote_provider`, include `*.py`) found only the definition and `api/tests/test_auth_services.py`; no production reference found. Dynamic invocation was not assessed. Private DNS resolution, deployed egress and cross-user access remain untested. Do not treat old audit prose calling the guard comprehensive as evidence.

## Probe Reproduction

Executed local `python3 - <<'PY' ... PY`; the following reproduces the B assertions without app imports, actual settings or network:
```python
import ast, subprocess, ipaddress, jwt
from datetime import datetime, timedelta
from urllib.parse import urlparse
from types import SimpleNamespace as N
from pydantic import BaseModel, ConfigDict
P='8af7e0fce922cada30002dff190a5bb3abcf4f63'
def load(path,names,env):
    t=ast.parse(subprocess.check_output(['git','show',P+':'+path],text=True))
    ns=[n for n in t.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names]
    assert {n.name for n in ns}==set(names)
    for n in ns: n.decorator_list=[]
    exec(compile(ast.Module(body=ns,type_ignores=[]),path,'exec'),env)
m=dict(BaseModel=BaseModel,ConfigDict=ConfigDict)
load('api/app/models/auth.py',['Token','TokenData'],m)
s=N(PRIVATE_KEY='synthetic-only-signing-key-32-bytes-long',ALGORITHM='HS256',PROVIDER='fixture-node')
a=dict(settings=s,jwt=jwt,datetime=datetime,ipaddress=ipaddress,urlparse=urlparse,Token=m['Token'],TokenData=m['TokenData'])
load('api/app/services/auth.py',['decode_token','_is_private_ip','_validate_provider_url','certify_with_remote_provider'],a)
claims=dict(username='fixture-user',provider=s.PROVIDER,expires=(datetime.utcnow()-timedelta(days=1)).isoformat())
t=jwt.encode(claims,s.PRIVATE_KEY,algorithm='HS256')
assert a['decode_token'](t,True).username=='fixture-user'
foreign=jwt.encode(claims,'untrusted-synthetic-signing-key-32bytes',algorithm='HS256')
assert a['decode_token'](foreign).username=='fixture-user'
calls=[]
a['requests']=N(post=lambda url,**kw:(calls.append((url,kw)) or N(status_code=200)))
remote=jwt.encode(dict(claims,provider='http://internal-service:8123'),'untrusted-synthetic-signing-key-32bytes',algorithm='HS256')
assert a['certify_with_remote_provider'](m['Token'](token=remote)) is True
assert calls[0][0]=='http://internal-service:8123/certify'
```
Results: assertions passed, exit 0; datetime.utcnow deprecation warning only in the combined B/D run. Real PyJWT/Pydantic used; decorators/imports isolated, external POST replaced. No live service/secret access.

## UNVERIFIED L2+ Handoffs

- Establish live callers before escalating remote helper/B-3 to an endpoint bypass; test DNS/redirect controls and issuer authenticity at callers. B-1 rollout remains BP-1, not closed by this scan.
- Trace config/key persistence, active settings-vs-saved-key selection, admin provisioning and removal. list_admins:231 converts DEFAULT_ADMINS with list() before its string check; string-env membership behavior needs consumer/config context, not an asserted takeover. Preserve intentional baseline inclusion.
- Trace OTP expiry/consumption and E2E deployment isolation; recovery_response:104-108 places caller password in outgoing message by construction, but live reachability and intended transport are unverified.
- B-4 middleware logs, B-5 CORS tests, B-6 document read gates, B-7 accepted lifetime, and B-8 settings CLI remain separate existing scope/debt, not reassigned IDs or newly proven vulnerabilities here.
