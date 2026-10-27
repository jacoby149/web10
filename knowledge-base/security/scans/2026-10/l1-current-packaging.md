# Current API Packaging And Migration L1

Integration: fresh `l1-current-edge-review.md` confirms URI output but keeps backup filesystem protection conditional/unverified.

Date: 2026-10-27. Model: `openai/gpt-6.1-sol`. Reviewer: OpenCode.
Source pin: `f7aabdb26346752141f46f19c393dbadfd25ddd2`, verified HEAD.
Status: exhaustive bounded L1 source/declaration review; OPEN concerns, not PASS.
Only this receipt is written. No fixes, runtime/test/central-document edits,
commit, push, package installation, image build, database connection or destructive
operation was performed. Existing dirty files were left alone.

## Manifest And Coverage

Counts include comments and blanks. Logical lines mean newline-delimited lines
including an unterminated last line, not executable LOC. All eight blobs end in
newline, so logical counts equal newline counts. No missing or overlapping ranges.
The seven-file subtotal is exactly 684; the lock adds 1,733, total **2,417**.

| Exact path | Read range, inclusive | Newlines | Logical lines |
|---|---|---:|---:|
| `api/.env_example` | 1-2, credential value suppressed | 2 | 2 |
| `api/Dockerfile` | 1-19 | 19 | 19 |
| `api/pyproject.toml` | 1-72 | 72 | 72 |
| `api/tools/__init__.py` | 1-1 | 1 | 1 |
| `api/tools/audit_mongo.py` | 1-240 | 240 | 240 |
| `api/tools/extract_accounts.py` | 1-218 | 218 | 218 |
| `api/tools/migrate_accounts.py` | 1-132 | 132 | 132 |
| `api/uv.lock` | 1-1733 | 1733 | 1733 |
| Total | eight complete files | 2417 | 2417 |

Every source line was reviewed, including docstrings, comments, CLI guards and
EOF. Lock reads initially hit the output cap; follow-up bounded reads covered
250-900 and 1115-1733. Full final lock coverage is 1-249, 250-429, 430-609,
610-789, 790-900, 901-1114, 1115-1294, 1295-1402, 1403-1572, 1573-1733.
A compact intermediate rendering is not substituted for these full reads.
`git diff --quiet <pin> -- <all eight paths>` returned zero: working-file reads
match the pin despite unrelated worktree changes.

Noncredential blob SHA-256 identifiers:

```text
api/Dockerfile a3f24185acf330d0dd6a43580af01def1c8fb996a7d3b16324d56576d1fdd87a
api/pyproject.toml 9b1cf9a801372f2ba6516cfe4ca47c2c50e3256eeed62f38884f7ddb969375d3
api/uv.lock 334acc0dc2d2b83561cffbe09fa39825dcea4a1a336fa3d6912f62637c45cd5b
api/tools/__init__.py 048de9dd8cbfd3e626da60a060a6e1c22256d5a49ae179afea307a655263f643
api/tools/audit_mongo.py a59c7c8da3747bd32b6e37fac2a75a229ec20129ad8344fd8a4608ef16538eed
api/tools/extract_accounts.py 65e1b6264f3a9a33a3f5003970424ed91b9c3698ef9a978244e97bd734d24d6f
api/tools/migrate_accounts.py f1264f2819e1db314cee959f54ae7f337175eb98ef2e1e2cdeaf1cfc87840096
```

## Orientation And Intent

Read `AGENTS.md` completely; browsed `knowledge-base/strategy/`; scanned recent
changelog entries; checked plan/lane L1-007 status (still open, not redone as a
merged task). Read security theory README, all six classes of its
`the-scope-ladder/the-checklist.md`, the design-intent gate, thesis, security
learnings, backend inventory and node-config. Also read the account migration
spec, `knowledge-base/web10-v3/migration/v2-to-v3-accounts.md`.
These orientation reads used the working documentation; changelog, learnings and
queues already contained concurrent uncommitted B-8 repair notes. They are context,
not proof that that repair is present at this source pin. No current settings
runtime review or B-8 closure is included here.

