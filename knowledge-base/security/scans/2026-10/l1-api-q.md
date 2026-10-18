# L1 API Q: Recursive Media, Accounts, Recovery, Visits

- Date: 2026-10-18.
- Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned commit: `8af7e0fce922cada30002dff190a5bb3abcf4f63`.
- Owned file: `api/app/v3/services/clickhouse.py`, inclusive lines **3219-4093**, **875 lines** of 4944.
- Every owned line read, including comments/blank lines; unscanned owned lines: none.
- Coverage complete for assigned lines; assurance: **review/signoff pending**. No confirmed finding, fix, PASS, independent design review or model-diverse sign-off claimed.

## Orient

- Read AGENTS, strategy/thesis, plan/lane scan queues, recent changelog, security theory/checklist/design-intent gate, security record/learnings, I1-I6 and prior backend receipt.
- Onboarding: B-1 issuer trust and B-4 credential logging are existing open risks; no fresh reproduction here. Account/storage helpers may intentionally delegate authority.
- Recession: tested the local typed-object signer seam and inspected verification, tombstones, contact verification flags and recovery-code lifecycle without presuming callers are absent.
- Obvious gap: owning a document containing an object key is distinct from owning that object; signature verification is distinct from checking custom expiry/purpose. Both need caller evidence.
- Preserve D41 readable-node, D56 aggregate telemetry, operator configuration and intentional test-mode recovery. This receipt does not independently perform the fresh design-intent review.

## Coverage Map

| Owned lines | Symbols / work inspected |
|---|---|
| 3219-3308 | `_collect_minio_keys`, `_resolve_minio_types`, `resolve_minio_types`, `resolve_media_urls_in_docs` including both ad branches |
| 3309-3457 | S3 size cache/pagination, app/node active-user metrics, store list, node stats, `node_has_users` |
| 3458-3516 | node config get/save, JWT key save/latest retrieval |
| 3517-3691 | user creation/migration/list, `list_public_users` read gate, counts, faces and pagination |
| 3692-3870 | user lookup/authentication, password/contact updates and verification, profile/contact recovery lookup |
| 3871-3918 | recovery table DDL/ensure/set/check |
| 3919-4018 | media confirmation/list/delete, metadata envelope and author filters |
| 4019-4093 | canonical app URL, `_verified_username`, visit window/query/insert |

## Checklist Dispositions

| Class | L1 disposition |
|---|---|
| 1. Access control | Media listing/deletion author-bound; public directory delegates readable-group computation then reads the filtered set. User/config/key mutations are storage helpers, not proven public endpoints. `_verified_username` explicitly requests signed decoding; custom expiry remains unverified. |
| 2. Injection | SQL values bound; dynamic contact condition is one of two fixed strings; placeholders index-generated. No shell, eval, filesystem path or template sink. URL normalization is parsing, not fetching; JSON helpers not audited. |
| 3. Boundaries/transport | Typed minio values reach offline signing, demonstrated below; no SSRF fetch in owned code. Bucket pagination uses configured S3. No cookie/CORS/postMessage policy here; no complete JWT validation claim. |
| 4. Availability | Reliability only: recursive objects, full-bucket pagination/cache stampede and all-users/profile sorting; no C+I IDs. |
| 5. Data lifecycle | Multiple user/media reads filter deleted before latest selection; recovery storage has no local expiry/consume; visit gate is check-then-insert. Caller mode/authority and actual DB semantics remain handoffs. |
| 6. Hygiene | No production credential literal or direct secret log in owned slice. Test recovery literal is explicitly test-mode intent, not a shipped-default finding. Persisting signing-key records is not automatically unauthorized disclosure. |
| I1-I6 | I1/I2 delegated verified decoder call inspected, not decoder assurance; I3/I5 candidates below; I4 respected; no cross-node store query found for I6. |

## Confirmed Findings

None. The fake-signer probe proves local forwarding only, not a reachable unauthorized object read.

## UNVERIFIED L2+ Handoffs

- **Q-C1 (3219-3306):** recursive minio resolver accepts an arbitrary body key without reader/owner context. Probe below forwards a synthetic other-owner key. Trace CRUD/write-time canonicalization, upload ownership and every resolver caller; establish attacker persistence and victim-object authorization before calling this a capability bypass. P-C4 is the metadata variant of this seam.
- **Q-C2 (3692-3868, 3953-4011):** `get_user`, `get_phone_record`, `get_users_by_contact`, `list_media` filter deleted before selecting latest. Password/contact updates copy all matching active historical versions (3735-3769). Test tombstoned accounts/media, changed contacts, same-time versions and concurrent verification/password changes against actual schema before asserting stale authorization.
- **Q-C3 (3871-3916):** recovery checker compares latest code with no local TTL/one-use consume; DDL has no TTL. Comments restrict usage to TWILIO_E2E. Trace typed config and callers before asserting production recovery replay. Test-only fixed code is not itself a vulnerability.
- **Q-C4 (4054-4067):** `_verified_username` calls `decode_token(private_key=True)` but checks no custom `expires`, purpose/target or contract locally. Verify decoder/caller requirements before alleging expired-token counting. The old backend's claim that this helper rejects expired tokens is not established by this slice.
- **Q-C5 (3743-3811):** verify-phone/email operate on current row by username, not a challenge-bound contact; profile helper returns phone/email. Verify caller ownership, challenge contact binding and output audience; helper names/docstrings alone prove neither privacy leak nor takeover.
- **Q-C6 (3452-3455, 4074-4091):** deleted-first bootstrap user count and non-atomic visit gating need integration review. The latter may inflate metrics under concurrency; no security exploit claimed.

## Local Probe and Inventory

Executed command (stdlib only; real function ASTs, fake signer; no application import):

```sh
python3 -c 'import ast, subprocess, types; source=subprocess.check_output(["git","show","8af7e0fce922cada30002dff190a5bb3abcf4f63:api/app/v3/services/clickhouse.py"],text=True); tree=ast.parse(source); names={"_collect_minio_keys","_resolve_minio_types","resolve_minio_types"}; nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]; calls=[]; signer=types.SimpleNamespace(generate_presigned_url=lambda operation,**kw: calls.append((operation,kw)) or "synthetic-url"); env={"settings":types.SimpleNamespace(S3_BUCKET="synthetic-bucket",READ_URL_EXPIRY=60),"get_s3_signing_client":lambda:signer}; exec(compile(ast.Module(body=nodes,type_ignores=[]),"clickhouse.py selected real functions","exec"),env); body={"nested":[{"type":"minio","value":"other-owner/synthetic-object"}]}; result=env["resolve_minio_types"](body); assert calls==[("get_object",{"Params":{"Bucket":"synthetic-bucket","Key":"other-owner/synthetic-object"},"ExpiresIn":60})]; assert result["nested"][0]["url"]=="synthetic-url" and "url" not in body["nested"][0]; print("Q synthetic fake-signer probe: arbitrary supplied key forwarded; input unchanged; no network; caller reachability UNVERIFIED"); lines=source.splitlines(); print("Pinned source lines:",len(lines)); print("Owned counts:",3218-2413+1,4093-3219+1,4944-4094+1,"total",4944-2413+1)'
```

- Exit 0; arbitrary supplied key forwarded, input unchanged. Source=4944; P=806, Q=875, R=851, total=2532. Earlier inventory's 2531 is off by one.
- `git rev-parse HEAD` matched pin; scoped `git diff` against pin was empty (command in P receipt).
- No live DB/network, secrets, runtime/central-doc/git changes or probe files. No exploit replay, all-flow safety claim or coverage for dependencies/callers/earlier slices.
