# Stage 0 — The Backend Keystone (D58)

**The one stage that does NOT parallelize.** A single coordinated change
across `groups.py` + `clickhouse.py` + `models/` + `api/tests/`. One
workspace, four items, in order. Everything in Stage 1 and Stage 2 lands on
this.

**Spec:** `knowledge-base/web10-v3/groups/access.md` + D58.
**Lane:** `d58-backend` in `parallel-execution.md`.

## The gate (do this first)

- [ ] **Re-base off `origin/dev`** after **#734** (node-ads) + **#727**
  (create-group) merge — they own `documents.py` / `clickhouse.py` /
  `groups.ts`. Start on a fresh branch off the new dev. Do **not** start
  before they land.

## The model in one paragraph (the target state)

A role is `{name, permissions: {service: [ops]}}` — a per-service map (the
`services` array is gone). `group_members` stores `(group_id, member_key,
role)` where `member_key` is a username **or** the reserved class keys
`anyone` / `authenticated`. A principal's **effective role** in a group is the
**union** of the permission maps of every class they belong to:

```
effective_perms(P, G) =
      role_perms(G, 'anyone')                            # always
    ∪ ( P authenticated ? role_perms(G, 'authenticated') : ∅ )
    ∪ ( P a member of G  ? role_perms(G, P.member_role)  : ∅ )

# role_perms(G, principal) = the `permissions` map of the role on that
# principal's group_members row in G (∅ if no row).

can(P, G, service, op) =
    op in effective_perms(P, G).get(service, [])
  ∪ op in effective_perms(P, G).get('*', [])        # '*' = all doc services
# management ops (manageRoles, assignRoles, revokeRoles, deleteGroup,
# hideAll, the join/member ops) live under the reserved 'group' key:
can_manage(P, G, op) = op in effective_perms(P, G).get('group', [])
```

`anyone ⊇ authenticated ⊇ member` — the nesting enforces member ⊇
signed-in-stranger ⊇ signed-out-visitor for free.

---

## Item 1 — Role shape + read gate + write gate  ⭐ the keystone

**Task.** Store roles as per-service maps and enforce the effective role on
both the read and the write path.

**Owns.** `api/app/v3/endpoints/groups.py`, `api/app/v3/services/clickhouse.py`,
`api/app/v3/models/` (the role/contract models), `api/app/v3/endpoints/documents.py`
(the read + create/attach path).

**The work.**
1. **Role shape.** The role model is `{name, permissions: {service: [ops]}}`.
   `group_contracts.roles` stores this JSON. Retire the `services` array from
   the model + any code that reads it. The `'*'` wildcard and the `'group'`
   management key are reserved service keys.
2. **Effective-role helper** (in `clickhouse.py`). `effective_role_perms(group_id,
   principal, authenticated: bool) -> {service: [ops]}` — resolves the
   principal's `group_members` row (for members) + the `anyone` row + the
   `authenticated` row (if `authenticated`), and unions their role `permissions`
   maps. This is the single source of truth both gates call.
3. **Read gate** (replaces the membership-only check). The group read
   (`read_documents_in_groups` + the read endpoint's member check) gates on
   `can(P, G, service, 'readAll')` per group, not `is_group_member`. For a
   `"me"` read, the reader's readable groups = the groups where their
   effective role grants `readAll` on the service. For an explicit-group read,
   filter to the groups the reader can read; if none, the existing 403/empty
   behavior. **Identity is NOT gated here** — it stays a public table read.
4. **Write gate (closes the attach hole).** Before `attach_doc_to_groups`,
   check `can(author, G, service, 'create')` for each target group. A
   bystander who can't write a group cannot attach their doc to it. (This is
   the fix for the hole where any signed-in user with an app contract could
   attach to any group.)
5. **Management ops.** `_require_group_permission` (and the assign/revoke
   paths) check `can_manage(P, G, op)` — the op under the `'group'` key of the
   effective role — instead of the old flat `permission in role.permissions`.

**Gates.** None (this is the first item). But the **branch gate** above
(#734 + #727 landed, re-based) must be clear.

**Acceptance bar.**
- A signed-out visitor reads a group's posts **iff** the group grants `anyone`
  a role with `readAll` on the service.
- A signed-in non-member reads **iff** the group grants `anyone` **or**
  `authenticated` a `readAll` role.
- A member reads **iff** their effective role (member role ∪ class grants)
  grants `readAll`.
- A bystander **cannot** attach a doc to a group they can't write (the attach
  hole is closed).
- Management ops (assign/revoke/delete) enforce the `'group'` key.
- Identity (name/banner/about) is still readable by any principal (public).
- API unit tests green + ruff clean.

