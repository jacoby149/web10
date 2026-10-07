# Credentials Are Not Diagnostic Data

An operator needs to see why a request failed without turning the diagnostic
store into a second login vault. A password echoed into a validation error is
still a password; truncating it to four kilobytes does not improve matters.

This document describes the API middleware repair made during the October
2026 security work. It covers one concrete sink, not every logger in web10.
See [hardening-2026-10.md](hardening-2026-10.md) for the repair receipt and
[audit-runbook.md](audit-runbook.md) for exposure handling.

## The Original Exposure

`api/app/middleware.py` `log_requests` buffered request and response bodies,
truncated their text, and inserted that text into ClickHouse `logs`.
Credentials could arrive through either side:

- Normal authenticated requests carry `token` in JSON.
- Login and recovery requests carry passwords or temporary credentials.
- Login responses carry a newly issued session token.
- Admin responses can contain configuration secrets.
- Validation responses can echo submitted credentials in `detail[].input`.
- Error messages can repeat a credential outside its original field.

Moving credentials out of URLs without repairing this sink would merely move
the leak into a different log column. Both boundaries have to be repaired.

## The Implemented Flow

The middleware still captures the real response and preserves the useful
sequence of request, outcome, and latency. Sanitization happens on a separate
representation, never on the bytes sent to the caller.

1. Read the request body and obtain the response from the route.
2. Buffer the response bytes, as the existing middleware already did.
3. Parse complete JSON bodies before truncating anything.
4. Collect string values beneath recognized credential fields on BOTH sides.
5. Build an escaped literal replacement pattern, longest values first.
6. Recursively redact sensitive fields and occurrences of collected values.
7. Remove validation `input` values and sanitize error detail/metadata.
8. Truncate the sanitized body representations for storage.
9. Insert the sanitized row; return the original response bytes/status/headers.

Collection from both sides matters. A newly issued response credential may be
echoed elsewhere in the response, or in a request value supplied by the test.
Redacting only the field named `token` would miss those secondary copies.

## Recognized Fields

`SECRET_FIELDS` is the executable list. Names are normalized by lowercasing
and removing non-alphanumeric characters, so `new_password`, `newPassword`,
and `new-password` match the same rule.

The current list covers:

- Session, access, refresh, identity, verification, and admission tokens.
- Password, password hash, new password, and `new_pass` variants.
- Credential/credentials, secret, private key, and client secret.
- API/access/secret keys and auth/authorization/authentication fields.

Sensitive dict/list values are replaced as fields, and string leaves beneath
them are collected to suppress echoes. Validation `input` is suppressed even
when a field name is not recognized. Safe fields remain useful: method, route,
status, timing, origin, response shape, and non-secret error classification.

`_extract_user_key` uses unsigned JWT metadata for log attribution. It is not
cryptographic evidence that this actor made the request, and must never become
an authorization decision or the sole evidence in an incident.

## Failure Must Not Break Delivery

Non-JSON bodies are logged as `[non-JSON body omitted]`, not decoded into a
possibly credential-bearing string. Excessive nesting can exceed Python's
recursive traversal budget; the middleware safely omits the body diagnostics
rather than failing the response or logging partially sanitized data.

The regression fixture returns the original deeply nested response bytes and
asserts that the synthetic credential does not appear in captured log rows.
This is a useful positive control: confidentiality and HTTP delivery must both
survive the sanitizer's refusal to inspect a pathological body.

The parser/traversal still processes complete buffered bodies. This change is
not a general request-size limit, streaming-response redesign, or complete
denial-of-service policy.

## What This Does Not Protect

This is field-and-echo redaction, not universal secret detection. A new secret
under an unknown name, a free-form string with no recognized credential source,
encoded/partial echoes, another service's logs, or a vendor's diagnostics may
need a separate rule. Review new credential shapes when adding endpoints.

It does not currently sanitize every SDK error. `Web10Error.details` keeps raw
API response text, and the social app's diagnostic reporter forwards strings
without a corresponding credential boundary. Those sinks remain open findings.
Likewise, an authenticator message sender or logger is not covered merely
because API middleware now redacts its own ClickHouse insertion.

This also does not implement D56 content masking. Telemetry remains enabled;
content-blind recording and content-free event conventions have their own
specification. Credential redaction is not permission to record private content.

## Verification And Operations

`api/tests/test_log_redaction.py` drives middleware with synthetic credentials,
nested structures, response-issued credentials, validation errors, raw bodies,
truncation boundaries, and excessive nesting. Tests inspect captured rows AND
assert unchanged response bytes/status/headers. Run from `api/`:

```sh
uv run pytest tests/test_log_redaction.py -v
uv run ruff check app/middleware.py tests/test_log_redaction.py
```

Passing these fixtures proves the exercised middleware behavior, not that old
ClickHouse rows, proxy logs, backups, exports, or screenshots contain no secrets.
No historical records were purged and no credentials were rotated by this repair.
Any cleanup/revocation operation needs separate approval and a scoped receipt;
follow [audit-runbook.md](audit-runbook.md) rather than deleting evidence casually.