Intent: package a generic FastAPI node with reproducible Python dependency
selection and ffmpeg support; retain standalone operator tools for auditing old
Mongo data, extracting account credentials to protected backup storage and
carrying existing password hashes into v3 without losing logins. Extraction is
read-only **against Mongo**, not a promise that it does no local output. Migration
is intentionally privileged operator work, not a remote endpoint needing a JWT
gate at each function. Storage-service idempotency/enrollment claims require
callee evidence beyond this L1.

The thesis/D41 permits node readability, not arbitrary public credential copies.
Node-config intentionally permits operator-managed settings and baseline-admin
bootstrap. Neither choice excuses shared defaults or credential-bearing logs.
No E2E, token-transport, admin-policy or telemetry redesign is proposed.

Orient results: onboarding retains B-2/defaults, issuer trust and supply-chain
debt; recession does not infer closure from uncommitted B-8 notes; the obvious
gap here is operator backup/output handling and the build trust surface, not a
new remote account-migration API. Dependency declarations assume external code
is trustworthy; locks do not establish that assumption.

## Findings And Bounded Concerns

### B-2 Correspondence: Credential Example And Inherited Defaults

`api/.env_example:1-2` contains a nonempty quoted `INFISICAL` credential-setting
literal, not an empty assignment. Its value is withheld everywhere in this
receipt; no request or validity check was attempted. Treat it as source-secret
hygiene under existing [B-2](l1-settings.md),
not a new proven live-secret incident. Scope cannot establish whether the literal
is usable, revoked, dummy or consumed by current code.

Both Mongo tools have fixed unauthenticated/plain-scheme private-host defaults
(`audit_mongo.py:34-39`, `extract_accounts.py:175-176`), inherited operator/bootstrap
configuration risk corresponding to B-2, not proof that a reachable database
accepts unauthenticated connections. Migration delegates environment/default
selection to `app.v3.services.clickhouse` (`migrate_accounts.py:21-29,76-83`);
the existing B-2 settings finding remains linked, not newly validated here.
Preserve intentional local operation and explicit overrides in any later repair.

### L1-PKG-01: Raw Mongo URI Credential Output

Confirmed local credential-output hygiene, conditional on an operator supplying
a credential-bearing URI. `audit_mongo.py:48-56` prints the complete URI after
ping; successful execution with a synthetic client reproduced credential bytes
in captured stdout (P1). This is a real source-to-output flow, not merely a
manufactured exception. No application exception was needed.

`extract_accounts.py:126-134,204-211` also stores the unmodified URI in manifest
metadata and, without `--out`, emits it on stdout (P2). Account hashes in this
manifest are intended export data, not a separate unexpected disclosure finding;
Mongo connection credentials are unnecessary extra credential material. Treat
both locations as one output-handling repair class, separate from the settings
B-8 CLI sink. Actual credentials, invocation, log access/retention and historical
exposure are unknown. No remote exfiltration or production compromise is shown.

Closure gate for a later small repair: repeat synthetic credential-bearing and
credential-free URI controls; retain useful host/database/count diagnostics and
complete protected account backup, without persisting or printing URI userinfo
or other secret URI parameters. No repair or red-to-green result here.

### L1-PKG-02: Backup File Protection Depends On The Environment

Confirmed local hygiene gap at `extract_accounts.py:204-208`: plain
`open(path, "w")`, no restrictive creation mode/opener, exclusive-create,
no-follow or atomic replacement. P6 intercepts the actual call in memory and
confirms only path and `w` are provided. Standard POSIX creation starts from
0666 filtered by umask (e.g. 022 yields 0644); existing-file permissions are not
tightened, and `w` follows links and truncates. This is conditional filesystem
semantics, **not a disk-based exploit replay or observed production file mode**.
No file, symlink, permissions or umask was changed in this scan.

The KB explicitly requires encrypted, access-controlled backup storage. The tool
warns and rejects repository-contained output by default (P3), but does not
enforce encrypted storage or safe final-file access. Exploitation needs a
permissive/readable destination or attacker-controlled path seam, plus local
access. A protected directory, restrictive umask and trusted path can mitigate;
actual operator configuration is unverified. Realpath guard versus later open
also leaves a conditional path-substitution race; no race was attempted.
Repository guard failure/no repo warns and proceeds (`150-170`); `--allow-repo`
is an explicit dangerous operator override, not a remotely reachable bypass.

