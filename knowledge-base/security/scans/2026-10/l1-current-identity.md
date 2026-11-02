# Current Identity L1 Receipt

Integration: `l1-current-api-review.md` governs evidence calibration. OAUTH-02 is an availability/order observation with C+I unverified, NOT a confirmed in-scope vulnerability; the original author assessment below is superseded on that point.

- Pin: `f7aabdb26346752141f46f19c393dbadfd25ddd2`; HEAD verified equal.
- Date: 2026-10-27. Model: `openai/gpt-6.1-sol` (OpenCode).
- Scope: eight complete files, **1,555/1,555 logical lines**, including imports, comments, blanks and EOF. Every line read, every checklist class considered. No gaps or partial methods.
- Disposition: **OPEN**. Coverage is not security PASS, independent review, model-diverse three-dry, a repair, deployment assurance or L2 completion.
- Writes authorized/performed: this receipt only, through apply_patch. Runtime, tests, central docs, index and local B8 work preserved. No commits, pushes, dependency installs, app startup, network, real credentials or live stores used.

## Orientation

Read root AGENTS in full; browsed strategy; scanned recent CHANGELOG and plan/lane security/OAuth state. Read security method README, checklist, design-intent gate, learnings, thesis, OAuth/auth KB, I1-I6 overview, D92 and group access KB. Also read old `l1-api-a.md`, `l1-api-b.md`, `l1-api-d.md`, `l1-api-e.md` in full; the method's orient and post-mortem chapters were additionally read. Old receipts establish history, not coverage at this pin. PROTOCOL-01/DELTA remains open; OAuth implementation ticks do not mean security approval.

- Onboarding: B-1 symmetric trust, B-3 unsigned-default decoding, L1-A-02 manifest routing, L1-B-01 remote-helper trust, L1-D-01 principal freshness and L1-E-01 account-token URL transport remain relevant. B-7 is accepted lifetime, B-8 is the settings CLI finding; neither ID is reassigned.
- Recession: signed custom `expires` is not PyJWT's standard `exp`; merely verifying a signature does not enforce freshness. The newly added OAuth authorize path repeats that failure. Active-client checking in `certify` does not establish enforcement at every principal-producing helper.
- Obvious gap / assumptions: I1 requires trusted signing material, I2 verified claims, I3 correct principal and storage filters, I5 freshness plus client/contract binding and lifecycle checks before side effects, I6 verified remote authority. New replay handling assumes possession of any tombstoned token authorizes family invalidation before checking the requesting client's binding. I4 deliberately does not require operator blindness. Dependency integrity remains outside this scan; availability is a separate track.
- Local working changes existed before scanning: settings, B8 test/repair receipt, security records/learnings/index, changelog and plan/lane docs, plus SDK repair receipt. They were not reverted, staged, edited or used as pinned runtime evidence. Scoped runtime diff against the pin was empty.

## Exact Coverage

All ranges below are inclusive and collectively cover each whole file. Git blob IDs are pinned source identities, not hashes of this report.

