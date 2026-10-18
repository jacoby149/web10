# API L1 Scope I Receipt

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63`; HEAD matched; assigned source diff exited 0.
- Coverage: complete whole-file reads, 705 lines; no unscanned assigned lines. Assurance: review/signoff pending; no whole-file secure claim.
- Only assigned receipt written. No runtime, central-doc, git changes, services, network or real secrets; not an independent design review.

## Orient

- Onboarding: read AGENTS, strategy thesis, scan plan/lane, changelog, security learnings/record, I1-I6, checklist and design-intent gate. Prior middleware/settings findings not redone.
- Recession: admin operations must stay behind verified admin authority; imported helper names do not establish their implementation. I3 storage boundaries remain load-bearing; token expiry/revocation cannot be inferred from signature-only call sites.
- Gap: bot identities/groups and untrusted operational attribution need provenance review. Supply-chain integrity still assumed; availability belongs to reliability.
- Intent: public app-store discovery/registration, deliberately unauthenticated external log intake, node-readable moderation and admin bug-report delivery are not automatically vulnerabilities. No cookie/telemetry/body-token decision reversal.

## Exact Coverage

| File | Read range/count | Symbols and ranges reviewed |
|---|---|---|
| `api/app/v3/endpoints/__init__.py` | 1-86 / 86 | imports 1-23; router registration/prefixes 24-81; `node_stats` 82-86 |
| `api/app/v3/endpoints/appstore.py` | 1-96 / 96 | module/constants 1-21; register 22-29; detail 30-40; list 41-49; create rating 50-72; ratings 73-80; admin list 81-89; approve 90-96 |
| `api/app/v3/endpoints/logs.py` | 1-71 / 71 | module 1-10; LogEntry/LogBatch 11-23; `submit_logs` 24-71, rows and explicit insert columns |
| `api/app/v3/endpoints/moderation.py` | 1-99 / 99 | module 1-16; flags 17-24; auto-hide and retroactive sweep 25-66; ban 67-90; banned list 91-99 |
| `api/app/v3/models/appstore.py` | 1-34 / 34 | imports 1-3; RegisterApp/ListStoreApps/CreateAppRating/GetAppRatings/AppsAdmin/ApproveApp 4-34 |
| `api/app/v3/models/moderation.py` | 1-27 / 27 | imports 1-3; ModerationFlags/ModerationAutoHide/ModerationBan 4-27 |
| `api/app/v3/services/moderation.py` | 1-107 / 107 | module/sentinel 1-24; `_word_re` 25-34; `check_text` 35-51; config 52-70; auto-hide decision 71-93; record flag 94-103; get flags 104-107 |
| `api/app/v3/services/bugbot.py` | 1-185 / 185 | module/roles/caps 1-47; provision 48-61; group-name 62-71; find group 72-87; ensure group 88-101; report summary 102-132; delivery 133-185, admin selection, write gate and attach |

## Checklist Dispositions

| Class | File-local disposition |
|---|---|
| 1 Access control | Moderation/admin-app endpoints call check_admin before operations. Rating explicitly requests verified decode and rejects anon, but expiry/scope remains external. Public store/stats/log routes noted, not presumed missing gates. Bugbot checks write permission before insert but group membership/privacy and bot-account provenance need helpers. I1/I2/I3/I5 remain unverified across edges. |
| 2 Injection | Logs insert uses rows/column_names, no interpolated SQL. Other queries delegated. Regex words escaped before compilation. No eval, pickle/yaml, shell or filesystem sink. Bot message is text data, not HTML; downstream markdown/render handling uninspected. |
| 3 Boundaries/transport | No outbound fetch, postMessage, cookies or CORS setup in assigned files. App URLs stored/delegated, not fetched locally. Body tokens intentional. I6 cross-node control absent locally; provider string in bot group IDs requires caller/helper semantics, not a federation exploit claim. |
| 4 Availability | Unbounded external log entries, ratings/admin queues and moderation sweep are reliability-only candidates. Public ingestion's potential volume is not C+I. |
| 5 Lifecycle | Config read-modify-save and bot user/group check-create races exist locally; security impact depends on helper atomicity and identity reservation. Restore/sweep failure semantics explicit, but stale hidden-state/ban tombstone enforcement external. |
| 6 Hygiene | No literal credentials. Bot password uses secrets.token_urlsafe(32) and hash helper. Report content intentionally sent to admins; exception logs may expose report-derived data but no token leak demonstrated. Anonymous log labels are caller-supplied attribution, not authenticated identity. |

I4 readable/admin-moderation intent respected. All checklist classes reviewed against all assigned lines; no absent inline helper check promoted to a vulnerability.

## Confirmed Findings

None demonstrated in I. No new confirmed finding IDs. Existing B-4 is not reallocated to voluntary external log payloads; sensitivity of submitted data is unproven here.

## Isolated Probe

Executed `python3 -B -c` compiling AST-selected actual `_word_re` and `check_text`, injecting only stdlib re; no config/store imports executed:

```python
import ast, subprocess, re
p = 'api/app/v3/services/moderation.py'
t = ast.parse(subprocess.check_output(['git', 'show', '8af7e0fce922cada30002dff190a5bb3abcf4f63:' + p], text=True))
nodes = [n for n in t.body if isinstance(n, ast.FunctionDef) and n.name in {'_word_re', 'check_text'}]
e = {'re': re}
exec(compile(ast.Module(body=nodes, type_ignores=[]), p, 'exec'), e)
assert e['check_text']('anything', ['.*']) == []
assert e['check_text']('a literal.x token', ['literal.x']) == ['literal.x']
assert e['check_text']('a literalax token', ['literal.x']) == []
```

Standalone pinned-source rerun: exit 0; wildcard and dot treated literally; all 3 assertions succeeded. C, H sink-flow, and H escaping probes were also rerun independently from pinned source and each exited 0.
Earlier combined C/H/I probe exited 1 because its positive fixture ended with non-word `.*`, incompatible with the function's trailing word boundary. Corrected to interior dot as above; this was a probe expectation error, not a vulnerability or implementation change. Negative tests do not establish all-pattern safety.

## UNVERIFIED L2+ Handoffs

- `appstore.py:23-27` forwards arbitrary registration body with URL-present check only. Inspect ch.register_app field allowlist, approval defaults and existing-record ownership before claiming mass assignment or approval bypass.
- `appstore.py:53-70`: trace decode_token expiry/provider and app-contract enforcement. Signature verification requested, but no local expires check; no expired-token exploit demonstrated.
- `logs.py:17-68`: caller may label service/user/origin/level arbitrarily by explicit external-intake design. Trace consumers before claiming trusted-audit impersonation; no downstream trust demonstrated. Inspect sensitive-data redaction/retention separately.
- `bugbot.py:48-58,80-97,155-174`: existing username accepted without provenance; existing named group reused without local member/privacy verification. Inspect signup reservation, boot provisioning, group mutability/read policy and race handling before claiming report disclosure or bot takeover.
- `moderation.py` endpoint sweep/config helpers and service flag helpers: trace policy/tombstones/restore behavior, admin-token checks and render sanitization. `check_text` docstring dedup claim differs from loop behavior for duplicate word entries; correctness only, not security proof.
- `__init__.py:82-86`: public stats payload delegated; verify aggregate-only content in helper before claiming information disclosure.
