# H-01 Direct Media Signing

01.11.2026. Base `e56d25304301b0eb4eb502506980dd68563635c6` plus local
route repair. Author and separate reviewer: `openrouter/openai/gpt-6.1-sol`.
**Direct arbitrary-key mint locally repaired. Not merged/deployed or L1 PASS.**

## Approved Intent

Operator approved owner-only standalone key refresh: people should see media
through the groups/documents that grant them access. `POST /v3/media/read-url`
has no document capability, so it may sign only the verified caller's exact
`username/` object namespace. Cross-user refresh requires an authorized carrier
document read. Unconfirmed uploads and owned derivatives remain directly readable.
Public thumbnails and authorized document/HLS paths are not made owner-only.
KB: `web10-v3/media/minio-auth-bifurcated.md`, Direct Refresh Is Owner-Only.

Orientation read the lane/plan/changelog, current H-01 receipt, learnings, media
intent and S5 boundaries. The existing proof was fake-auth/signer forwarding.
Metadata ownership is not object ownership: requiring an owned metadata record
would both break unconfirmed uploads and leave forged-key provenance unresolved.

## Minimal Source Change

Only `api/app/v3/endpoints/media.py::read_url` changes. Retain `_user`'s verified
identity, reject empty/non-string keys or an empty owner suffix (400), then deny
keys outside the exact owner namespace (403) before bucket/signing calls. Preserve
response shape/TTL. Fixed outcome logs omit keys, tokens and presigned URLs.

S3 keys are opaque: no decode, URL/path normalization, UUID grammar, HEAD or
metadata lookup. `alice/../bob/opaque.png` remains an Alice-namespaced literal
object key, not Bob's object; the unchanged key is covered by its signature.
An intermediary normalizing the path would invalidate the signature, not make
it a valid signature for another key. Actual proxy/object-store behavior is
still an integration gate.

## Stronger Repro Gate

`api/tests/test_media_read_url_owner.py` uses a clean subprocess per case to
remove conftest's boto mocks and load **real boto3/botocore 1.43.50**. Synthetic
JWT/S3 keys, explicit synthetic endpoint/credentials, disabled AWS metadata and
blocked Python socket/DNS operations avoid live services. Bucket operations and
signing-client factory are stubbed; returned signer is actual boto3 SigV4.
The registered FastAPI route, actual JWT verification and real signing execute.
An independent standard-library HMAC verifier reconstructs canonical request,
scope/signature and exact bucket/key/expiry; no signed URLs are printed.

Initial focused run: **3 failed, 1 passed**. Distinguish these failures:

- Real Alice JWT + Bob key produces HTTP 200 and an independently verified
  foreign-key SigV4 capability before the expected-403 assertion fails.
- Integer object key reaches signer/returns 500 rather than expected 400.
- Owned-path case fails only because the new fixed decision logs are absent.
- Invalid-token control passes already. This is not three authorization exploits.

After repair, foreign/prefix-collision/case/encoded-delimiter keys are denied
before all bucket/factory/signer calls. Owned unconfirmed keys, nested thumbnails,
HLS-shaped derivatives and opaque punctuation/dot keys still return valid
signatures. Malformed/wrong-key/expired/anonymous/empty credentials never sign.

This proves a synthetically valid unauthorized capability on baseline, **not**
deployed IAM authority, an existing private object or its retrieval.

## Verification And Review

From `api/`:

```sh
uv run --frozen pytest tests/test_media_read_url_owner.py tests/test_thumbnail.py tests/test_hls.py tests/test_v3_clickhouse.py tests/test_v3_endpoints.py tests/test_query_endpoint.py -q --disable-warnings
uv run --frozen pytest -q --tb=short --disable-warnings
uv run --frozen ruff check .
uv run --frozen ruff format --check .
```

**503 focused / 1,477 API tests plus four subtests pass**; lint/format (111 files)
and `git diff --check` pass. Parent independently reran full checks. Five new
pytest cases include subprocess key/token matrices and a group `posted_by`
dispatch control; code/test delta is 230 changed lines.

Separate same-model reviewer replayed baseline by replacing only registered
`read_url.__code__` with the base Git function in memory. Foreign capability
again verified before failed denial assertion. Current 85 new/thumbnail/HLS and
739 existing boundary tests passed (824 total across review runs). No new
route-local defect found. Group preservation test mocks group/store/resolver
implementations: it pins dispatch/posted_by, not real group authorization.

DESIGN-INTENT REVIEW: intent is owner-only direct refresh plus document-gated
foreign media; delta is 403 for direct foreign keys; no conflict with approved
unconfirmed-owner/derivative/public-thumbnail behavior; TTL-limited shareable
URLs and node readability remain intentional; browser/MinIO/IAM, expiry/re-read
UX, actual group/registry/store integration and external SDK consumers untested.
Same-model review earns no model-diverse three-dry credit.

## Remaining Gates

Accepted locally on 01.11.2026: direct foreign-key refresh calls stop working;
viewers re-read authorized carrier documents. SDK wire shape remains unchanged.
Social's generic refresh helper retains the old record on failure, not an
automatic carrier re-read; foreign records could retain expired URLs until a
document reload. Owner upload/profile refresh and normal resolved feed media
paths remain supported. Existing bearer URLs stay usable until TTL expiry.

Forged object keys in owned metadata, recursive minio leaves and thumbnail
references, service-scoped authority/deletion policy, issuer trust and whole-class
signing provenance remain OPEN as separate S5/S4 work. This repair must not imply
all media paths enforce object provenance. Real services/browser/CI/deployment,
history and diverse sign-off remain OPEN. No commit or PR created.
