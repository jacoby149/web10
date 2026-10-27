# Current Store A: Bounded L1 Receipt

Integration: fresh calibration in `l1-current-api-review.md`; schema inconsistency is not a demonstrated OAuth exploit.

- Date: 2026-10-27. Scanner: OpenCode. Model: `openai/gpt-6.1-sol`.
- Source pin / verified HEAD: `f7aabdb26346752141f46f19c393dbadfd25ddd2`.
- Sole reviewed runtime scope: `api/app/v3/services/clickhouse.py:1-1975`, inclusive, exactly 1,975 logical lines and 1,975 newline terminators. Read every line, including comments, strings, imports, constants and blank lines, in disjoint reads 1-990 (990 lines) and 991-1975 (985 lines).
- Boundary 990 is blank after `update_document` ends at 988; `delete_document` starts at 991. Last complete function is `get_hidden_docs`, 1940-1968. Lines 1969-1975 are blanks and the next section heading, not a partial ban function.
- Full-file mechanical denominator: 5,317 lines; **no coverage claimed for 1976-5317**. Parsing the full file for AST boundaries/hashes is mechanical accounting, not review of the remainder.
- Assigned-byte SHA-256: `7cfd020f78a69d77082b14fb353b2f375b383c7b81087a9910dfffc17b369806`. Full-file SHA-256: `9ff1ef3de0856ae4df6fbc43d91e160db663dbc3c9589b73b5f879205df8b9a6`.
- `git diff f7aabdb26346752141f46f19c393dbadfd25ddd2 -- api/app/v3/services/clickhouse.py` returned empty. Probes consumed the pinned git object, not an imported working-tree application.
- Disposition: assigned L1 reading complete; no new demonstrated confidentiality/integrity exploit, no repair, no PASS, no L2 completion, no fresh independent/model-diverse/three-dry sign-off. One newly observed schema inconsistency, below, is not an OAuth exploit.

## Orientation

Read root `AGENTS.md` in full; browsed strategy; read security theory README, complete six-class checklist and design-intent gate, complete thesis, learnings, historical `l1-api-m.md`, `l1-api-n.md`, `l1-api-o.md`, OAuth KB, group-access KB and security overview. Read D92, current plan/lane priority and security-record entries, schema KB through its document/group/member definitions, and recent changelog. Central documents have concurrent pre-existing edits; their status notes are working-tree orientation, not claims that those edits are committed at the runtime pin. None was modified here.

- Onboarding: I3 has no storage row-ACL backstop. Helpers accept trusted actor/group/service arguments; absence of JWT validation in each primitive is not independently an endpoint bypass. B-6 already covers the author-unscoped document getter. Historical M/N/O have coverage-only receipts, not current assurance.
- Recession: re-read member shortcuts, migration classification, deleted-row ordering, management/service distinction and omitted-column writes rather than inheriting seed PASS language. Old M/N/O candidates remain unresolved. OAuth introduces new DDL not covered by the historical pin `8af7e0fce922cada30002dff190a5bb3abcf4f63`.
- Obvious gap: policy inference and caller provenance are security-sensitive even without raw SQL input; document identity `(author_key, doc_id)` differs from attachment/hidden joins keyed on `doc_id`. OAuth logical expiration, physical retention and single-use concurrency are distinct questions. Dependencies, driver semantics and schema defaults are not proved by AST compilation.
- Already-done check: plan/lane show O1-O9 implemented, historical API L1 ticked, and PROTOCOL-01/DELTA open. This requested current bounded rescan is not a reimplementation, nor permission to take the optional O10 task.

## Exact Accounting

65 top-level functions plus one class occupy 1,716 distinct assigned lines. The class contains one method; `effective_role_perms` contains one nested function. Nested boundaries below do not add to the denominator. The remaining 259 lines were also read.

