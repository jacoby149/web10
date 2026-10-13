# Contract Healing — the app owns its own contracts

The canonical reference for how an app guarantees the group contracts it needs.
A group contract is **app infrastructure**: the roles, reserved grants, join
policy, and tags that make an app's access model work. Like any infrastructure,
it can **drift** — created before a role existed, a role definition lost, a tag
dropped — and when it does, the app breaks **silently** (no error, no crash;
just a feature that quietly stops working). This doc is the design for the
"the app owns its own contracts" principle: **check every contract the app
needs; if it is not equal to the canonical shape, heal it — consensually.**

`access.md` is the spec for who-can-do-what in a group. This doc is the spec
for how an app keeps its group contracts in a working shape over time.

## The problem: a contract that drifts breaks the app silently

A group contract is a shape the app depends on. Take web10-social's followers
group. Its access model is: the `anyone` principal class holds the `reader`
role, and the `reader` role grants `readAll` on `profile`. That is what makes a
profile public (D41 + D58 point 7). The app needs **two things** to be true:

1. The contract **defines** the `reader` role (a role definition in `roles`).
2. The contract **carries** the `anyone → reader` member row (a grant).

Both must hold. The node's read gate (`readable_groups_batched`, `access.md`)
resolves a grant by looking up the role **the member row names**. If the member
row says `reader` but the contract never defined a `reader` role, the grant
resolves to **nothing** — the row is present, the role is absent, and the access
the app expects never happens. No error is raised. The group simply doesn't
grant what the app thinks it grants.

This is the failure class: **a contract that is not equal to the shape the app
needs, with no signal that it isn't.**

### The real bug this design fixes

A followers group created **before** the `reader` role was added to the
canonical `FOLLOWER_ROLES` has the `anyone → reader` member row but **no
`reader` role definition**. The grant is inert. The owner is therefore absent
from the public people directory (the D0 read, `clickhouse.md`), even though
their profile is "public." Verified on a live node: the owner's followers group
carried `anyone → reader` in `group_members` but the contract's `roles` array
had only `owner` + `member` — no `reader`. A group created after the role
shipped had all three and worked. Same app, same code, different contract age —
the difference was purely contract drift.

### The clobbering bug this design also fixes (found while scrutinizing)

The first-cut heal for the public profile was: "on sign-in, if the followers
group has no `anyone` row, add it" (public-by-default). But making a profile
**private** is implemented by *removing* the `anyone` row
(`setProfilePublic(false)` → `removeGroupMember(groupId, 'anyone')`). So the
heal and the user's choice **fought each other**:

```
user makes profile private  →  `anyone` row removed
user signs out, signs in    →  heal sees no `anyone` row → re-adds it
result: profile is public again, against the user's will
```

A heal that re-adds a row the owner deliberately removed is **not consensual** —
it clobbers a user choice on the next sign-in. This is the failure mode that
shapes the whole design: **the heal must distinguish what is the app's to
guarantee from what is the owner's to choose.**

## The design

Two layers, split by D60 (the node stays generic; the app owns its concepts):

- **The SDK provides the mechanism** — a universal "diff a group contract
  against a canonical spec, and heal the diff" primitive. It knows nothing
  about followers, profiles, or social. It operates on the group-contract
  primitives (`roles`, `members`, `join_policy`, `tags`).
- **The app provides the canonical spec** — the shape *this app* needs for
  *this group type*. web10-social declares `FOLLOWERS_CONTRACT_SPEC`. The node
  never learns it.

```
web10-social (app)                          SDK (mechanism)                 node (generic)
─────────────────────                       ─────────────────               ──────────────
FOLLOWERS_CONTRACT_SPEC  ───────────────►  reconcileGroupContract(id, spec)
  roles: [owner, member, reader]              │  getGroup + getGroupMembers
  join_policy: 'open'                          │  diffGroupContract(spec, current)
  tags: ['web10-social-followers']             │  if drift: updateGroup(merged roles)
  (NO members — see the split below)           │             addGroupMember(missing rows)
                                               └──────────────────────────────►  stores the shape
```

### The primitive (SDK)

`diffGroupContract(spec, current)` — **pure**, no I/O. Given the canonical spec
and the contract's current shape (from `getGroup` + `getGroupMembers`), it
returns the exact set of **additive** changes that would bring the contract in
line with the spec:

- `missingRoles` — spec roles with no matching `name` in the contract.
- `rolePermissionGaps` — for a spec role that exists but lacks some permission
  ops, the `(role, service, op)` tuples that are missing.
- `missingMembers` — spec member rows with no matching `member_key`.
- `joinPolicyDrifted` — the spec's join policy differs from the contract's.
- `missingTags` — spec tags the contract doesn't carry.
- `inSync` — true when all of the above are empty.

`reconcileGroupContract(groupId, spec)` — reads the contract, diffs it, and if
it has drifted, applies the additive heal:

