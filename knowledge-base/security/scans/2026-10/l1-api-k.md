# L1 API K: import processing and YouTube parser

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63` (HEAD verified; assigned source diff empty).
- Owned: `api/app/v3/services/import_worker.py:533-1028`, 496 lines, NOT the entire 1,028-line worker.
- Owned whole files: `api/app/services/importers/__init__.py:1-16` (16), `api/app/services/importers/youtube.py:1-355` (355).
- Total: 867 lines read, coverage complete for assigned lines; unscanned owned lines: none. Disposition: review/signoff pending; no confirmed C+I findings.
- Worker 1-532 is J context, not K coverage. L1-J-01 belongs to J, not a second K finding.

## Orient
- Onboarding: AGENTS, thesis, D90, social/import KB, plan/lane/changelog, security learnings/record, I1-I6, checklist and design-intent gate read. Existing importer/durability items are implemented, not evidence of exhaustive security coverage.
- Recession: verify untrusted exports remain data, stage under the job owner, and never bypass group authority on delayed execution. D90's streaming claim differs from the parser's actual whole-remainder read.
- Gap: persisted jobs outlive request-time permission checks; URL redirects, storage keys and imported content require their actual adjacent gates/sinks. No helper safety presumed.
- Intent: creator-owned staged catalog, explicit publishing, durable diagnostics; readable node and operator-controlled export retention are accepted. No fix or independent design review performed.

## Coverage By Symbol/Range
| File / lines | Reviewed |
|---|---|
| Worker 533-635 | `_process_job`: terminal/parser checks, resume, target selection, writes, completion and finally cleanup |
| Worker 636-727 | Download, zip/tar streamed member enumeration, list adapter, object deletion |
| Worker 728-789 | Followers ID/provisioning, `user_owns_group`, identity existence read |
| Worker 790-858 | Timestamp parser, user-scoped dedup/profile queries, thumbnail HTTP/storage write |
| Worker 859-1028 | `_write_records`, nested progress, media pool, posts/comments/profile/face creation and group attachment |
| Registry 1-16 | Imports and fixed platform-to-streaming-parser mapping |
| YouTube 1-127 | Format contract, CSV/JSON-sequence parsing, thumbnail/tag helpers |
| YouTube 128-241 | Video/comment/channel mapping and member-path classification |
| YouTube 242-316 | File-object reader, close handling, streaming entry point and record joins |
| YouTube 317-355 | List parser and equivalent record assembly |

## Checklist Dispositions
| Class | L1 disposition |
|---|---|
| 1 Access control | Job owner supplies document author; dedup/profile SQL binds user; target ownership is explicitly assumed checked at creation, not rechecked at execution. Group/storage helper enforcement and request authority are L2, not confirmed missing gates. |
| 2 Injection | Local SQL uses parameters; no eval/pickle/YAML/shell/template sink. Archive names are labels, not extraction destinations; downloads use generated `part-NNN` filenames. Text/URLs become stored data; downstream render sanitization is L2+. |
| 3 Boundaries/transport | `_upload_thumbnail` uses `requests.get(url, timeout=15)` with no local destination/redirect validation. Actual registered parser constructs a fixed HTTPS CDN host; arbitrary URL sink alone is not demonstrated attacker-reachable SSRF. No cookie/CORS/postMessage/token-URL surface. |
| 4 Availability | Separate reliability: parser reads entire remainder and accumulates records; archive/member/response size and thumbnail future counts are not bounded here. Not C+I findings. |
| 5 Lifecycle | Finally deletes exports unless accepted keep switch; deletion failures only log. Resume re-downloads/re-parses; dedup is check-then-write, not atomic. Security consequences of replay/revocation/tombstones need L2. |
| 6 Hygiene | No literal credential found. Broad error strings/object keys may enter trace; no actual secret demonstrated. Temp permissions derive from `mkdtemp`; no explicit world-readable mode. |
| I1/I2/I5 | No token decode here; endpoint and persisted-grant enforcement unverified. |
| I3/I4/I6 | Owner authoring visible locally; group visibility/provisioning and attachment sinks unverified. Node-readable design retained; no remote ClickHouse or federation query here. |

## Safe Local Evidence (No Confirmed Vulnerability)
Run from repository root; executes the unchanged pure parser, not a reconstruction:
```sh
python3 -B -c 'import io,runpy; from urllib.parse import urlsplit; m=runpy.run_path("api/app/services/importers/youtube.py"); calls=[]
class Tracked(io.BytesIO):
 def read(self,n=-1): calls.append(n); return super().read(n)
f=Tracked(b"Video ID,Video Title (Original),Privacy\nx,synthetic title,Private\n"); records=m["parse_youtube_streaming"]([("Takeout/video metadata/videos.csv",f)]); assert records[0]["body"]["visibility"]=="private"; assert f.closed; assert calls==[8192,-1]; print("stream_read_sizes=",calls,"closed=",f.closed,"private_visibility=",records[0]["body"]["visibility"])
for vid in ["http://127.0.0.1/", "//169.254.169.254/latest/meta-data", "../redirect?url=http://127.0.0.1/#"]:
 u=m["map_youtube_video"]({"Video ID":vid,"Video Title (Original)":"synthetic"})["media_url"]; assert urlsplit(u).hostname=="i.ytimg.com"
print("three_host_override_inputs_remain_on=i.ytimg.com; no requests sent")'
```
- Result: `stream_read_sizes= [8192, -1] closed= True private_visibility= private`; three host-override inputs remain on `i.ytimg.com`. No requests sent, no DoS load generated.
- The negative URL checks cover only those three strings, not redirects, DNS, HTTP normalization or all possible inputs. Private visibility is record mapping, not proof of read-gate enforcement.

## UNVERIFIED L2+ Handoffs
- K-H1: trace create/start endpoint checks through persisted target ownership, app scope, membership revocation and group deletion until `_process_job:596-607` / `_write_records`. Confirm stale authority only with a working denied-grant replay.
- K-H2: trace minted export keys to download/delete helpers and all object-key validators; no cross-owner read/delete proved here.
- K-H3: assess CDN redirect/DNS/path behavior and all `_upload_thumbnail` callers before claiming SSRF. No network probe permitted/performed.
- K-H4: inspect ClickHouse group/member/attachment/tombstone helpers and staging/comment read paths for owner-only guarantees, collisions and concurrent writes. `user_owns_group` checks returned role; helper filtering remains uninspected.
- K-H5: imported body/website/video URL rendering is an eventual sanitizer boundary, not an XSS finding in this parser.
- Reliability handoff: `youtube.py:248-255` directly contradicts flat-RAM streaming intent; `f.read()` consumes all remaining bytes. Resume/idempotency, deletion retry and overlapping sweep execution also need reliability review.
- No live services, secrets, network, installs, runtime/central-doc edits or git mutation. No whole-worker security, endpoint exposure, fix or convergence sign-off claimed.