| File | Lines and inspected sections | Git Blob |
|---|---|---|
| `api/app/endpoints/system.py` | 1-391: imports/router 1-20; root/certify/ice 21-71; setup 72-118; config/admin 119-170; telemetry/beacon/analytics 171-255; ready 256-269; manifest proxy 270-309; report submission/admin reads 310-391 | `005a5f3c3b4c4cbe53c567d22040383c29bd3400` |
| `api/app/models/auth.py` | 1-64: imports/Token 1-13; TokenData and both population methods 14-37; signup/login/contact forms 38-64 | `b6d6eed96c641ffaa98961fd85301d0bd5648460` |
| `api/app/services/auth.py` | 1-127: imports/bcrypt 1-35; decoder 36-45; IP/URL guards 46-75; remote helper 76-83; anon/certify 84-113; admin gate 114-127 | `4f00022a0c1b818c6b235bfe021bcf8c99febf6a` |
| `api/app/v3/endpoints/__init__.py` | 1-90: every import 1-24; prefix/router includes and comments 25-85; public node stats 86-90 | `b22f0e19ab30ae65bc340fb299981a2a70db2511` |
| `api/app/v3/endpoints/auth_helper.py` | 1-44: imports/user 1-14; client_id_of 15-28; user_or_anon 29-44 | `9a3de353f5b7ef3522859771915ac8ae4a2016b3` |
| `api/app/v3/endpoints/oauth.py` | 1-197: imports/constants/URI guard 1-39; registry register/list/lookup/revoke 40-90; mint and secret check 91-116; authorize 117-144; both token grants and terminal rejection 145-197 | `f0a6a3e7e1ae37f8e2e5bed9bfe1accf149069e4` |
| `api/app/v3/models/oauth.py` | 1-41: imports/register 1-10; revoke 11-15; lookup 16-20; authorize 21-31; token 32-41 | `fad58b27888f3c7eedd98337c678a99f009ef5a0` |
| `api/app/v3/endpoints/groups.py` | 1-601: imports/router 1-37; management/moderation/key/id/summary helpers 38-140; create/list/get/update 141-246; member list/add/remove 247-287; join/invite/accept/decline/leave/requests 288-380; manages/directory/by-user 381-462; detail 463-507; block/unblock/sharing/delete/heal 508-563; hide/unhide/hidden 564-601 | `8b58355666a5a9cd9a59abbad928c0766af89e8e` |

Line counts independently checked from `git show <pin>:<path>`: 391 + 64 + 127 + 90 + 44 + 197 + 41 + 601 = 1,555. `git diff <pin> -- <eight paths>` returned no output. All eight files were read through EOF with Read before probing.

## Six-Class Dispositions

| File | 1 Access Control | 2 Injection | 3 Boundaries / Transport | 4 Availability (Separate Track) | 5 Lifecycle | 6 Hygiene |
|---|---|---|---|---|---|---|
| system.py | Admin routes call check_admin; public setup/status/beacons/report submission intentional; setup guarded by node_has_users. No delegated helper certified by name. | No local SQL/shell/eval/template/path sink; request JSON is data. Store/render binding L2. | L1-A-02 persists; no registration/host gate at manifest GET. | Raw report/beacon sizes and pagination locally unbounded; manifest 256 KiB/timeout bound retained. | Setup check/key/config/user writes non-atomic locally; store concurrency/retention L2. | `/ready` exception text, beacon/report exception logging are unredacted sinks, not demonstrated protected-value leaks. Unsigned report attribution is not authorization. |
| models/auth.py | Token allows extras; TokenData assigns payload fields without assignment validation; neither alone grants authority. | No executable deserialization or execution sink. | No transport performed. | Unbounded strings/dicts/lists are reliability. | Optional claims/defaults are not expiry enforcement. | No literal secrets or credential logs; model permissiveness is caller-validation debt. |
| services/auth.py | B-1/B-3 persist; certify checks signature/provider/username/custom expiry and active client when truthy; check_admin calls certify and verified decode. | No SQL/shell/template/path execution. | L1-B-01; DNS names are not resolved by `_is_private_ip`; remote destination comes from unsigned claims and status 200 is trusted. | bcrypt work and remote timeout are reliability. | Client tombstone lookup delegated; anon expiry exemption intentional; no local key rotation. | Configured key use, not new source-secret evidence; intentional bcrypt 72-byte truncation maintained, no new password-policy finding. |
| endpoints/__init__.py | Includes routers without blanket auth dependency; public aggregate stats intentional. Per-router gates not established by assembly. | No query text/SQL execution locally. | Mount prefix `/v3`, `/oauth`, `/groups` accounted; no network/cookie sink. | Aggregate/stat costs delegated. | No state mutation locally beyond router assembly. | OAuth comment saying authorize/token land later is stale documentation, not a vulnerability. |
| auth_helper.py | L1-D-01 persists; client_id_of also returns verified marker without freshness/provider/client-state validation. No unsigned decode here. | No execution sink. | No network/URL transport. | Parsing costs only. | No custom expiry or active-client revocation check in these helper bodies. | No secrets/logs; caller responsibilities must not be mistaken for local enforcement. |
| oauth.py | L1-OAUTH-01; registry admin checks present; client secret check present; authorize rejects anon; L1-OAUTH-02 ordering. | No SQL/string execution; identifiers passed to store helpers. | Exact redirect equality; confidential clients by design; JSON models, not OAuth form/header parsing. No local outbound fetch. | URI list/string sizes and store costs reliability; Unicode secret compare may error, not an auth bypass. | Code/refresh entropy from secrets; one-use/TTL/rotation atomicity delegated. Replay branch invalidates before client binding. | No credential logging/literal key; registry list secrecy delegated while public lookup explicitly projects nonsecret fields. |
| models/oauth.py | Required token fields are schema presence, not authentication; confidential client secret optional in model but checked by handler. | Plain data fields; no execution. | Docstrings describe GET/form-style while implementation is POST JSON; interoperability drift, not demonstrated security break. | Unbounded redirect list/state/token strings reliability. | No lifecycle enforcement in schema; delegated to handlers/store. | No literal secrets/logging. Lookup token is required but unused by handler (public fields only), correctness mismatch not private-data leak. |
| groups.py | Permission gates on role assignment/revocation/invites/delete/moderation; update only checks membership locally. Public metadata/D80 enumeration intentional. E candidates remain L2. | No local SQL/shell/template/path sink; role dictionaries/helper parameters require storage tracing. | L1-E-01 persists. No local outbound fetch/cookie/postMessage. | Duplicate create member loop, unbounded collections/pagination reliability. | Check/resolve/add races, owner healing and tombstone semantics need storage evidence. | Account bearer URL is hygiene finding; no literal secrets/logging; get_document_any_author used for service gating does not itself return contents. |

