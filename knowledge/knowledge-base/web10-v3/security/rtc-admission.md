# One-Use RTC Admission

A signed-in user wants live peer connectivity without putting a reusable API
session into a signaling URL. The signaling service needs an authenticated
identity before registering the peer, not a promise to check it afterwards.

For example, Alice opens a messages connection. Her SDK exchanges the session
with the configured RTC service, which consults one configured API and returns
a short-lived ticket. Only that ticket enters the WebSocket URL.
The mechanism is generic signaling identity, not a social membership endpoint.

This describes `api/rtc/server.ts` `createRtcServer`,
`api/app/endpoints/system.py` `rtc_authorize`, and
`sdk/src/rtc/index.ts` `createRTC`. Paths are repository-root references.
See [credentials.md](credentials.md) for session custody and
[overview.md](overview.md) for the cryptographic issuer qualification.

## Exchange A Session For Admission

The SDK chooses the configured RTC host from `wapi.state.rtcServer`, not a
destination read out of a document. `initP2P` validates the host shape and label,
reads session metadata to calculate the expected ID, then requests a ticket.
ICE configuration is resolved before minting that ticket, immediately ahead
of constructing PeerJS; a slow `/ice` request must not use up its lifetime.

```http
POST /ticket
Content-Type: application/json

{"token":"<SESSION_JWT_PLACEHOLDER>","label":"messages"}
```

The RTC request body must have exactly two keys. `token` is a non-empty string
of at most 4096 characters; `label` matches `[A-Za-z0-9_-]{0,64}`.
The empty label is valid. The whole JSON parser also has a 4 KB bound, so the
character limit is not permission to exceed the aggregate body limit.

The SDK uses `credentials: 'omit'`, `redirect: 'error'`, and a ten-second
abort timeout. This prevents ambient cookie transport and credential replay
through an HTTP redirect. The configured RTC recipient still receives the JWT
and is therefore trusted with it; a ticket does not remove that trust.

RTC calls only `${CERTIFY_BASE_URL}/rtc/authorize`:

```json
{"token":"<SESSION_JWT_PLACEHOLDER>","label":"messages"}
```

`CERTIFY_BASE_URL` is mandatory and parsed as a fixed HTTP(S) origin.
Userinfo, a non-root path, query, fragment, or another protocol causes startup
failure. The service never chooses a verifier from an unsigned `provider`.
Its Axios call has a five-second timeout, no redirects, a 4096-byte response
limit, and accepts only HTTP 200.

The API response must be exactly an object containing one `peer_id` string.
RTC rejects empty IDs, IDs longer than 512 characters, and control characters.
Verifier failure or malformed output returns a generic 401 without logging
the Axios error object, which could retain the submitted session credential.

## Where The Identity Comes From

`rtc_authorize` first calls `certify(Token(token=...))`, then performs a verified
`decode_token(..., private_key=True)`. Local signing configuration, provider
match, and session expiry are checked; anonymous sessions are refused.
Malformed, forged, unsigned, expired, and wrong-provider sessions do not select
any outbound provider fetch in this path.

Provider, username, and site must be non-empty strings without whitespace.
An absent or empty site becomes `web10`; the label has its separate schema.
The ID is the four components joined with single spaces, with every dot
replaced by an underscore. An empty label leaves a trailing separator.

```text
provider.example alice app.example messages
becomes
provider_example alice app_example messages
```

The SDK `peerId` computes that same representation from unverified metadata
only to compare expectations. The API's verified response is the admission
authority. A mismatched `peer_id` in the ticket response is an SDK error,
not an invitation to adopt the returned identity silently.

This is not JWKS federation. The known symmetric HS256 issuer/configuration
gap remains outside this protocol. Do not restore unsigned provider selection
as a workaround for a remote session that the configured API cannot verify.

## Ticket Response And Scope

After successful verification, RTC generates 32 random bytes with
`node:crypto` `randomBytes`, encoded as unpadded base64url: 256 bits, 43 characters.
It stores the ticket with the exact verified peer ID and a deadline 30 seconds
after issuance in its process-local map.

```json
{
  "ticket": "<OPAQUE_TICKET_PLACEHOLDER>",
  "peer_id": "provider_example alice app_example messages",
  "expires_in": 30
}
```

The placeholder is illustrative, not a valid ticket. A real value must match
`[A-Za-z0-9_-]{43}`. Responses set `Cache-Control: no-store`.
`POST, OPTIONS` and `Content-Type` are exposed through wildcard CORS without
credentialed-cookie support. There is no ticket cookie.

A ticket grants one signaling admission for one identity. It does not grant
document reads, group permissions, or API authentication. It is not a JWT,
contains no independently decodable identity, and is not a session replacement.
Do not log it merely because its scope is smaller than the original JWT.

