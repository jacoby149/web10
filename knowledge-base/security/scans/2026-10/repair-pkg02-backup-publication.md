# L1-PKG-02 Backup Publication

01.11.2026; base `0918a7409141e2b42b3ffa81e9ff585550c3c5ad` plus local
extractor repair. Author and separate reviewer: `openrouter/openai/gpt-6.1-sol`.
**Local source repair only. Not merged, deployed, or protocol L1 PASS.**

## Intent And Scope

Phase 0's account manifest is the only external password-hash backup. Preserve
its complete hashes, PII, JSON schema, count/checksum and read-only Mongo behavior;
keep credentials out of diagnostics, but not out of the protected backup.
Orientation read the packaging receipt, migration intent, learnings, strategy,
plan/lane/changelog and existing extraction/URI controls. PKG-01 URI omission
already exists; PKG-02 file protection remains separate. D41 node readability
does not authorize readable credential-backup files. No live services or data.

Recession: `open(path, "w")` still follows links, truncates destinations and uses
environment-dependent creation mode. Gap: checking a pathname before opening
would not prevent a competing final destination; exclusive publication is needed.
Scope is file-local extractor output and its real filesystem tests, not an L2
campaign or a complete host/storage audit.

## Source Repair

`api/tools/extract_accounts.py::_publish_manifest` stages with same-directory
`tempfile.mkstemp` (private creation mode `0600`, exclusive random name), writes
UTF-8 JSON, flushes, file-fsyncs and closes before `os.link` publication. A final
file or symlink already present causes refusal, not replacement. The finally
block removes only the tool-owned temporary name; it never removes the final
destination. A supported POSIX filesystem and trusted directory are required.

`main` maps output OSError to exit 1 and fixed diagnostics, not exception content
or false success. Cleanup failure after publication also returns 1; a complete
final backup and private staging hard link may remain. Its warning says so.
Incomplete extraction/repo guard/explicit override/stdout remain unchanged.

## Repro And Verification

Tests execute the actual CLI with synthetic Mongo records and real disposable
filesystem paths outside the repository. No permission changes to existing user
files, no production credentials, network, destructive live test or DB writes.

Initial nine-case baseline: **8 failed, 1 passed**. These are not eight exploits:

- Actual umask `022` produces `0644`, not private `0600` output.
- Existing regular output, symlink sentinel and dangling symlink are accepted
  for writing instead of refused; these are real filesystem behaviors.
- Injected write failure writes a partial payload and raises uncaught OSError.
- Flush/fsync/link patches are not called by baseline code: those failures pin
  absent operations, not successful fault injection into baseline operations.
- Stdout is the passing legitimate-behavior control.

Reviewer independently replayed the same 8-fail/1-pass subset by loading the
base Git source in memory. Final 13 protection controls cover the above plus
private staging-before-publication, a competing destination, cleanup failure and
the repo guard/explicit override. Positive manifests retain full hashes/checksum.

Commands from `api/`:

```sh
uv run --frozen pytest tests/test_extract_accounts_protection.py tests/test_extract_accounts.py tests/test_mongo_connection_output.py -q
uv run --frozen pytest -q --tb=short --disable-warnings
uv run --frozen ruff check .
uv run --frozen ruff format --check .
```

**45 focused tests pass; 1,420 API tests plus four subtests pass; lint/format
pass (109 files formatted); `git diff --check` passes.** Parent reran full suite.
Code/test delta: 255 changed lines, including the 215-line new test file.

## Fresh Review

Separate same-model reviewer ran the 45 focused tests, inspected Python 3.12.6
tempfile's `O_EXCL`/`0600` implementation and independently probed publication,
existing/dangling destinations, fdopen/fsync/link errors on disposable storage.
No blocking findings. Review required separating real filesystem red evidence
from the absent-operation baseline controls above.

DESIGN-INTENT REVIEW: intent is complete loss-avoiding credential backup; delta
is private staging/no-clobber publication and nonzero safe output errors; no
by-design conflict (hashes remain exportable); privileged direct-store extraction
and operator-provided encryption remain intentional; target filesystem/ACL,
process termination/close errors/power loss and connected migration/login remain
untested intent. Same-model review is not diverse three-dry sign-off.

## Acceptance And Open Gates

Accepted locally on 01.11.2026: reruns require fresh filenames; there is no
overwrite override. Unsupported hard-link filesystems fail closed. This keeps
the only existing backup intact instead of silently replacing it. A cleanup
error may obscure a preceding error, but no exception details leak and no final
backup is deleted. No claim that fsync alone gives directory-entry durability.

Trusted access-controlled ancestors, encryption, ACLs, same-UID/root protection,
process/host crashes and deployed filesystem behavior remain operational gates.
The existing realpath repo guard's ancestor-substitution race is not repaired.
If parent paths become attacker-writable, reassess the whole pathname boundary;
this is not a substitute for provisioning secure storage. CI, deployment/history,
required diverse review and protocol L1 remain OPEN. No commit or PR created.
