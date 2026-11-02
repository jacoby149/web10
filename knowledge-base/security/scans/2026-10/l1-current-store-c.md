# Current Store C: Assigned L1 Receipt

Integration: `l1-current-api-review.md` calibrates relational-model evidence; no actual ClickHouse/endpoint exploit established.

## Identity and Scope

- Date: 2026-10-27. Scanner/model: `openai/gpt-6.1-sol` (OpenCode; API routing ID `openrouter/openai/gpt-6.1-sol`).
- HEAD/source pin: `f7aabdb26346752141f46f19c393dbadfd25ddd2`.
- File: `api/app/v3/services/clickhouse.py`, 5,317 logical lines at this pin.
- Assigned coverage only: **3892-4877 = 986 lines**, **4878-5317 = 440 lines**, **1,426 lines total**, inclusive, contiguous, no overlap. All assigned lines read, including comments, constants, DDL and blank lines. Unread assigned lines: zero.
- **46 complete top-level functions**, no class definitions in this slice. The requested six classes are addressed as threat classes below. First range ends after `list_apps_admin`; second begins with `get_app` and ends at EOF after `node_ad_performance`.
- Source read in three complete windows: 3892-4391, 4392-4877, 4878-5317. `git rev-parse HEAD` matched the pin; `git diff <pin> -- api/app/v3/services/clickhouse.py` produced no output.
- Coverage complete for this assignment, **not PASS**. No fix, live exploit, caller assurance, independent/model-diverse review, three-dry sign-off or L2 advancement claimed.
- Existing unrelated worktree changes were present at start and left untouched. Only this `.context` receipt is written; no runtime/test/central KB edits, commits, pushes or installations.

### OAuth Scope Mismatch

The instruction mentions code, refresh and client persistence, but those implementations are **not in the assigned ranges at this HEAD**. Symbol-location search finds `add_oauth_client` at 2258, `get_oauth_client` 2277, `list_oauth_clients` 2299, `revoke_oauth_client` 2318, `store_oauth_code` 2338, `redeem_oauth_code` 2349, `store_refresh_token` 2384, `get_refresh_token` 2394 and `rotate_refresh_token` 2418. These are inventory locations only, **not reviewed bodies or coverage**. No OAuth single-use/rotation/client-persistence assurance can be derived from Store C. Do not silently credit them to this receipt; the assigned owner of that earlier slice must account for them. This receipt stays within the explicit range restriction.

## Orientation

Read root `AGENTS.md`; browsed strategy; read thesis, D92, relevant plan/lane status and recent changelog; read security method README, orient, all checklist classes, design-intent gate, security overview I1-I6, learnings, security-record context, historical `l1-api-q.md` and `l1-api-r.md`, and the complete OAuth KB (`knowledge-base/web10-v3/auth/oauth.md`). Historical Q/R pin is `8af7e0fce922cada30002dff190a5bb3abcf4f63`, not current assurance.

- **Onboarding:** Q-C2/Q-C3/Q-C4/Q-C5/Q-C6 and R-C1 through R-C7 already name the account, recovery, verification, analytics, curation and diagnostics edges relevant here. B-1/B-3 issuer/decoder debt and BP-1 remain separate. B-4 automatic HTTP logging source repair does not certify every logger. No new B-series ID is allocated here.
- **Recession:** latest-before-deleted handling is not uniform. `list_users` and app/rating lists rank tombstones; account getters, several mutations, media reads, app detail lookup and node-ad inventory have different ordering. Existing warnings about non-atomic metrics remain applicable, not newly demonstrated races. `verify_phone` and `verify_email` explicitly select only one latest active row; do not conflate them with the three all-history mutations.
- **Obvious gap / assumptions:** I1/I2 depend on real decoder validation, not a helper name; I3 depends on caller-derived identity/group sets and document attachment semantics; I5 depends on current account/contact state and contract gates; I6 depends on no remote-controlled query authority. Bound parameters do not establish correct authorization. Version filtering and expiry cannot be presumed safe merely because storage uses tombstones. No new invariant class proposed; availability remains reliability, not C+I security debt.
- Queue state: OAuth O1-O9 are recorded complete, O10 optional/open; post-pin API delta review remains open. This is refreshed assigned coverage, not reimplementation of shipped OAuth or closure of the campaign.