I4: operator-readable data/config, public metadata and social graph are intentional, not findings. I6: no cross-ClickHouse query in scope; the remote certify helper's destination/status trust remains bounded local evidence, not federation verification.

## Local Findings And Observations

### L1-OAUTH-01: Expired Session Accepted at Authorization-Code Boundary

**OPEN; high-priority freshness integrity defect, related to L1-D-01, not B-3.** `oauth.py:135-142` requests signature verification, rejects blank/anon username, then sends a newly generated code to `store_oauth_code` without custom expiry/provider validation or `certify`. A synthetic correctly signed user JWT with `expires` yesterday produces a returned code and a store-call tuple bound to that user/client/URI for 60 seconds. The same JWT is rejected by actual `certify`.

Preconditions: possession of a previously valid signed user token, active target client and matching registered URI. Signature forgery is not demonstrated or needed. An expired session must not authenticate new delegation under I5/D92. This is newly covered OAuth-local acceptance, not a duplicate independent bug count for the already-known principal helper defect.

**Proven:** actual pinned handler execution, actual PyJWT signature verification, expired identity accepted and code handed to an inert sink/returned. **Not proven:** durable code insertion/redemption, fresh access/refresh issuance, real HTTP access, account takeover or live storage effects. Those direct edges remain L2. Bad response_type, wrong redirect and anonymous identity controls failed before the sink.

### L1-OAUTH-02: Foreign-Client Replay Triggers Family Invalidation Before Binding

**Local ordering observation; C+I consequence UNVERIFIED, not a confirmed in-scope vulnerability.** `oauth.py:169-178` authenticates requesting client A, loads a refresh row, and if deleted invokes `invalidate_token_family(row['family_id'])` before comparing row client to A. With a synthetic tombstoned row belonging to client B, real handler execution using correct A secret invokes the inert invalidation sink for B's family and then raises `invalid_grant`. A wrong A secret invokes no invalidation.