## Consume Before Upgrade

PeerJS still uses the query key named `token`, but its value is now the opaque
ticket. A representative URL has this shape, with encoded components:

```text
wss://rtc.example/peerjs?key=peerjs&id=<ENCODED_PEER_ID>&token=<OPAQUE_TICKET>
```

`WebSocketServer.verifyClient` checks the request before the RFC6455 upgrade.
It bounds the URL at 2048 characters and requires exactly one occurrence each
of `key`, `id`, and `token`; the key must be `peerjs`, ID at most 512 characters,
and ticket exactly the expected base64url shape.

For a structurally valid presentation, the map entry is deleted synchronously
before comparing identity and expiry. Wrong-ID use therefore burns the ticket.
Acceptance requires an entry, `now < expires`, exact ID equality, and no
already-active registration for that ID. At the deadline itself it is expired.
Malformed presentations fail closed but need not consume an unlooked-up entry.

Only an accepted presentation reaches upgrade, PeerJS registration, and the
socket's `OPEN` message. Missing tickets, session JWTs, wrong IDs, replays,
duplicate credential parameters, and expired tickets must reach none of those.
This is the essential repair over authentication after registration.

## Bound Work And Delivery

| Resource | Enforcement |
|---|---|
| Pending verifier calls | At most 64 |
| Ticket capacity | Stored tickets plus pending calls at most 4096 |
| Ticket body parser | 4 KB |
| Upstream verifier response | 4096 bytes |
| Signaling URL | 2048 characters |
| Peer ID | 512 characters |
| WebSocket signaling message | 64 KB |

Expired tickets are pruned on ticket issuance. Capacity refusal returns 503
without starting another verifier call. Parsing errors return a safe 400;
authorization denial returns a safe 401. These are resource bounds, not a
complete rate-limit or abuse-management policy.

The server sets `maxPayload` and also wraps socket message delivery. Bun's
WebSocket implementation ignores the former bound in the tested deployment
runtime; the explicit delivery guard closes oversized messages with code 1009
before PeerJS receives them. Preserve and test both layers when dependencies
or runtime versions change. Peer discovery is disabled.

## Reconnect And Logout

`initP2P` waits for the local peer's `open` event; a ten-second readiness timeout
destroys the connector and rejects rather than pretending signaling is ready.
Initialization errors before admission also reject.

After disconnection, the connector exchanges the current session for a fresh
ticket and replaces the PeerJS `options.token` before `reconnect`.
It never retries the consumed URL credential. Renewal failures retry with
backoff starting at one second and capped at 30 seconds, while the peer remains
disconnected. Concurrent renewal is guarded and successful renewal resets delay.

`destroy` marks the connector stopped, clears the timer, destroys the peer,
and clears channel maps and handlers. State checks after asynchronous work
prevent logout from resurrecting signaling. Social `src/data/p2p.ts` cleanup
invokes this teardown; `src/__tests__/data/p2p.test.ts` exercises that seam.

Ticket expiry is admission expiry, not ongoing session revocation. A socket
already admitted is not automatically disconnected after 30 seconds or when
its original JWT expires. There is no demonstrated periodic reauthorization
or global logout invalidation of every existing socket. Do not claim either.

## Operate The Cohort

`api/rtc/index.ts` passes `process.env.CERTIFY_BASE_URL` into the constructor
and listens on `PORT` or 80. Checked stack settings use internal API origins:

- `docker-compose.yml`: `http://api`.
- `e2e/docker-compose.yml`: `http://api`.
- `web10.app.yml`: `http://prod-api`.
- `ubuntu-deployment/docker-compose.ecosystem.yml`: `http://${STACK}-api`.

The server allows configured HTTP for trusted internal routing. That is not
permission for public plaintext signaling. The SDK requires HTTPS/WSS except
for deliberate insecure localhost, `*.localhost`, `127.0.0.1`, or `[::1]` use.
Production TLS/proxy behavior requires a deployment receipt of its own.

Tickets live in process memory: restart revokes outstanding tickets; another
replica cannot consume them. Replication needs issue/upgrade instance affinity
or a shared store with atomic one-use consumption. Neither is implemented by
the local map. Treat rolling restarts and reconnect storms accordingly.

Deploy API, RTC, SDK RTC code, public `wapi.js` copies, and the vanilla
`marketing/marketing-ui/public/docs/rtc.js` bundle as a compatible cohort.
`sdk/src/rtc/browser.ts` is the browser bundle entry. There is deliberately
no JWT signaling fallback: old clients fail rather than weakening admission.

This satisfies D60 by using a verified session identity and an opaque admission
primitive, not followers, profiles, or social tables in the node. The testing
receipt and the unclaimed browser/data-channel/proxy scopes are detailed in
[audit-runbook.md](audit-runbook.md).
