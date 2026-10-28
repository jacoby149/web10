# L1-PKG-01 Mongo Connection Output Repair

27.10.2026. Baseline `c893f2f66` (open #1265); this repair is a separately
recorded follow-up on the same branch, included in #1265 by the operator's
commit-and-push request. Pending merge/deployment. Model: OpenCode
`openrouter/openai/gpt-6.1-sol`; fresh same-model reviewer, no diversity credit.

## Boundary And Intent

The audit CLI copied its input URI to stdout after a successful ping. The
account extractor copied it into `source.uri` in both stdout and file manifests.
Operator-supplied credentials and secret query options therefore accompanied
otherwise useful reports and backups. No remote trigger or historical theft is
established. These are separate sinks from B-8's settings diagnostic.

The repair omits the whole connection URI rather than parsing/redacting it.
Audit still reports connection success, database and counts. The manifest keeps
`source.db`, account rows, timestamp, count and row checksum. URI input reaches
MongoClient unchanged. All repository helper callers are updated; the migration
consumer reads users, not `source.uri`. No persisted backup is rewritten.

Reviewed acceptance adjustment: the original receipt asked to retain host
diagnostics. This bounded repair deliberately omits those too: the tool has no
need to serialize connection input, and a redaction heuristic could retain secret
query options or mishandle a URI. Database/count diagnostics remain useful, but
cannot distinguish hosts with identical database names. External audit parsers,
manifest metadata consumers and three-argument helper callers are unverified.
Accept that compatibility risk for this local repair, not as an operational or
deployment guarantee. Reopen on a demonstrated dependency with a separately
specified safe destination identifier; never restore raw connection output.

## Repro Gate

`uv run --frozen pytest -q tests/test_mongo_connection_output.py --tb=no`:
12 failures before the repair, all at the output-omission boundary; 12 pass
after. Four URI cases cover userinfo, query secrets, percent-encoded SRV and
credential-free input across audit stdout, manifest stdout and actual temporary
file output. Mongo is inert; original URI forwarding and client closure are
asserted. Captured output is never included in failure messages.

Focused extraction/output suites: 32 pass. Fresh reviewer also ran migration
controls: 42 pass. Independent baseline/current probes (24 runs) reproduced
all three URI sinks before and denied them after; account rows/counts/checksums
match and both pilot/all-account selection consume the new manifest. That
independent replay used inert dependencies and an in-memory file sink, not DBs.
Focused Ruff check and format check pass for all four code/test files.
`uv run --frozen pytest -q --disable-warnings`: 1,192 passed, four subtests
passed. `git diff --check`: pass. These are local results, not successor PR CI.

## DESIGN-INTENT REVIEW

Fresh reviewer read migration KB, thesis, learnings, the original finding and
all changed code/tests; separately inventoried callers and replayed controls.

- Intended behavior: operator audit and complete credential-bearing account backup, with no loss of login data.
- Delta: connection input no longer becomes report/export metadata; database/count/checksum/account payload and actual connection arguments remain unchanged.
- By-design conflict: none with D41, D56 or intentional protected account exports; the host-diagnostic tradeoff is explicit above.
- Conventional deviation: none introduced; privileged migration and JS/token policies are unchanged.
- Test limits: synthetic successful paths and actual temporary output, not live Mongo/ClickHouse, login, production retention or external consumers.

L1-PKG-02 file protection, connection defaults, driver exception content,
command-line/process exposure, historical copies, rotation and rollout remain
OPEN or unverified under their own evidence. No full-tool or protocol PASS.

## Next Concrete Repairs

After integration, continue PROTOCOL-01: SQL content logging (L1-G-01), overlapping
job traces (L1-J-01), frozen-install fallbacks and freshness/popup binding with
their serialized owners. Resolve schema/concurrency/revocation and backup
candidates with targeted proofs, not assumptions. Issuer/default provisioning,
artifact provenance, release evidence and model-diverse three-dry review remain
real gates. Coverage completion does not discharge any of these obligations.
