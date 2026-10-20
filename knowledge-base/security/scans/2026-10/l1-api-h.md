# API L1 Scope H Receipt

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63`; HEAD matched; scoped source diff exited 0.
- Coverage: complete assigned whole-file reads, 614 lines; no unscanned assigned lines. Disposition: **OPEN**, L1-H-01; review/signoff pending, no safety certification.
- Only assigned receipt written; no runtime/central-doc/git mutation, network/service probe or real secrets.

## Orient

- Onboarding: AGENTS, thesis, scan plan/lane, changelog, learnings/security record, I1-I6, checklist and design-intent gate read. Prior middleware/settings work not duplicated.
- Recession: I3 requires every object/document access path to carry authority, not merely authentication. B-6 unscoped lookup is a known verification item; absence of inline helper implementation is not proof of a vulnerability.
- Gap: object-store signing bypasses document-read machinery unless explicitly tied to authority. Parser/import and app-contract semantics remain L2 work; dependency trust assumed.
- Intent: public pure card rendering, anonymous public thumbnails, readable-node model and HLS URL capabilities are intentional. No proposed transport/telemetry/cookie change. Fresh design review still owed.

## Exact Coverage

| File | Read range/count | Symbols and ranges reviewed |
|---|---|---|
| `api/app/v3/endpoints/media.py` | 1-262 / 262 | imports/router 1-36; `upload_url` 37-65; `read_url` 66-85; confirm/list/delete 86-107; `get_thumbnail` 108-168; transcode section/handler 169-197; `_hls_doc` 198-216; master/variant/segment handlers 217-262 |
| `api/app/v3/endpoints/imports.py` | 1-157 / 157 | module 1-30; `_import_object_key` 31-39; `create_import` 40-90; `_owned_job` 91-102; `start_import` 103-131; status 132-138; trace 139-157 |
| `api/app/v3/endpoints/preview.py` | 1-109 / 109 | module 1-26; `_meta_tag` 27-33; `_render` 34-84; `render_preview` 85-109 |
| `api/app/v3/models/media.py` | 1-40 / 40 | imports 1-3; ConfirmMedia/ListMedia/DeleteMedia/UploadUrlRequest/ReadUrlRequest/TranscodeRequest/ThumbnailRequest 4-40 |
| `api/app/v3/models/imports.py` | 1-29 / 29 | imports 1-3; ImportPart/ImportCreate/ImportJobRef/ImportTraceRef 4-29 |
| `api/app/v3/models/preview.py` | 1-17 / 17 | imports 1-3; PreviewRender 4-17 |

## Checklist Dispositions

| Class | File-local disposition |
|---|---|
| 1 Access control | L1-H-01: handler discards identity and forwards caller key to signing without an intervening object-authorization check; dynamic proof uses stub authentication/signing. Other media CRUD delegates authority to ch helpers; transcode selects user-owned doc; thumbnail gates groups; HLS verifies sig before access re-check. Import owner comparison precedes status/trace/start; target group ownership explicitly checked. I1/I2/I5 verification/expiry/contracts remain helper-dependent. |
| 2 Injection | No SQL/shell/eval/unsafe deserialization sink. HTML text/attributes escaped. URL scheme in clickable href unconstrained: candidate below, not confirmed XSS. Import extension truncation/key construction inspected; no filesystem sink here. |
| 3 Boundaries/transport | No outbound HTTP fetch in assigned handlers. S3 helpers use operator endpoint; account token in body intentional. HLS URL sig intentional. No local cookie/postMessage/CORS setup. I6 cross-node boundary not implemented here. |
| 4 Availability | Missing upload content-length policy, broad model dicts, unbounded page/trace integers and buffered segments/manifests are reliability concerns, not C+I findings. |
| 5 Lifecycle | Import start check/queue is non-atomic; worker dedup/retention/recovery uninspected. HLS no-store headers present. Signature lifetime/revocation delegated. Metadata confirmation and replayed upload URL authority need direct helpers. |
| 6 Hygiene | No hardcoded secrets. Preview logs caller URL/title/image; credential-bearing URL retention candidate, no secret demonstrated. No explicit token logging locally. Broader middleware B-4 not rescanned/reconfirmed here. |

I4 node readability does not authorize arbitrary private-object capability issuance. No whole-system invariant assurance claimed.

## OPEN L1-H-01: Missing Handler-Level Object Authorization

- Location: `api/app/v3/endpoints/media.py:66-83`, especially 69-78. C+I class: object-level authorization; confidentiality risk, not DoS.
- Source-supported concern: `_user(data)` return value is discarded. Caller-supplied `body.object_key` flows unchanged into `generate_presigned_url('get_object', Params={Bucket, Key})`, then the result is returned. The handler contains no intervening ownership/group/document check after the auth-helper call.
- Conditional dynamic proof: executing the actual function with authentication stub returning `alice`, synthetic key `bob/private/report.pdf`, inert bucket helper and capturing signer passes that exact key to the fake sink and returns its synthetic URL. The key's Bob ownership is a fixture label, not a verified private object.
- Preconditions/limits: exploitation would require a real accepted caller, knowledge of a private object's key, and signer/storage authority permitting retrieval. This probe proves arbitrary-key sink flow conditional on stub authentication, not a successfully authenticated HTTP request, real unauthorized signing, or private capability retrieval. Auth-helper behavior, object existence/discoverability and production IAM remain unverified; restrictions there may limit impact. OPEN records the source-supported concern, not a confirmed end-to-end exploit.
- New scope ID used; not B-6 (which concerns document lookup), not B-4. No repair attempted.

### Reproducible Probe

Executed inline with `python3 -B -c`; AST compiles real function body while omitting imports/decorator to prevent service initialization. All dependency sinks are fake:

```python
import ast, subprocess, types
p = 'api/app/v3/endpoints/media.py'
t = ast.parse(subprocess.check_output(['git', 'show', '8af7e0fce922cada30002dff190a5bb3abcf4f63:' + p], text=True))
f = next(n for n in t.body if isinstance(n, ast.FunctionDef) and n.name == 'read_url')
f.decorator_list = []
calls = []
class Signer:
    def generate_presigned_url(self, *a, **kw):
        calls.append(kw)
        return 'synthetic-signed-url'