```text
29-41       _get_client
44-51       _LazyClickHouse (method __getattr__: 50-51)
57-65       _now
68-84       _iso_utc
87-95       _from_iso_utc
98-111      _ch_ts
114-115     _json
118-121     _parse_json
124-126     _gen_doc_id
129-318     ensure_apps_schema
321-331     _tombstone_app_row
334-393     _migrate_file_index_app_rows
401-439     _migrate_discoverable_default_flip
450-462     _infer_membership_visibility
465-518     _migrate_membership_visibility_backfill
521-549     _infer_group_tag
552-607     _migrate_group_tags_backfill
614-623     _transform_role
626-690     _migrate_d58_role_shape
724-736     _ensure_discover_group_contract
739-775     ensure_discover_group
778-827     _heal_discover_group_roles
835-885     insert_document
888-940     read_documents
943-988     update_document
991-998     delete_document
1001-1023   get_document
1026-1052   get_document_any_author
1055-1093   can_read_carrier_post
1101-1107   attach_doc_to_groups
1110-1117   detach_doc_from_groups
1120-1123   replace_doc_groups
1126-1132   get_doc_groups
1140-1194   create_group
1197-1223   get_group
1226-1248   delete_group
1251-1299   update_group
1307-1319   add_group_member
1322-1334   remove_group_member
1337-1359   ensure_creator_owner
1362-1383   heal_followers_group_owner
1386-1405   get_group_members
1408-1425   get_group_member
1428-1430   is_group_member
1446-1461   _normalize_role_perms
1464-1501   effective_role_perms (nested perms_for: 1479-1483)
1504-1509   _effective_allows
1512-1522   can_read_group
1525-1539   can_write_group
1542-1550   readable_groups
1553-1633   readable_groups_batched
1636-1647   has_mgmt_permission
1650-1656   can_moderate_service
1659-1665   can_moderate_group
1668-1681   get_group_member_keys
1684-1702   _get_group_member_counts
1705-1718   list_discoverable_groups
1721-1769   get_user_groups
1772-1819   get_user_public_groups
1827-1852   create_join_request
1855-1867   resolve_join_request
1870-1888   get_pending_requests
1891-1905   has_pending_or_invited_request
1913-1919   hide_doc_from_group
1922-1937   unhide_doc_from_group
1940-1968   get_hidden_docs
```

Exact complementary ranges (not unreviewed gaps):

```text
1-28, 42-43, 52-56, 66-67, 85-86, 96-97, 112-113, 116-117,
122-123, 127-128, 319-320, 332-333, 394-400, 440-449, 463-464,
519-520, 550-551, 608-613, 624-625, 691-723, 737-738, 776-777,
828-834, 886-887, 941-942, 989-990, 999-1000, 1024-1025,
1053-1054, 1094-1100, 1108-1109, 1118-1119, 1124-1125,
1133-1139, 1195-1196, 1224-1225, 1249-1250, 1300-1306,
1320-1321, 1335-1336, 1360-1361, 1384-1385, 1406-1407,
1426-1427, 1431-1445, 1462-1463, 1502-1503, 1510-1511,
1523-1524, 1540-1541, 1551-1552, 1634-1635, 1648-1649,
1657-1658, 1666-1667, 1682-1683, 1703-1704, 1719-1720,
1770-1771, 1820-1826, 1853-1854, 1868-1869, 1889-1890,
1906-1912, 1920-1921, 1938-1939, 1969-1975
```

Imports/client configuration (1-56), migration sentinels, discover constants/public role (691-723), D58 transition prose (1431-1445) and all section boundaries are included. No symbol crosses either owned boundary; assigned union is exactly `[1,1975]`, no gaps/overlap.

## Six-Class Review

