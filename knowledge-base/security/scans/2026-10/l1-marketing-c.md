# L1 Marketing C: Payment and Reporting Boundaries

- Source pin: `db325cd3ca242774ed0afdaf743fdf35419da1e7`; scan date: 2026-10-18.
- Scanner: OpenCode, gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Disposition: **OPEN**; file-local coverage complete, security review/sign-off pending.
- Nine whole files, **712 lines**, including comments, blank lines and one empty file; no omitted source ranges.
- Only this receipt written. No runtime/central documentation/git mutations, installs, network or production credentials used.

## Orient
- Read AGENTS, security theory/checklist/design-intent gate, security learnings/record, I1-I6, thesis, current plan/lane/changelog; browsed strategy and existing receipts.
- Onboarding: B-1/B-3 issuer weaknesses and B-2/B-4 credential/logging debt are not closed by this scan; no duplicate finding asserted.
- Recession: checked credential defaults, unsigned authority, account scoping and persisted state; existing API receipt coverage is not marketing-service assurance.
- Obvious gap: accounting integrity needs provenance/replay checks independently of token decoding. Dependency trust and deployment exposure remain assumptions.
- Intent: public bug submission and readable-node design are preserved; neither implies authority to cancel another app's payout or certify paid conversions.
- D41/D56/body-token/cookie choices are not findings. Strategy D57 places creator payments later; marketing payment code here is a local scaffold, not evidence of operational money movement.
- This is a scan, not a fix or independent design-intent review; no behavioral delta or three-dry/model-diverse claim.

## Exact Coverage
All paths below are relative to `marketing/marketing-api/app/`; each row was checked against all six classes.

| Whole file | Lines/count | Symbols and ranges reviewed |
|---|---|---|
| `__init__.py` | 1-3 / 3 | app import/export and blank line |
| `main.py` | 1-21 / 21 | imports/logger/app 1-9; CORS 10-17; dual router mounts 18-21 |
| `models.py` | 1-135 / 135 | imports/Phase 1-14; import request/response/job schemas 15-56; FeedbackCreate 57-70; payout enum/create/response 71-101; affiliate create/response/click/conversion 102-135 |
| `v3/__init__.py` | 1-17 / 17 | imports/router 1-5; infrastructure mount 6-8; analytics comment and product mounts 9-17 |
| `v3/endpoints/__init__.py` | empty / 0 | empty package explicitly inspected |
| `v3/endpoints/feedback.py` | 1-139 / 139 | imports/state 1-23; load/save/startup 24-42; formatter 43-66; credentialed delivery 67-109; submit 110-132; listing 133-139 |
| `v3/endpoints/infra.py` | 1-10 / 10 | imports/router 1-7; public health 8-10 |
| `v3/endpoints/issue_tracking.py` | 1-74 / 74 | imports/config 1-14; proxy 15-25; public submit 26-48; delegated admin list 49-61; delegated detail 62-74 |
| `v3/endpoints/pay.py` | 1-313 / 313 | imports/config/state 1-41; load 42-59; save/startup 60-78; create/get/list/cancel payouts 79-165; create/get/list links 166-220; clicks 221-241; conversions 242-277; stats 278-300; webhook stub 301-313 |

## Checklist Dispositions
1. Access control: no JWT decode in these files. Pay cancellation/accounting mutate records without identity/provenance checks (findings below). Payout creation only checks configured Stripe key, not caller identity; real Stripe call is commented out. Issue admin handlers forward body tokens to fixed node paths; delegated checks uninspected, not declared missing. Public health/submission are intentional surfaces.
2. Injection: no executable SQL, shell, eval, pickle or filesystem path derived from caller input. JSON parsing is data-only. Affiliate target URLs are stored, not fetched. Feedback emits user text/Markdown; downstream rendering is outside L1, not proven XSS.
3. Boundaries/transport: CORS wildcard plus credentials is static configuration, not proof of cookie theft; no cookie auth is implemented here. Node destinations derive from operator environment, not caller URLs. Issue tokens remain JSON body credentials. Feedback's environment token is an Authorization header to the configured node; redirect/provider behavior untested.
4. Availability: synchronous requests, unlimited list/storage growth and partially bounded feedback fields are reliability/DoS debt, not C+I findings.
5. Lifecycle: conversion events have no replay identity/check; payout JSON save emits a list but load calls dict.update, a restart/reliability defect, not demonstrated authority bypass. Saves outside the pay lock can race; no executed security race claimed. Feedback persists contact and full diagnostic fields; public disclosure intent remains unresolved.
6. Hygiene: no embedded credential literal found in these nine files; Stripe credentials default empty, node credentials come from environment. No actual source constant values reproduced. Third-party credential validity/rotation untested. Error response/exception logs can echo upstream data, but no reachable protected credential source demonstrated; disclosure remains candidate only.

## Confirmed Local Findings
- **L1-MC-01: ungated payout cancellation**, `pay.py:139-163`. Any local caller can enumerate IDs and cancel a pending record; no owner/role input or check intervenes. P1 created a synthetic pending record through the real handler, listed its raw synthetic customer field, then cancelled it without credentials. Confirmed local stored-state integrity failure, not a live unauthorized HTTP transaction or Stripe cancellation. Raw payout listing deserves privacy review separately; no assumption that provider IDs themselves are bearer secrets.
- **L1-MC-02: caller-forged/replayed conversion accounting**, `pay.py:242-298`. Caller revenue and affiliate ID append a commission event without paid-event verification, actor check or deduplication. P2 replayed the same synthetic conversion twice and observed 2000 commission cents in real stats. This is local ledger/stat forgery, not money issuance, Stripe fraud or evidence any settlement consumer trusts this store. Negative revenue is also schema-accepted but not needed for proof.

