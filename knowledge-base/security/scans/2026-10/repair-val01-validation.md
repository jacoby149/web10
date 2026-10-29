# L1-VAL-01 Validation Diagnostic Repair

28.10.2026. Author/reviewer: fresh OpenCode contexts using
`openrouter/openai/gpt-6.1-sol`; same model, no diversity credit.
Scope: `api/app/main.py` request-validation handler and
`api/tests/test_validation_logging_security.py`. Local source repair only.

## Repro Gate

Actual `/v3/query` requests with a missing SQL field, wrong token/SQL types and
a non-object body reproduce bearer/password/content canaries in the old handler's
ERROR logs and 422 body. Before repair: three failures, three passing controls.
After repair: fixed message, generated correlation ID and error count omit all
exception/request content. Tests inspect full LogRecord dictionaries as well as
responses. Malformed JSON plus query/header canaries is a negative control that
already passed before repair, not an additional red-to-green exploit.

HTTP 422, application code 10422, null data and wildcard CORS remain. A valid
schema with an invalid JWT still reaches 401. A valid query traverses the actual
parser/compiler with inert storage and returns an asserted nonempty result;
that control is not real ClickHouse execution or a permission proof.

Commands: `uv run pytest -q` in `api/`: 1,331 passed plus four subtests.
Focused ruff check passes. Fresh reviewer independently replayed the original
handler in memory: three failures/three passes; candidate plus middleware tests:
15 passed. The later success-control strengthening asserts exact result JSON.

## DESIGN-INTENT REVIEW

1. Intent: reject malformed requests without copying private input into diagnostics.
2. Delta: fixed client message plus ID replaces detailed exception echo; operators
   retain correlation/count rather than field-level details. Status/envelope retained.
3. By-design conflict: none identified; D41 readability, D56 telemetry, body tokens,
   authentication, authorization and generic node primitives are unchanged.
4. Standard deviation: retain the existing custom envelope rather than introduce
   FastAPI's default detail array. No new authorization policy.
5. Untested intent risk: external consumers may parse old message text; real
   browser/operator troubleshooting and deployed retention are unverified.

Accepted bounded implementation tradeoff, 28.10.2026: field-level diagnostics and
external message parsing are not preserved because arbitrary exception text can
contain credentials. Schema-driven synthetic reproduction remains available.
Reopen on a demonstrated supported consumer or operator requirement; specify
safe structured diagnostics rather than restoring exception serialization.

No deployment, historical log cleanup, rotation, production exposure, complete
main.py safety, model-diverse three-dry review or protocol L1 PASS is claimed.
Uncaught exceptions and other explicit log producers remain separate obligations.
