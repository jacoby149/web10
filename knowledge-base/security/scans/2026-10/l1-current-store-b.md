# Current Store B: Read-Only L1 Receipt

Integration: `l1-current-api-review.md` bounds the conditional race, SQL omission and unresolved real schema/merge effects.

- Pin: `f7aabdb26346752141f46f19c393dbadfd25ddd2` (HEAD verified).
- Date: 2026-10-27. Model: `openai/gpt-6.1-sol`.
- File: `api/app/v3/services/clickhouse.py`, 5,317 logical lines at pin.
- Assigned coverage ONLY: inclusive 1976-2930 (955 lines) and 2931-3891 (961 lines), total **1,916 lines**, no overlap/gaps. Every assigned line read, including comments and blanks. All function bodies complete at both boundaries; 72 functions and one exception class. All six checklist threat classes applied, not six Python classes.
- Source equality: `git diff <pin> -- api/app/v3/services/clickhouse.py` empty during replay. No coverage claimed outside these ranges or for dependencies/callers. Runtime, tests and central documents read-only. Only this receipt written; no fix/commit/push/network/database/secret access.
- Result: one demonstrated conditional local single-use failure; one new SQL-construction defect requiring schema/caller verification; historical candidates retained as handoffs. Not a whole-file PASS, current campaign closure, endpoint exploit, deployed exposure, independent review or model-diverse three-dry sign-off.

## Orient and Intent

Read root AGENTS in full; browsed strategy; read thesis, recent changelog, security learnings, security theory README, six-class checklist, design-intent gate, historical `l1-api-o.md`, `l1-api-p.md`, `l1-api-q.md`, canonical groups/access and auth/oauth specs. Checked current plan/lane entries: PROTOCOL-01/DELTA remains open, protocol L2 gated. Old receipts at `8af7e0fce922cada30002dff190a5bb3abcf4f63` do not cover new OAuth code or establish current assurance.

Onboarding: I3 has no storage ACL backstop. Storage helpers may deliberately rely on caller authorization. B-6 and L1-H-01 are existing related work, not findings reproduced here. Recession: rechecked tombstone ordering, app identity re-keying, read gates and media capability minting rather than inheriting old PASS language. Obvious gap: code/refresh token check-then-act and identity-preserving tombstones now need explicit treatment; owning metadata is not necessarily authority over its object key.

Intent: generic documents/contracts/groups remain usable by any app (D60), with both app-contract and per-service effective-role gates (D58/D92). OAuth codes are client/redirect-bound, 60-second, single-use; refresh rotation retains tombstoned rows for replay detection. D41 permits node readability, not arbitrary user access. Preserve public grants, authorized cross-user/group media, public thumbnails, author-context metadata lookup, generic ads, and fresh reader-specific HLS capabilities. No default E2E, token-transport, telemetry or operator-configuration changes proposed.

## Function Coverage

Ranges below name every function/class; intervening module comments, cache constants and whitespace were also read. Ranges are definition/body spans, not an alternative coverage denominator.