- **Roles** — one `updateGroup` with the **full merged role list** (the
  contract's existing roles preserved verbatim + the spec's missing roles
  appended, with the spec's missing ops **unioned** into matching existing
  roles). `updateGroup` *replaces* the roles field, so the full merged list is
  required — sending only the delta would erase the owner's roles.
- **Members** — `addGroupMember` for each missing row.
- **Tags** — appended to the existing set (the owner's other tags are never
  dropped).
- **Join policy** — reset to the spec's.

It is **idempotent** (an in-sync contract produces no writes) and returns the
diff + whether it healed, so a caller can log or surface what changed.

### The consensual-heal invariant (the load-bearing rule)

The heal is **additive and never destructive**:

1. It only **adds** what is missing (a role, an op, a member row, a tag) and
   resets a drifted join policy. It **never removes** a role, an op, a member
   row, or a tag the owner has.
2. It only touches what the **spec declares**. Anything the owner set that the
   spec doesn't mention is left exactly as-is.

These two rules are what make the heal safe to run automatically (on every
sign-in) without ever surprising the owner. A heal that could *remove* or
*rewrite* an owner's value would not be consensual — it would be the app
imposing on the owner.

### The infrastructure-vs-choice split (what the app puts in the spec)

The split that resolves the clobbering bug is the **app's** decision, encoded in
what it puts in the spec:

- **Infrastructure** — the parts of the contract the app *needs to function*
  and the owner doesn't meaningfully "choose." Put these in the spec; the heal
  guarantees them. For the followers group: the **role definitions**
  (`owner`/`member`/`reader` — the `reader` role is what makes the public
  grant work), the **join policy** (`open` — following is an open join), and
  the **followers tag** (D78 selection).
- **Choice** — the parts that express the **owner's** intent. Do **not** put
  these in the spec; the heal must not fight the owner over them. For the
  followers group: the **`anyone` publicness row**. It is a **create-time
  default** (a new followers group is created public — the create path adds
  `anyone → reader`) and a **user toggle** (`setProfilePublic` adds/removes it).
  It is *not* a heal invariant. Re-adding it on every sign-in would clobber a
  "make private" choice.

```
FOLLOWERS_CONTRACT_SPEC = {
  roles: [owner, member, reader],   // infrastructure — the heal guarantees these
  join_policy: 'open',              // infrastructure — following is an open join
  tags: ['web10-social-followers'], // infrastructure — D78 selection
  // members: — deliberately ABSENT. The `anyone` row is the owner's publicness
  // choice (create-time default + toggle), not app infrastructure. The heal
  // never re-adds it.
}
```

The consequence: a followers group created before the `reader` role existed
self-heals on the owner's next sign-in (the missing role definition is
appended, the inert `anyone → reader` grant starts working, the owner reappears
in the people directory) — **without** the heal ever touching the owner's
publicness choice.

## Where the heal runs

- **web10-social** — `ensureFollowers` (run on sign-in, fire-and-forget,
  non-blocking) calls `reconcileGroupContract(followersGroupId,
  FOLLOWERS_CONTRACT_SPEC)`. This is the "the app self-heals on the next
  sign-in" path. A heal failure is non-fatal (logged, never blocks sign-in).
- **The authenticator** — the user's control plane for their contracts. It
  surfaces **contract health** so drift is *visible* (not just silently
  healed): it checks the user's groups for **dangling grants** — a member row
  that names a role the contract doesn't define (the exact failure class above,
  detected by a generic referential-integrity check that needs no app spec).
  The authenticator is generic (D60) — it doesn't know web10-social's spec — so
  it detects + surfaces, and the *owning app* repairs (on its next sign-in).
  See "The authenticator's role" below.

## The authenticator's role (detect + surface, app repairs)

The authenticator is the node's generic consent/contract UI. It cannot know
web10-social's canonical spec (D60 — the spec is app knowledge). So its
contract-health check is a **generic invariant**, not an app-spec diff:

- **Dangling grant** — a `group_members` row whose `role` is not defined in the
  group's `roles`. This is broken *by construction* regardless of app: a grant
  that names a nonexistent role grants nothing. The authenticator surfaces
  "group X has a grant for role `reader` that the group doesn't define — it
  does nothing" and notes that the app that owns the group repairs it on the
  next sign-in.

This is the "check every contract, if it is not equal, **suggest** a change"
half of the principle, made generic. The app's self-heal is the "heal it" half.
Together: drift is both *fixed* (app) and *visible* (authenticator), so neither
the user nor the operator has to "bat an eye" figuring out why a feature
stopped working.

## Failure modes (and how the design handles each)

The design was scrutinized against every way a contract heal could break. Each
mode, and the behavior:

