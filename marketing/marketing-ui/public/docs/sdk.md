# web10 SDK

The web10 SDK (`wapi.js`) is the JavaScript library for building apps on a web10 node. It handles authentication, scoped token management, and CRUD operations against the node's data layer.

## Install

```bash
npm install web10-npm
```

Or via CDN:

```html
<script src="https://unpkg.com/web10-npm/dist/wapi.js"></script>
```

## Quick start

```javascript
import { wapiInit } from 'web10-npm'

const wapi = wapiInit('https://auth.web10.app')

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

## Future: typed SDK rewrite

A TypeScript rewrite (C2 in the lane queue) is in progress: native fetch (no axios), full types for the protocol, ESM + tree-shakeable dist, and peerjs/RTC as an optional subpath. The current SDK remains fully functional and supported.

## Source

The SDK source lives in [`sdk/`](https://github.com/jacoby149/web10/tree/dev/sdk) in this repository.