Preconditions: valid credentials for an active client A plus knowledge of a tombstoned refresh token from client B. Random guessing the opaque token is not established; this is not token discovery. The final HTTP error does not undo the preceding side-effect request. Demonstrated possible refresh denial is availability; no unauthorized read/grant or surviving attacker authority shown. Do not count it as a C+I finding or access-token revocation.

**Proven:** mismatched-client family invalidation is requested by local control flow without reaching the ownership check. **Not proven:** real store lookup returns such a row, real family mutation, concurrent effects, current access-token revocation or deployed logout. Actual helper/schema impact is L2; a fake sink is not a deployed exploit. Keep legitimate same-client replay invalidation when addressing this ordering.

## Existing IDs Revalidated

- **L1-A-02, OPEN:** `system.py:273-307`, arbitrary manifest destination and JSON response proxy. Fake GET received `http://127.0.0.1:8123/internal/manifest.json`; handler returned synthetic JSON. This proves routing/return primitive, not actual private-network reachability. Invalid JSON and over-cap controls rejected.
- **L1-B-01, OPEN:** `services/auth.py:46-81`, DNS-name provider `http://internal-service:8123` passes guard, receives fake POST `/certify`, fake 200 returns True. Literal loopback denied. No DNS/redirect/network test, production caller or remote attestation bypass claimed; old report's unused-helper conclusion not refreshed by repository-wide search here.
- **L1-D-01, OPEN:** `auth_helper.py:5-12,29-44`, expired signed user token returns fixture username from both helpers; `certify` rejects it. New `client_id_of:15-26` similarly only decodes claims; downstream active-client/contract bypass is not established. Provider/purpose absence is source observation, not a separate forged-token exploit.
- **L1-E-01, OPEN:** `groups.py:463-475` account credential accepted in GET query. Real isolated FastAPI route/OpenAPI generation declares `token` in `query`. No real credential/history/proxy theft demonstrated. Existing S7 owns related repair.
- **B-1 / B-3, OPEN existing debt:** synthetic key-holder can mint/decode arbitrary fixture identity; unsigned-default decode accepts unrelated-key claims while verified decoding rejects them (`services/auth.py:36-43`). No deployed key sharing, secret validity or unsigned authorization exploit claimed. D92 explicitly leaves HS256 migration separate; this is not new OAuth-specific cryptographic policy debt.

## Runnable Minimal Probes

Executed locally with `python3 -B` and existing PyJWT/Pydantic/FastAPI/requests. Loader retrieves pinned source with git, selects actual AST function/class bodies and removes only decorators except for the route-binding probe. It does not import app modules/settings, run startup, connect a store, issue HTTP/DNS calls or write bytecode. Request/store replacements are inert in-memory sinks. The following compact equivalent replay preserves the assertions used in the executed probe:

