# B-4 Middleware Repair Evidence

Baseline: `9be059bfb6eba8f2f3763b02e7315baaa7219750`, 2026-10-18.
Agent: OpenCode `gpt-6.1 sol` (`openrouter/openai/gpt-6.1-sol`).
One finding: automatic middleware copies HTTP secrets/content into log records.
No source or deployment closure claimed until repair evidence and merge exist.

## Source Research Checkpoint

Read both actual pinned implementations/tests before runtime edits:

- PR1157 `61ece872c1e9bfb8706e4c4e9776ef01c53a467a`:
  [middleware lines 13-109](https://github.com/jacoby149/web10/blob/61ece872c1e9bfb8706e4c4e9776ef01c53a467a/api/app/middleware.py#L13-L109),
  `_insert_log` and `log_requests`: no body read/buffer/unsigned attribution,
  route-template/method allowlist, existing column layout and original response.
  Its `test_middleware_security.py` has body, route/method, stream/cookie/background
  and storage-failure non-exposure tests; main-handler tests are separate scope.
- PR1159 `ede48ff19056111b2d15660b7b2667bf85e9b858`:
  [middleware lines 15-222](https://github.com/jacoby149/web10/blob/ede48ff19056111b2d15660b7b2667bf85e9b858/api/app/middleware.py#L15-L222),
  field/echo redaction still reads/buffers bodies, extracts unsigned attribution
  and logs insert exception tracebacks. Its `test_log_redaction.py` scenarios
  motivate stronger unknown-field/error-copy/stream assertions, not retention.
- Current baseline still copies raw path/origin, unsigned user attribution,
  truncated bodies, error message/meta; buffers/reconstructs the response and
  logs insert failures with `exc_info=True`. Existing pinned L1 receipt reproduced
  B-4. Baseline `uv run pytest`: **1,121 passed** before adding this regression.

Choose the stronger metadata-only policy, not recursive field-name heuristics.
S1 permits this independent slice. Do not import its settings/SSRF/main-handler
or S3 issuer/delegation/context changes. Future S3 origin-context handoff remains
separate; this change neither sets nor resets authority context. No credential,
stored schema, auth transport or coordinated consumer protocol migration needed.

## Scope And Release Limits

Runtime scope is only `api/app/middleware.py`. Commit synthetic regressions in
`api/tests/test_middleware_security.py`; no live network/DB/credential use.
Target contract: [HTTP logging boundary](../../../web10-v3/security/logging.md).
Test actual middleware and insert arguments, not a reconstructed sanitizer.
Historical logs/backups/proxies/credentials, main exception-handler outputs,
explicit log intake, query logging and import traces are not repaired here.
No whole-file PASS, model-diverse three-dry sign-off or deployed closure claim.

## Repro Gate And Verification

The final nine cases fail against the pinned original module and pass against
the repair. A temporary pytest collection hook loads the original code in memory,
so no working-tree source swap or reconstructed implementation is involved:

```sh
cd api
uv run python - <<'PY'
import subprocess, pytest
class Original:
    def pytest_collection_finish(self, session):
        from app import middleware
        code = subprocess.check_output(["git", "show", "9be059bfb6eba8f2f3763b02e7315baaa7219750:api/app/middleware.py"], text=True)
        exec(compile(code, "pinned-original-middleware", "exec"), middleware.__dict__)
raise SystemExit(pytest.main(["tests/test_middleware_security.py", "-q", "--tb=short"], plugins=[Original()]))
PY
uv run pytest tests/test_middleware_security.py -q --disable-warnings
```

Observed: original **9 failed** (exit 1); repair **9 passed** (exit 0).
Separate per-channel synthetic canaries cover request/response/error/metadata and
unverified username. Real FastAPI cases preserve body delivery, record the route
template, exclude real validation echoes and preserve two cookies, multi-chunk
content and actual background execution. Direct identity/receive/iterator spies
pin no logger body read or response consumption. Initial test setup lacked empty
receive channels in two cases; repaired the harness before using the red evidence.

Full repaired API suite: **1,130 passed**, then **1,131 passed** after merging
dev's `2e09de0a8` node-ad change, then **1,138 passed** after the 20.10.2026
sync through `869d4fda4`; `ruff check .` and `ruff format --check .`
passed. Fresh independent code/design and red/green replay reviews found no
blocking issue, including re-review after adding the integration controls;
remaining shutdown/disconnect, delayed streaming, mounted-route composition and
real storage/deployment behavior are not certified. On 2026-10-18 this bounded
intent-test gap is accepted for the source repair because response identity,
normal ASGI delivery and absence of body access are pinned; re-review if response
wrapping, routing/context ownership or log scheduling changes. No three-dry claim.

## Initial Repair Ordering

B-4 is independent and stops a reproduced new-exposure path without credential
provisioning or SDK wire changes. B-2 provisioning/rotation, expired-principal
authority, object-signing authorization and cross-job trace attribution remain
open and need their own bounded proofs/repairs, not a broad PASS or deferral.
SDK S-1 and joint consent-response binding have stronger sender capabilities but
require explicit origin/window/configuration and consumer/artifact rollout work.
Next independent SDK candidate is L1-SDK-B-01 dictionary integrity; source tests
alone cannot close its shipped behavior until L1-010 artifact correspondence and
build/copy ownership are addressed. Do not silently regenerate/publish packages.
