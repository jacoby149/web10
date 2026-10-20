# L1-MB: Marketing Import Mappers

Date: 2026-10-18. Contract source pin: `db325cd3ca242774ed0afdaf743fdf35419da1e7`.
Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
Disposition: coverage complete; security review/sign-off pending. No confirmed local C+I finding; not PASS.
Source was initially read from the supplied workspace; counts match the pinned inventory. Independent reviewer verification (reported by the operator): `git diff --exit-code db325cd3ca242774ed0afdaf743fdf35419da1e7 -- marketing/marketing-api/app/{facebook,instagram,youtube,web10}.py` verified all four assigned files equal the pin.
Only this receipt is written. No fixes, runtime/central edits, installs, live services, credentials or git mutations; replay uses read-only `git show`.

## Orient

Read AGENTS, security theory/use theory, learnings, security record, I1-I6, six-class checklist,
design-intent gate, thesis, current plan/lane/changelog and backend inventory; browsed strategy.
Onboarding: B-1/B-3 issuer/unsigned-auth debt and B-4 logging debt remain open elsewhere; no closure claimed here.
Recession: imported posts still target `staging_posts`; source visibility is metadata, not proof of public access or owner isolation.
Obvious gap: upload-controlled authors, references, URLs and arbitrary service names may acquire authority downstream;
dependency/helper trust and storage gates are assumptions, not certified properties. Availability stays reliability.
Intent: preserve portable imports, explicit publication, readable-node D41, body tokens and useful diagnostics;
this scan changes no product behavior. Fresh independent design-intent/convergence review remains owed.
Retirement intent: `knowledge-base/web10-v3/social/import.md:42-48` retires the marketing HTTP/v2 importer, superseded by the active node-native v3 importer.
That KB statement proves neither that the marketing route is unmounted nor that these mappers are active runtime; deployment/caller reachability remains unverified.

## Whole-File Coverage

Every line including comments/blanks was read; exact paths/ranges/counts, total **4 files / 727 lines**:

| Path | Range/count | Symbols and inspected ranges |
|---|---|---|
| `marketing/marketing-api/app/facebook.py` | 1-194 / 194 | imports 1-4; privacy 5-17; JSON field 18-27; post 28-63; photo 64-100; friend 101-118; comment 119-153; detector 154-166; parser 167-194 |
| `marketing/marketing-api/app/instagram.py` | 1-221 / 221 | imports 1-4; post/media/tagged/location/comment mapping 5-112; comment 113-141; profile 142-158; follows 159-180; parser 181-221 |
| `marketing/marketing-api/app/youtube.py` | 1-196 / 196 | imports 1-4; duration 5-18; video/thumbnail 19-103; comment 104-137; channel 138-155; detector 156-166; parser 167-196 |
| `marketing/marketing-api/app/web10.py` | 1-116 / 116 | format/imports/constants 1-32; remap 33-43; parser manifest 44-59; service discovery 60-78; decoding 79-94; body/ID/output 95-116 |

## Provenance And Sinks

Facebook: caller supplies `zf` and entry paths; matching archive bytes become JSON lists, then post/photo/friend/comment records.
Attachment/photo URLs, names, author labels, IDs and privacy originate in uploaded content; fixed target services, no issuer verification.
Instagram: archive profile/follows/post JSON supplies biographies, websites, filenames, coordinates, authors, IDs and child comments.
Post visibility is hardcoded public metadata but target is staging; media/comments/profile/contacts use fixed services.
YouTube: uploaded JSON `items` supplies video/channel/comment identities, privacy, textDisplay HTML-looking text and thumbnail URLs.
Channel website uses a fixed `https://youtube.com` prefix; thumbnail values are copied, not fetched; no YouTube API invoked.
web10: manifest JSON is parsed then discarded, not authenticated; member names select target service and uploaded dict bodies pass unchanged.
Only exact `posts`, `public_posts`, `private_posts` names remap; arbitrary names/body fields are not treated as grants inside this file.
All four: `zf.read(member)` is an archive-object boundary, not demonstrated OS-path access; no extraction/open/write occurs locally.
All four: no SQL construction/execution, subprocess/shell/eval, outbound HTTP/fetch, credential literals/validation, cookie/CORS or logging sinks.
JSON decoding is data-only here; `__import__('datetime')` and regex imports have constant names, not upload-controlled code.

## Six-Class Disposition

| Class | File-local disposition across all four files |
|---|---|
| 1 Access control | No endpoint/auth decision or protected-store read; returned identity/visibility fields are untrusted metadata. FB/IG/YT fixed services; web10 arbitrary service handoff requires caller/write-gate review. |
| 2 Injection | No SQL/shell/template execution; JSON only. FB/IG/YT retain strings/URLs/IDs; web10 retains dict bodies/services. Member names reach `zf.read`, not local extraction; no traversal exploit demonstrated. |
| 3 Boundaries/transport | No actual outbound fetch, token transport or browser boundary in any file. URL/filename forwarding is a downstream SSRF/render/path candidate, not a confirmed primitive here. |
| 4 Availability | Whole-member reads, JSON/list accumulation, conversions and broad exception catches can consume resources or lose records. Reliability only, not C+I findings. |
| 5 Lifecycle | Staging remaps observed for posts; other records remain media/comments/profile/contacts or original web10 service. No persistence/cleanup/dedup/owner-isolation guarantee established. |
| 6 Hygiene | No secret defaults, secret logs or credential sinks found locally. Broad catches suppress malformed-input diagnostics; no demonstrated protected-content leak. |