## Synthetic Real-Source Probes
Executed `python3 -B - <<'PY'` with the following stdlib-only harness (repository root):
```python
import ast, asyncio, subprocess, types, json, logging, uuid
from datetime import datetime
from threading import Lock
PIN='db325cd3ca242774ed0afdaf743fdf35419da1e7'
class Router:
 def __getattr__(self,n): return lambda *a,**k: lambda f:f
class HTTPException(Exception): pass
def load(name):
 s=subprocess.check_output(['git','show',f'{PIN}:marketing/marketing-api/app/v3/endpoints/{name}.py'],text=True)
 t=ast.parse(s);t.body=[n for n in t.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))]
 g=dict(APIRouter=Router,HTTPException=HTTPException,Request=object,PayoutCreate=object,AffiliateCreate=object,AffiliateClick=object,AffiliateConversion=object,FeedbackCreate=object,PayoutResponse=lambda **k:k,AffiliateLinkResponse=lambda **k:k,PayoutStatus=types.SimpleNamespace(PENDING='pending',CANCELLED='cancelled'),router=Router(),json=json,logging=logging,uuid=uuid,datetime=datetime,store_lock=Lock(),_feedback_lock=Lock(),payouts={},affiliate_links={},affiliate_clicks=[],affiliate_conversions=[],_feedback_store=[],STRIPE_SECRET_KEY='synthetic-only',STRIPE_PLATFORM_FEE_PCT=2)
 exec(compile(t,f'{name}.py','exec'),g)
 g['_save_stores']=lambda:None;g['_save_feedback']=lambda:None;g['_deliver_bug_post']=lambda e:None
 return g
async def run():
 p=load('pay');r=await p['create_payout'](types.SimpleNamespace(app_id='victim-app',amount_cents=1000,currency='usd',stripe_account_id='synthetic-account',stripe_customer_id='synthetic-customer',description='synthetic-private'))
 assert (await p['list_payouts']())['items'][0]['stripe_customer_id']=='synthetic-customer'
 assert (await p['cancel_payout'](r['payout_id']))['status']=='cancelled'
 print('P1: local listing and cancellation reproduced')
 p['affiliate_links']['synthetic-id']={'affiliate_key':'victim','commission_pct':10}
 c=types.SimpleNamespace(affiliate_id='synthetic-id',revenue_cents=10000,customer_key='synthetic')
 await p['track_affiliate_conversion'](c);await p['track_affiliate_conversion'](c)
 assert (await p['get_affiliate_stats']('victim'))['total_commission_cents']==2000
 print('P2: replayed conversion accounting reproduced')
 before=json.dumps(p['payouts']);assert await p['stripe_webhook'](object())=={'status':'ok'};assert before==json.dumps(p['payouts'])
 print('P3: unread webhook acknowledged; no payout mutation')
 f=load('feedback');fb=types.SimpleNamespace(message='synthetic report',contact='private@example.invalid',app='test',route='/',version=None,user_agent=None,console_errors=[],stack_trace=None)
 await f['submit_feedback'](fb);assert (await f['list_feedback']())['items'][0]['contact']=='private@example.invalid'
 print('P4: synthetic feedback contact returned publicly by local handler')
asyncio.run(run())
```
Results: P1-P4 assertions succeeded, exit 0; executed probe used equivalent longer result labels. No failed probe hidden or repaired. Source was obtained with read-only `git show`; no git mutations.
Extraction retains complete real function bodies/decorators; import/startup statements are excluded to avoid store reads. Models/router/response classes and persistence/delivery sinks are inert substitutes. This does not test FastAPI HTTP validation, dependency execution, real disk persistence, provider credentials or settlement.

## UNVERIFIED L2+ Handoffs and Limits
- **L1-MC-C1:** feedback GET returns contact, diagnostics and full stored reports (`feedback.py:112-139`), P4 proves synthetic flow only. Establish intended audience/confidentiality before calling it private-data disclosure. Public submission and public bug posts alone are not forgery vulnerabilities.
- **L1-MC-C2:** formatter redacts only stack URLs/token-shaped strings, not message/route/console fields (`44-65`). Trace actual protected-value collection and public-post permissions; synthetic token-shaped input alone would not prove credential theft.
- **L1-MC-C3:** issue proxy delegates admin authorization (`49-74`); trace actual node gates and report-id routing before alleging bypass. Feedback uses operator token/configured destination; issue proxy forwards optional caller token without adding operator credentials. Neither is shown to mint credentials.
- **L1-MC-C4:** webhook lacks signature verification but reads no payload and changes no state (`304-313`); P3 confirms acknowledgment only. No forged payment completion finding. Require signed events and replay protection before activating money/state authority.
- **L1-MC-C5:** trace payout/affiliate consumers and deployment exposure. Payout provider invocation is comments, not executable; local state mutation does not demonstrate transfer authority. Returned upstream error bodies/logs need protected-source provenance before disclosure claims.
- No live services, requests, real credentials, production data, browser behavior, helper safety, full-service safety, fixes or sign-off established. Imported modules are context boundaries, not additional coverage.