```bash
python3 -B - <<'PY'
import ast, subprocess, ipaddress, json, logging, secrets
from datetime import datetime, timedelta
from types import SimpleNamespace as N
from urllib.parse import urlparse
import jwt, requests
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException, APIRouter, FastAPI
P='f7aabdb26346752141f46f19c393dbadfd25ddd2'
def load(path,names,env,decorators=False):
    tree=ast.parse(subprocess.check_output(['git','show',P+':'+path],text=True))
    nodes=[n for n in tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
    assert {n.name for n in nodes}==set(names)
    if not decorators:
        for n in nodes: n.decorator_list=[]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),path,'exec'),env)
def denied(fn, *args):
    try: fn(*args)
    except HTTPException as e:
        assert e.status_code == 400 and e.detail in {'unsupported_response_type','redirect_uri_mismatch'}
        return
    except Exception as e:
        assert type(e) in (Exception,RuntimeError) and str(e) == 'TOKEN'
        return
    raise AssertionError('unexpected acceptance')
m=dict(BaseModel=BaseModel,ConfigDict=ConfigDict,Field=Field)
load('api/app/models/auth.py',['Token','TokenData'],m)
load('api/app/v3/models/oauth.py',['OauthAuthorize','OauthToken'],m)
s=N(PRIVATE_KEY='synthetic-isolated-key-at-least-32-bytes',ALGORITHM='HS256',PROVIDER='fixture-node')
a=dict(settings=s,jwt=jwt,datetime=datetime,ipaddress=ipaddress,urlparse=urlparse,Token=m['Token'],TokenData=m['TokenData'])
load('api/app/services/auth.py',['decode_token','anon_token','certify','_is_private_ip','_validate_provider_url','certify_with_remote_provider'],a)
def signed(**kw):
    claims=dict(username='fixture-user',provider=s.PROVIDER,expires=(datetime.utcnow()+timedelta(days=1)).isoformat())
    claims.update(kw)
    return jwt.encode(claims,s.PRIVATE_KEY,algorithm='HS256')
expired=signed(expires=(datetime.utcnow()-timedelta(days=1)).isoformat())
try: a['certify'](m['Token'](token=expired))
except Exception as e: assert str(e)=='TOKEN'
else: raise AssertionError('expired certify accepted')
h=dict(decode_token=a['decode_token'],exceptions=N(TOKEN=RuntimeError('TOKEN')))
load('api/app/v3/endpoints/auth_helper.py',['user','user_or_anon','client_id_of'],h)
assert h['user'](m['Token'](token=expired))=='fixture-user'
assert h['user_or_anon'](m['Token'](token=expired))=='fixture-user'
assert h['client_id_of'](m['Token'](token=signed(client_id='fixture-client')))=='fixture-client'
foreign=jwt.encode(dict(username='other',provider='elsewhere',expires='2000-01-01'),'unrelated-synthetic-signing-key-32bytes',algorithm='HS256')
assert a['decode_token'](foreign).username=='other'
try: a['decode_token'](foreign,True)
except jwt.exceptions.PyJWTError: pass
else: raise AssertionError('foreign signature accepted')
calls=[]
a['requests']=N(post=lambda url,**kw:(calls.append((url,kw)) or N(status_code=200)))
assert a['certify_with_remote_provider'](m['Token'](token=signed(provider='http://internal-service:8123')))
assert calls[0][0]=='http://internal-service:8123/certify'
denied(a['_validate_provider_url'],'http://127.0.0.1')
client=dict(client_id='client-a',client_secret='synthetic-client-secret',redirect_uris=['https://client.example/callback'])
stored=[]; invalidated=[]
ch=N(get_oauth_client=lambda cid:client if cid=='client-a' else None,
     store_oauth_code=lambda *args:stored.append(args),
     get_refresh_token=lambda token:dict(deleted=1,client_id='client-b',family_id='family-b'),
     invalidate_token_family=lambda family:invalidated.append(family))
o=dict(decode_token=a['decode_token'],exceptions=N(TOKEN=RuntimeError('TOKEN')),ch=ch,secrets=secrets,HTTPException=HTTPException, OauthAuthorize=m['OauthAuthorize'],OauthToken=m['OauthToken'])
load('api/app/v3/endpoints/oauth.py',['oauth_authorize','oauth_token','_verify_client_secret'],o)
o['_CODE_TTL_SECONDS']=60
r=o['oauth_authorize'](m['OauthAuthorize'](token=expired,client_id='client-a',redirect_uri=client['redirect_uris'][0]))
assert r['code']==stored[0][0] and stored[0][1:]==('client-a','fixture-user',client['redirect_uris'][0],60)
for overrides in [dict(response_type='token'),dict(redirect_uri='https://client.example/other'),dict(token=signed(username='anon'))]:
    data=dict(token=expired,client_id='client-a',redirect_uri=client['redirect_uris'][0]); data.update(overrides)
    count=len(stored)
    denied(o['oauth_authorize'],m['OauthAuthorize'](**data))
    assert len(stored)==count
for secret in ['wrong','synthetic-client-secret']:
    try: o['oauth_token'](m['OauthToken'](grant_type='refresh_token',client_id='client-a',client_secret=secret,refresh_token='synthetic-tombstoned-b'))
    except HTTPException as e:
        assert (e.status_code,e.detail)==((401,'invalid_client') if secret=='wrong' else (400,'invalid_grant'))
    else: raise AssertionError('refresh accepted')
    assert invalidated==([] if secret=='wrong' else ['family-b'])
class Response:
    body=[b'{"synthetic_internal":"fixture"}']
    def __enter__(self): return self
    def __exit__(self,*a): pass
    def raise_for_status(self): pass
    def iter_content(self,**kw): return self.body
gets=[]
e=dict(requests=N(get=lambda url,**kw:(gets.append(url) or Response()),exceptions=requests.exceptions),json=json,exceptions=N(NO_PWA=RuntimeError('NO_PWA')),log=logging.getLogger('isolated'))
load('api/app/endpoints/system.py',['pwa_listing'],e)
assert e['pwa_listing']('http://127.0.0.1:8123/internal')=={'synthetic_internal':'fixture'}
assert gets==['http://127.0.0.1:8123/internal/manifest.json']
for body in [[b'not-json'],[b'x'*(256*1024+1)]]:
    Response.body=body
    try: e['pwa_listing']('https://fixture.example')
    except RuntimeError as ex: assert str(ex)=='NO_PWA'
    else: raise AssertionError('manifest control accepted')
g=dict(router=APIRouter(),SimpleNamespace=N,user_or_anon=lambda data:'anon')
load('api/app/v3/endpoints/groups.py',['group_detail'],g,decorators=True)
app=FastAPI(); app.include_router(g['router'])
params=app.openapi()['paths']['/detail']['get']['parameters']
assert any(p['name']=='token' and p['in']=='query' for p in params)
print('All local finding assertions and negative controls passed')
PY
```

