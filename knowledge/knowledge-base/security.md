# Security

## Invariants

- I1: Forged tokens are rejected
- I2: No authorization on unsigned decode
- I3: Cross-collection access is impossible
- I4: Scoped tokens enforce their boundaries
- I5: LLM tokens are read-only on posts, never on DMs/contacts

## Auth Flow

JWT-based with RS256 for federation. Tokens carry provider, user, and scope claims.

## CORS

Origins derived from `CORS_SERVICE_MANAGERS` + `PROVIDER` settings. No wildcard `*`.

## Provider URL Validation

Scheme allowlist, private-IP/localhost SSRF guard, length cap, 10s fetch timeout.