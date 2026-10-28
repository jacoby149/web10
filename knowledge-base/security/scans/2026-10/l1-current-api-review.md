# Current API Evidence and Design Review

Integration: reviewed scan reports were promoted from `.context/` alongside this review; calibrated dispositions below govern interpretation.

Date: 2026-10-27. Reviewer: OpenCode, `openai/gpt-6.1-sol` (routing ID `openrouter/openai/gpt-6.1-sol`). Pin and observed HEAD: `f7aabdb26346752141f46f19c393dbadfd25ddd2`.

Disposition: **OPEN findings; evidence corrections incorporated.** Fresh reviewer context, same model family as all five authors. This is not model-diverse sign-off, three-dry convergence, a repair review, campaign completion or security certification. Availability is excluded from the C+I finding set.

Final integration review, 27.10.2026: the published identity helper now validates
exception type/message and exact refresh status/detail. The updated fenced block
was replayed unchanged successfully. Earlier permissive-helper comments below
record review history, not an outstanding correction or current replay instruction.

## Blockers and Corrections

1. **OAUTH-02 must not be presented as a confirmed C+I vulnerability merely by calling refresh invalidation a security-state integrity change.** Identity receipt:60-66 proves an invalidation request before binding; `oauth.py:169-178` corroborates it. Preconditions include active A credentials and possession of B's already-tombstoned opaque token. The demonstrated possible consequence is denial of B's future refresh, which is availability. No unauthorized read, grant, surviving attacker authority or other C+I consequence was shown. Retain the ordering/binding observation as local behavior/product correctness and an unverified C+I candidate, not an in-scope confirmed security finding. The stored-family helper at `clickhouse.py:2432-2440` writes refresh tombstones, not access-token revocation; do not say it invalidates existing JWTs or logs users out. Same-client replay invalidation is intentional D92 behavior.
2. **Keep OAUTH-01 as confirmed local expired-principal acceptance, not completed delegation/account takeover.** `oauth.py:135-142` verifies the signature but never validates custom `expires`; actual `certify:88-110` rejects the same synthetic expired token. The actual handler returns a code and calls an inert store sink. Fresh token issuance, real code persistence/redemption and actual HTTP access were not demonstrated. The missing code-table column below independently prevents assuming the storage path works. This is a new OAuth occurrence of the existing L1-D-01 freshness-validation root, not an independent cryptographic or unsigned-decode defect.
3. **The redemption race is conditional local evidence, not a DB or endpoint exploit.** `clickhouse.py:2349-2378` performs read/check/insert/return without atomic consumption. The barrier fixture forces two active snapshots and makes both commands succeed; both calls return `alice`. That proves the function has no local mechanism to serialize consumption under those assumptions. It does not show that current deployed schema permits either command, that ClickHouse supplied those snapshots, or that two authenticated requests obtained tokens. No analogous refresh race was replayed. Preserve STORE-B-01 as a conditional single-use defect, with explicit integration debt.
4. **Connect the schema defect across receipt boundaries before interpreting race reachability.** Store A correctly captures `oauth_codes` DDL at 279-283 using `ReplacingMergeTree(updated_at)` without declaring `updated_at`. Store B's redemption SELECT at 2356 and INSERT at 2373 also require that column. Conversely, `store_oauth_code:2343-2345` inserts seven positional values, with no explicit column list/version value. Merely adding an eighth column would require checking insert compatibility/default/column ordering as well. No ClickHouse parser or server was run; actual failure, existing schema and fresh/upgrade reach remain unverified. Schema inconsistency is correctness/reachability debt, not itself a C+I exploit. An exception from a real command prevents the subsequent return; the inert command's success must not erase that possibility.
5. **STORE-B-02 proves omission in emitted SQL, not effective revoke bypass.** Bulk revoke/cleanup omit `client_id` at 2229-2231/2243-2247; targeted revoke preserves it at 2220-2221. Cleanup also selects empty-origin delegated rows. Permission lookup depends on client identity at 2164-2172. Actual persistence/merge/defaults determine outcome. An additional source-level concern is the shipped template's `ReplacingMergeTree(updated_at) ORDER BY (user_key, allowed_origin)` at `clickhouse-init/001-init-v3-schema.sql.template:216-224`; schema ensure adds `client_id` at 273 but does not re-key that table. Distinct delegated clients use the same empty origin. Query-time partitioning cannot by itself preserve rows already coalesced by storage. This is a priority schema/merge verification candidate, not a demonstrated deployed loss/bypass. The template inspection is a bounded supporting edge, not additional whole-file L1 coverage.
6. **Narrow negative and exception claims.** Identity replay:97-100 treats *any* exception as denial. Missing names, incorrect doubles and type errors could satisfy it. Refresh assertions accept either 400 or 401 without checking detail. These are unreliable as published safety controls. Fresh strict identity replay below confirms the intended rejection branches, but does not certify the real service. Store A's absent-row fakes, Data's permission/compiler-denial doubles and Store C's scripted event answers are controls on local branching, not failed real exploits or found-safe learnings. Preserve that distinction when incorporating receipts centrally.