Observed original execution: exit 0; six progress confirmations for B-1/B-3/D-01, B-01, OAUTH-01, OAUTH-02, A-02 and E-01 (B-1/B-3/D-01 shared one line). Only datetime.utcnow deprecation warnings; no failure needing a retry. The compact replay consolidates print lines and introduces a negative-control helper; it does not alter extracted runtime bodies. Standard dependencies must already be available; no installation is part of reproduction.

## Failed Attempts and Limits

- Unrelated-key verified decode failed with PyJWTError; unsigned-default reading succeeded. No claim that unsigned metadata attribution alone authorizes anything.
- Actual certify denied yesterday's custom expiry with TOKEN; principal helpers and authorize did not. No probe claimed global middleware bypass.
- Literal private-IP provider validation failed. DNS-name and status trust succeeded only at inert sinks; no DNS rebinding, redirect or live internal-service proof.
- Implicit response, redirect mismatch and anonymous authorize attempts failed before code storage. These narrowly bounded negatives do not validate expiry/purpose/provider/revocation globally.
- Wrong client secret failed before family invalidation. Correct A secret plus tombstoned B row reached invalidation even though the request ultimately failed. No actual storage mutation proved.
- Non-JSON and over-cap manifest attempts failed with NO_PWA. Valid JSON routing alone does not imply arbitrary byte/file reads.
- Route-binding proof generated OpenAPI in memory, not a client request with a real bearer or access-log leak.
- No full API test suite, browser, deployed server, concurrent storage replay, live egress or OAuth client integration run. No failed environment setup or package changes. Candidate concerns below were deliberately not promoted through permissive fakes.

## L2 Handoffs (Not Completed Here)

