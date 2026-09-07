# Scaffolding

**Who this is for:** you — a developer starting a new web10 app. Two
starting points: the **CLI** (generates a project) and the **demo apps**
(runnable references on this site).

## The SDK first

Every web10 app is built on the same SDK — `wapi.js`. Two ways to load it:

- **Browser (IIFE):** the script attaches `window.web10` —
  `createV3Client`, `openAuthPortal`, `authListen`, `readTokenCookie`, and
  the rest. This is what the demo apps use.
- **npm:** `web10-npm` — `createV3Client` + types, for server-side or
  bundled clients.

```js
const w = window.web10.createV3Client({ apiOrigin: 'https://api.web10.app' })
```

The full surface: [SDK Guide](/docs/sdk).

## The CLI

`web10-cli` scaffolds a starter app from the command line. It lives in the
web10 monorepo (`marketing/web10-cli/`) and is published to npm:

```bash
npx web10-cli create
```

It asks three things:

1. **Framework** — Vanilla JS + HTML + CSS, or React
2. **Template** — a starter app shape (Todo App, Notes App)
3. **Folder name** — where your app lives

What you get: a working auth flow (login via the auth portal), at least one
service round-trip (create + read a record), and the consent screen on first
run. Full details: [CLI Quickstart](/docs/cli-quickstart).

## The demo apps

The demos on this site are **reference implementations** — each one is a
small, complete app that exercises one part of the protocol against a real
node. They're the fastest way to see a pattern done right: read the page,
then read its `script.js` (every step is logged).

| Demo | What it shows you |
|---|---|
| [Hello](/docs/hello/) | The minimal app: auth portal, a contract, one create + read. Start here. |
| [Notes](/docs/notes/) | CRUD in a private group — the "your data" pattern. |
| [Query](/docs/query/) | The flexible read (`w.query`) live — the query playground. |
| [Messages](/docs/messages/) | P2P messaging over WebRTC data channels. |
| [Groups](/docs/groups/) | Creating groups, roles, members, and posting to them. |
| [Media](/docs/media/) | Presigned upload → confirm → read-back; video → HLS transcode → adaptive playback. |
| [Feed](/docs/feed/) | The discover board read + engagement, the way the social app does it. |
| [Sharing](/docs/sharing/) | Blocking and sharing pauses — the "KB with teeth" anti-tests. |

**Which one first?**

- Building your first app → **Hello** (it's ~200 lines and the canonical
  auth + contract + CRUD flow).
- You need media → **Media** (the full presigned + HLS flow).
- You need the query engine → **Query** (five runnable examples).
- You need groups/roles → **Groups**.

## Pointing your app at a node

Everything keys off two origins:

- **`apiOrigin`** — the node's API host (e.g. `https://api.web10.app`).
  `createV3Client({ apiOrigin })`.
- **The auth origin** — the authenticator (e.g. `https://auth.web10.app`).
  `openAuthPortal(authOrigin)` / `contractRequest(contracts, authOrigin)`.

For a self-hosted node, both are your node's hosts. The token's `provider`
claim tells you which node you're on — the demos derive group ids from it
rather than hardcoding.

## The shape of a web10 app

Every app, small or large, is the same five moves:

1. **Create the client** — `createV3Client({ apiOrigin })`.
2. **Sign the user in** — `openAuthPortal` + `authListen` (the token lands
   in a cookie; return visits restore it).
3. **Request your contract** — `contractRequest` with the services you need
   (the user approves once).
4. **Ensure your groups** — create/join the groups your app reads and
   writes (idempotent — re-sending on every login is safe).
5. **Do CRUD** — `create` / `read` / `update` / `delete`, or `query` for the
   fancy stuff.

That's the whole architecture. The [Hello demo](/docs/hello/) is those five
moves, in order, with comments.