e = dict(ReadUrlRequest=object, _user=lambda d: 'alice',
         ensure_bucket=lambda s: None, get_s3_client=lambda: None,
         get_s3_signing_client=lambda: Signer(),
         settings=types.SimpleNamespace(S3_BUCKET='fake', READ_URL_EXPIRY=60))
exec(compile(ast.Module(body=[f], type_ignores=[]), p, 'exec'), e)
r = e['read_url'](types.SimpleNamespace(body={'object_key': 'bob/private/report.pdf'}))
assert calls[0]['Params']['Key'] == 'bob/private/report.pdf'
assert r['read_url'] == 'synthetic-signed-url'
```

Standalone pinned-source rerun: exit 0; assertions confirm stub-auth arbitrary-key sink flow and synthetic return only. A separate pinned-source `_render` probe also exited 0: `<script>probe</script>` title escaped into `&lt;script&gt;probe&lt;/script&gt;`; no browser execution claim. The initial combined process had misleading output `alice authenticated` (actually stubbed) and subsequently exited 1 on the I fixture expectation; H assertions had completed. Neither that output nor these reruns establish real authentication or private-object retrieval.

## UNVERIFIED L2+ Handoffs

- `media.py:89-105,132-165,184-195`: validate auth-helper expiry/app scope and ch metadata/object-reference authorization, tombstones, hidden/block/sharing policy; no helper implementation covered by H.
- B-6: `_hls_doc:207-214` does order sig verification before `can_view_doc`; this local ordering does not close B-6's broader helper/caller review.
- `imports.py:31-37,55-67,91-157`: extension-derived keys, ownership helper, persisted group authority after job creation, worker extraction/cleanup, trace redaction and queue races need direct-edge review. No arbitrary filesystem write or cross-user job read demonstrated.
- `preview.py:70`, model `preview.py:11`: `javascript:` URLs are not scheme-filtered; HTML escaping alone does not reject them. Browser/origin/CSP delivery exploit not tested, so candidate only, not confirmed XSS.