No correction above authorizes source fixes, changed central findings, broad OAuth disabling or promotion to the next campaign rung.

## Reproduced Evidence

All six published shell blocks were executed from the workspace root unchanged, using their pinned Git reads and in-memory sinks. Every block exited 0. They do not import/start the application or connect a real store. Captured settings output was not printed. Interpreter `datetime.utcnow()` deprecation warnings occurred in Identity/Store C; these were not security failures.

| Receipt / probe | Fresh result | Evidence ceiling |
|---|---|---|
| Identity runnable block, receipt:80-174 | `All local finding assertions and negative controls passed` | Actual extracted handlers/PyJWT verification with synthetic signing key; store/network dependencies inert |
| OAUTH-01 within Identity | Expired signed token rejected by actual certify with TOKEN, accepted by authorize; returned code equals sink argument bound to user/client/URI/60 seconds | Local authentication/freshness failure, no durable delegation |
| OAUTH-02 within Identity | Wrong secret: no invalidation; correct A secret with tombstoned B row: `family-b` requested then error | Local ordering/forwarding only; C+I consequence unproved, availability excluded |
| Data P1-P7, receipt:88-194 | All seven assertions completed; pinned settings 5/5 canaries captured, overlay 0/5; import/settings parity held | Branch/log/config evidence only; no real compiler/permission/store execution |
| Data accounting, receipt:200-214 | `449,283,84,15,165,94,140` | Pinned mechanical line counts |
| Store A P1-P8, receipt:152-220 | `P1-P8: all assertions passed; offline stubs only` | DDL/SQL capture and trusted-argument helper behavior, not DB semantics |
| Store B, receipt:83-138 | Race `['alice', 'alice']`, two consume commands; bulk identity omission, binding/expiry/hash/media controls completed | Conditional concurrency with forced active snapshots and successful inert commands |
| Store C, receipt:115-165 | P1 copies 2 conflicting histories; P2 active history survives filtered tombstone; N1/N2 distinguish latest-first paths; event insertion and three N3 denials completed | SQLite relational model and scripted analytics answers, not ClickHouse merging or endpoint authority |

### Reproduction Procedure

The executable artifacts remain the fenced shell blocks in the five reviewed receipts; no probe file was created. To rerun exactly, execute each `bash`/`sh` fenced block from the repository root. Identity contains one, Data two, and each Store receipt one. The programs read the explicit pin, not local settings. Do not run pinned settings as an uncaptured CLI or replace its captured output with printing.

Historical strict replay replaced the original `except Exception: return` helper
in memory with the following. The published identity block now incorporates this
logic and exact refresh status/detail checks; rerun that block unchanged instead:

```python
    except HTTPException as e:
        assert e.status_code == 400
        assert e.detail in {'unsupported_response_type', 'redirect_uri_mismatch'}
        return
    except Exception as e:
        assert type(e) in (Exception, RuntimeError) and str(e) == 'TOKEN'
        return
```

Observed result: exit 0, same success line. This confirms literal-loopback TOKEN, unsupported response, redirect mismatch and anonymous TOKEN controls without accepting arbitrary exception types/messages. First stricter harness attempt allowed only RuntimeError for TOKEN, but the actual provider validator raises plain `Exception('TOKEN')`; it exited 1 at that control before the remaining probes. Corrected the in-memory review harness only, then reran successfully. That harness mistake is not product evidence. Final integration also replayed the now-explicit refresh status/detail assertions; neither version turns a fake lookup into a real one.