## Complete Function Inventory

Ranges below give function definition through final statement; intervening lines were also read and are included in the 1,426-line denominator.

| Lines | Function | Local review disposition |
|---|---|---|
| 3892-3899 | `list_users` | Rank all rows then filter tombstones; tie favors deletion. Negative control N2. |
| 3902-3992 | `list_public_users` | Derives group IDs, delegates readable-group gate, reads gated faces without membership recheck, chooses newest face and counts/ranks. Helper gate/block semantics and username/provider identity need L2. |
| 3995-4014 | `get_user` | Deleted-first lookup returns password hash/contacts internally; P2 logical-model stale-row result. |
| 4017-4024 | `authenticate_user` | Delegates hash verification after `get_user`; no actual password verification or login bypass replay. |
| 4027-4043 | `change_password` | All active history copied with new hash and one timestamp; P1 demonstrates conflicting copied contacts. |
| 4046-4058 | `change_phone` | Same all-history SQL shape; resets phone verification but can copy stale hashes/email. Static sibling of P1, not separately executed. |
| 4061-4073 | `set_email` | Same all-history SQL shape; resets email verification but can copy stale hashes/phone. Static sibling of P1. |
| 4076-4090 | `verify_phone` | Latest active row only, N1; challenge/contact binding and concurrent updates unverified. |
| 4093-4100 | `verify_email` | Latest active row only; same challenge-boundary limit, no separate execution. |
| 4103-4114 | `get_user_profile` | Returns contacts/verification flags, not password; docstring says public but audience not established. |
| 4117-4120 | `get_phone_number` | Delegates account lookup; caller ownership unverified. |
| 4123-4132 | `get_phone_record` | Contact + deleted filtered before latest; old contact/account association candidate Q-C2. |
| 4135-4171 | `get_users_by_contact` | Fixed email/phone predicates, parameterized normalization; deleted filtered inside ranking. P2. |
| 4194-4198 | `_ensure_recovery_codes_table` | Best-effort DDL, swallowed exception; no secret output. |
| 4201-4207 | `set_recovery_code` | Plain code + timestamp insert, intended local-Twilio/E2E mode. |
| 4210-4219 | `check_recovery_code` | Latest string comparison, no local TTL/consume; Q-C3, not production replay proof. |
| 4227-4253 | `confirm_media_upload` | Supplied author + serialized metadata insert, standard envelope; upload provenance delegated. |
| 4256-4304 | `list_media` | Author and service filters, generated bound ID placeholders, deleted-first version ranking; stale-media candidate. |
| 4307-4314 | `delete_media` | Author-bound tombstone insert from active history; DB defaults/version precision outside scope. |
| 4322-4354 | `_canonical_app_url` | Parse/normalize only, strips credentials/query/fragment, folds index; no fetch/SSRF sink. |
| 4357-4370 | `_verified_username` | Requests signed decode; no local custom expiry/purpose/client gate; Q-C4, decoder not executed here. |
| 4377-4394 | `_count_app_visit` | Bound app/user max timestamp, 3h gate, insert; non-atomic, no concurrency replay. |
| 4431-4472 | `log_content_deliveries` | Rejects anon/empty, unique IDs, batched 24h gate/insert; arbitrary exception text warning. |
| 4475-4486 | `_has_preceding_delivery` | Same doc/service/reader/surface, delivery within 1 day; exercised through P3/N3. |
| 4489-4515 | `_log_content_signal` | Preceding delivery plus same-type 1h gate; event name passed through. P3/N3. |
| 4518-4529 | `record_content_event` | Anon rejection and signal delegation; P3/N3. |
| 4532-4552 | `content_event_reach` | Supplied doc/service set; bound values and integer interval. |
| 4555-4586 | `content_event_metrics` | Supplied docs/service, delivery/click/viewport aggregates and numeric conversion. |
| 4589-4611 | `content_event_surface_breakdown` | Supplied docs/service, delivery counts by surface. |
| 4614-4634 | `content_event_timeseries` | Supplied docs/service, delivery counts by date. |
| 4637-4666 | `content_event_views_for_docs` | Requires supplied doc/group sets; raw active attachment subquery, no local group authorization derivation. |
| 4669-4711 | `content_event_creator_rows` | Supplied author/service doc subquery; active-first history, doc-ID-only event association. |
| 4714-4794 | `register_app` | Canonical URL; existing metadata update preserves approval; new row pending; visits gated by decoder helper. |
| 4797-4824 | `list_apps` | Rank before deleted/approval filter; no direct credential fields. |
| 4827-4875 | `list_apps_admin` | Rank before deleted, per-app deduped ratings aggregate; caller admin authority delegated. |
| 4878-4902 | `get_app` | Canonicalized, active-first latest lookup; R-C6 stale-app candidate. |
| 4905-4944 | `get_app_detail` | Rejects missing/unapproved record, then metrics/ratings/node aggregate helpers; no visit write. |
| 4947-4964 | `approve_app` | Rank all versions then active filter; supplied approval/review state, caller admin authority delegated. |
| 4967-4989 | `create_app_rating` | Canonical target; supplied author/provider/rating insert; endpoint model/identity validation owed. |
| 4992-5017 | `get_app_ratings` | Latest per app/author before tombstones; comments returned as data, no local renderer. |
| 5025-5065 | `submit_bug_report` | Intentional public submission, UUID, diagnostic strings/screenshots persistence; claimed username not verified identity. |
| 5068-5093 | `list_bug_reports` | Active reports, bounded parameters, no screenshots; admin gate not local. |
| 5096-5121 | `get_bug_report` | Bound ID, active-first read including parsed screenshots; admin gate not local. |
| 5135-5182 | `insert_marketing_event` | Intentional public ingest, arbitrary metadata/diagnostics serialization; numeric line/column coercion. |
| 5185-5247 | `marketing_events_summary` | Six bound-window queries; top paths/referrers/errors remain literal stored strings. Total named pageviews counts all event types: correctness, not C+I finding. |
| 5250-5317 | `node_ad_performance` | Inventory prefilters tag/deleted before ranking; totals/timeseries/per-ad queries bind doc IDs but omit service; fail-open only to `None`, warning includes exception. |

