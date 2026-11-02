# H01 Direct HLS Mint Provenance

01.11.2026. Base `1dda69ecfbc787958284c17e80441fa954759429` plus local
repair. Author and fresh reviewer: `openrouter/openai/gpt-6.1-sol`.
Local source repair, not merged/deployed or protocol L1 PASS.

## Orientation And Scope

Checked plan/lane/changelog and #1309: merged, all thirteen checks green at
publication. Read security learnings, H01/variant evidence and bifurcated media
intent. Prior variant repair denies arbitrary manifest fetches but cannot stop
a client from using an already-minted foreign-prefix sig at the segment endpoint.
This repair owns only direct-document minting in `_mint_hls_manifest_urls` and
focused tests. Resolved-ref/ad minting stays explicit open work. L2 stays gated.

The attachment named a different new branch; actual clean workspace branch was
`jacoby149/continue-branch-v4`. It was left unchanged.

## Repro Gate

Actual mint helper receives an Alice-owned document naming `bob/private/video.mp4`.
Baseline returns a signed stream URL. Test verifies the JWT cryptographically,
then supplies it to actual FastAPI `/v3/media/hls/segment` with a key-sensitive
synthetic S3 store. Handler fetches `bob/private/hls/360p/seg001.ts`, returns HTTP
200 and exact synthetic foreign bytes. The final expected-no-capability assertion
fails: **one failed baseline test**. After repair the same test sees no minted URL.
No segment request can be constructed from that absent output. This is denial of
issuance, not a claim that the segment endpoint revokes old/bad tokens.

No live storage, real private bytes or credentials were used. The helper's input
is synthetic, not persisted malicious metadata; actual read-route authorization
and database retrieval are not established by this probe.

## Repair And Compatibility

Direct mint requires MinIO type, string owner, string raw key, exact `owner/`
prefix and nonempty suffix. Owner is `posted_by or author_key`, not the reader or
group namespace. No coercion, path decoding or normalization. The shared
`hls_prefix` retains worker compatibility. Existing reader/authenticated claims,
TTL and segment DB-free behavior remain unchanged.

Copy direct settings without `manifest_url` before mint/denial, also when
disabled. Valid inputs get a fresh URL; rejected inputs cannot return a stored
capability. Original document/settings remain unchanged. Fixed started/completed/
denied logs carry no identity, object key, content, JWT or signed URL.

24 new cases: one real mint-to-segment reproduction, eleven invalid video/key
cases, five invalid owners, two group-uploader/reader positives, one disabled
stale suppression, two group/viewer namespace negatives and two legacy owner/
opaque-key/stale-replacement positives. Ref/ad tests remain unchanged and green.

## Verification And Fresh Review

From `api/`: `uv run --frozen pytest -q --tb=short --disable-warnings` ->
**1,623 passed plus eight subtests**. Ruff check and format check pass (111 files).
Fresh same-model reviewer ran initial 114 HLS tests and found no blocking defect;
recommended uploader-precedence negatives, empty/null posted_by fallback and
opaque-key/stale-replacement positives, added before final full-suite run.

DESIGN-INTENT REVIEW: intended behavior is authorized reader-bound streaming of
uploader-owned media. Delta denies foreign/non-MinIO/malformed direct keys and
strips stored stream URLs. No by-design conflict or new standards deviation found;
bearer URLs and sig-only segments remain intentional. Actual legacy stored shapes,
read/mint/recheck/browser/worker/storage integration remain untested. This is
same-model review, not model-diverse three-dry sign-off.

## Open Gates

Resolved-ref/ad minting can still issue prefixes from stored references; do not
claim whole-mint or segment-prefix closure. Caller-selected query owner contexts,
legacy URL fields, persisted provenance, old capability TTL, actual services,
CI/deployment/history and required diverse review remain OPEN. Publication and
CI status are tracked in the repair PR; local results do not establish rollout.