Future gate: isolated synthetic filesystem regressions for secure new-file mode,
existing destinations, links, interrupted output and preservation of the only
backup. No destructive test is authorized by this receipt.

### Migration Input Integrity: Operator Handoff, Not Remote Auth Bypass

`migrate_accounts.py:32-46,72-83,94-107` parses JSON without schema, count or
checksum verification and forwards selected records to `ch.migrate_user`.
P8 demonstrates incorrect count/checksum and duplicate usernames accepted through
the real CLI body into an inert sink; `--user` keeps the last duplicate whereas
`--all` retains both. The extraction SHA-256 is a fingerprint, not an authenticated
signature and not automatic tamper protection. P7 also shows string `false`
becoming boolean true at `80,82`; genuine JSON booleans from the extractor do
not trigger that conversion bug. The extractor has the same truthiness issue
for malformed source verification fields (`86,88`).

This is an account-migration integrity/validation concern requiring trusted
operator input or corruption/tampering of its protected manifest. It does not
prove an unauthenticated remote mutation, database SQL injection, overwrite of
an existing account, recovery takeover or actual enrollment. Actual service
validation and duplicate/idempotency effects are L2 debt. Do not add a remote
endpoint gate to a standalone migration function as a supposed fix.

### Other Local Observations

- Audit `76-83,218`: collection truth testing can be incompatible with PyMongo;
  collection lookup also depends on an `apps` name while selecting a nested
  namespace. External-driver behavior was not executed. This is operational
  correctness debt, not proven disclosure.
- Audit `95-102` materializes whole collections and inspects legacy stars only;
  the migration KB already acknowledges its current-shape undercount. Sampling,
  empty/negative limits and misleading totals are reliability/correctness debt.
- Extraction `93-117` sorts rows and rejects missing username/hash (P4/P5), but
  does not cross-check collection name against username or reject duplicates.
  Malformed body types can fail extraction. Snapshot consistency across Mongo
  reads is not guaranteed. Preserve current-first and legacy fallback support.
- Migration `_mask` (`49-53`) emits seven leading characters; P9 proves an entire
  malformed short hash survives. Normal bcrypt prefix disclosure is not a whole
  password hash disclosure. Dry-run prints phone/email intentionally (`114-121`),
  so terminal/log protection remains necessary; stdout is not automatically safe.
- Importing the real migration module imports the real storage service before
  argument parsing. P7 establishes only helper-level dry-run avoidance of the
  sink, not that real module startup cannot initialize/connect to storage.
- Extraction closes its client in a finally around extraction (`192-195`), but
  ping precedes that block; audit closes only on successful completion (`235`).
  These cleanup gaps are operational debt, not an added C+I finding.

## All Six Classes

| Checklist class | Applied to all eight files; result and boundary |
|---|---|
| 1. Access control | No JWT decode/issuer/expiry decision or HTTP route in these tools. Mongo reads and migration sink are operator-authorized primitives. Manifest validation is bounded above; I3 service gates, I1/I2/I5 token handling and I6 federation cannot be certified by this scope. |
| 2. Injection | Mongo filter dictionaries are fixed; JSON load is data parsing, not eval/pickle. The sole subprocess uses fixed argv for git, no shell interpolation. Operator-selected paths/URIs are intentional authority; output-file link/race concerns remain conditional. No local SQL/HTML/template/eval sink; downstream query binding is unreviewed. |
| 3. Boundaries/transport | Private-host plain Mongo defaults, raw URI metadata/stdout and CLI argument exposure checked. No browser cookies, CORS or postMessage here. Operator-selected connection target is not remote-user SSRF. TLS/auth policy and actual network reachability were not tested. |
| 4. Availability/DoS | Whole-collection list, whole-manifest parse, no batching/cost cap, malformed input and failure cleanup considered. These are reliability debt, explicitly outside I1-I6 security closure. No load or exhaustion test. |
| 5. Data lifecycle | Credential backup retention/encryption delegated to operator; plain file write, checksum non-enforcement, duplicate selection, read consistency, metadata persistence and conditional realpath/open race reviewed. No automatic deletion is requested: preserve the only backup. Actual DB idempotency/tombstones/races not tested. |
| 6. Hygiene/supply chain | B-2 correspondence, raw URI output and permissive file-creation contract above. Docker has no USER declaration, a mutable base tag, unversioned apt ffmpeg and default dev-group sync. Inherited user, deployed privilege and package vulnerability are unknown. Frozen lock and hashes are declaration-integrity evidence only. |