| # | Failure mode | Behavior | Why it's safe |
|---|---|---|---|
| 1 | **Missing role definition** (the real bug) — `anyone → reader` row present, `reader` role absent | Healed: the role is appended | Additive; the inert grant starts working |
| 2 | **Clobbering a user choice** — owner made profile private (removed `anyone`), heal re-adds it | **Not healed** — `anyone` is not in the spec | The choice/infra split; the heal never touches owner choices |
| 3 | **Role present but missing an op** — `reader` exists without `profile: readAll` | Healed: the op is unioned in | Additive union; never removes an op the owner added |
| 4 | **Member row present with a different role** — `anyone → member` (not `reader`) | Left as-is (diff keys members by `member_key`) | The owner manages member roles; the heal doesn't rewrite them |
| 5 | **Owner added an extra role** not in the spec | Left as-is | Rule 2 — the heal only touches what the spec declares |
| 6 | **Owner added an extra tag** not in the spec | Left as-is (spec tags are appended, owner tags kept) | Additive; never drops owner tags |
| 7 | **Join policy drifted** — followers group set to `request` | Reset to `open` | Following is app infrastructure (an open join); not a meaningful owner choice for this group |
| 8 | **Concurrent heals** — two sign-ins both diff + write | Converges | The node's ReplacingMergeTree dedup (latest `updated_at` wins) + member-row dedup; both write the same merged shape |
| 9 | **Group doesn't exist** when reconcile runs | `getGroup` throws; the caller (ensureFollowers) creates first, then reconciles; a throw is caught + logged, non-fatal | Creation is a separate, deliberate action; the heal assumes the group exists |
| 10 | **Caller lacks permission** — `updateGroup`/`getGroupMembers` gated on membership | The self-heal caller is the **owner** (always permitted). The authenticator only checks groups the user owns/manages | The heal runs where the caller has the rights |
| 11 | **Members list truncated** (a popular creator, many followers) | A reserved row the diff can't see is "added" — a harmless duplicate (node dedups); a visible row is never re-added | Truncation only causes benign duplicates, never a missed heal |
| 12 | **Role shape drift** (flat vs per-service map permissions) | The diff compares by `(service, op)`, not by serialized equality — robust to key ordering. Assumes the same permission *shape* as the spec (the app always writes the per-service map) | Semantic comparison; the app's write shape is consistent |
| 13 | **Owner deletes an app-required role** (via the role editor) | Re-added on the next sign-in | App infrastructure is *guaranteed by the app* — that is the point of "the app owns its own contracts." The owner can't permanently remove a role the app needs |
| 14 | **Heal cost on every sign-in** | Two reads (`getGroup` + `getGroupMembers`), writes only on drift; fire-and-forget, non-blocking | Cheap; never delays sign-in |

The two modes that would have been **bugs** if unhandled — #2 (clobbering) and
#17 below (sending a delta instead of the full merged role list) — are the ones
the scrutiny exists to catch.

| 17 | **`updateGroup` replaces the roles field** — sending only the missing roles would erase the owner's existing roles | The heal sends the **full merged list** (`mergeGroupRolesForReconcile`) | `updateGroup` is a replace, not a patch; the full list is required |

## Trace: a drifted followers group self-heals on sign-in

```
owner signs in to web10-social
  └─ App bootstrap (fire-and-forget)
      └─ ensureFollowers('jacoby149')
          ├─ getGroup(followersGroupId)            → exists
          ├─ getMyGroups()                          → owner is a member (no join)
          └─ reconcileGroupContract(id, FOLLOWERS_CONTRACT_SPEC)
              ├─ getGroup + getGroupMembers
              │    current roles:  [owner, member]            ← `reader` is MISSING
              │    current members: [jacoby149→owner, anyone→reader]
              ├─ diffGroupContract(spec, current)
              │    missingRoles: [reader]                     ← the drift
              │    inSync: false
              └─ updateGroup(id, { roles: [owner, member, reader] })   ← full merged list
                 (no member writes — `anyone` not in the spec; no tag/policy drift)
  → next read of the D0 people directory: the `anyone → reader` grant now
    resolves (the `reader` role exists) → the owner is listed. Healed.
```

A second sign-in: `diffGroupContract` returns `inSync: true` → no writes
(idempotent). If the owner then makes their profile private (`anyone` row
removed), the next sign-in's diff still returns `inSync: true` for the spec
(`anyone` isn't in it) → the heal does **not** re-add it. The choice holds.

## The D60 split, stated plainly

- **The node** stores and serves the group contract. It is generic — it doesn't
  know what a followers group "should" look like. It enforces the access model
  (`access.md`) against whatever shape is stored.
- **The SDK** provides the universal diff + reconcile mechanism. It doesn't know
  what a followers group is — it reconciles *any* group contract toward *any*
  spec.
- **The app** (web10-social) declares the canonical spec for the group types it
  creates, and runs the self-heal. It is the only layer that knows "a followers
  group needs the `reader` role and an open join policy, and the `anyone` row
  is the owner's choice."

A new app that creates a new group type writes its own spec and calls the same
`reconcileGroupContract` — no node or SDK change. That is the durable part: the
mechanism is built once; every app's contracts heal themselves.
