# H01 HLS Variant Provenance

01.11.2026. Base `fb8820c3086bc751b428720d865361d53899a18b` plus local
repair. Author and separate reviewer: `openrouter/openai/gpt-6.1-sol`.
Local source repair only. No whole-HLS or protocol L1 PASS.

## Intent And Scope

Authorized readers may stream uploader-owned media through existing document/
group access. Readability of editable rendition metadata must not authorize
arbitrary storage keys. Read plan/lane/changelog, learnings, H01 receipts and
media intent before editing. PR #1307 is merged; do not repeat its raw repair.
This slice owns only the variant fetch boundary, not mint or segment policy.

## Reproduction

Two cases exercise the real FastAPI handler and locally signed JWT, replacing
only document-access lookup and S3 with doubles. Alice's readable video retains
its valid `alice/abc/hls` sig but rendition metadata names either
`bob/private/hls/360p/index.m3u8` or `alice/other/hls/360p/index.m3u8`.
A key-sensitive object-store double serves a unique synthetic private marker.
Both baseline responses were HTTP 200 and returned that marker; both failed
expected-403 assertions. No live service, real object, credentials or persisted
injection was used. This proves handler-level retrieval, not production exposure.

## Repair

`_hls_doc` retains verified claims alongside the access-checked document.
`hls_variant` requires a string raw MinIO key in the uploader's exact namespace,
the same HLS prefix in the verified token, and the exact worker-produced variant
manifest key. It checks types without string coercion and denies before creating
a storage client. Group-authored documents use `posted_by or author_key`, not
the group or viewer. Worker key construction was independently checked against
`transcode.py`; keys remain opaque and are not normalized.

The HTTP 403 failure is safe diagnostic signal; no key, token, URL or private
manifest is added to logs. Master access/revocation and segment behavior remain.

## Verification And Review

Initial repro: 2 failed (both synthetic markers disclosed). After repair: both
denied before storage. Added 28 cases total: two disclosures, sixteen malformed
key/owner/signed-prefix cases, eight reference-shape/type cases and two positive
authenticated-fan/anonymous group-uploader controls. Existing rewrite and missing
variant checks remain. Final full API suite: **1,599 passed plus eight subtests**.
Ruff lint and format checks pass across 111 files.

Commands from `api/`: `uv run --frozen pytest -q --tb=short --disable-warnings`,
`uv run --frozen ruff check .`, `uv run --frozen ruff format --check .`.

Fresh same-model reviewer ran the initial 86 HLS controls, checked worker keys,
and found no blocking defect. Reviewer suggested authenticated-fan and malformed
reference coverage; both were added before the final full-suite run.

DESIGN-INTENT REVIEW: intent is group-authorized streaming of uploader media;
delta denies unrelated manifest keys without owner-only viewing; no by-design
conflict or new standard deviation found. TTL-limited URL capabilities and DB-
free segments remain intentional. Mocked authorization does not establish actual
carrier/public-board permissions; persisted metadata, live worker/storage/player,
legacy records and a fresh read after a video-tree change remain integration risks.
Same-model review is not model-diverse three-dry sign-off.

## Open Gates

Mint sites still derive prefixes from stored references and segments trust those
claims directly. Denying a variant does NOT invalidate a separately minted bad
segment capability. Mint/segment provenance is the next bounded candidate, not
repaired by this change. Legacy URL/caller-owner authority, actual DB/storage/
browser integration, CI/deployment/history and diverse review remain OPEN.
Publication and CI status are tracked by the repair PR; local results above do
not establish deployment or whole-campaign closure.