## Packaging And Lock Checks

Docker `1-19`: fixed mirrored GHCR base tag (not digest), apt update/install with
no recommends and list cleanup, fixed workdir, narrowly scoped copies of project
metadata and `app/` only, frozen sync, and exec-form Gunicorn command bound on
port 80 with four Uvicorn workers. No `COPY .`, explicit secret ARG/ENV, shell
interpolated user input or disabling TLS is declared. No `USER` means inherited
base behavior, not independently proven root. Tools and `.env_example` are not
copied by this Dockerfile, but app defaults can be inherited in the copied app.
The comment about no third-party runtime pull is not a build-network guarantee:
apt and Python dependency installation still depend on external inputs. Startup
`uv run` has no explicit `--frozen`/`--no-sync`; actual sync/network behavior and
external configuration were not executed.

Pyproject `1-72`: Python >=3.12; 13 direct dependencies including sqlglot for the
query boundary, direct bcrypt, PyJWT, storage, Twilio and HTTP components; optional
test dependencies and default dev tooling including PyMongo; Ruff rules and
pytest settings. Broad lower bounds do not by themselves prove a vulnerable
installed version. Default dev sync includes test/lint/migration dependencies
in the image unless overridden. No arbitrary custom index, build hook or shell
script is declared here.

Lock `1-1733`: version 1/revision 3, Python split markers, **63 package records**
(62 registry packages plus local virtual project), **1,088 artifact declarations**.
Offline stdlib TOML parsing checked every registry source, every artifact URL,
SHA-256 syntax, positive size and every ordinary dependency-name reference.
All registry sources are HTTPS PyPI; artifact URLs are HTTPS on
`files.pythonhosted.org`, with no userinfo/query/fragment. All artifact hash fields
match `sha256:` plus 64 hex characters. The virtual root is `web10-api` at `.`.
Root direct-dependency count matches pyproject (13); root test/dev declarations
were read alongside their metadata. Markers/extras/platform wheels and source
archives were included, not excluded as generated noise.

No download/hash verification, advisory/CVE database audit, dependency source
review, upstream provenance, malicious-package analysis, resolver execution,
build reproducibility, ffmpeg/OS/base-image safety or deployed-version assurance
is claimed. Hash syntax is not artifact authenticity; frozen selection is not
external-code safety. These remain explicit supply-chain limits.

## Runnable Offline Proofs

Executed with system Python **3.12.6**, `-I -B` (isolated imports, no bytecode).
The proof loads committed source using git, removes only the two external import
forms, retains function bodies, uses inert database/ClickHouse substitutes and
captures all potentially sensitive output in memory. No real app, PyMongo or
dependency implementation is imported. These substitutes bound the evidence;
they do not establish behavior of external services. All canaries below are
synthetic; do not substitute real credentials or print captured buffers.

Run from the repository root:

