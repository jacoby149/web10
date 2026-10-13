# Stage 1 — The Demo Apps (D58, parallel)

**Fully parallel — one workspace per demo.** Each demo owns its own dir under
`marketing/marketing-ui/public/docs/`, so the lanes never touch each other. N
workspaces run N demos at once.

**Spec:** `knowledge-base/web10-v3/groups/access.md` + D58 + the per-demo
notes below.
**Lane:** `d58-demos` in `parallel-execution.md`.
**Gate:** **Stage 0 (the backend) is merged.** The demos are the reference
implementation (D46) — they run the real SDK consent flow, so green demos
prove the backend end-to-end before Stage 2 (the social app, the integration
test) builds on it.

## The common pattern (what every demo does)

Two changes, same shape in each demo:

1. **Adopt the per-service role-map shape.** The demo's `createGroup(...)` call
   passes roles in the old `{services, permissions}` shape. Convert each role
   to `{permissions: {service: [ops]}}` (the `services` array is gone; `'*'`
   and `'group'` are reserved service keys). The SDK passes roles through
   unchanged — this is a data-shape change in the demo's `script.js`, not an
   SDK change.
2. **Drive a public/private + identity fork in the demo's e2e.** The demo's
   e2e (`e2e/tests/<demo>.spec.ts`) gets a fork that: sets the group's face
   (name + description via the identity write endpoint, Stage 0 Item 3),
   grants / revokes the `anyone` read role (public ↔ private), and asserts a
   **bystander's** read (a non-member, signed out) sees the identity but posts
   only when the group is public. This is the D58 fork each demo proves
   through the real consent popup.

**`groups-demo` is the reference** — it has the richest `ROLE_PRESETS`
(create / join / roles / invite). Do it first (or use it as the template); the
other demos are lighter versions of the same change.

## The demo lanes

Each is an independent lane. The owns path is the demo's dir + its e2e spec.

### media-demo
- **Owns:** `marketing/marketing-ui/public/docs/media/` + `e2e/tests/media-demo.spec.ts` (or the media e2e).
- **Task:** the media demo creates `media-{username}` (an app-function group) with roles. Convert its role literals to the per-service map shape. The media demo's group is `invite_only` (private) by design — assert a bystander sees the identity but **no** media (the private fork). Drive the identity fork (set the group's name/description).
- **Acceptance bar:** role shape is the map; the e2e drives the private fork (bystander: identity yes, media no) + the identity write; media upload → create → read → display still green; no console errors.

### notes-demo
- **Owns:** `marketing/marketing-ui/public/docs/notes/` + its e2e.
- **Task:** the notes demo creates `notes-{username}` with roles. Convert role literals to the map shape. Notes group is `invite_only` (private) — assert the private fork (bystander: identity yes, notes no) + drive the identity fork.
- **Acceptance bar:** role shape is the map; private fork + identity fork in the e2e; note CRUD (create/read/update/delete) still green; no console errors.

### sharing-demo
- **Owns:** `marketing/marketing-ui/public/docs/sharing/` + its e2e.
- **Task:** the sharing demo creates `sharing-{username}` with roles. Convert role literals to the map shape. The sharing demo is the one that exercises the **sharing toggle** (block/unblock per group) — keep that working under the new gate. Drive the public/private + identity fork.
- **Acceptance bar:** role shape is the map; the sharing block/unblock still works (a blocked user's posts are hidden from members — now via the effective role); public/private + identity fork in the e2e; no console errors.

### groups-demo  ⭐ the reference
- **Owns:** `marketing/marketing-ui/public/docs/groups/` + its e2e.
- **Task:** the richest demo — `ROLE_PRESETS` (owner / moderator / page-curator / member), create / join / roles / invite / leave / remove. Convert **all** `ROLE_PRESETS` to the per-service map shape (this is the template the other demos copy). Add the `page-curator` identity fork (a curator sets the group's face; a member can't). Drive the full public/private fork (open / request / invite_only × public / private).
- **Acceptance bar:** all `ROLE_PRESETS` in the map shape; the role/invite/leave/remove lifecycle still green; the `page-curator` identity fork (curator writes face, member can't); the public/private × join-policy matrix in the e2e; no console errors. **This is the template — keep it canonical.**

### messages-demo
- **Owns:** `marketing/marketing-ui/public/docs/messages/` + its e2e.
- **Task:** the messages demo creates DM groups (`dm-{other}`) with roles + the WebRTC P2P half. Convert the DM role literals to the map shape. DMs are `invite_only` (private, two members) — assert the private fork (a third party sees the identity but no messages). The WebRTC P2P half is unaffected by D58 (it's transport, not access) — keep it green.
- **Acceptance bar:** DM role shape is the map; the private fork (third party: identity yes, messages no); DM CRUD + WebRTC P2P round-trip still green; no console errors.

### feed-demo
- **Owns:** `marketing/marketing-ui/public/docs/feed/` + its e2e.
- **Task:** the feed demo creates the discover group (public board) + followers groups. Convert role literals to the map shape. The discover group is the **public** case — assert a signed-out visitor reads the board (the `anyone` grant). The followers groups are the member case. Drive the public (discover) + member (followers) forks.
- **Acceptance bar:** role shape is the map; the discover board is publicly readable by a signed-out visitor (the `anyone` grant); the followers-group member read works; post → follow → read combined feed still green; no console errors.

### tasks-demo
- **Owns:** `marketing/marketing-ui/public/docs/tasks/` + its e2e (if it has one).
- **Task:** the tasks demo creates user-named groups with roles. Convert role literals to the map shape. Drive a public/private + identity fork (a user-named community group, made public, a bystander reads it).
- **Acceptance bar:** role shape is the map; public/private + identity fork; task CRUD still green; no console errors.

### SDK role type (shared, small)
- **Owns:** `sdk/src/` (`V3GroupRole` type + `dist/` rebuild).
- **Task:** the SDK's `V3GroupRole` type is the old `{name, services, permissions}` shape. Change it to `{name, permissions: Record<string, string[]>}` (the per-service map). Rebuild `dist/`. This is the shared type the demos + social app reflect — the demos are plain JS (no type) so they don't strictly need it, but the social app (Stage 2) does.
- **Acceptance bar:** `V3GroupRole` is the map shape; `dist/` rebuilt; SDK tests green; `tsc` clean. **Note:** #704 (curateAds) also touches `sdk/src/` — sequence after it or coordinate on the barrel.

## Stage 1 done-ness

Stage 1 is done when **all seven demos** (that create groups) run the new role
shape and their e2es drive the public/private + identity fork green — proving
the backend end-to-end through the real consent flow. **Then Stage 2 (the
social app + authenticator) fans out.**
