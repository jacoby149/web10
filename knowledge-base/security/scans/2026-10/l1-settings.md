# L1: API settings

Operators need explicit credentials without quietly falling back to shared ones
or leaking their replacements through diagnostics. This receipt covers the
settings file, not the services that consume it.

## Receipt

- Unit: `api/app/settings.py`, lines 1-140, entire file including blank lines.
- Level: L1, file-local only.
- Source commit: `8704e9f5c97968d9161c4f5f889c0d0fa0a8be6c` (fetched `origin/dev`).
- Date: 2026-10-18.
- Scanner: OpenCode, model `gpt-6.1 sol` (API ID: `openrouter/openai/gpt-6.1-sol`).
- Result: **OPEN**. Existing **B-2** default-credential behavior confirmed;
  new **B-8** command-line secret dump reproduced. Neither is fixed.
- No runtime edits, services, network, inherited environment, or real-secret output.
- No independent three-dry convergence review or whole-API PASS claimed.

## Orient

Read learnings, security record, I1-I6/checklist, thesis, node-config KB,
design-intent gate, current plan/lane/changelog, and extraction ownership.
PR #1199 is merged; its receipt does not close B-4. L1-002 was still open.

- Onboarding: B-2 covers credentials in defaults; BP-1 covers symmetric signing
  and BP-4 historical exposure/rotation. Do not duplicate those architectural items.
- Recession: no proven B-2 fix has landed in this file. Current repeatable defaults
  confirm outstanding debt, not a regression of a completed fix.
- Obvious gap: environment injection alone does not prevent disclosure: the CLI
  prints the resulting globals. The final env loop also destroys parsed types.
- Intent: the node-config KB permits operator configuration and a bootstrap-admin
  baseline. This scan does not declare those choices, local HTTP endpoints,
  the accepted cookie lifetime, or node readability vulnerabilities in themselves.

## Line-by-line coverage

| Lines | Behavior checked | L1 judgment |
|---|---|---|
| 1-6 | OS import, section headings | No additional executable sink. |
| 7-20 | Provider, authenticator hosts, default admins and comments | Narrow host list and intentional bootstrap baseline; actual checks/saved-list semantics require consumers. Comment says saved admins take over, whereas node-config KB says union: unresolved comment/KB mismatch, not a demonstrated authorization break. |
| 21-23 | Algorithm, key, expiry | B-2 literal signing default; symmetric signing remains BP-1. Lifetime already recorded as B-7 in the October backend audit, not a new finding. |
| 24-37 | Costs, bounds, signup/beta defaults | Literal settings only; no auth decision here. Beta/verify policy enforcement and numeric-string consumers require L2. |
| 38-50 | Twilio, E2E switch, Stripe, payment percentage | Credential-shaped defaults fall under B-2; some literals visibly abbreviated, so no live third-party credential validity claim. E2E default is empty; no code issuance in this file. |
| 51-60 | Internal S3 address, ClickHouse address/credentials/TLS | B-2 repeatable password fallback. Local HTTP/TLS-off defaults alone do not prove production cleartext exposure; no network call here. |
| 61-85 | Public presigning config, S3 credentials/TLS, URL TTLs, size | B-2 shared access/secret fallbacks. URL signing/ownership and endpoint interpretation remain L2. |
| 86-99 | HLS rendition, signature TTL, worker controls | No subprocess or signing operation here; consumer validation remains unverified. Resource bounds are reliability, not additional C+I findings. |
| 100-123 | Import concurrency/limits, retain switch, heartbeat controls | Retention switch initially parsed boolean but later overwritten if explicitly set; handoff below. Absence stays falsey in the isolated probe, not proof of export deletion. |
| 124-129 | Broad environment-to-globals assignment | Explicit environment settings overwrite already-parsed booleans/numbers with strings. Environment is operator-controlled; no remotely controlled overwrite established. |
| 130-138 | Manager-host splitting, cost mapping | Host whitespace stripped but no hostname validation here; blank/wildcard/malformed override impact requires consumers. Costs inherit any string overrides. |
| 139-140 | Script entry point | B-8: dumps globals, including supplied secrets, to stdout only when run as `__main__`. |

All checklist classes considered: access control (configuration only; defaults
and type handoff above), injection (no eval, shell, template, SQL, unsafe
deserialization, or user-controlled filesystem operation), transport (endpoint/
TLS configuration but no fetch, cookie, URL token, or postMessage operation),
availability (worker/query bounds routed to reliability), lifecycle (retention
flag handoff), hygiene (B-2/B-8). This is not dependency or deployment coverage.

## Findings and handoffs

**B-2, High, OPEN: nonempty repeatable credential defaults.** With an empty
environment, five sampled credential fields remain nonempty and identical across
independent loads. Explicit synthetic environment values do replace them. This
demonstrates fail-open configuration and corroborates the source inspection,
not that any default authenticates against a deployed API, bank, SMS service,
database, or object store. Default values are deliberately withheld. Removal/
provisioning work belongs with extraction S1; rotation/exposure remains BP-4.

