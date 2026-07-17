# web10 Protocol Specification

**Version:** 1.0.0-draft
**Status:** Draft — under active development

## 1. Overview

web10 is a protocol for **user-owned data** on the internet. Each user gets a
dedicated database collection; records are `{service, body}` documents. Apps are
stateless frontends that hold a **scoped, expiring token** and talk to a user's
collection over a tiny CRUD API. The data outlives any app.

### 1.1 Design Principles

- **Data ownership:** Users own their data. Apps are lenses, not platforms.
- **Statelessness:** Apps hold nothing but a scoped, expiring token.
- **Least privilege:** Every actor (app, agent, LLM) acts under a token with
  minimal scope.
- **Portability:** Data, algorithm, and identity move with the user across nodes.
- **Open protocol:** Self-hostable nodes; the reference implementation is one
  valid node, not the only one.

## 2. Data Model

### 2.1 User Collections

Each user gets one MongoDB collection named by their username. Every document
follows the envelope pattern:

```json
{
  "_id": "<ObjectId>",
  "service": "<service-name>",
  "body": {
    "<user-defined fields>": "..."
  }
}
```

- `service` identifies the logical service (e.g. `posts`, `inbox`, `services`).
- `body` contains the user's data. The API transforms between the wire format
  (body-only) and the storage format (envelope) via `to_gui`/`to_db`.

### 2.2 The Services Collection

The `services` service holds ACL (terms) records and the account record:

- **Star record** (`service: "*"`) — holds account data: username, password hash,
  phone, Stripe IDs, credit/space limits. Protected from CRUD modification.
- **Terms records** (`service: "<name>"`) — hold `whitelist` and `blacklist`
  arrays controlling who can perform CRUD actions on a service.
- **Services-terms record** (`service: "services"`) — controls who can modify
  other services' terms.

### 2.3 Field Prefixing (Security Boundary)

Queries and updates prefix user-controlled field names with `body.` so that
user input can never target the protected `service` field:

- `q_t(query, service)` — transforms a user query: adds `service` filter,
  prefixes field names with `body.`
- `u_t(update)` — transforms a user update: prefixes field names with `body.`
- `_id` is intentionally exempt: it passes through unprefixed so records can
  be addressed by id (update/delete convert `query._id` to an ObjectId).
- `$`-prefixed fields in queries are reserved for pagination (`$skip`, `$sort`,
  `$limit`) and are stripped from field-name matching.

## 3. Authentication

### 3.1 Token Format

Tokens are JWTs with the following payload:

```json
{
  "username": "<username>",
  "site": "<origin-domain>",
  "target": "<target-provider>",
  "provider": "<issuing-provider>",
  "expires": "<ISO-8601-timestamp>"
}
```

| Claim      | Description                                                        |
|------------|--------------------------------------------------------------------|
| `username` | The user this token represents                                     |
| `site`     | The origin domain of the requesting app                            |
| `target`   | The provider the token is addressed to                             |
| `provider` | The provider that issued (signed) this token                       |
| `expires`  | ISO-8601 timestamp after which the token is invalid                |

**Default algorithm:** HS256 (symmetric). Migration to RS256/EdDSA with JWKS
is planned for federation support (see §3.5).

### 3.2 Token Minting

`POST /web10token` — creates a new scoped token. Two flows:

1. **Password flow:** Submit `username`, `password`, `site`, `target`. The
   server authenticates the user and issues a token. The `site` must be in
   `CORS_SERVICE_MANAGERS`.

2. **Token-to-token flow:** Submit an existing certified token plus desired
   `username`, `site`, `target`. The server verifies the submission token and
   checks `can_mint` rules:
   - `username` must match the submission token's username
   - the submission token's `site` must be in `CORS_SERVICE_MANAGERS`, or the
     requested `site` must equal the submission token's site
   - `provider` must match (same-provider minting)