```sh
python3 -I -B - <<'PY'
import ast, subprocess, types, io, contextlib, sys, json
H = "f7aabdb26346752141f46f19c393dbadfd25ddd2"
def load(name):
    p = "api/tools/" + name + ".py"
    t = ast.parse(subprocess.check_output(["git", "show", H + ":" + p], text=True))
    t.body = [n for n in t.body
              if not (isinstance(n, ast.Import) and any(a.name == "pymongo" for a in n.names))
              and not (isinstance(n, ast.ImportFrom) and n.module == "app.v3.services")]
    g = {"__name__": "offline_probe"}
    exec(compile(t, p, "exec"), g)
    return g
a, e, m = [load(n) for n in ("audit_mongo", "extract_accounts", "migrate_accounts")]
class DB:
    def list_collection_names(self): return []
class Client:
    admin = types.SimpleNamespace(command=lambda *x: None)
    def __getitem__(self, k): return DB()
    def close(self): pass
fake = types.SimpleNamespace(MongoClient=lambda *x, **kw: Client())
a["pymongo"] = e["pymongo"] = fake
secret = "synthetic-" + "credential-canary"
uri = "mongodb://operator:" + secret + "@db.invalid/"
out, err, old = io.StringIO(), io.StringIO(), sys.argv
sys.argv = ["audit", "--uri", uri]
try:
    with contextlib.redirect_stdout(out): assert a["main"]() == 0
finally:
    sys.argv = old
assert secret in out.getvalue()
print("P1 audit URI credential captured; value withheld")
with contextlib.redirect_stdout(out := io.StringIO()), contextlib.redirect_stderr(err):
    assert e["main"](["--uri", uri]) == 0
assert secret in json.loads(out.getvalue())["source"]["uri"]
print("P2 extract URI credential retained in manifest/stdout; value withheld")
e["_git_repo_root"] = lambda: "/synthetic-repo"
with contextlib.redirect_stderr(err):
    try:
        e["_refuse_repo_output"]("/synthetic-repo/private.json")
        raise AssertionError("guard did not refuse")
    except SystemExit as ex: assert ex.code == 2
print("P3 repo output guard refuses a contained path")
class Col:
    def __init__(self, current=None, legacy=None): self.current, self.legacy = current, legacy
    def find_one(self, q): return self.current if q == e["_CURRENT_STAR_QUERY"] else self.legacy
r = {"username": "synthetic-user", "hashed_password": "synthetic-hash", "verified": False}
assert e["extract_user"](Col(current={"body": r}))["star_shape"] == "current"
assert e["extract_user"](Col(legacy=r))["star_shape"] == "legacy"
assert e["extract_user"](Col()) is None
print("P4 current/legacy/orphan extraction controls satisfied")
class BadDB:
    def list_collection_names(self): return ["bad"]
    def __getitem__(self, k): return Col(current={"body": {"username": "bad"}})
rows, issues = e["extract_all"](BadDB())
assert not rows and len(issues) == 1
print("P5 missing hash excluded and issue produced")
class Sink(io.StringIO):
    def close(self): pass
sink, calls = Sink(), []
def inert_open(*args, **kwargs):
    calls.append((args, kwargs))
    return sink
e["open"] = inert_open
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
    assert e["main"](["--uri", uri, "--out", "/synthetic-out.json"]) == 0
assert calls == [(("/synthetic-out.json", "w"), {})]
assert secret in sink.getvalue()
print("P6 output open uses plain w, no explicit restrictive opener; no disk written")
writes = []
m["ch"] = types.SimpleNamespace(migrate_user=lambda **kw: writes.append(kw) or
    {"username": kw["username"], "created": True, "enrolled": True})
row = {"username": "synthetic-user", "password_hash": "synthetic-hash", "phone_verified": "false"}
m["migrate_one"](row, True)
assert not writes
m["migrate_one"](row, False)
assert writes[-1]["phone_verified"] is True
print("P7 dry-run helper avoids sink; string false coerces to True in non-dry helper")
manifest = {"count": 999, "sha256": "invalid", "users":
    [row, dict(row, password_hash="different-synthetic-hash")]}
selected, error = m["select_targets"](manifest, user="synthetic-user")
assert not error and selected[0]["password_hash"] == "different-synthetic-hash"
selected, error = m["select_targets"](manifest, all_users=True)
assert not error and len(selected) == 2
m["load_manifest"] = lambda path: manifest
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
    assert m["main"](["--manifest", "in-memory", "--all"]) == 0
assert len(writes) == 3
print("P8 wrong count/checksum and duplicate rows accepted through main into inert sink")
assert m["_mask"]("abcdefg") == "abcdefg..."
print("P9 short malformed hash entirely retained by prefix mask; value withheld")
print("9 probe groups completed; DB/network/filesystem writes=0; real app/dependency imports=0")
PY
```