| Class | File-local disposition across assigned lines |
|---|---|
| 1. Access control, I1/I2/I3/I5 | No JWT decode/mint/verification in slice. Trusted-argument CRUD, attachment, member and moderator primitives require callers. Null-author read, member shortcuts, creator heal, wildcard management and service-less moderation require provenance checks below. Public principal union and D80 public memberships are intentional. No endpoint grant demonstrated. |
| 2. Injection | Fixed DDL; query data bound or inserted as rows. Dynamic conditions/order/placeholder names derive from fixed branches or integer enumeration, not caller SQL fragments. JSON decode is data, not eval/pickle/YAML. No shell, filesystem path, renderer/template execution or caller SQL executor found. Malicious synthetic string remains a query parameter. External helper implementations not certified. |
| 3. Boundaries/transport, I5/I6 | Lazy DB destination/credentials/TLS are operator settings at 32-38; no credential values read. No HTTP fetch, browser messaging, cookie, CORS, token URL or cross-node DB execution in assigned bodies. Media factories are imports, not invoked signing sinks here. Driver/TLS configuration and caller HLS signature order remain outside this L1 claim. |
| 4. Availability | Unbounded migrations, enrollment, group/member/moderation reads, generated candidate placeholders and permission fan-out are reliability/DoS debt only. Boot exceptions defer work. Invalid DDL may interrupt schema ensure, but availability is not promoted into a C+I exploit. |
| 5. Data lifecycle | OAuth codes declare a nonexistent replacement-version column; expires_at is not a physical TTL. Hash storage is specified, not demonstrated by DDL alone. Getter/attachment/carrier tombstone prefilters contrast with rank-then-filter member/group/public/pending reads. Read/write migration sentinels, replace attachments, delete-group multiwrites, owner heal and request resolution are nontransactional. Actual merge/timestamp/concurrency semantics untested. |
| 6. Hygiene | No hardcoded credential values, bearer logging, unsafe deserialization or secret build artifacts in assigned lines. Settings references inherit existing B-2 concerns without re-proving them. Boot exception strings at 318/775 and app URL logs at 393 are sinks, not demonstrated secret disclosure. Public board wildcard, node-readable content and confidential-client secret storage are not automatically findings. Defaults for new group discoverability/membership visibility are restrictive. |

I4 is preserved as intent: node readability is deliberate, not a requirement for universal public access. I6 has no cross-store query here; that is not federation assurance.

## Observations and Handoffs

Labels below are local evidence/handoff references, not newly allocated central vulnerability IDs. No existing finding is closed.