No full suite, live HTTP, browser, DB parser/server, private-network request, real signing credential, object fetch, deployment or historical exposure replay was attempted. Author-reported broader probe/test runs are not additional reviewer results.

## Exact Range Union

Counts were independently recomputed with `git show <pin>:<path>` and `splitlines()`. The two file sets are disjoint. All 15 non-store counts match their receipts:

| Set | Whole files and inclusive ranges | Total |
|---|---|---|
| Identity | `endpoints/system.py:1-391`; `models/auth.py:1-64`; `services/auth.py:1-127`; `v3/endpoints/__init__.py:1-90`; `v3/endpoints/auth_helper.py:1-44`; `v3/endpoints/oauth.py:1-197`; `v3/models/oauth.py:1-41`; `v3/endpoints/groups.py:1-601` | 8 files, 1,555 |
| Data | `v3/endpoints/documents.py:1-449`; `v3/endpoints/query.py:1-283`; `v3/endpoints/contracts.py:1-84`; `v3/models/contracts.py:1-15`; `v3/models/__init__.py:1-165`; `middleware.py:1-94`; `settings.py:1-140` | 7 files, 1,230 |
| Store A | `v3/services/clickhouse.py:1-1975` | 1,975 |
| Store B | Same file `1976-2930` (955), `2931-3891` (961) | 1,916 |
| Store C | Same file `3892-4877` (986), `4878-5317` (440) | 1,426 |

Paths above are relative to `api/app/`. Store union is exactly `[1,5317]`: every integer once, no gap/overlap. AST top-level function/class spans do not cross any split endpoint. Store A's 66 top-level function/class spans occupy exactly 1,716 lines; its printed complementary ranges occupy 259 unique nonoverlapping lines and complete `[1,1975]`. Store C's 46 function spans match the replay inventory. Store C correctly refuses credit for OAuth persistence, which belongs to B, not C.

Combined receipts: **16 unique runtime files / 8,102 logical lines** (`1555 + 1230 + 5317`), not 18 files from adding three store slices as files. Storage full SHA-256 independently matches `9ff1ef3de0856ae4df6fbc43d91e160db663dbc3c9589b73b5f879205df8b9a6`; A slice matches `7cfd020f78a69d77082b14fb353b2f375b383c7b81087a9910dfffc17b369806`.

Scoped working-tree diffs against pin were empty except the known settings overlay. Counts refer to pinned settings, including the old globals dump, not its local replacement. This verifies receipt accounting, not that this reviewer independently reread every one of 8,102 lines or that other API files are currently covered. Current-source inspection focused on OAuth/auth, contract/code/refresh helpers, schema initialization and supporting test/template edges. Historical receipts cannot fill unreviewed current scope by assertion.

## Root Deduplication

- OAUTH-01 and L1-D-01 are manifestations of signature-only principal production without full session freshness validation. `client_id_of` and `_verified_username` are related caller-validation debt, not independently proven access bypasses here. B-3 unsigned decoding is a different root; authorize explicitly verifies signatures.
- OAUTH-02 is cross-client replay-ordering behavior, separate from STORE-B-01 consumption atomicity. Code and refresh check-then-act resemblance does not prove two races. Schema inconsistency is separate again, and constrains both reachability and integration testing.
- STORE-B-02 bulk key omission is not another instance of O-C3 timestamp ties. A's client-ID schema mismatch and B's persistence questions should share one schema lifecycle investigation, retaining each distinct defect/location rather than multiplying exploit counts.
- A attachment/getter tombstone candidates, B O-C1/P-C2 and C stale media/account/app observations share predicate-before-latest patterns but different sinks/authorization and cannot be collapsed into one proven disclosure. `read_documents` and `list_users` provide contrary latest-first controls.
- B recursive signer forwarding and historical P-C4/Q-C1/H concerns are related provenance boundaries, not multiple demonstrated private-object reads. B-6 author-unscoped getter remains an existing capability-boundary concern.
- L1-G-01 explicit SQL logging is not repaired by B-4 automatic HTTP metadata logging. B-2 defaults and B-8 CLI output are distinct sources/sinks; neither closes issuer trust. B-8 overlay is preserved, not merged/deployed proof.
- Store C P1/P2 remain Q-C2 local SQL-model evidence; event forwarding remains R-C1 and depends on the preceding-delivery/same-type windows. Neither grants a new account-takeover or revenue-fraud ID.