Observed output was exactly the nine P1-P9 labels above plus the final completion
line; all assertions held, exit 0. No credential or captured payload values were
printed. P6 is an intercepted API-contract check, not an actual filesystem mode
test. P8 is inert-sink forwarding, not persisted corruption. The script is proof
of current behavior, not a repair regression gate or a full test-suite run.

Reproduce the nonsecret declaration checks separately (no network/install):

```sh
python3 -I -B - <<'PY'
import subprocess, tomllib, urllib.parse, re
H = "f7aabdb26346752141f46f19c393dbadfd25ddd2"
def blob(p): return subprocess.check_output(["git", "show", H + ":" + p], text=True)
expected = {"api/.env_example": 2, "api/Dockerfile": 19, "api/pyproject.toml": 72,
    "api/tools/__init__.py": 1, "api/tools/audit_mongo.py": 240,
    "api/tools/extract_accounts.py": 218, "api/tools/migrate_accounts.py": 132,
    "api/uv.lock": 1733}
for p, n in expected.items():
    s = blob(p)
    assert s.count("\n") == n == len(s.splitlines()) and s.endswith("\n")
assert sum(expected.values()) == 2417
ps = tomllib.loads(blob("api/uv.lock"))["package"]
arts = []
for p in ps:
    if "registry" in p["source"]:
        assert p["source"]["registry"] == "https://pypi.org/simple"
    else:
        assert p["source"] == {"virtual": "."} and p["name"] == "web10-api"
    for a in ([p["sdist"]] if "sdist" in p else []) + p.get("wheels", []):
        u = urllib.parse.urlsplit(a["url"])
        assert u.scheme == "https" and u.hostname == "files.pythonhosted.org"
        assert not (u.username or u.password or u.query or u.fragment)
        assert re.fullmatch("sha256:[0-9a-f]{64}", a["hash"]) and a["size"] > 0
        arts.append(a)
names = {p["name"] for p in ps}
for p in ps:
    for d in p.get("dependencies", []): assert d["name"] in names
root = next(p for p in ps if p["name"] == "web10-api")
project = tomllib.loads(blob("api/pyproject.toml"))
assert len(root["dependencies"]) == len(project["project"]["dependencies"]) == 13
assert len(ps) == 63 and len(arts) == 1088
print("8 files / 2417 logical lines; 63 packages / 1088 artifact declarations")
PY
```

Both embedded proof blocks were extracted from this receipt and executed again
with Python `-I -B`; both exited zero. The second printed exactly
`8 files / 2417 logical lines; 63 packages / 1088 artifact declarations`.

## Design-Intent Assessment And Limits

DESIGN-INTENT REVIEW (author assessment only, not fresh independent sign-off):

- Intended behavior: generic node packaging plus protected, loss-avoiding account
  extraction and operator-controlled pilot/full migration, preserving hashes.
- Changed behavior: none; only this local receipt is added. Operators, users and
  apps receive no runtime change.
- By-design conflict: none introduced. D41 readability, baseline admins, explicit
  operator configuration and intentional credential backup remain respected.
- Conventional deviation: intentional privileged direct-store migration and
  credential export are not remote unauthenticated access. Plain output-file
  protection and redundant URI credentials are not justified by node readability.
- Tests cover delta: no runtime delta. Nine offline probe groups establish only
  the stated local flows; no runtime suite/build/integration test was run.
- Untested intent risk: no code change to break product behavior. Future output
  hardening must preserve complete backups, supported stars, environment overrides,
  pilot selection and useful diagnostics; future validation must not silently
  discard legitimate accounts. Actual migration/login/recovery/storage and deployed
  consumers remain untested, not accepted as safe by this receipt.
- KB write-back: deliberately not performed; central records/queues/learnings and
  changelog remain coordinator-owned and read-only under this request.

No independent/model-diverse reviewer, three-dry convergence, L2 call graph,
L3 service closure, L4 protocol/project assessment, live credential validation,
production data/backup/log inspection, real filesystem exploit, dependency audit,
database writes, deployment remediation, rotation or finding closure is claimed.
Coverage applies only to these eight pinned files. Tests/app source/RTC/root
orchestration and deployment are outside this denominator. Existing B-2 remains
OPEN. This receipt must not be promoted to security PASS or whole-backend coverage.
