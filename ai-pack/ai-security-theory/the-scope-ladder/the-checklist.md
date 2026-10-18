# The Checklist — the signature list

[← back to The Scope Ladder](./README.md)

The scan (at every level) checks each unit against this list. Two sources,
combined:

1. **The invariants** — the system's stated security guarantees (for web10,
   I1–I6 in `knowledge-base/web10-v3/security/overview.md`). A finding is "the
   code does not do what the invariant says it should."
2. **The signatures** — the patterns that show up in a *web application*: a
   Python/FastAPI + ClickHouse backend, a TypeScript/React + WebRTC frontend, and
   a user-facing query engine.

> **Scope note — this is a web app, not a C program.** Memory-safety threats
> (buffer overflow, use-after-free, format string, ROP, integer overflow) do **not
> apply** to Python/JS — the interpreter is trusted. **Don't chase them; they are
> noise here.** The real injection surface in this stack is *wider* than C's, not
> narrower: the language makes it easy to eval, deserialize, shell-out, and build
> SQL. The signatures below are cut for that.

A scanner is only as good as its checklist. Keep this list **live**: every time a
real finding is found that the list did not catch, add the pattern. The list is
the accumulated memory of every scan.

## Organized by threat class

The checklist is grouped by **threat class**, not as a flat list. This matters for
two reasons: (1) at every level you check *every* class for the unit, not just the
ones that are convenient; (2) the "obvious gap" prompt in the KB-orient is
literally *"is there a threat class missing from this list?"* — and you can only
ask that if the list is organized by class.

### 1. Access control (I1, I2, I3, I5) — the crown jewels

- **Unsigned decode used for an auth decision** — a JWT/base64 decode that skips
  signature verification, then feeds an authorization check. *(web10 B-3:
  `decode_token(..., private_key=False)`.)*
- **Trusting the token's own claims** — an auth decision that reads `issuer` /
  `provider` / `role` from the payload instead of verifying it. *(I1.)*
- **Missing expiry check** — a token accepted without checking `expires`.
- **Missing auth gate** — a mutation or a read of non-public data with no token
  check on the path.
- **Read path missing the ownership filter** — a query that can return another
  principal's data because the `author_key` / group-membership filter is absent or
  bypassable. *(I3 — the crown jewel.)*
- **Over-broad grant / mass assignment** — a permission/role that grants more than
  the action needs, **or** the client can set a field it shouldn't be able to (a
  CRUD-everything API is a mass-assignment surface: "does this endpoint write only
  the fields the caller is allowed to set?").
- **No revocation** — a grant/token that cannot be revoked (I5: scoped, expiring,
  *revocable*).

### 2. Injection (the Python/JS surface — not the C surface)

- **SQL / query injection** — user input flowing into a ClickHouse query by string
  building instead of a parameterized/bound path. *(The backend's real injection
  surface.)*
- **The query engine boundary** — caller-supplied SQL reaching a raw table. The
  safe-query wall is the I3 boundary for caller SQL; a bypass here is a crown-jewel
  break. *(This is a first-class high-value target, not a footnote — see below.)*
- **Template / render injection** — user content reaching a template engine or an
  HTML render without the single locked sanitizer. *(Jinja2 SSTI if templates are
  used; the `rehype-sanitize` choke point for the render.)*
- **Deserialization** — `pickle` / `yaml.load` / `JSON.parse` of untrusted data
  reaching code execution or object injection. *(Python-specific, real.)*