Nonfunction lines include recovery DDL at 4184-4191 (MergeTree, no TTL), E2E-only mode comments at 4174-4182, 3h visit constant at 4373-4374, analytics intent/constants at 4397-4428 (24h delivery, 1h signal), section headers and whitespace. None excluded from reading/counts.

## All Six Threat Classes

| Class | Findings, negative results and limits |
|---|---|
| 1. Access control (I1/I2/I3/I5) | Delegation is not automatically a missing auth gate. Account/profile/admin/report helpers require caller authority review. Directory composes a readable-group gate; media list/delete bind author. Metrics rely on caller doc/group/author sets. `_verified_username` requests `private_key=True`, but cannot locally prove expiry/client revocation. No demonstrated unauthorized endpoint read/write. |
| 2. Injection | Caller values bound in inspected SQL; identifiers/placeholders index-generated, optional SQL fragments fixed, interpolated windows cast with `int`. No shell/eval/pickle/filesystem/render sink in slice. JSON helpers/driver binding not certified. URL parsing is not fetching; returned comments/screenshots need consumer rendering review. |
| 3. Boundaries/transport | No outgoing arbitrary-URL fetch, cookie, CORS or postMessage implementation here. Stored app/icon/page/referrer URLs are data, not demonstrated SSRF. JWT validation is an external seam. OAuth token/client persistence is outside range, explicitly uncredited. |
| 4. Availability | Recursive/dependent reads, entire-user directory, per-app ratings fan-out, unpaged lists, public diagnostic/screenshots volume and DDL retry are reliability concerns only; no C+I IDs. |
| 5. Data lifecycle | P1/P2 model actual function SQL mutation/read behavior. Recovery has no local TTL/consume in intentional E2E mode. Visits/deliveries/signals are check-then-insert: race hypotheses, not demonstrated concurrency. Stale attachment/media/app/node-ad inventory and equal-version ordering need real schema/engine replay. |
| 6. Hygiene | No embedded production secret or explicit raw token logging in assigned lines. Warnings at 4472/5316 stringify exceptions; reports/beacons persist supplied diagnostics. A manufactured secret-bearing exception would show a sink, not protected-source leakage. No new B-4 disclosure established. |