## Unverified L2+ Candidates

- **L1-MB-C1:** web10 60-114 forwards archive-selected services and arbitrary dict bodies, including authority-looking fields; inspect real importer routing, service permissions and body interpretation before alleging mass assignment or cross-owner writes.
- **L1-MB-C2:** FB 49-51/65-76, IG 43-50/150-152, YT 39-50/106/149 and web10 101-110 retain upload-controlled URLs/paths/text. Inspect actual fetch/extraction/render consumers and sanitizers; no SSRF, XSS or filesystem traversal demonstrated.
- **L1-MB-C3:** fixed-service media/comments/profile/contacts and fabricated author/origin IDs need actual ownership, publication and dedup provenance review; staging comments do not themselves prove those companion services owner-only.
These are handoffs, not confirmed vulnerability IDs. No BP/B finding is duplicated; confirmed IDs: none.

## Safe Source-Real Probes

Initially executed against workspace source; revised pinned replay uses `python3 -B -c '<code below>'` from repository root.
P1 parsed actual source AST/counts; P2-P5 executed actual module definitions with top-level imports removed.
Injected helper stand-ins are explicitly conditional: real `.utils` behavior and actual ZipFile/callers were not exercised.
`Z.read` is a fake archive sink/source; URLs/paths are synthetic canaries, never requested or opened.

```python
import ast,json,subprocess
PIN='db325cd3ca242774ed0afdaf743fdf35419da1e7'
root='marketing/marketing-api/app'; mods={}
for name,count in [('facebook',194),('instagram',221),('youtube',196),('web10',116)]:
 s=subprocess.check_output(['git','show',f'{PIN}:{root}/{name}.py'],text=True); assert len(s.splitlines())==count
 t=ast.parse(s); t.body=[n for n in t.body if not isinstance(n,(ast.Import,ast.ImportFrom))]
 ns=dict(json=json,safe_str=lambda x:str(x) if x is not None else None,safe_num=lambda x:x,parse_timestamp=lambda x:x,parse_tags=lambda x:[],parse_mentions=lambda *x:[],find_json_entries=lambda es:[e for e in es if e['path'].endswith('.json')])
 exec(compile(t,name,'exec'),ns); mods[name]=ns
class Z:
 def __init__(self,values): self.values=values; self.reads=[]
 def read(self,p): self.reads.append(p); return json.dumps(self.values[p]).encode()
u='http://127.0.0.1:9/MB-CANARY'
z=Z({'../your posts.json':[{'Post text':'MB-CANARY','Post attachments':json.dumps([{'url':u}])}]})
r=mods['facebook']['parse_facebook'](z,[{'path':p} for p in z.values])
assert r[0]['service']=='staging_posts' and r[0]['body']['media_refs']==[u] and z.reads==['../your posts.json']
z=Z({'posts/a.json':{'post_id':'p','post_text':'MB-CANARY','media':[{'media_filename':'../../MB-CANARY'}]}})
r=mods['instagram']['parse_instagram'](z,[{'path':p} for p in z.values])
assert r[0]['body']['url']=='../../MB-CANARY' and r[1]['service']=='staging_posts'
z=Z({'videos.json':{'items':[{'id':'v','snippet':{'title':'MB-CANARY','thumbnails':{'high':{'url':u}}},'status':{'privacyStatus':'private'}}]}})
r=mods['youtube']['parse_youtube'](z,[{'path':p} for p in z.values])
assert r[0]['service']=='staging_posts' and r[0]['body']['visibility']=='private' and r[1]['body']['url']==u
z=Z({'../records.json':[{'_id':'x','body':{'author_key':'MB-OTHER','role':'admin'}}],'public_posts/records.json':[{'body':{'text':'MB-CANARY'}}]})
r=mods['web10']['parse_web10'](z,[{'path':p} for p in z.values])
assert r[0]['service']=='..' and r[0]['body']=={'author_key':'MB-OTHER','role':'admin'} and r[1]['service']=='staging_posts'
print('L1-MB P1-P5: all assertions satisfied')
```

Revised pinned replay succeeded: `L1-MB P1-P5: all assertions satisfied`; no failed attempts. Receipt remains <=130 lines.
Results: P1 AST/counts 4/727; P2 Facebook path+URL+staging; P3 Instagram path+staging;
P4 YouTube URL+private staging; P5 web10 service+body+remap; all assertions satisfied.
Limits: no real helper validation, HTTP/auth exploit, DB mutation, network, credential validity, private-data access,
production exposure, caller reachability, dependency safety, fix, whole-service safety or independent/model-diverse three-dry claim.