- **Shell / command injection** — user input reaching `subprocess` / `os.system` /
  a shell. *(Rare in this stack; check, don't assume.)*
- **Path traversal** — a user-controlled path segment reaching the filesystem.

### 3. Boundaries & transport (I5)

- **`postMessage` with no origin check** — accepting a token or command from any
  `e.origin`. *(web10 S-1: `authListen` accepted a token with no origin gate.)*
- **Token in a URL** — a credential in a query string (logged by proxies, in
  history, in referrers) instead of a header/body.
- **Cookie flag gaps** — a session cookie missing `Secure` / `SameSite` where the
  transport warrants it. *(web10 S-5.)*
- **CORS load-bearing assumption unpinned** — `allow_origins=["*"]` defended only
  by "the token is in the body" with no test pinning that assumption. *(web10 B-5.)*
- **SSRF** — a node that fetches a user-influenced URL (imports, the YouTube
  importer, link previews, federation) can be pointed at internal services or the
  cloud metadata endpoint (`169.254.169.254`). Check every outbound fetch for a
  user-controlled destination.

### 4. Availability / DoS — out of scope (a separate track)

**This is not a security invariant gap.** Availability (the system stays up and
usable) is *reliability / DoS resistance* — a different discipline from security
(confidentiality + integrity). The invariants I1–I6 deliberately do not cover it,
and that is correct, not a hole: a security theory that guarantees data isolation
is not the same as one that guarantees uptime. **DoS is its own track.** Listed here
only so a scanner recognizes the patterns and *routes them to the reliability track*
instead of treating them as security findings:

- **Unbounded query** — a user query (the query engine!) that can scan the whole
  table / join the whole dataset. Rate limiting is not a bound; the *query itself*
  needs a cost bound.
- **Unbounded fan-out** — federation: a client fanning out to N nodes where N is
  attacker-influenced.
- **Unbounded upload / payload** — a media upload or request body with no size cap.
- **ReDoS** — a regex (user-influenced or not) with catastrophic backtracking.
- **Unbounded pagination / group size** — a read that returns "all" when it should
  page.

*(If DoS becomes a real concern for the project, it gets its own invariants + its
own gauntlet — it does not get folded into I1–I6.)*

### 5. Data lifecycle

- **Sensitive data persisted where it should be ephemeral** — a one-use ticket,
  OTP, or nonce stored long-lived or re-usable.
- **TOCTOU / race on a security check** — a check-then-act on a shared resource
  (the one-use RTC ticket, the OTP, the auth gate) where a second request can slip
  in between the check and the act. *(The one-use ticket is a textbook TOCTOU
  target.)*
- **Tombstone / dedup gap on a security table** — a stale row (removed member,
  resolved request) that a read path fails to filter, so a revoked grant still
  reads as active.

### 6. Bad practices / hygiene (L1 — check and clean as you go)

Not "hackable from the outside" in the active-attack sense — **straight-up
practices that compromise the security posture by convention.** Each is a *local*
property (this line, this config, this default), so it is an **L1** finding. The
rule that keeps this from becoming noise: **catch and clean it at L1 as you go — a
bad practice you fix when you find it never stacks into a bigger problem.** (If you
let them accumulate, a few *can* compound into an exploit path none had alone; the
fix is simply not to let them accumulate.)

**Weighted for an open-source project** (web10 is public — the code is already
readable by everyone, so the priorities shift):

- **Secret in public source — HIGH.** A key, token, password, or signing secret as
  a literal / module default instead of env-injected. In a *closed* project this is
  a leak to an attacker who breaks in; in an **open-source** project it is a leak to
  *everyone, immediately*. This is the #1 hygiene finding here. *(web10 B-2: the
  JWT signing key + Stripe/Twilio/ClickHouse creds sat in `settings.py` source.)*
- **Secret in a build artifact** — a key/credential baked into a bundle, image, or
  published package (not just source — the *shipped* artifact). Same world-leak
  logic as above.
- **Secret in a log line** — a token, credential, or sensitive body field written to
  a log. *(web10 B-4: `middleware.py` logged full request/response bodies.)*
- **Weak / default / hardcoded credentials** — a default password, a `password`/
  `password123` in a fixture that ships, a shared test cred that leaked into prod
  config.