**Kickoff (copy-paste for a fresh workspace).**
> **Task:** D58 Stage 0 / Item 1 — the backend role shape + read gate + write
> gate. Roles become per-service maps `{name, permissions: {service: [ops]}}`;
> add an `effective_role_perms(group_id, principal, authenticated)` helper in
> `clickhouse.py` (union over the `anyone` / `authenticated` / member-role
> rows); gate the group **read** on `readAll` in the effective role per group
> + service (replaces the membership-only check — identity stays public); gate
> the **write/attach** on `create` in the effective role (closes the attach
> hole); management ops check the reserved `'group'` key.
> **Spec:** read `knowledge-base/web10-v3/groups/access.md` + D58 first — the
> effective-role formula and the gates are there.
> **Owns:** `api/app/v3/endpoints/{groups,documents}.py`,
> `api/app/v3/services/clickhouse.py`, `api/app/v3/models/`.
> **Gates:** re-base off `origin/dev` after #734 + #727 merge. This is Item 1
> of the `d58-backend` lane — Items 2–4 follow it.
> **Acceptance bar:** the six bullets in `stage-0.md` Item 1 (visitor /
> signed-in / member read forks; attach-hole closed; `'group'` key enforced;
> identity public). API unit tests green + ruff clean.

---

## Item 2 — Backfill (one-time, sentinel-gated)

**Task.** Migrate pre-existing groups to the new role shape + rename the
discover board's `anon` row, with a conservative visibility default.

**Owns.** `api/app/v3/services/clickhouse.py` (the migration function + the
boot self-heal), `clickhouse-init/` (if the DDL/seed changes), `api/tests/`.

**The work.**
1. **Role fan-out.** For each live group in `group_contracts`, transform each
   role from `{name, services: [], permissions: []}` to
   `{name, permissions: {service: [ops]}}`: for each `service` in the old
   `services` list, set `permissions[service] = <the old flat permissions>`.
   `['*']` → the `'*'` key. (Groups already in the new shape are skipped.)
2. **`anon` → `anyone`.** Rename the discover board's `group_members` row
   `member_key = 'anon'` → `'anyone'`.
3. **Conservative visibility default.** Do **not** add `anyone` /
   `authenticated` read grants to any existing group besides the discover
   board. Pre-existing groups keep their current (member-only) content
   visibility; owners opt into publicness later via the Stage 2 control. No
   silent access expansion.
4. **Sentinel-gated + concurrent-safe.** A `node_config` sentinel marks
   completion (the house pattern from the discoverable backfill); the
   migration is idempotent (re-running is a no-op) and only ever rewrites role
   shape / renames the one row — it never changes content access.

**Gates.** Item 1 (the new role shape must exist before you migrate into it).

**Acceptance bar.**
- After the backfill, every live group's roles are in the per-service map shape
  (no `services` array remains).
- The discover board's public row is `member_key = 'anyone'` and the board is
  still publicly readable.
- No non-discover group gained an `anyone`/`authenticated` read grant
  (visibility unchanged for pre-existing groups).
- The migration is idempotent + sentinel-gated (runs once).
- API unit tests green (fan-out correctness, `['*']`→`'*'`, anon→anyone,
  conservative default, idempotency) + ruff clean.

**Kickoff.**
> **Task:** D58 Stage 0 / Item 2 — the one-time, sentinel-gated backfill. Fan
> each live group's old `{services, permissions}` roles out into the new
> `{permissions: {service: [ops]}}` shape (`['*']` → `'*'` key); rename the
> discover board's `anon` member row → `anyone`; **conservative visibility
> default** (no existing group besides discover gains an `anyone`/
> `authenticated` read grant — owners opt in later). Sentinel-gated +
> idempotent (the house `node_config` sentinel pattern).
> **Owns:** `api/app/v3/services/clickhouse.py`, `clickhouse-init/`,
> `api/tests/`.
> **Gates:** Item 1 (role shape) must be merged first.
> **Acceptance bar:** all live groups in the new shape; discover board's row is
> `anyone` + still public; no non-discover group gained public visibility;
> idempotent + sentinel-gated. API unit tests green + ruff clean.

---

## Item 3 — Identity write endpoint

**Task.** The write path for the group's **face** — the public
`group_identity` table. This is what unblocks the Facebook-group look (the
Stage 2 profile editor + the fan-facing hero both call it).

**Owns.** `api/app/v3/endpoints/groups.py` (the new endpoint),
`api/app/v3/services/clickhouse.py` (the identity write), `api/app/v3/models/`,
`api/tests/`.

**The work.**
1. **Endpoint.** `POST /v3/groups/identity` (or extend the existing
   group-update path) — body: `group_id` + the identity fields (`name`,
   `description`, `banner_ref`, `avatar_ref`, `website`, `tags`).
