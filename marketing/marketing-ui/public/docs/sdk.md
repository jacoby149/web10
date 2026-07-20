# web10 SDK

Build apps that talk to a web10 node. One collection per user, a tiny CRUD API, scoped tokens.

## What you get

A web10 node exposes a per-user MongoDB collection through a RESTful CRUD API. Your app holds a scoped, expiring JWT and reads or writes the user's data. The data outlives any app. You own the collection.

## The current SDK — wapi.js

Today, the legacy SDK lives at `sdk/` and publishes as the `web10-npm` package. It works: it handles auth, CRUD, service management, and aggregate queries. It is untyped JavaScript built on axios.

**This is the SDK that runs in production today.** The demo apps on this site (Hello, Notes) use it.

### Quick start (legacy wapi.js)

```js
// Initialize against your node
const wapi = wapiInit("https://auth.web10.app")

// Request a service
wapi.SMROnReady([{
  service: "my-app",
  cross_origins: ["your-domain.com"],
}], [])

// Auth flow
authButton.onclick = wapi.openAuthPortal
wapi.authListen(() => {
  // Logged in — token is stored
  const token = wapi.readToken()
})

// CRUD
wapi.create("my-app", { text: "hello" })
wapi.read("my-app", {})
wapi.update("my-app", { _id: "..." }, { $set: { text: "updated" } })
wapi.delete("my-app", { _id: "..." })

// Aggregate (read-only, sandboxed)
wapi.aggregate("my-app", [
  { $group: { _id: "$type", count: { $sum: 1 } } },
])
```

See the [Hello demo](/docs/hello) and [Notes demo](/docs/notes) for runnable examples.

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