1. `oauth_authorize -> decode_token/store_oauth_code`, token redemption/minter and callers: trace actual issuance/redeem, expiry/provider/purpose checks and whether delegated tokens can authorize another client without session authority. No re-delegation/contract-escape exploit claimed.
2. `oauth_token -> get_refresh_token/invalidate_token_family/rotate_refresh_token`: real hash lookup, tombstone visibility, client/family binding, atomic one-use rotation and replay races. Trace revocation endpoint/contract interaction: OAuth KB promises revoked refresh fails, but these local bodies do not inspect app-contract revocation. Storage/contract bypass remains unverified.
3. `certify/client_id_of/user/user_or_anon -> callers`: active-client tombstone and custom expiry enforcement at actual access boundaries, falsey delegation markers and provider/purpose separation. Do not infer all request paths call certify from the auth KB diagram.
4. Historical E-C1/E-C2/E-C4/E-C5 retained: groups update accepts a member then forwards roles/visibility; accept-invite accepts pending-or-invited; create replay forwards members and caller roles to ownership ensure; real helper gates/role validation determine effects. No confirmed low-role escalation from fake storage. D80 public membership and D53 metadata must remain public.
5. Owner healing: `/list` parses all returned group IDs and heals where owner equals caller, while `_parse_group_id` also accepts non-user-created shapes; `/heal-owner` has the same generic parser. Trace real helper namespace validation, role provenance and storage. Source mismatch with the user-created-group comment is not a demonstrated takeover. `/list` starts with get_user_groups: whether completely missing membership can self-heal is correctness/storage debt.
6. Group detail/moderation -> membership/content/storage gates: doc reads, hidden-doc metadata, blacklist/sharing and management checks/tombstones. No raw-store read or cross-user content leak shown; static `service='posts'` in detail is a pre-existing D60 genericity concern, not a new security exploit.
7. System setup -> key/config/admin persistence: check-then-write concurrency and failed create leaving saved key/config. Config/admin routes -> actual credential/admin enforcement; public telemetry/report -> binding, rendering, retention and safe error producers. `/ready` error interpolation and log.exception are sinks without reachable protected-value sources here (historical L1-A-01-style unverified disclosure, not confirmed leak).
8. Router includes -> per-router auth and duplicate recovery mount semantics; helpers/models -> real request validation, body-vs-header/form OAuth interoperability. No mount-level blanket-auth claim or undocumented transport support assurance.

## Design Intent

This is the scanning author's intent analysis, not a fresh independent DESIGN-INTENT REVIEW or acceptance of untested risks.

- Intended behavior: D92 adds confidential-client authorization codes, verified delegated identities, per-client revocable contracts and rotating refresh families without replacing generic groups/doc permissions. Only a signed-in, unexpired session should establish new delegation. Replay revokes the owning client's compromised family, not an unrelated client's lifecycle merely because another client supplied the token.
- Changed behavior: none; runtime/tests untouched. Any future repair should be one bounded finding, with actual red-to-denied repro gates and separately reviewed intent delta.
- By-design conflict: none asserted. Preserve D41 readable nodes, D56 content-blind telemetry, JSON body-token convention, intentional anonymous/public metadata, owner repair and browser no-Origin behavior. Do not add default E2E, HttpOnly requirements or blanket-private social graphs.
- Conventional deviations: HS256 migration deferred separately by D92/D7; no flat OAuth scope and no public-client/PKCE flow deliberately chosen in D92. These are not newly discovered policy mistakes. Account bearer tokens in GET URLs are not excused by body-token design. Optional state is client-managed per OAuth KB, not automatically an endpoint CSRF finding.
- Untested intent risks for future repairs: legacy session/app tokens may depend on permissive helpers; provider/purpose gating can break intended direct/same-origin flows; client-binding changes must preserve same-client stolen-token detection; transport changes must preserve anonymous detail deep links. Actual code/refresh persistence, denied-call nonmutation and valid confidential-client flow need tests before closure, not assumed safe from these sinks.
- Write-back: only this local receipt, per explicit user constraint. Central record/learnings/index/plan/changelog remain unchanged; coordinator incorporation, fresh review and model diversity still owed. No repair or security gate advanced.