I4 readable-node/D41 respected; no operator-blindness requirement invented. I6 has no local cross-node query/fetch, but external helpers/deploy trust are not certified. D56 is content-blind telemetry intent, not proof all caller metadata is content-free.

## Results and Existing IDs

**No new confirmed externally exploitable security finding.** There are demonstrated local defects/flows with explicit synthetic limits; these are not PASS and not new duplicate security IDs.

- **P1 / Q-C2: account-version mutation, 4027-4073.** With two active historical user versions, actual `change_password` SQL inserts two new rows with the same supplied timestamp and different contact/verification states. This is a demonstrated deterministic mutation in the in-memory SQL model, not a race. It leaves ambiguity/stale contact state available to version selection. `change_phone`/`set_email` have the same all-history copy shape; stale password/other-contact restoration is a candidate, not separately replayed. ClickHouse replacement/tie selection, production persistence, attacker-controlled history and recovery/login impact remain unverified. Do not describe a specific winning stale row or demonstrated takeover. `verify_phone` negative N1 copies only the latest active row in the same model.
- **P2 / Q-C2: deleted-first account reads, 3995-4014 and 4135-4171.** An active version followed by a newer deleted version yields a record from `get_user` and `get_users_by_contact` in the synthetic SQL model. The same data is excluded by `list_users` (N2), which ranks before filtering. This proves predicate-order behavior under retained history, not an actual deleted-account login/recovery exploit. `get_phone_record`, `list_media`, `get_app` and creator/attachment queries require their own lifecycle/caller evidence; do not generalize the demonstrated fixture to every query.
- **P3 / R-C1: event-type forwarding, 4489-4529.** Actual signal functions accept `event_type='delivery'` when scripted query answers provide a preceding delivery and latest same-type delivery two hours old. The inert insert sink receives one `delivery` row. The two-hour fixture satisfies the >1h signal/<1d delivery preconditions; this is not merely passing a string. Endpoint enum/authority, actual query answers, durable counter inflation and payout consequences are NOT demonstrated. N3 rejects anon, absent preceding delivery and recent same-type event.
- **Q-C3:** recovery-code comparison remains locally reusable/untimed by inspection; comments explicitly scope this to TWILIO_E2E. No production-mode bypass claim; typed configuration/caller verification remains necessary.
- **Q-C4; B-1/B-3 and historical L1-D-01/02 context:** expiry/client/purpose validation behind `_verified_username` remains external. No decoder mock promoted to proof that an expired OAuth token counts visits here.
- **Q-C5:** profile contact audience and contact-challenge binding remain external; `public profile` docstring does not prove public disclosure.
- **Q-C6 / R-C6:** visit and event dedupe concurrency remains a check-then-act hypothesis. No threads, workers, ClickHouse interleaving or repeat-winner race were tested. P1's sequential multirow mutation is separate evidence, not a concurrency demonstration.
- **R-C2:** aggregates require real caller-derived readable groups/authors and current doc/attachment semantics. New node-ad inventory review at 5262-5265 observes tag/deleted filtering before latest ranking: old tagged history could qualify a now-untagged/deleted doc. Aggregate queries at 5272-5301 omit service. Actual doc-ID uniqueness, tag permissions, schema history and admin-only audience determine impact; no fabricated rows promoted to cross-user disclosure or revenue fraud.
- **R-C3/R-C4/R-C7:** canonical URL metadata updates preserve existing approval; admin actions/ratings accept supplied authority fields. Manifest provenance, endpoint checks and request constraints are owed, not evidence they are missing. Re-rating is intentional versioning, not an automatic duplicate-write defect.
- **R-C5 / B-4 context:** exception warnings and persisted diagnostics need real protected-value sources/retention/readers. Public reports intentionally accept content; that alone is not the same as automatic content-bearing session recording or a D56 violation.
- **Q-C1/P-C4/B-6/H signer concerns:** no recursive signer or presign implementation lies in this slice. Confirm/list media metadata is not a replay of the historical arbitrary-key signing concern; no new signing exploit claimed.

