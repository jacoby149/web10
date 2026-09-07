# App Contracts

**Who this is for:** you — a developer building an app that reads or writes
a user's web10 data.

## What an app contract is

An app contract answers one question: **"What can this app do with my
data?"** It's a per-app grant of per-service, per-operation permissions. One
contract per app origin — the app declares every service it touches in one
place, and the user approves or denies once.

```json
{
  "allowed_origin": "https://music.web10.com",
  "permissions": {
    "posts": ["readAll", "create"],
    "playlists": ["readAll", "create", "updateOwn", "deleteOwn"],
    "comments": ["readAll"]
  }
}
```

Services are infinite — `posts`, `playlists`, `notes`, anything you invent.
They're just labels. Apps are the constraint: one contract per app, no
per-service hand-waving.

**The permission vocabulary:** `readAll`, `create`, `updateOwn`, `updateAll`,
`deleteOwn`, `deleteAll`, `hideAll`. (Group-management ops like `assignRoles`
live on group roles, not app contracts.)

## How your app gets a contract

Apps can't create contracts for themselves. The flow is **consent through the
authenticator** — an App Contract Request (ACR):

1. Your app opens the authenticator popup.
2. Your app sends the contract request: the origin + the permissions it
   needs.
3. The user sees exactly what's being asked — and if a contract already
   exists, the **diff**: added permissions green, removed red.
4. The user approves or denies. One ACR covers all your services.

In the SDK, the unified contract-request flow (ACR + group requests in one
batch):

```ts
w.contractRequest(
  [
    {
      kind: 'app',
      app_origin: 'https://music.web10.com',
      permissions: { posts: ['readAll', 'create'] },
    },
  ],
  'https://auth.web10.app',
  (response) => {
    // response: { status: 'approved' | 'denied' | 'error', errors? }
  },
)
```

The authenticator is the **only writer** of app contracts — the
`app-contracts/add` and `app-contracts/revoke` endpoints reject any origin
that isn't the authenticator. If your app tries to grant itself access, it
gets a 403. That's the design.

## The return run: zero taps

First run pays the consent once. Every run after: the login popup checks
"signed in? contract granted?" and, when both are yes, hands back the token
and closes itself — **the user taps nothing**. A revoked contract is the one
case that re-prompts: "I revoked it" should mean "ask me again."

## How enforcement works

Every document operation checks two things, in order:

1. **App contract** — does this origin have an active contract for this
   user, granting this operation on this service? (The outer wall.)
2. **Group role** — does the user's effective role in the target group grant
   the operation? (The inner permission.)

Both must pass. The contract gets your app through the door; the group
decides what the user sees inside.

Two nuances worth knowing:

- **The check keys on the `Origin` header.** A same-origin or direct API
  call (no `Origin`) skips the contract check — the contract gate is for
  cross-origin web apps.
- **Origin is curation, not a wall (D64).** A browser enforces `Origin`; a
  scripted client forges it freely. The real boundary is the user's token +
  the user's contract (user-centric). Don't build security on origin
  gating — build it on the token.

## The user's controls (the kill switch)

The user can revoke any contract, any time, in the authenticator:

- **Revoke one app** — it loses access immediately.
- **Revoke all** — no website touches the user's data. Ever.

From the SDK (authenticator-side):

```ts
await w.revokeAppContract('https://music.web10.com')  // one app
await w.revokeAppContract()                            // the kill switch
```

Your app should handle the "contract revoked" 403 gracefully — the demo
apps show a "fix access" state that re-opens the consent flow instead of
dying.

## Listing and managing

```ts
// What contracts does this user have?
const contracts = await w.listAppContracts()
// → [ { allowed_origin, permissions } ]
```

`addAppContract(origin, permissions)` exists too — but it's
authenticator-origin-gated, so it's for the consent UI, not your app.

## The two trust layers, side by side

| | App contract | Group role |
|---|---|---|
| Answers | "What can this **app** do?" | "Who can see my **content**?" |
| Keyed by | Origin (one per app) | Group (one per group) |
| Shape | `{ service: [ops] }` | `{ service: [ops] }` per role |
| Consent | A one-time grant (ACR) | An action (create / join / update) |
| Revocation | Kill switch in the authenticator | Leave the group / revoke the role |

Same permission language, two trust layers. The full model:
[Protocol Spec — Permissions](/docs/protocol-spec).
