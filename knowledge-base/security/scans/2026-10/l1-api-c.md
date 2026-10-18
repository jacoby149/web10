# API L1 Scope C Receipt

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63`; HEAD matched; scoped `git diff --exit-code <pin> -- <assigned files>` exited 0.
- Coverage: complete assigned whole-file reads, 675 lines; no unscanned assigned lines. Assurance: review/signoff pending, not a whole-file safety claim.
- Only this receipt is assigned output for C. No runtime edits, fixes, network, services, credentials, or independent design review.

## Orient

- Onboarding: read AGENTS, strategy thesis, plan/lane scan state, recent changelog, security learnings/record, I1-I6, checklist and design-intent gate. Middleware/settings receipts are prior work, not rescanned.
- Recession: I1 key provenance remains external; I3 relies on storage-helper gates with no storage ACL backstop. B-6 is the existing unscoped-document-read verification item, not automatically a vulnerability here.
- Gap: object-reference authority and parser-mediated file/network access need direct-edge follow-up; dependency trust remains assumed. DoS is reliability, not C+I.
- Intent: readable-node media, short-lived HLS bearer capabilities and sig-only segments are intentional; no proposal to replace these or token-in-body/accepted telemetry.

## Exact Coverage

| File | Read range/count | Symbols and ranges reviewed |
|---|---|---|
| `api/app/services/hls.py` | 1-172 / 172 | module/imports/regex 1-35; `hls_prefix` 36-47; `mint_sig` 48-71; `verify_sig` 72-90; `can_view_doc` 91-124; `variant_tag` 125-129; `synthesize_master_manifest` 130-149; `rewrite_variant_manifest` 150-161; `segment_key` 162-172 |
| `api/app/services/media.py` | 1-68 / 68 | module 1-11; `_s3_client` 12-27; internal/signing clients 28-47; `ensure_bucket` 48-65; `make_object_key` 66-68 |
| `api/app/services/transcode.py` | 1-371 / 371 | module 1-37; submit/start/worker lifecycle 38-82; video-ref/settings/failure helpers 83-117; rendition parser/planner 118-167; thumbnail dimensions 168-174; ffmpeg runner 175-182; duration/dimension probes 183-237; `_process_job` 238-371, including raw download, rendition/thumbnail uploads, final update and cleanup |
| `api/app/v3/services/thumbnail.py` | 1-64 / 64 | module 1-18; `pick_thumbnail` 19-64, video fallback and non-video URL selection |

## Checklist Dispositions

| Class | File-local disposition |
|---|---|
| 1 Access control | HLS decode explicitly verifies signature with configured algorithm; binds doc_id and requires username/prefix. Mint adds exp. DB helpers decide membership/carrier access; their correctness is unverified. Worker reads/updates with supplied author. Pure thumbnail helper intentionally has no gate. I1/I2/I3/I5 system assurance deferred. |
| 2 Injection | No SQL construction, eval, unsafe deserialization or HTML sink. Subprocess argv lists, not shell strings; raw local filename fixed. HLS variant/segment regex rejects tested traversal. Manifest interpolations and media-reference authority need provenance review below. |
| 3 Boundaries/transport | HLS sig in URL is the documented streaming capability, not an account-token transport finding. S3 destinations are operator settings. Media parsers may interpret downloaded bytes; not probed. No cookies/postMessage/CORS configuration here; I6 has no cross-node DB sink locally. |
| 4 Availability | Unbounded queue, input download/output volume and parser resource costs: reliability only. Timeouts/concurrency exist but do not prove resource bounds. |
| 5 Lifecycle | Temporary tree cleaned in finally; worker uses original body snapshot for final update. Revocation/access re-check and stale metadata/object relationships require caller/helper review; no local exploit established. |
| 6 Hygiene | No literal credential values; S3/JWT secrets come from settings. Logging includes object keys, ffmpeg args/errors and document identifiers, not explicit account tokens. Parser errors could contain sensitive bytes: unverified. Configured transport/default-key posture not re-audited. |

I4 readable-node intent preserved; no operator-blindness finding. Native parser memory safety/dependencies are not Python source coverage.

## Confirmed Findings

None demonstrated in C. Existing B-6 remains a verification handoff; no new finding ID allocated.

## Isolated Probe

Executed `python3 -B -c` using AST-selected real `segment_key` (not a reimplementation), stdlib regex globals only. Reproduce from repo root:

```python
import ast, subprocess, re
p = 'api/app/services/hls.py'
t = ast.parse(subprocess.check_output(['git', 'show', '8af7e0fce922cada30002dff190a5bb3abcf4f63:' + p], text=True))
e = {'_VARIANT_RE': re.compile(r'^\d+p$'), '_SEG_RE': re.compile(r'^seg\d+\.ts$')}
exec(compile(ast.Module(body=[n for n in t.body if isinstance(n, ast.FunctionDef) and n.name == 'segment_key'], type_ignores=[]), p, 'exec'), e)
for v, s in [('../720p', 'seg1.ts'), ('720p', '../secret'), ('720p/x', 'seg1.ts')]:
    try: e['segment_key']('alice/id/hls', v, s)
    except ValueError: continue
    raise AssertionError('accepted')
assert e['segment_key']('alice/id/hls', '720p', 'seg1.ts') == 'alice/id/hls/720p/seg1.ts'
```

Standalone pinned-source rerun: exit 0; three traversal/slash inputs denied; valid input accepted. Initially the combined command later exited 1 on an unrelated moderation test expectation (documented in I); C assertions had completed. This is not exhaustive path/encoding assurance.

## UNVERIFIED L2+ Handoffs

- `hls.py:112-121`: B-6 lookup plus literal `is_group_member` branch versus effective service permissions, block/sharing/hidden policy and carrier checks; inspect direct helpers before asserting bypass.
- `hls.py:78-88`: decoder requires no explicit exp claim and uses shared signing configuration. Trace other token minting shapes/key separation before claiming token confusion or non-expiring capability acceptance.
- `transcode.py:239-262,315,352`: author-scoped document can contain arbitrary video object reference; establish write-side validation before claiming cross-user raw reads or HLS-prefix overwrite.
- `transcode.py:175-235,284-350`: ffmpeg/ffprobe protocol handling of uploaded playlists/containers needs isolated parser testing; no SSRF/local-file exploit demonstrated.
- `hls.py:140-159`, `thumbnail.py:35-64`: provenance/types of manifest metadata and thumbnail URLs; downstream renderer/scheme handling uninspected.