| Lines | Complete symbols |
|---|---|
| 1976-2032 | `ban_user` 1976-1988; `unban_user` 1991-2003; `get_banned_users` 2006-2015; `get_banned_users_list` 2018-2032 |
| 2040-2097 | `get_user_discover_posts` 2040-2057; `insert_moderation_flag` 2060-2067; `get_moderation_flags` 2070-2097 |
| 2105-2190 | `add_app_contract` 2105-2119; `get_app_contracts` 2122-2143; `is_origin_allowed` 2146-2154; `get_app_permissions` 2157-2178; `has_permission` 2181-2190 |
| 2193-2250 | `grant_delegated_contract` 2193-2207; `revoke_app_contract` 2210-2223; `revoke_all_app_contracts` 2226-2233; `cleanup_stale_app_contracts` 2236-2250 |
| 2258-2335 | `add_oauth_client` 2258-2274; `get_oauth_client` 2277-2296; `list_oauth_clients` 2299-2315; `revoke_oauth_client` 2318-2325; `_hash_secret` 2331-2335 |
| 2338-2440 | `store_oauth_code` 2338-2346; `redeem_oauth_code` 2349-2378; `store_refresh_token` 2384-2391; `get_refresh_token` 2394-2415; `rotate_refresh_token` 2418-2429; `invalidate_token_family` 2432-2440 |
| 2448-2524 | `block_user` 2448-2451; `unblock_user` 2454-2466; `is_user_blocked` 2469-2476; `block_user_in_group` 2479-2482; `unblock_user_in_group` 2485-2497; `set_user_group_sharing` 2505-2511; `is_sharing_enabled` 2514-2524 |
| 2532-2713 | `_power_mean_score` 2532-2584; `_power_mean_score_sql` 2587-2633; `_board_base_sql` 2636-2713 |
| 2716-2928 | `_group_docs_query` 2716-2761; `_group_docs_ranked_query` 2764-2842; `read_documents_in_groups` 2845-2905; `QueryExecutionError` 2908-2912; `execute_query` 2915-2928 |
| 2931-3115 | `read_docs_by_ref` 2931-3012; `read_ref_counts_by_ref` 3015-3045; `read_document_by_id` 3053-3115 |
| 3118-3279 | `resolve_pinned_ads` 3118-3157; `attach_pinned_ads` 3160-3172; `get_active_node_ads` 3180-3224; `_node_ad_hash` 3227-3236; `attach_node_ads` 3239-3279 |
| 3287-3405 | `get_groups_manages` 3287-3337; `add_provider_service_contract` 3361-3372; `get_provider_service_contracts` 3375-3383; `is_provider_origin_allowed` 3386-3394; `revoke_provider_service_contract` 3397-3405 |
| 3413-3609 | `_hls_settings_for_ref` 3413-3425; `resolve_media_urls` 3428-3519; `_collect_minio_keys` 3522-3532; `_resolve_minio_types` 3535-3554; `resolve_minio_types` 3557-3568; `resolve_media_urls_in_docs` 3571-3609 |
| 3627-3758 | `total_s3_size` 3627-3641; `get_app_metrics` 3644-3672; `get_node_active_users` 3675-3688; `list_store_apps` 3691-3704; `get_node_stats` 3707-3752; `node_has_users` 3755-3758 |
| 3766-3889 | `get_node_config` 3766-3779; `save_node_config` 3782-3789; `save_jwt_key` 3792-3799; `get_latest_jwt_key` 3802-3812; `create_user` 3820-3843; `migrate_user` 3846-3889 |

## Six-Class Disposition

| Class | Review result |
|---|---|
| 1 Access control / I1-I3,I5 | App lookup branches bind user and origin/client; empty permissions deny. Registry listing excludes secret; internal getter intentionally returns it. Mutations/config/key/account helpers rely on callers. By-ID and pinned-ad membership SQL does not itself evaluate per-service roles. Optional board membership explicitly delegates preauthorization. These are L2 obligations, not proof of public access. |
| 2 Injection | Most SQL values parameterized; generated placeholders index-derived. Rank expression inputs are trusted-expression seams. Ref/cursor literals double quotes, but service is interpolated and compiler is external. `execute_query` deliberately trusts compiled SQL. No shell/eval/pickle/yaml/render/filesystem sink observed. No injection demonstrated; compiler/driver escaping unverified. |
| 3 Boundaries/transport / I5,I6 | Stored origins/redirects are not fetched. Signing functions operate on keys with configured bucket; no local user-destination fetch. Actual S3 pagination is an external operational call and was not invoked. No JWT decode, cookie/CORS registration, postMessage or account-token URL construction here. Offline fake signer is not a private read. |
| 4 Availability | Unbounded lists, moderation aggregation, recursion, global engagement scans, bucket pagination, full app sort and numeric edge cases are reliability-only. No C+I ID assigned for cost/overflow. |
| 5 Lifecycle | Code redemption check-then-consume demonstrated below. Bulk app tombstones lose delegated identity. Several reads prefilter tombstones before latest selection; app/OAuth/provider timestamp ties omit deleted tie-break. Refresh getter intentionally exposes tombstones for caller replay handling, not a missing local gate. Rotation and family invalidation are separate operations. |
| 6 Hygiene | No credential literal, automatic credential logging or source-default password found in assigned lines. Client secret persistence is explicit registry design, not an automatic B-2 finding. Raw codes/refresh tokens hashed before insert. Config/JWT records intentionally persist and need privileged callers; no secret read attempted. Exception-string propagation is a sink needing source/audience tracing, not proven secret disclosure. |

