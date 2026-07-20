# web10 SDK

Build apps that talk to a web10 node. One collection per user, a tiny CRUD API, scoped tokens.

## What you get

A web10 node exposes a per-user MongoDB collection through a RESTful CRUD API. Your app holds a scoped, expiring JWT and reads or writes the user's data. The data outlives any app. You own the collection.

## The current SDK — wapi.js

Today, the legacy SDK lives at `sdk/` and publishes as the `web10-npm` package. It works: it handles auth, CRUD, service management, and aggregate queries. It is untyped JavaScript built on axios.

**This is the SDK that runs in production today.** The demo apps on this site (Hello, Notes) use it.

### Install

```bash
npm install web10-npm
```

Or via CDN:

```html
<script src="https://unpkg.com/web10-npm/dist/wapi.js"></script>
```

### Quick start

```javascript
import { wapiInit } from 'web10-npm'

const wapi = wapiInit('https://auth.web10.app')

// Request a service
wapi.SMROnReady([{
  service: 'my-app',
  cross_origins: ['your-domain.com'],
}], [])

// Open the auth portal on button click
loginBtn.onclick = wapi.openAuthPortal

// Listen for the user to log in
wapi.authListen(() => {
  const token = wapi.readToken()
  console.log(`Logged in as ${token.username}@${token.provider}`)

  // Create a record
  wapi.create('my-service', { text: 'hello web10' })
    .then(r => console.log('created', r.data))

  // Read records
  wapi.read('my-service', {})
    .then(r => console.log('records', r.data))
})
```

See the [Hello demo](/docs/hello) and [Notes demo](/docs/notes) for runnable examples.

## API overview

### Initialization

`wapiInit(authUrl, appStores?, rtcServer?)` — returns a wapi instance bound to the given auth portal. `appStores` and `rtcServer` are optional.

### Authentication

| Method | Description |
|---|---|
| `wapi.isSignedIn()` | Returns whether the user is authenticated |
| `wapi.openAuthPortal()` | Opens the web10 auth popup |
| `wapi.authListen(callback)` | Calls `callback` when the user logs in |
| `wapi.signOut()` | Clears the session |
| `wapi.readToken()` | Returns the current JWT payload, or `null` |
| `wapi.getTieredToken(site, target)` | Mints a scoped token for a specific site/target |

### CRUD

Each method returns an axios promise resolving to `{ data: T[] }`.

| Method | Description |
|---|---|
| `wapi.create(service, body, username?, provider?)` | Insert a record |
| `wapi.read(service, query, username?, provider?)` | Query records |
| `wapi.update(service, query, update, username?, provider?)` | Update matching records |
| `wapi.delete(service, query, username?, provider?)` | Delete matching records |

Query pagination uses `$sort`, `$skip`, and `$limit`:

```javascript
wapi.read('posts', { $sort: { _id: -1 }, $limit: 20 })
```

### Aggregate

The 5th verb — server-side aggregation pipelines (read-only, sandboxed):

```javascript
wapi.aggregate('posts', [
  { $match: { type: 'photo' } },
  { $group: { _id: '$author', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
])
```

### Service management

`wapi.SMROnReady(sirs, scrs)` — registers service initialization requests (SIRs) and service change requests (SCRs). The node calls back when terms are accepted.

## NPM package

The package is published as `web10-npm` on npm:

[![npm version](https://img.shields.io/npm/v/web10-npm)](https://www.npmjs.com/package/web10-npm)

Published automatically on every `v*` tag push (see `cd.yml`).

## The next SDK — C2

A typed, modern rewrite is in progress (lane C2). It will bring:

- **TypeScript** — full types for records, queries, terms, and tokens. `read<T>(service, query): Promise<T[]>`.
- **Native fetch** — no axios dependency. Zero required deps.
- **Tree-shakeable** — ESM + types. RTC/WebRTC as an optional subpath export.
- **Modern auth** — `login()` wraps the popup/oauth dance into a single promise.
- **Docs from types** — TypeDoc-generated API reference.

When C2 lands, the docs here will point to it as the primary SDK. The legacy wapi.js will remain available for backward compatibility.

## Core concepts

### Services

A service is a named namespace inside a user's collection. Apps declare services they need via Service Initialization Requests (SIRs). The user accepts or denies them in the consent portal.

### Scoped tokens

Every actor — app, agent, LLM — acts under a scoped, expiring, revocable token. A token carries `username`, `site`, `target`, `provider`, and `expires`. The `certify` endpoint verifies tokens; `is_permitted` checks terms records to authorize actions.

### Terms

Terms records in the `services` collection define what each token may do. Users can modify terms at any time in the consent portal. Revoke a token and the app loses access immediately.

## Resources

- [Protocol Spec](/docs/protocol-spec) — the full API contract
- [Conventions](/docs/conventions) — schema conventions for posts, media, contacts
- [CLI Quickstart](/docs/cli-quickstart) — scaffold a new web10 app with the CLI

## Source

The SDK source lives in [`sdk/`](https://github.com/jacoby149/web10/tree/dev/sdk) in this repository.