| Reference | Current lines / function | Evidence and required follow-up |
|---|---|---|
| STORE-A-SCHEMA (new local correctness defect) | 274-283, `ensure_apps_schema` | Emitted `oauth_codes` DDL has code_hash/client_id/username/redirect_uri/created_at/expires_at/deleted, but uses `ReplacingMergeTree(updated_at)`. P1 captures this from real AST body; updated_at is undeclared. Client/refresh DDL controls declare it. No ClickHouse parser/server run, actual rejection, deployed schema break, token reuse or auth bypass proved. Trace fresh init versus upgrade schema and boot failure ordering before runtime impact claims. Outer catch 315-318 stops subsequent code after a real command exception; no actual exception from DB was induced. |
| OAuth lifecycle/schema follow-up | 252-295 | Code and refresh tables have expiration fields, no physical `TTL` clause. Logical expiry can be enforced by redemption; this is NOT proof of expired-token acceptance. Check redemption checks, rotation atomicity, family invalidation and cleanup outside assigned lines. SHA-256-only comments are intent, not enforcement in this slice. Code DDL lacks updated_at even though comments call it tombstone-based. |
| OAuth schema/KB alignment | 266-273 | Source adds `client_id String DEFAULT ''`; OAuth KB/D92 and plan say nullable/NULL. Source comments consistently distinguish empty browser key from delegated key. Determine actual fresh schema, insert/read keys and driver behavior before claiming collision, lost grants or bypass. App-contract permission/revoke helpers are outside this assignment. |
| Existing M-C1 | 450-462, 521-549, 552-607, 465-518 | P2 reproduces arbitrary legacy private-notes ID -> social-group tag -> public membership classification; DM-tag control stays hidden. Need actual sentinel/migration state plus public consumer replay; no stored relationship disclosure demonstrated. Preserve D80's intentionally public social graph. |
| Existing M-C2 | 425-431, 668-672, 812-825; tags migration 587-599 | Older group-row rewrites omit newer tags/visibility fields; tag backfill omits visibility. Infer default resets only conditionally on actual schema/version/order. Need upgrade/concurrent explicit-policy replay; no generic private-group disclosure proved. D60 app-specific legacy inference remains a design concern, not permission to expand it. |
| Existing M-C3 | 334-393, 401-439, 465-518, 552-607, 626-690 | Sentinel/get-then-insert/tombstone sequences lack a transaction in these bodies. Duplicate writes alone do not prove harmful interleaving. Need controlled integrity-changing concurrency and policy provenance evidence. |
| Existing N-C1 | 1512-1539 | P3 proves member read/create shortcuts even when effective grants are empty. Nonmember with empty grants is denied. Source prose says membership grants access; canonical access KB 119,262-275 requires per-service effective grants. Reconcile conflict and trace independent caller checks before naming unauthorized read/create. Do not silently replace the product model. |
| Existing N-C2 / related O-C1 | 1001-1052, 1081-1093, 1126-1132; detach 1110-1117 | Getters prefilter deleted rows; carrier prefilters deleted/body-match rows before ranking and joins live attachment versions without latest-row selection; attachment getter ignores newer tombstones. P5/P6 prove SQL shape only, not recovered deleted data. `read_documents` 911-924 instead ranks before deleted filtering. Need pre-merge deletion, media-removal and detach replay at actual authorized consumers. Detach uses second-resolution now(); order/ties also need actual schema evidence. |
| Existing N-C3 | 1519-1520, 1536-1537, 1578-1633 | P4 returns a member group even when fake live-contract results are empty; empty membership control denies. Batched initial readable set bypasses contract intersection despite docstring 1567-1569. Need surviving membership/deleted-contract/caller trace, not claim every deleted group is readable. |
| Existing N-C4, B-6 | 835-1052, 1101-1383 | Caller-selected IDs/authors/services/attachments and creator/user arguments are trusted here. P5 null-author read omits author predicate; supplied author retains it. P7 heal can locally assign supplied bob owner of alice-shaped ID; no-owner control writes nothing. Caller must derive creator and bind caller/group, never pass arbitrary user. B-6 remains the doc-bound HLS lookup concern, not a duplicate ID. Actual signature-before-read/reauthorization and endpoint ownership checks are unreviewed. |
| Carrier service extension of N-C1/N-C2 | 1055-1093 | Intent says service-agnostic carrier, but final permission call is `can_read_group(g, reader, 'posts', authenticated)` even though SQL never selects the carrier service. P6 captures that forwarding. Need real non-post carrier with distinct service grants, correct latest attachment/body, and actual HLS consumer to determine overgrant/overdenial. No stream obtained. |
| Existing O-C4 plus N-C4 identity concern | 1659-1665, 1940-1968 | Any-service hideAll grants helper-level moderation eligibility; hidden read returns bodies without service predicate, joining documents by doc_id only and ranking documents by doc_id rather than `(doc_id,author_key)`. P8 captures SQL. Need actual caller service checks, possible chosen-ID collisions and constrained moderator replay. Not a demonstrated cross-service/cross-author leak. |
| Existing O-C6 (assigned subset only) | 1827-1905, 1913-1968; management 1636-1665 | Join/request status/role, hide/unhide, member/group mutators require validated caller authority. Management accepts `group` or legacy `*`; `authenticated=True` is supplied internally to effective grants. Trace caller authentication and legacy wildcard semantics; no forged management grant demonstrated. Latest pending/hidden-row filtering is present, not whole-path certification. |

Historical O-C2 (block predicate), O-C3 (contract revocation ties), O-C5 (board optional membership/raw rank expressions), and O-C6's app-contract portion are **outside 1-1975**. They remain historical unresolved handoffs, not current rescanned observations. Likewise ban, board, OAuth storage CRUD/redemption and app-contract helpers after 1975 are not reviewed here. Existing B-1/B-2/B-3/B-4/B-8 statuses are not changed by this receipt.

## Runnable Offline Evidence

Run from repository root with Python 3.11+ and git. This is a compact replay of the same P1-P8 assertions executed during the scan (exit 0, all passed). It extracts only assigned function bodies; no application/settings imports or connections. `query`, `command` and `insert` are inert Python collectors, not a DB emulator. Synthetic results establish branch/forwarding behavior only. No source, bytecode, storage or probe files are written.