I4: readable-node/public-grant model preserved. I6: no cross-node store query in assigned code. I1/I2 cryptographic verification lives outside scope; no verification assurance inferred.

## Stable Findings and Handoffs

### L1-CURRENT-STORE-B-01: Conditional Concurrent Code Redemption

Location: 2349-2378, especially query 2354-2359 and tombstone 2372-2377. **Confirmed local single-use failure under concurrent active snapshots**, not demonstrated authenticated HTTP token issuance. Two calls can both read active code, pass binding/expiry, each issue a tombstone, and each return the username. The function has no conditional consume result or synchronization; even a zero-row command would not prevent its return. Prerequisite: overlapping requests with a valid code and matching client/URI. Synthetic barrier replay below returns `['alice', 'alice']`; no invented secret, DB or network.

L2 handoff: trace token endpoint admission/concurrency and actual ClickHouse visibility/schema, then reproduce duplicate issuance safely with isolated dependencies. Keep client/URI binding and ordinary one-time authorization usable. Do not conflate this with issuer trust or claim production exploitation. Refresh rotation's analogous interleavings (2418-2440) need their own replay; not confirmed by this code-redemption test.

### L1-CURRENT-STORE-B-02: Delegated Identity Omitted From Bulk Tombstones

Locations: `revoke_all_app_contracts` 2228-2231 and `cleanup_stale_app_contracts` 2242-2247. **Confirmed SQL-construction mismatch; authorization impact UNVERIFIED.** Both omit `client_id` from INSERT columns and SELECT projection. Targeted revocation 2220-2221 preserves it, delegated grants 2198-2200 populate it, and permission reads 2164-2166 select it. Thus bulk operations do not explicitly tombstone the same delegated identity. Cleanup also treats empty delegated origins as stale, contrary to its browser-only legitimacy comment.

L2 handoff: verify actual column default, sorting key, migrations, caller timing and delegated permission after bulk revoke/cleanup. A default-empty delegated key may leave the original delegated grant active or create a synthetic browser-key tombstone; this consequence was NOT executed against ClickHouse. Not a demonstrated revoke bypass or independent duplicate of historical O-C3 timestamp ties. Preserve both browser and delegated keyspaces, not a blanket OAuth disable.

### Existing Candidate Continuity (Not New Confirmed Findings)

