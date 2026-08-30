# The v3 Groups Overhaul (D58)

The end-to-end build of the group access model D58 decided. This is the
umbrella — the **what**, the **why**, the **sequence**, and the **status**.
The detailed task blocks + copy-paste kickoff prompts live in the three stage
docs:

- [`stage-0.md`](v3-groups-overhaul/stage-0.md) — the backend keystone (sequential)
- [`stage-1.md`](v3-groups-overhaul/stage-1.md) — the demo apps (parallel)
- [`stage-2.md`](v3-groups-overhaul/stage-2.md) — the social app + authenticator (parallel)

The **spec** is the KB: `knowledge-base/web10-v3/groups/access.md` (the
canonical model) + D58 in `strategy/decisions.md`. The lanes are tracked in
`strategy/parallel-execution.md` (`d58-backend` / `d58-demos` / `d58-social`)
and `strategy/plan.md` (the "Groups: Access Model (D58)" section). **This doc
set is the operator's view; the lane board is the fleet's view. Keep them
in sync.**

## What

D58 replaced the group permission model the KB described but the code never
built. The build has three parts:

1. **The backend** — roles become per-service permission maps; access is
   granted to three nested principal classes (`anyone` / `authenticated` /
   `member`); reads are role-gated for content, identity stays public;
   public/private = a grant to `anyone`/`authenticated`; the attach hole is
   closed.
2. **The demos** — the reference implementation adopts the new role shape and
   proves the backend end-to-end through the real consent flow.
3. **The apps** — the social app renders the group's face (the
   Facebook-shaped hero) + public/private; the authenticator gets the profile
   editor + the "who can read" control.

## Why (the short version)

Chasing the "make groups look like a Facebook group" feature exposed that the
group permission model was a fiction: the `services` array on roles was never
enforced, `anon` was a misnomer, reads were membership-only (not role-gated),
and the write side had no group gate at all (the attach hole). D58 decides the
real model; this overhaul builds it. Full reasoning: D58.

## The sequence (three-stage pipeline)

```
STAGE 0  backend        — SEQUENTIAL, the keystone (1 workspace)
                          role shape + read/write gates → backfill →
                          identity write endpoint → conformance re-pin
                          ⛔ gated on #734 (node-ads) + #727 (create-group)
                            landing — they own groups.py / clickhouse.py
                           │
STAGE 1  demos          — PARALLEL, one workspace per demo (7 + sdk)
                          media · notes · sharing · groups(ref) ·
                          messages · feed · tasks
                          ✅ demos green = backend proven end-to-end
                           │
STAGE 2  social + auth  — PARALLEL, one workspace per feature (6)
                          role defs · profile(fan) · public/private(fan) ·
                          profile editor(admin) · public/private(admin) ·
                          feed/detail read
```

**The two rules that make it work:**

1. **Stage 0 is the only serial part.** It is one coordinated change across
   `groups.py` + `clickhouse.py`. Splitting *that* across agents is where you
   get conflicts, not speed. One workspace does it, in order, then the
   fans-out happen.
2. **Demos before social app.** The demos are the reference implementation
   (D46). A backend bug surfaces in a 200-line demo's e2e, not a 25-file app.
   By the time Stage 2 starts, the flow is proven and the social work is "wire
   up what works."

**Parallelism count:** 1 (backend) → **7** (demos) → **6** (social features).

## The gate (right now)

Stage 0 cannot start until the in-flight PRs that touch the same files land:

| PR | Touches | Why it gates Stage 0 |
|---|---|---|
| **#734** node-ads (D57) | `api/.../endpoints/documents.py` + `services/clickhouse.py` | the read/write gates + backfill live in these exact files |
| **#727** create-group (3.33.0) | `web10-social/src/data/groups.ts` | the Stage 2 role definitions live in that file |

(#704 curateAds touches `sdk/src/` — a soft dependency for the Stage 1/2 role
type.) **Re-base off `origin/dev` after #734 + #727 merge, then start
Stage 0 / item 1.**

## Status

| Stage | Lane | Status |
|---|---|---|
| Decision + KB | — | ✅ done (3.37.0, #733) |
| Stage 0 — backend | `d58-backend` | ⛔ gated on #734 + #727 |
| Stage 1 — demos | `d58-demos` | ⛔ gated on Stage 0 |
| Stage 2 — social + auth | `d58-social` | ⛔ gated on Stage 0 (ideally Stage 1 green) |

## Version

Stays **v3** (operator: pre-prod, a month in development — a breaking protocol
change stays on the 3.x line, no v4). The backend keystone is the first 3.x
minor that changes the role wire shape; the backfill handles pre-existing
groups.
