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

### 4. Availability / DoS — the class the invariants don't name

The invariants I1–I6 are all *confidentiality + integrity*. **Availability is not
in the list** — which is exactly the "obvious gap" the KB-orient should surface.
Check it anyway:

- **Unbounded query** — a user query (the query engine!) that can scan the whole
  table / join the whole dataset. Rate limiting is not a bound; the *query itself*
  needs a cost bound.
- **Unbounded fan-out** — federation: a client fanning out to N nodes where N is
  attacker-influenced.
- **Unbounded upload / payload** — a media upload or request body with no size cap.
- **ReDoS** — a regex (user-influenced or not) with catastrophic backtracking.
- **Unbounded pagination / group size** — a read that returns "all" when it should
  page.

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

### 6. Secrets & config

- **Secret in source** — a key, token, password, or signing secret as a
  module-level default or literal, instead of env-injected. *(web10 B-2: the JWT
  signing key + Stripe/Twilio/ClickHouse creds sat in `settings.py` source.)*
- **Secret in a log line** — a token, credential, or sensitive body field written
  to a log. *(web10 B-4: `middleware.py` logged full request/response bodies.)*
- **Insecure default** — a security-relevant setting that defaults to the open
  value (CORS `*`, debug on, verification off) rather than the closed one.

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
  the guarantee?) + the cross-service availability (unbounded fan-out).

## Keeping the list honest

- **A finding the list missed = a list edit.** Same PR as the fix, or a follow-up
  docs PR. The list grows with every scan.
- **A pattern that fires constantly with no real finding = noise.** Demote it or
  tighten the match. A checklist that screams on everything stops getting read.
- **A whole class missing = the "obvious gap."** If a threat class (availability,
  supply chain, …) has no signatures, the KB-orient should raise it.
- **The list is per-repo in the KB, the *shape* of a list is portable.** This doc
  is the template; a repo's live list lives with its ledger (e.g.
  `knowledge-base/security/`).