## Runnable Offline Evidence

Executed successfully with `python3` and standard library only. It obtains the pinned source through Git, AST-extracts actual assigned function bodies without importing the application, and executes selected functions with injected dependencies. No files, real credentials, application startup, ClickHouse, network or external service. SQLite uses retained synthetic versions, not ReplacingMergeTree: it exercises the actual SQL's relational filtering/copying, **not ClickHouse background merges, driver behavior or production authorization**. Only pyformat parameter syntax is translated. Scripted analytics answers are explicit assumptions, not database evidence.

```sh
python3 - <<'PY'
import ast, subprocess, sqlite3, re, types, datetime
pin='f7aabdb26346752141f46f19c393dbadfd25ddd2'
src=subprocess.check_output(['git','show',pin+':api/app/v3/services/clickhouse.py'],text=True)
tree=ast.parse(src)
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and 3892<=n.lineno and n.end_lineno<=5317]
print('lines',len(src.splitlines()),'ranges',4877-3892+1,5317-4878+1,'total',5317-3892+1,'functions',len(nodes))
for n in nodes: print(n.lineno,n.end_lineno,n.name)
class DB:
 def __init__(self):
  self.db=sqlite3.connect(':memory:')
  self.db.create_function('replaceRegexpAll',3,lambda s,p,r: re.sub(p,r,s))
  self.db.execute('CREATE TABLE users (username,password_hash,phone,phone_verified,email,email_verified,created_at,updated_at,deleted)')
 def sql(self,s,p): return self.db.execute(re.sub(r'%\((\w+)\)s',r':\1',s),p or {})
 def query(self,s,p=None): return types.SimpleNamespace(result_rows=self.sql(s,p).fetchall())
 def command(self,s,p=None): self.sql(s,p)
db=DB(); stamp='2026-10-27T12:00:00'
env={'client':db,'re':re,'_now':lambda:stamp,'_ch_ts':lambda x:x,'_iso_utc':lambda x:x}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'pinned assigned functions','exec'),env)
rows=[('u','hash-old','111',1,'old@example.invalid',1,'2026-01-01','2026-10-25',0),('u','hash-current','222',0,'current@example.invalid',0,'2026-01-01','2026-10-26',0)]
db.db.executemany('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)',rows)
env['change_password']('u','new-synthetic-hash')
copied=db.db.execute('SELECT phone,email FROM users WHERE updated_at=?',(stamp,)).fetchall()
assert len(copied)==2 and len(set(copied))==2
print('P1 change_password copied two conflicting historical contact states:',len(copied))
db.db.execute('DELETE FROM users'); db.db.executemany('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)',rows)
env['verify_phone']('u'); assert db.db.execute('SELECT count(*) FROM users WHERE updated_at=?',(stamp,)).fetchone()[0]==1
assert db.db.execute('SELECT phone FROM users WHERE updated_at=?',(stamp,)).fetchone()[0]=='222'
print('N1 verify_phone copied only latest contact')
db.db.execute('DELETE FROM users'); db.db.execute('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)',rows[1]); tomb=list(rows[1]); tomb[7]='2026-10-27'; tomb[8]=1; db.db.execute('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)',tomb)
assert env['list_users']()==[] and env['get_user']('u') is not None and len(env['get_users_by_contact']('current@example.invalid'))==1
print('P2 deleted-first get_user/contact return old active row; N2 list_users excludes same tombstoned user')
class Sink:
 def __init__(self, answers): self.answers=iter(answers); self.writes=[]
 def query(self,*a,**k): return types.SimpleNamespace(result_rows=next(self.answers))
 def insert(self,*a,**k): self.writes.append((a,k))
now=datetime.datetime.utcnow()
env.update(datetime=datetime.datetime,_CONTENT_EVENT_SIGNAL_WINDOW_S=3600)
sink=Sink([[(1,)],[(now-datetime.timedelta(hours=2),)]])
env['client']=sink
assert env['record_content_event']('doc','svc','reader','surface','delivery') is True
assert sink.writes[0][0][1][0][4]=='delivery'
print('P3 synthetic preceding delivery 2h old permits client-signal helper delivery insertion')
for label,answers,reader,kind in [('anon',[],'anon','click'),('no preceding delivery',[[(0,)]],'reader','click'),('recent same type',[[(1,)],[(now,)]],'reader','delivery')]:
 sink=Sink(answers); env['client']=sink
 assert env['record_content_event']('doc','svc',reader,'surface',kind) is False and not sink.writes
 print('N3 blocked:',label)
print('Offline probes PASS; SQLite logical model / scripted sink only; no ClickHouse, auth caller, network or production exploit')
PY
```