The minted token inherits the provider, gets a new expiry
(`TOKEN_EXPIRE_MINUTES`), and carries the requested scope.

### 3.3 Token Certification

`POST /certify` — verifies a token is valid, non-expired, and issued by this
provider. Checks:

1. Token is signed with the node's `PRIVATE_KEY`
2. `provider` matches `settings.PROVIDER`
3. `username` is present
4. `expires` is in the future (unless `username` is `"anon"`)

A `null` token body creates an anonymous token:
`{username: "anon", provider: PROVIDER, target: PROVIDER}`.

### 3.4 Authorization (is_permitted)

Before any CRUD operation, `is_permitted(token, username, service, action)` checks:

1. **Certification:** Token certifies with its provider (local or remote).
2. **Target:** Token's `target` matches this provider (or is `null` for
   owner-to-self access).
3. **Cross-origin:** Token's `username` is `"anon"`, or its `site` is in
   `CORS_SERVICE_MANAGERS` or listed in the service's `cross_origins`.
4. **Terms:** The service's terms record grants the requested action for the
   token's `(username, provider)` via whitelist/blacklist matching.

Whitelist/blacklist entries support regex matching on `username` and `provider`
fields. Actions: `create`, `read`, `update`, `delete`, or `all`.

### 3.5 Federation (Planned)

**Current state:** Remote providers are verified by calling their `/certify`
endpoint over HTTP. This is a known vulnerability (SSRF + spoofing).

**Target state:** Asymmetric signing (RS256/EdDSA). Each provider publishes a
public key at a well-known JWKS URL. Any provider verifies any token offline.
Migration plan: dual-verify (HS256 + RS256), then drop HS256.

## 4. CRUD API

All CRUD endpoints take the target user and service as path parameters and the
token as JSON body.

### 4.1 Create

```
POST /{user}/{service}
Body: { token, query: { <record-data> } }
```

Creates a record in `user`'s collection. `query` becomes the record's `body`.
Returns the created record with `_id`.

**Protection:** Cannot create a record with `service: "*"` (star duplication).

### 4.2 Read

```
PATCH /{user}/{service}
Body: { token, query: { <filter>, $skip?, $sort?, $limit? } }
```

Returns matching records (body-only, `_id` as string). PATCH is used instead of
GET because GET requests cannot carry a secure body.

**Pagination:**
- `$skip` — number of records to skip
- `$sort` — sort specification (e.g. `{created_at: -1}`)
- `$limit` — max records to return (0 = unlimited)

### 4.3 Update

```
PUT /{user}/{service}
Body: { token, query: { <filter> }, update: { $set: {...}, $inc: {...}, ... } }
```

Updates matching records. Returns `{matchedCount, modifiedCount}`.

**Protection:** Cannot update the star record (`service: "*"`) via CRUD.

**Supported operators:** `$set`, `$inc`, `$max`, `$currentDate`, `$unset`.

**Array pull:** include a top-level `"PULL": true` key in the update object;
`$unset` fields ending in a numeric array index are then re-applied as a
`$pull`, removing the element instead of leaving it `null`.

### 4.4 Delete

```
DELETE /{user}/{service}
Body: { token, query: { <filter> } }
```

Deletes matching records. Returns confirmation.

**Protection:** Cannot delete the star record via CRUD.

## 5. Star Record Protection

The star record (`service: "*"`) is the account record. It is protected from
CRUD operations by two mechanisms:

1. **`star_found()`** — blocks creating records with `service: "*"`
2. **`star_selected()`** — blocks updating/deleting records when the query
   matches the star record

These checks are enforced in `mongo.py` and cannot be bypassed by terms records.

## 6. Metering

Each CRUD operation increments `credits_spent` on the star record:

| Action    | Cost (credits)              |
|-----------|-----------------------------|
| create    | 0.000025                    |
| update    | 0.000025                    |
| read      | 0.000005                    |
| delete    | 0.000002                    |
| aggregate | 0.000005 per pipeline stage |