```sh
git show f7aabdb26346752141f46f19c393dbadfd25ddd2:api/app/v3/services/clickhouse.py | python3 -B -c '
import ast, sys, json, logging
from datetime import UTC, datetime
from types import SimpleNamespace
s=sys.stdin.read(); tree=ast.parse(s)
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.end_lineno<=1975]
class Sink:
    def __init__(self): self.calls=[]; self.rows=[]
    def query(self,q,p=None):
        self.calls.append(("query",q,p)); return SimpleNamespace(result_rows=self.rows.pop(0) if self.rows else [])
    def command(self,q,p=None): self.calls.append(("command",q,p))
    def insert(self,*a,**k): self.calls.append(("insert",a,k))
c=Sink(); ns={"json":json,"datetime":datetime,"UTC":UTC,"client":c,"log":logging.getLogger("offline")}
exec(compile(ast.Module(nodes,[]),"assigned-real-bodies","exec"),ns)
for name in ("_migrate_file_index_app_rows","_migrate_discoverable_default_flip","_migrate_d58_role_shape","_migrate_group_tags_backfill","_migrate_membership_visibility_backfill"):
    ns[name]=lambda: None
ns["ensure_apps_schema"]()
q=next(x[1] for x in c.calls if x[0]=="command" and x[1].startswith("CREATE TABLE IF NOT EXISTS oauth_codes"))
columns=q.split("(",1)[1].split(") ENGINE",1)[0]
assert "ReplacingMergeTree(updated_at)" in q and "updated_at" not in columns
assert len(c.calls)==18 and "expires_at DateTime64(3)" in q and " TTL " not in q
for table in ("oauth_clients","oauth_refresh_tokens"):
    ddl=next(x[1] for x in c.calls if x[0]=="command" and x[1].startswith("CREATE TABLE IF NOT EXISTS "+table+" ("))
    assert "updated_at DateTime64(3)" in ddl
g="example.invalid/groups/users/alice/private-notes"
tags=ns["_infer_group_tag"](g)
assert tags==["web10-social-group"] and ns["_infer_membership_visibility"](g,tags)=="public"
assert ns["_infer_membership_visibility"](g,["web10-social-dm"])=="hidden"
ns["is_group_member"]=lambda *a:True
ns["effective_role_perms"]=lambda *a:{}
assert ns["can_read_group"]("g","alice","notes") and ns["can_write_group"]("g","alice","notes")
ns["is_group_member"]=lambda *a:False
assert not ns["can_read_group"]("g","alice","notes") and not ns["can_write_group"]("g","alice","notes")
c.calls=[]; c.rows=[[("g",)],[],[]]
assert ns["readable_groups_batched"]("alice","notes",True,["g"])==["g"]
c.rows=[[],[],[]]
assert ns["readable_groups_batched"]("alice","notes",True,["g"])==[]
c.calls=[]; needle="synthetic\x27 OR 1=1 --"
assert ns["get_document"](needle,"alice") is None
get_sql=c.calls[-1][1]
assert "AND deleted = 0 ORDER BY" in get_sql and needle not in get_sql and c.calls[-1][2]["doc_id"]==needle
ns["read_documents"]("alice","notes")
read_sql=c.calls[-1][1]
assert read_sql.index("row_number()")<read_sql.index("WHERE rn = 1 AND deleted = 0")
ns["get_doc_groups"]("doc")
assert "deleted = 0" in c.calls[-1][1] and "row_number" not in c.calls[-1][1]
ns["read_documents"](None,"notes"); assert "author_key = %(author)s" not in c.calls[-1][1]
ns["read_documents"]("alice","notes"); assert "author_key = %(author)s" in c.calls[-1][1]
c.rows=[[("g",)]]; seen=[]
ns["can_read_group"]=lambda *a: seen.append(a) or True
assert ns["can_read_carrier_post"]("media","alice","bob",True)
assert seen==[("g","bob","posts",True)]
assert "AND deleted = 0" in c.calls[-1][1] and "pg.deleted = 0" in c.calls[-1][1]
c.calls=[]; ns["get_group"]=lambda *a:{"roles":[{"name":"owner","permissions":{}}]}
ns["get_group_member"]=lambda *a:None
ns["heal_followers_group_owner"]("example.invalid/groups/users/alice/g","bob")
assert c.calls[-1][1][1][0][1:3]==["bob","owner"]
c.calls=[]; ns["get_group"]=lambda *a:{"roles":[]}
ns["heal_followers_group_owner"]("g","bob"); assert not c.calls
c.calls=[]; ns["get_hidden_docs"]("g")
assert "d.doc_id = hd.doc_id" in c.calls[-1][1] and "collection_name" not in c.calls[-1][1]
ns["get_user_public_groups"]("alice")
assert "gc.membership_visibility = \x27public\x27" in c.calls[-1][1]
ns["get_pending_requests"]("g")
assert "WHERE rn = 1 AND status IN" in c.calls[-1][1]
print("P1-P8: all assertions passed; offline stubs only")
'
```