## Negative Evidence Limits

The original generic exception helper was the concrete unreliable negative found and corrected in this review. Other ceilings remain: rejecting compiler/permission doubles cannot prove actual authorization; empty-result fixtures cannot prove tombstone handling; SQLite cannot establish ReplacingMergeTree winners; parameter capture is not driver/injection certification; fake presigning is not private-object retrieval; fake HTTP 200 is not remote attestation/private-network reach. An invalid_grant response after a side-effect request does not prove nonmutation. A source concern plus an unexercised sink is not demonstrated disclosure.

Store A's `ensure_apps_schema` catches/logs exceptions and returns, and Store C recovery-table setup swallows exceptions. A permissive fake command cannot verify either startup schema success or useful error handling. Unredacted exception interpolation in system/query/storage is only a sink until a reachable protected-value source and unauthorized audience are shown. Do not treat deliberate fabricated secret exceptions as credential exfiltration proof. Deprecation warnings and harness errors must not count as exploit denial.

## DESIGN-INTENT REVIEW

- Intended behavior: D92 permits confidential external clients to act for an authenticated, unexpired user through existing generic per-service/group contracts, with client-bound short-lived single-use codes, rotating refresh families and revocation. D41 preserves readable nodes and public discovery under policy, not operator blindness; D56 preserves aggressive content-blind telemetry. Existing browser/direct no-Origin behavior is explicitly retained, not a defect to silently remove.
- Changed behavior: none for creators, fans, apps, operators or remote nodes. This review changes only a local evidence document and the calibration of claims; it neither denies legitimate requests nor changes credentials, storage, transport, consent, telemetry or B-8 diagnostics. No runtime repair is being approved.
- By-design conflict? None introduced by the read-only artifact. Corrections preserve same-client replay detection and authorized public/group media, and do not prescribe default E2E, HttpOnly SDK cookies, ownership-only reads, blanket private memberships, a new scope system or OAuth removal. Freshness/single-use/revocation gaps conflict with D92 requirements, not with a declared exception allowing stale credentials.
- Conventional standard violated intentionally? D92 explicitly chooses confidential/static clients, no public-client PKCE flow yet, no flat scope claim and separate HS256 migration. Body-token transport, JS-readable credentials and readable nodes are intentional per learnings/thesis. JSON POST handlers versus OAuth KB GET/form/header promises and empty-string versus nullable client keys remain documentation/implementation discrepancies requiring reconciliation; this review does not invent an acceptance or infer security failure solely from interoperability drift.
- Tests cover the delta? No runtime delta exists. Fresh replays pin bounded source behavior and mechanical accounting only. They are not repro-gate closure, production integration tests, or evidence that the valid confidential-client journey still works against ClickHouse. Mock-backed OAuth tests inspected at `api/tests/test_oauth_clients.py:269-368` also accept mocked persistence and cannot resolve schema reachability; those tests were not rerun here.
- Untested intent risk: evidence overstatement could prioritize availability-only work over C+I, duplicate roots, or encourage broad helper hardening that breaks browser/direct callers. This report mitigates those review risks through explicit classifications, but accepts no runtime/deployment risk on the operator's behalf. Future repairs need valid expired/fresh session controls, client/redirect binding, actual schema/inserts, one-winner concurrency, correct multi-client revocation, same-client replay and public/group-media compatibility tests. Unverified product flows remain open, not accepted by implication.
- KB write-back: intentionally limited to this requested `.context` review. No learnings, security record, index, plan, lane, changelog or B-8 file changed. Coordinator incorporation and model-diverse convergence remain owed. PROTOCOL-01/DELTA is not advanced by this report.

## Preservation

Pre-existing settings/B-8 test/repair and central-document changes were observed at entry and left untouched. No source edits, installs, commits, pushes, PRs, live DB/network operations or credential output were performed. The only manual write is this report via apply_patch. Further source repair and campaign-state updates require separately authorized work.