- **O-C1 / P-C2:** 2052-2053 and 2682-2683 attachment reads prefilter deleted rows before ranking; 3203-3206 node ads prefilter deleted/tags and read raw active attachments. Replay newer detach/delete/tag-removal versions with actual schema and callers before claiming stale exposure. Board documents themselves rank before deleted filtering; do not generalize attachment behavior to that subquery.
- **O-C2:** 2472-2473 blocked predicate discards unblock tombstones before latest selection. Likely over-denial, not demonstrated confidentiality loss. Board blacklist anti-joins instead dedup first with deleted tie-break.
- **O-C3 expanded:** 2132, 2151, 2172, 2282, 2304, 2356, 2401, 3379, 3391 timestamp ordering lacks deterministic deleted tie-break. Actual precision/collisions/merge rules need isolated DB evidence. No same-time revocation exploit claimed.
- **O-C5 / P-C1:** board `require_membership=False` delegates readable group filtering; by-ID 3088-3099 uses raw active member/attachment rows and document deleted prefilter, without roles/contracts, group blocks/sharing/hides/bans locally. Pinned ads 3144-3146 likewise raw membership, and literal-only membership can under-serve intentional public grants. Trace all caller gates and public/authorized controls before labeling a leak or proposing membership-only lockdown.
- **P-C3:** refs/cursor/service 2963-2999 and 3035-3044 enter external `build_safe_query`; validate real parser/round-trip, backslashes/quotes, service provenance, raw-table rejection and parameter semantics. A stub compiler would not prove injection. `execute_query` 2925 deliberately executes trusted SQL; its trust precondition needs caller verification.
- **P-C5:** global reaction/comment ranking counts at 2817-2824 are not visibility-filtered here and prefilter deleted versions. Determine intended public aggregate semantics and actual inference before asserting restricted-data disclosure.
- **P-C4 / Q-C1 / L1-H-01 relationship:** metadata is author-scoped 3458; its stored keys and recursively supplied minio keys 3544-3548 reach signer. Probe proves forwarding only. Trace write-time object ownership/capability validation and read callers, including ad branches 3593-3607. No real signature, object existence, persistence, private retrieval or HTTP access shown; do not double-count the existing media handler concern. Retain authorized cross-user media and public thumbnails.
- **Q-C6 partial overlap:** `node_has_users` 3757 and create-user existence 3830 prefilter deleted; stats counts use mixed dedup rules. Trace bootstrap/registration constraints and concurrent signup/migration before naming auth takeover. `migrate_user` delegates existence/member checks outside assigned lines.
- **Additional direct-edge debt:** admin/owner gates on moderation, OAuth registry, blacklist/sharing, provider contracts, node config/JWT getters/setters and account migration; permission shape validation; empty/falsy client-ID routing and mixed key namespaces; refresh getter expiry/deleted/client validation by callers; family invalidation versus concurrent token insert; exception text returned by query handlers; approved-app metadata audience and stats aggregation. None demonstrated as an external bypass here. Helpers beyond the assigned slice are unreviewed, even when named by a call.

## Runnable Evidence

Stdlib only, reads pinned source through git, compiles selected real AST bodies without application imports/settings/credentials; query/command/insert/signing sinks are inert. Run from repository root. This minimal replay covers the two new observations plus denial/hash/media controls; broader successful run also asserted board tag placeholders, omitted optional membership, client/origin parameter branches and empty-permission denial.

```sh
python3 -B - <<'PY'
import ast, subprocess, types, datetime, json, threading, concurrent.futures
pin = 'f7aabdb26346752141f46f19c393dbadfd25ddd2'
s = subprocess.check_output(['git','show',pin+':api/app/v3/services/clickhouse.py'], text=True)
assert not subprocess.check_output(['git','diff',pin,'--','api/app/v3/services/clickhouse.py'], text=True)
nodes = [n for n in ast.parse(s).body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and 1976 <= n.lineno <= 3891]
assert all(n.end_lineno <= 3891 for n in nodes)
assert len(nodes) == 73 and len(s.splitlines()) == 5317
now = datetime.datetime(2026,10,27,tzinfo=datetime.timezone.utc)
ns = {'json':json, 'timedelta':datetime.timedelta, '_now':lambda:now,
      'settings':types.SimpleNamespace(S3_BUCKET='synthetic',READ_URL_EXPIRY=60)}
m = ast.Module(body=[ast.ImportFrom(module='__future__',names=[ast.alias(name='annotations')],level=0)]+nodes,type_ignores=[])
exec(compile(ast.fix_missing_locations(m),'pinned-slice','exec'),ns)
class Capture:
    def __init__(self): self.commands=[]; self.inserts=[]; self.rows=[]
    def command(self,q,p=None): self.commands.append((q,p)); return types.SimpleNamespace(written_rows=1)
    def insert(self,*a,**k): self.inserts.append((a,k))
    def query(self,q,p=None,**k): self.commands.append((q,p)); return types.SimpleNamespace(result_rows=self.rows)
c=Capture(); ns['client']=c
ns['revoke_all_app_contracts']('alice')
ns['cleanup_stale_app_contracts']('alice')
ns['revoke_app_contract']('alice','',client_id='bot')
assert 'client_id' not in c.commands[0][0] and 'client_id' not in c.commands[1][0]
assert 'client_id' in c.commands[2][0]
uri='https://client.invalid/cb'
ns['store_oauth_code']('synthetic-code','bot','alice',uri)
ns['store_refresh_token']('synthetic-refresh','bot','alice','family')
assert c.inserts[0][0][1][0][0] == ns['_hash_secret']('synthetic-code')
assert c.inserts[1][0][1][0][0] == ns['_hash_secret']('synthetic-refresh')
for expiry,cid,u in [(now+datetime.timedelta(seconds=60),'other',uri),
                     (now+datetime.timedelta(seconds=60),'bot',uri+'/other'),
                     (now-datetime.timedelta(seconds=1),'bot',uri)]:
    c=Capture(); c.rows=[('alice',expiry,'bot',uri)]; ns['client']=c
    assert ns['redeem_oauth_code']('synthetic-code',cid,u) is None
    assert len(c.commands)==1
barrier=threading.Barrier(2)
class Race(Capture):
    def query(self,q,p=None,**k):
        barrier.wait(timeout=5)
        return types.SimpleNamespace(result_rows=[('alice',now+datetime.timedelta(seconds=60),'bot',uri)])
c=Race(); ns['client']=c
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results=list(pool.map(lambda _:ns['redeem_oauth_code']('synthetic-code','bot',uri),range(2)))
assert results==['alice','alice'] and len(c.commands)==2
calls=[]
signer=types.SimpleNamespace(generate_presigned_url=lambda op,**kw:calls.append((op,kw)) or 'synthetic-url')
ns['get_s3_signing_client']=lambda:signer
body={'nested':[{'type':'minio','value':'other-owner/synthetic-object'}]}
out=ns['resolve_minio_types'](body)
assert calls[0][1]['Params']['Key']=='other-owner/synthetic-object'
assert out['nested'][0]['url']=='synthetic-url' and 'url' not in body['nested'][0]
assert ns['_hls_settings_for_ref']({'transcoding_settings':{'manifest_url':'synthetic-old','status':'done'}})=={'status':'done'}
print('local race:',results,'bulk identity omission confirmed; denial/hash/media controls passed; no private read')
PY
```

