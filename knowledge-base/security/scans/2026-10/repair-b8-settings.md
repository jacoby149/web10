# B-8 Settings Diagnostic Repair

27.10.2026; baseline `f7aabdb26346752141f46f19c393dbadfd25ddd2` (#1255 merged).
Author/reviewer: separate OpenCode `gpt-6.1 sol` contexts
(`openrouter/openai/gpt-6.1-sol`), same-model, not model-diverse three-dry sign-off.
Status: source repair verified; pending PR integration/merge, not deployed.

## Scope And Order

B-8 is the settings CLI's globals-to-stdout disclosure, not B-2 credential
defaults. Selected as an independent local hygiene fix while B-1/B-2 provisioning,
issuer and exposure work remains OPEN with existing S1/S3/BP ownership. This is
not an extraction of omnibus PRs or a decision to defer higher-impact debt away.
Other protocol findings and post-scan changes still block L1 advancement.

An operator/diagnostic job must explicitly execute the script or module. A reader
of its output could obtain effective credentials. No remote trigger, production
invocation, log-reader access, prior exposure or live credential validity proven.

Replace only `print(globals())` with a fixed load-completion message containing
no configuration values, paths, object representations or field-name blacklist.
Normal import, defaults, environment overrides, type behavior, manager splitting,
cost mapping, issuer/auth and runtime callers are unchanged. Startup errors from
malformed environment configuration and other diagnostics are outside this fix.

## Repro Gate

`python3 -m unittest discover -s tests -p test_settings_diagnostics.py -v`
before repair: all four CLI subcases fail (script/module x empty/synthetic env);
the import/derived-config control passes. Injected canaries reach captured output.
After repair: two tests pass, including all four CLI subcases; exact fixed stdout,
empty stderr, silent import and preserved selected overrides/derived settings.

Children use empty or synthetic environments, not inherited operator credentials.
Tests assert booleans so failure output does not reproduce captured configuration.
Fresh reviewer separately captured baseline/current execution with ten synthetic
canaries: all ten disclosed before, zero after. Compared every uppercase setting
under identical env: equal, both imports silent. Pinned source was executed through
`-c`, not materialized as baseline script/module files; actual current entry points
are tested by the regression. No services/network or live secrets used.

`uv run --frozen pytest -q`: **1,180 passed**, four subtests passed.
`uv run --frozen ruff check app/settings.py tests/test_settings_diagnostics.py`
and the corresponding `ruff format --check`: pass. `git diff --check`: pass.

## DESIGN-INTENT REVIEW

Fresh reviewer read thesis, learnings, node-config and the pinned L1 receipt.
- Intended behavior: operator-overridable configuration and useful nonsecret diagnostics; bootstrap/admin configuration remains available.
- Changed behavior: CLI execution reports load completion rather than dumping globals; imports/configuration unchanged.
- By-design conflict? None; D41 readability and D56 telemetry do not authorize credential dumps.
- Conventional standard violated intentionally? No new deviation; no token/cookie or policy changes.
- Tests cover the delta? Actual script/module output and import/config controls, plus independent original/current reproduction; not production operations.
- Untested intent risk: external tooling parsing the old dictionary is unverified; bounded acceptance below and in learnings.
- KB write-back: repair evidence, learnings, record, changelog and queues updated; B-2 and historical exposure remain open.

Accepted 27.10.2026: external dump-parser compatibility may break, but retaining a
credential-bearing interface is unsafe and documented admin-gated configuration
remains available. No matching repository invocation found by the reviewer;
external consumers/deployed jobs unverified. Reopen if one surfaces: specify a safe
diagnostic separately, never restore globals dumping. Production logs/backups and
approved credential rotation need operational assessment. No deployment, full-file
PASS, model-diverse convergence or protocol L1-L4 completion claimed.
