# B-5 Credential-Free CORS Pin

01.11.2026. Base `13187aacc` plus local test-only additions.
Author and separate reviewer: `openrouter/openai/gpt-6.1-sol`.
**Selected-route assumptions pinned locally; B-5 browser/integration/sign-off
and protocol L1 remain OPEN. No runtime vulnerability or repair claimed.**

## Existing Evidence And Gap

`main.py` intentionally permits all browser origins without credentialed CORS.
Apps explicitly supply scoped body tokens. Existing `test_cors_trust_boundary.py`
already pins arbitrary-origin preflight, no credential header and error-response
CORS. It does not establish that supplied ambient credentials cannot authenticate
actual protected routes. This is additional assumption coverage, not redoing the
existing preflight tests or imposing an origin allowlist.

Read the strategy/plan/lane/changelog, B-5 learnings and historical/current
receipts, main/auth/profile/create paths and SDK cookie slot. D41/D56, JS-readable
cookies and body-token transport remain intentional. CORS allows transport; it
does not replace the app-contract or document/group access gates.

## Added Controls

Thirteen new cases in `api/tests/test_cors_trust_boundary.py` exercise the actual
FastAPI app/CORS/auth helpers/JWT verification with synthetic signing keys:

- Valid Bob token in Cookie (`token`, the SDK slot), Authorization, or both cannot
  replace missing/empty/malformed profile body tokens: 422/401/401, no profile read.
- Valid Alice body token selects Alice with no ambient token or with Bob in both
  ambient transports; actual profile route returns the expected profile.
- Arbitrary-Origin create passes exact Alice/origin/service/operation to the real
  route's app-permission gate; denied permission returns 403/no insert, granted
  permission returns the synthetic insert. Permission/storage implementations
  are mocked, not certified by these controls.

Keys are fixture-scoped; real decoder/helpers/routes/middleware run. Explicit
headers ensure ambient material is sent through ASGI. This is not a browser
request. Starlette may echo Origin when Cookie is present even with credentials
disabled; controls require an allowed origin and absence of the credentials
header, not a wildcard on every response.

## Verification And Mutation Sensitivity

From `api/`:

```sh
uv run --frozen pytest tests/test_cors_trust_boundary.py -q
uv run --frozen pytest -q --tb=short --disable-warnings
uv run --frozen ruff check .
uv run --frozen ruff format --check .
```

18 CORS tests pass; 1,470 API tests plus four subtests pass, lint/format and
`git diff --check` pass. New behavior was already green: no exploit-red/runtime
repair claim. Same-model reviewer independently ran the 18 cases with socket
connections blocked and observed actual received ambient headers without printing
values: three Cookie-only, three Authorization-only, four both, one neither on
profile requests.

In-memory pytest-plugin probes (no tracked source edits): changing configured
CORSMiddleware to `allow_credentials=True` and clearing its cached stack gives
17 failures/1 pass, including all 13 new cases. Replacing route-bound
`account._user` with a fixed Bob principal gives 8 failures/3 passes on the
profile subset (7 deselected): six unexpected 200s, two identity mismatches,
three still-valid missing-field 422s. This is test sensitivity, not a real
cookie-auth exploit or proof every possible regression is detected.

Review initially found that an unconfigured profile Mock produced serialization
noise under the gate mutation. Changed it to serializable synthetic profile data;
reviewer reran baseline and mutation with the clean results above.

## Design-Intent Review And Open Gates

Fresh same-model review found no blocking issue. Intent: independently hosted
apps use explicit tokens, with credential-free CORS. Delta: test coverage only.
No by-design conflict or policy hardening introduced. Body-token/JS-cookie
choices remain intentional, not mistakes to reverse. Untested intent: browser
credential modes/SameSite/Secure delivery, page-JS response visibility, actual
contract persistence/revocation, deployment/proxy headers and SDK login/consent.

Wrong-key/expired body-token denial has separate decoder coverage; this slice
does not repeat it at these HTTP routes. Other routes and future credential
sources require their own analysis. No whole-API ambient-auth safety, browser
assurance, model-diverse three-dry credit or L1 PASS. Reopen on auth-cookie/header
support, CORS credential changes, new auth dependencies or proxy header rewriting.

At the local checkpoint these tests/docs were uncommitted and kept out of decoder
PR #1303. The operator subsequently requested committing and pushing all changes
on this branch. This slice remains test-only; browser integration and required
diverse sign-off remain owed rather than deferred out of the L1 gate.