2. **Gate.** The caller's effective role must grant `create` (first write) or
   `updateOwn`/`updateAll` on the `group-identity-service` — i.e. the owner or
   a `page-curator`. Use the Item 1 effective-role helper.
3. **Write.** Append a new row to `group_identity` (append-only, latest wins —
   the house dedup-then-filter read already takes the latest non-deleted row).
   `banner_ref` / `avatar_ref` are media doc refs (the Stage 2 editor uploads
   the media first, then writes the refs here).
4. **Read stays public.** The existing `get_group_identity` /
   `get_group_identities` (directory + detail) are unchanged — identity is
   readable by any principal.

**Gates.** Item 1 (the effective-role gate). The media upload it references
already exists (the presigned flow) — no new media work here.

**Acceptance bar.**
- An owner / `page-curator` can write the group's identity; a plain member
  **cannot** (the `group-identity-service` gate).
- A write appends a new `group_identity` row; the directory + detail read the
  latest.
- Identity remains readable by any principal (anon included) after a write.
- API unit tests green (gate: owner yes / curator yes / member no; append +
  latest-wins; public read) + ruff clean.

**Kickoff.**
> **Task:** D58 Stage 0 / Item 3 — the identity write endpoint. `POST
> /v3/groups/identity` writes the group's face (name, description, banner_ref,
> avatar_ref, website, tags) to the public `group_identity` table, gated by
> the caller's effective role granting `create`/`update` on
> `group-identity-service` (owner / `page-curator`). Append-only, latest wins.
> The read path (directory + detail) stays public — unchanged.
> **Owns:** `api/app/v3/endpoints/groups.py`, `api/app/v3/services/clickhouse.py`,
> `api/app/v3/models/`, `api/tests/`.
> **Gates:** Item 1 (effective-role helper). Media upload already exists —
> `banner_ref`/`avatar_ref` are media doc refs the client uploads first.
> **Acceptance bar:** owner/curator can write, member can't; append +
> latest-wins; identity still public after a write. API unit tests green +
> ruff clean.

---

## Item 4 — Conformance re-pin

**Task.** Re-pin the security conformance suite to the **effective-role**
model (not membership), and add the stronger anti-tests D58 enables.

**Owns.** `api/tests/` (the conformance / permission-matrix suite —
`test_v3_conformance.py` and the I3 tests).

**The work.**
1. **Re-pin I3.** "No query returns documents for a group the reader's
   **effective role** doesn't grant `readAll` on" — replace the
   membership-framed assertions with effective-role ones.
2. **The principal-class forks.** Add explicit cases:
   - **anon vs private group** — a signed-out visitor gets the identity (public)
     but **no** posts (no `anyone` grant).
   - **signed-in vs signed-out** — a group granting `authenticated` (not
     `anyone`): a signed-in stranger reads posts, a signed-out visitor doesn't.
   - **monotonicity** — a member's readable set ⊇ a signed-in stranger's ⊇ a
     signed-out visitor's (the nesting invariant).
   - **the attach-hole anti-test** — a bystander (no write grant) **cannot**
     attach a doc to the group; the read reflects it.
   - **the discover board regression** — still publicly readable via the
     `anyone` grant after the rename.
3. **Keep the existing I3 surface tests green** (cross-user isolation, etc.) —
   they should now pass *because of* the effective-role gate, not despite it.

**Gates.** Items 1–3 (the gates + the identity endpoint must exist to test).

**Acceptance bar.**
- The conformance suite asserts effective-role gating (not raw membership).
- The five forks above are explicit, passing tests.
- The full API suite green + ruff clean.

**Kickoff.**
> **Task:** D58 Stage 0 / Item 4 — the conformance re-pin. Re-pin the I3 /
> permission-matrix suite from "membership grants access" to "effective role
> grants access." Add the principal-class forks: anon-vs-private (identity
> yes, posts no), signed-in-vs-signed-out (the `authenticated`-only group),
> monotonicity (member ⊇ stranger ⊇ visitor), the attach-hole anti-test
> (bystander can't attach), and the discover-board regression (still public via
> the `anyone` grant).
> **Owns:** `api/tests/` (conformance + I3 suite).
> **Gates:** Items 1–3 merged.
> **Acceptance bar:** the suite asserts effective-role gating; the five forks
> are explicit passing tests; full API suite green + ruff clean.

---

## Stage 0 done-ness

Stage 0 is done when all four items are merged and: a fresh group can be made
public / signed-in-only / private by its grants alone; a bystander's read is
exactly what their effective role allows; the attach hole is closed; and the
conformance suite proves it. **Then Stage 1 (the demos) fans out.**
