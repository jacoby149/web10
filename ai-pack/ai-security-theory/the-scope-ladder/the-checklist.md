# The Checklist — the signature list

[← back to The Scope Ladder](./README.md)

The scan (at every level) checks each unit against this list. Two sources,
combined:

1. **The invariants** — the system's stated security guarantees (for web10,
   I1–I6 in `knowledge-base/web10-v3/security/overview.md`). A finding is "the
   code does not do what the invariant says it should."
2. **The basic basics** — the signature patterns that show up in almost every
   unhardened codebase. These are the "Norton signatures."

A scanner is only as good as its checklist. Keep this list **live**: every time a
real finding is found that the list did not catch, add the pattern. The list is
the accumulated memory of every scan.

## The basic basics (signature patterns)

Each is a pattern you can match line-by-line without architectural judgment.

### Secrets & config
- **Secret in source** — a key, token, password, or signing secret as a
  module-level default or literal, instead of env-injected. *(web10 B-2: the JWT
  signing key + Stripe/Twilio/ClickHouse creds sat in `settings.py` source.)*
- **Secret in a log line** — a token, credential, or sensitive body field written
  to a log. *(web10 B-4: `middleware.py` logged full request/response bodies.)*
- **Insecure default** — a security-relevant setting that defaults to the open
  value (CORS `*`, debug on, verification off) rather than the closed one.

### Tokens & auth (I1, I2, I5)
- **Unsigned decode used for an auth decision** — a JWT/base64 decode that skips
  signature verification, then feeds an authorization check. *(web10 B-3:
  `decode_token(..., private_key=False)`.)*
- **Trusting the token's own claims** — an auth decision that reads `issuer` /
  `provider` / `role` from the payload instead of verifying it. *(I1.)*
- **Missing expiry check** — a token accepted without checking `expires`.
- **Missing auth gate** — a mutation or a read of non-public data with no token
  check on the path.
- **Over-broad grant** — a permission/role that grants more than the action needs
  (the intersection with current authority is not taken).

### Boundaries & transport (I3, I5)
- **Read path missing the ownership filter** — a query that can return another
  principal's data because the `author_key` / group-membership filter is absent
  or bypassable. *(I3 — the crown jewel.)*
- **Caller-controlled input reaching a raw store** — user input flowing into a
  query/template/eval without the safe boundary. *(I3 / the query-engine wall.)*
- **`postMessage` with no origin check** — accepting a token or command from any
  `e.origin`. *(web10 S-1: `authListen` accepted a token with no origin gate.)*
- **Token in a URL** — a credential in a query string (logged by proxies, in
  history, in referrers) instead of a header/body.
- **Cookie flag gaps** — a session cookie missing `Secure` / `SameSite` where the
  transport warrants it. *(web10 S-5.)*
- **CORS load-bearing assumption unpinned** — `allow_origins=["*"]` defended only
  by "the token is in the body" with no test pinning that assumption. *(web10 B-5.)*

### Injection & output
- **Injection** — string-built SQL / shell / path / template from untrusted input.
- **Unsanitized render** — user content reaching an HTML render without the single
  locked sanitizer choke point. *(The XSS surface — web10's D85 render choke.)*
- **Path traversal** — a user-controlled path segment reaching the filesystem.

### Data lifecycle
- **Sensitive data persisted where it should be ephemeral** — a one-use ticket,
  OTP, or nonce stored long-lived or re-usable.
- **No revocation** — a grant/token that cannot be revoked (I5: scoped, expiring,
  *revocable*).
- **Tombstone / dedup gap on a security table** — a stale row (removed member,
  resolved request) that a read path fails to filter, so a revoked grant still
  reads as active.

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

- **L1 file-scan** — the whole "basic basics" list, applied line by line within the
  file.
- **L2 immediate-neighborhood-scan** — the same list, but applied to the file *and
  its neighborhood* (a pattern that only fires when you can see the callee / the
  boundary / the data flow).
- **L3 project-wide-scan** — the **invariants**, applied to the *architecture*
  (does the token model hold across nodes? do the boundaries compose? does the
  deploy coupling preserve the guarantee?). The basic basics are mostly done by
  L1/L2; L3 is where the invariants get checked as a *system*, not a line.

## Keeping the list honest

- **A finding the list missed = a list edit.** Same PR as the fix, or a follow-up
  docs PR. The list grows with every scan.
- **A pattern that fires constantly with no real finding = noise.** Demote it or
  tighten the match. A checklist that screams on everything stops getting read.
- **The list is per-repo in the KB, the *shape* of a list is portable.** This doc
  is the template; a repo's live list lives with its ledger (e.g.
  `knowledge-base/security/`).