**Exemption:** read and delete on the `services` service are not charged and
skip the credit/space check. Create and update on `services` are metered
normally.

Credits are replenished monthly (`last_replenish` month check). Free tier gets
`FREE_CREDITS` (0.10) and `FREE_SPACE` (8 MB).

## 7. Error Responses

All errors return HTTP 401 with a `detail` message (except aggregate
pipeline validation, which returns HTTP 400). Error codes:

| Detail                                      | Meaning                              |
|---------------------------------------------|--------------------------------------|
| `incorrect username or password`            | Login failure                        |
| `incorrect token`                           | Token certification failed           |
| `crud access denied`                        | Terms check failed                   |
| `submitted token can't mint desired token`  | Mint rules violated                  |
| `can't modify the star service`             | Star protection (update/delete)      |
| `can't duplicate the star service`          | Star protection (create)             |
| `the user doesn't exist`                    | No star record found                 |
| `the user already exists`                   | Duplicate signup                     |
| `ran out of credits`                        | Credit limit exceeded                |
| `ran out of space`                          | Space limit exceeded                 |
| `please verify your phone number to do that.`| Phone verification required         |

## 8. Security Invariants

These invariants must hold for every node implementation:

- **I1.** A provider can cryptographically verify who issued any token,
  including other providers' tokens, without trusting the token's own claims.
- **I2.** Authorization decisions use only verified token data — never an
  unsigned decode.
- **I3.** A request can only touch the addressed user's collection. Cross-
  collection access is impossible by construction.
- **I4.** Private content is unreadable by the node operator (e2e encryption).
- **I5.** Every actor (app, agent, LLM) acts under a scoped, expiring,
  revocable token — least privilege, always.

## 9. Aggregate — the 5th verb

A read-only verb enabling server-side data aggregation with (nearly) the
full MongoDB query language:

```
POST /{user}/{service}/aggregate
Body: { token, pipeline: [ { <stage> }, ... ] }
```

(POST rather than GET for the same reason read uses PATCH: GET requests
cannot carry a secure body.)

**Permission:** terms treat aggregate as a `read` action.

**Sandbox (by structure, not rewriting):** the server prepends
`$match {service, body.service ≠ "*"}` → `$addFields body._id` (stringified)
→ `$replaceRoot` to `body`. The dev's pipeline runs on scoped, body-only
documents shaped exactly like read() results. The wrapper `service` field and
the star record are unreachable — scoping cannot be escaped by any stage.

**Stage allowlist:** `$match`, `$project`, `$group`, `$sort`, `$skip`,
`$limit`, `$unwind`, `$addFields`, `$set`, `$count`, `$facet`, `$bucket`,
`$bucketAuto`, `$sample`, `$sortByCount`, plus the full comparison/logical/
array operator language inside them. Any other stage is rejected.

**Operator denylist (rejected at any nesting depth, including `$facet`
sub-pipelines and `$group` accumulators):** `$where`, `$function`,
`$accumulator` (JS execution), `$lookup`, `$graphLookup`, `$unionWith`
(cross-collection read), `$out`, `$merge` (cross-collection write).

**Resource caps:** `maxTimeMS` (2000 ms), pipeline length (20 stages,
`$facet` sub-pipelines counted independently), `$limit`/result ceiling
(1000 docs), `allowDiskUse: false`.

**Metering:** charged per pipeline stage — `0.000005` credits × stage count
(minimum 1) — into the same `credits_spent` ledger as CRUD, gated by the same
credit/space check.

**Errors:** invalid pipelines return HTTP 400 —
`aggregation pipeline uses a stage or operator that isn't allowed` or
`aggregation pipeline exceeds a resource cap`. Validation happens before the
database is touched.

**SDK:** `wapi.aggregate(service, pipeline, username?, provider?, protocol?)`.