- **Insecure default** — a security-relevant setting that defaults to the open value
  (CORS `*`, verification off, auth disabled) rather than the closed one.
- **Long-lived secret with no rotation** — a key/token that never rotates (a leaked
  one is leaked *forever*).
- **Over-broad permission / mode** — a file, bucket, or port that is more open than
  it needs to be (world-readable secret, public bucket, exposed admin port).
- **Debug / verbose / stack-trace in prod — LOW here.** In a *closed* project this
  leaks internals; in an **open-source** project the code is public anyway, so it is
  mostly a nuisance, not a leak. *(Deprioritized for web10 — check it, don't fret
  over it.)*

**Close condition:** most of these have a trivial "exploit" (the secret *is* the
exploit — read the source, here's the key) and close red→green like any finding.
The pure-hygiene ones (insecure default, over-broad mode, no rotation) have no clean
exploit — they close with a **static check** (a lint rule / config assertion / "grep
for the pattern returns nothing"), not a red→green test. Either way, it is recorded
and cleaned at L1.

## The render choke point (XSS, stated as a checkable claim)

The XSS question in this stack is not "is there unsanitized render?" — it is a
single, checkable claim: **does *every* render path route through the one locked
sanitizer?** For web10 that is `rehype-sanitize` (the D85 render choke). The scan
enumerates every place user content reaches the DOM and asserts it goes through
the choke. A render path that bypasses it is a finding. This is an **L3/L4**
claim (you need the whole render surface to verify "every path"), not an L1 line.

## The query engine (a first-class target, not a footnote)

The query engine (`w.query` + the safe-query boundary) is where **user-supplied SQL
meets the data**. It is simultaneously an **I3** target (can caller SQL reach a raw
table?), an **injection** target, and a **DoS** target (unbounded query). It gets
extra scrutiny at every level it appears in, and it is the natural home for a
dedicated gauntlet (see `knowledge-base/security/scans/late-stage/` — the
query-engine gauntlet). If a scan is unsure whether the query engine is safe, the
answer is "run the gauntlet," not "it's probably fine."

## The invariants (web10, I1–I6)

| Invariant | The check the scanner runs |
|---|---|
| **I1** | Does every token verify its issuer cryptographically, never trusting the payload? |
| **I2** | Does every auth decision use only verified token data — no unsigned decode? |
| **I3** | Does every read path carry the ownership / group-membership filter, including the reserved principal-class rows? |
| **I4** | Is node-readability by design respected (no accidental operator-blindness, no over-exposure beyond terms)? |
| **I5** | Does every actor act under a scoped, expiring, revocable token enforced by a contract? |
| **I6** | Does the cross-node boundary stay the HTTP API + verified token — no cross-store query, no remote data as control? |

## Which level uses which part of the list

- **L1 file-scan** — every class, applied line by line within the file.
- **L2 call-graph-scan** — every class, applied to the file + its **direct** edges
  (a pattern that only fires when you can see the direct callee / the boundary /
  the data flow one hop out).
- **L3 service-scan** — the **invariants + the multi-hop classes** (the taint trace
  across the service, the render choke point "every path" claim, the query engine
  as a system).
- **L4 project-wide-scan** — the **invariants as a system** (does the token model
  hold across nodes? do the boundaries compose? does the deploy coupling preserve
  the guarantee?).

## Keeping the list honest

- **A finding the list missed = a list edit.** Same PR as the fix, or a follow-up
  docs PR. The list grows with every scan.
- **A pattern that fires constantly with no real finding = noise.** Demote it or
  tighten the match. A checklist that screams on everything stops getting read.
- **A whole class missing = the "obvious gap."** If a C+I threat class (supply
  chain, the client-side / browser-hostile surface, …) has no signatures, the
  KB-orient should raise it.
- **The list is per-repo in the KB, the *shape* of a list is portable.** This doc
  is the template; a repo's live list lives with its security record (e.g.
  `knowledge-base/security/`).