Observed exit 0. Inventory printed `lines 5317 ranges 986 440 total 1426 functions 46`, followed by all function spans listed above. P1 printed `2`; N1, P2/N2, P3 and all three N3 assertions passed. The interpreter emitted a `datetime.utcnow()` deprecation warning; production code uses that same naive UTC clock, and no behavior claim depends on suppressing the warning. This is probe success, not exploit denial after a fix.

## Design Intent and Limits

- **Intended behavior:** D41 node-readable data with terms/access enforcement; D56 heavy but content-blind telemetry; D49 real-user bounded app visits; D86 server delivery as impression floor plus gated client signals. Account recovery must preserve current credentials/contact verification, and local E2E recovery is intentionally distinct from production Twilio Verify. Store curation and public bug/beacon ingest remain legitimate functions.
- **Delta:** none. This scan changes only a local receipt, not any actor's behavior or protocol.
- **By-design conflict:** none introduced. Do not prescribe E2E, HttpOnly SDK cookies, removal of body-token transport/telemetry, or closing intentional public ingest as a response to these observations.
- **Conventional deviation:** D92 intentionally uses confidential/static clients, existing permissions rather than a new scope system, and defers PKCE/public clients. Those are KB decisions, not findings manufactured by this scan. Hashed OAuth code/refresh storage, single use, rotation and family revocation remain requirements for the earlier-range owner, not verified here.
- **Untested intent risk:** any later current-row repair must preserve multi-account contact recovery, phone/email verification reset semantics, authorized media/groups, approved-app metadata refresh, aggregate/public counters and detailed voluntary reports. Any event-type repair must preserve app-defined signals while keeping server-only delivery authority. Actual storage/auth integration and external clients need separate pinning tests and fresh design-intent review; this author has not supplied independent risk acceptance on their behalf.
- **Evidence boundary:** function SQL and inert insert arguments are local evidence; SQLite fixtures do not reproduce production merges, caller auth, ClickHouse mutation success, account takeover, live content/credential exposure or money movement. No concurrent execution was attempted. Decoder, JSON helpers, readable-group/compiler/signer callees, endpoints, schema/DDL outside the slice, migrations, deploy/retention and OAuth client/code/refresh persistence are unreviewed at L1 here or explicit L2+ obligations.
- **Disposition:** assigned source accounting complete; local defects/flows and existing candidates remain open for coordinator triage. No central record updated by instruction, no fix or closure claimed, and no all-store/protocol/project security PASS.