**B-8, Medium, OPEN: CLI dumps environment-injected secrets.** An operator or
diagnostic job must explicitly execute `settings.py` as a script. Lines 139-140
print all settings globals, including the five synthetic environment-provided
credentials. Anyone able to read that stdout/captured log obtains those values.
Ordinary import does not trigger this print. No remote trigger, deployed invocation,
log-reader access, or historical exposure is established. A separate tiny fix
should remove/replace the secret-bearing dump while preserving useful nonsecret
diagnostics; commit a synthetic stdout regression with red -> denied green.
Do not reuse B-7: that ID already names the earlier token-lifetime finding.

**L2 handoff, not a confirmed security finding:** explicit `"false"` values for
six security/lifecycle-relevant flags become truthy strings after lines 124-128,
including flags parsed earlier with `os.getenv`. Trace the actual consumers of
`CLICKHOUSE_SECURE`, `S3_USE_SSL`, `S3_PUBLIC_USE_SSL`, `KEEP_IMPORT_EXPORTS`,
`TWILIO_E2E`, and `VERIFY_REQUIRED` before claiming bypass, retention, TLS, or
recovery impact. The local type bug is demonstrated; downstream C+I impact is not.

## Reproduction

Run from the repository root with Python 3 (stdlib only). This is temporary
scan evidence, not a permanent test or a remediation. Environment changes are
isolated and restored; secret-bearing stdout is captured in memory, never emitted.

```python
import contextlib
import io
import os
import runpy
from unittest.mock import patch

PATH = "api/app/settings.py"
FIELDS = (
    "PRIVATE_KEY", "TWILIO_AUTH_TOKEN", "STRIPE_LIVE_KEY",
    "CLICKHOUSE_PASSWORD", "S3_SECRET_KEY",
)
with patch.dict(os.environ, {}, clear=True):
    baseline = runpy.run_path(PATH)
    repeated = runpy.run_path(PATH)
assert all(isinstance(baseline[name], str) and baseline[name] for name in FIELDS)
assert all(baseline[name] == repeated[name] for name in FIELDS)
print("B-2: 5 credential fields have nonempty repeatable defaults with an empty environment; values withheld")
synthetic = {name: f"SYNTHETIC_{name}_NOT_A_CREDENTIAL" for name in FIELDS}
with patch.dict(os.environ, synthetic, clear=True):
    overridden = runpy.run_path(PATH)
assert all(overridden[name] == synthetic[name] for name in FIELDS)
print("control: explicit synthetic environment values replace all 5 credential defaults")
output = io.StringIO()
with patch.dict(os.environ, synthetic, clear=True), contextlib.redirect_stdout(output):
    runpy.run_path(PATH, run_name="__main__")
assert all(value in output.getvalue() for value in synthetic.values())
print("B-8: running settings as __main__ writes all 5 synthetic environment credentials to stdout")
flags = {
    "CLICKHOUSE_SECURE": "false", "S3_USE_SSL": "false",
    "S3_PUBLIC_USE_SSL": "false", "KEEP_IMPORT_EXPORTS": "false",
    "TWILIO_E2E": "false", "VERIFY_REQUIRED": "false",
}
with patch.dict(os.environ, flags, clear=True):
    configured = runpy.run_path(PATH)
assert all(configured[name] == "false" and bool(configured[name]) for name in flags)
print("L2 handoff: 6 explicit false flags finish as truthy strings; consumer security impact not tested")
assert baseline["KEEP_IMPORT_EXPORTS"] is False
assert baseline["TWILIO_E2E"] == ""
print("control: absent KEEP_IMPORT_EXPORTS and TWILIO_E2E stay falsey; not a whole-flow safety claim")
print("All assertions passed; no network, services, inherited environment, or real secrets printed")
```

Observed output (all assertions passed):

```text
B-2: 5 credential fields have nonempty repeatable defaults with an empty environment; values withheld
control: explicit synthetic environment values replace all 5 credential defaults
B-8: running settings as __main__ writes all 5 synthetic environment credentials to stdout
L2 handoff: 6 explicit false flags finish as truthy strings; consumer security impact not tested
control: absent KEEP_IMPORT_EXPORTS and TWILIO_E2E stay falsey; not a whole-flow safety claim
All assertions passed; no network, services, inherited environment, or real secrets printed
```

## Next

A fresh same-model agent reviewed the receipt, source ranges, redaction, finding
IDs, and design intent, and independently ran the probe with all assertions
passing. No corrections were requested. This is one documentation/design review,
not three-dry convergence or model-diverse security sign-off.

Keep B-2/B-8 OPEN until separate fixes meet the repro gate. Next queued L1 unit:
`api/app/main.py`, entire file, including middleware/CORS registration. This receipt
does not discharge the L2 handoffs or any unrelated unit's scan debt.