Executed broad replay: exit 0. Output: bulk/cleanup `preserves_client_id False`, targeted `True`; hash PASS; DENIED wrong-client/wrong-uri/expired; race `['alice', 'alice']`, two tombstone commands; board PASS; permission branches/default-deny PASS; media forwarding/input-unchanged/HLS-strip/no-key PASS. Counts: 5317 total, 955+961=1916 assigned, 72 functions/1 class.

Failed harness attempt: first compilation omitted locations on a synthesized future import and raised `TypeError: required field "lineno" missing from stmt` before function execution. Fixed in-memory harness with `ast.fix_missing_locations`; no source change. It is not product evidence. Negative exploit controls above rejected wrong binding/expired codes without issuing consume commands. No failed attempt was discarded as a safety PASS.

## Design-Intent and Limits

- Intended behavior: generic role-gated reads, revocable delegated grants, single-use codes, replay-aware refresh rotation, fresh media/HLS URLs, readable-node discovery and public aggregate metrics.
- Changed behavior: none; only this local receipt added. No repair reviewed or accepted.
- By-design conflict: none introduced. Potential repairs must not replace per-service/public effective grants with ownership-only or literal-membership-only restrictions, remove authorized cross-user media, hardcode social services, or disable OAuth to hide its lifecycle defect.
- Conventional deviations: readable node/no default E2E and body-token model intentional per thesis/learnings; not findings. Raw registry secret storage is specified; rotation/storage hardening needs separately grounded scope, not an invented project decision.
- Tests cover delta: no runtime delta. Synthetic evidence proves selected local behavior only, not schema, parser, signer, endpoint integration or deploy behavior. No committed tests or existing runtime test suite executed/modified.
- Untested intent risks: all real public/authorized media flows, concurrent ClickHouse semantics, expiry precision, client lifecycle and caller permission checks remain unverified. No risk acceptance or independent fresh design-intent sign-off fabricated. Central KB write-back intentionally deferred to coordinator under explicit read-only constraint.

No reads outside assigned code promoted to L1 coverage. No line coverage for prior storage foundations or later users/recovery/analytics implied. No database or HTTP exploit, valid credential, private object, production exposure, credential rotation, repair, central-record update, commit/push, security PASS or L2 advancement claimed.