Original executed probe printed P1-P8 successes individually: 18 DDL statements captured; version column missing only in code-table control comparison; legacy classification public/DM hidden; member shortcuts true/true and nonmember false/false; synthetic member group retained with absent contract; getter/read/attachment SQL distinctions and injection string bound only; null-author versus author control; carrier uses posts; owner heal trusts supplied user/no-owner no-write; moderation doc_id-only/service-less and public/pending filters present. Final output: `All assertions passed; no application imports, network, DB, storage writes or secrets`.

### Failed Attempts / Negative Controls

- Attempted SQL-string interpolation with synthetic quote/OR/comment payload did not enter the query text; it stayed in bound `doc_id`. This establishes local parameter separation, not driver-level SQL safety for all methods.
- Empty grants for nonmembers returned false/false; no blanket all-principal access claim follows from member shortcuts.
- Batched empty membership/contract results returned no groups; no unconditional readable-group claim.
- DM classification remained hidden; migration concern is not all-group disclosure.
- Missing getter rows returned None, not a deleted document. No tombstone-recovery exploit was attempted against ClickHouse; SQL shape is the entire local evidence.
- Owner-less group healed nothing; caller-selected-user forwarding requires an authority failure at a caller to become exploitation.
- Public visibility and pending latest-row predicates are present. Capturing them does not simulate a DB rejection or prove every public/private/request flow safe.
- No probe assertion failed during the executed run. No discarded live exploit, secrets test, real persistence or network attempt is hidden by this receipt.

## Design-Intent Lens

1. Intended behavior: generic user-owned documents and group policy, live revocable per-service grants and creator-owner restoration; D80 distinguishes public social membership from hidden relationships. D92 adds confidential-client delegation, bound one-use 60-second codes and rotating hash-stored refresh credentials without changing the browser token path.
2. Behavioral delta: none. This receipt changes only `.context/l1-current-store-a.md`, not actor access, credentials, transport, storage or UI.
3. By-design conflict: none introduced. Public discover grants, node readability, no default E2E, body tokens, JS-readable cookies and D56 telemetry are not vulnerabilities by themselves. Canonical role-policy versus member-shortcut conflict is explicitly retained, not silently resolved.
4. Conventional deviations: preserve D41/D56 and D92 confidential-client v1/no PKCE decision. A missing DDL version column is not a documented intentional deviation. Physical TTL absence is not synonymous with logical expiry absence.
5. Untested intent risk: no runtime delta to test here; DB creation, merge timing, caller auth, real HLS, migration policy retention, refresh rotation and deployment remain unverified. A later repair must preserve authorized public/group media, per-service policy, deliberate public membership, creator-only heal and normal browser/delegated contracts. This author's intent lens is not a fresh independent design-intent review or dated operator risk acceptance.

## Limits and Delivery

Only this requested context receipt was written with apply_patch. Runtime, tests, central KB/records/changelog/plan/lanes and pre-existing dirty work were left untouched. No fixes, installs, DB/network calls, real storage, settings import, secret retrieval, commit, push or PR. No full test suite run: probes compile selected real bodies with inert synthetic dependencies, not actual DB exploitation or protocol integration.

Coordinator handoff: preserve these exact bounded lines and original IDs; combine other disjoint current-store scopes without counting the same lines twice. Prioritize schema-init consistency verification and existing M/N/O caller/schema handoffs, leaving affected authority conclusions unverified until actual direct-edge evidence and required independent review. This receipt does not authorize skipping the open protocol L1 gate or advancing to L2 campaign completion.
