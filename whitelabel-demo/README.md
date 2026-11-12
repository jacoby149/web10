# White-label demo — OPS

Show TorahAnytime its own social experience: its branding, a populated Torah
feed and playable shiurim, behind a password. A convincing demonstration, not
a petabyte migration wearing a nice hat.

## TorahAnytime demo

| Role | Confirmed hostname |
|---|---|
| Social UI | `https://torah.web10.app` |
| Node API | `https://api.torah.web10.app` |

These are operator-selected names, **not a claim that DNS or deployment exists**.
The server/IP, private access and additional auth/media/RTC routing are still
to be settled. TorahAnytime has offered a server; do not assume these names
already point there or reuse the public web10 node.

## Files

| File | Purpose |
|---|---|
| [OPS.md](OPS.md) | DNS, TLS, isolated stack, password gate, verification and rollback |
| [CONTENT.md](CONTENT.md) | Select, download and stock an attributed Torah sample |
| [OPS-LOG.md](OPS-LOG.md) | Sanitized dated execution receipts; planning is separate from live changes |

Source of product scope and sent offer:
[partner brief](../knowledge-base/strategy/torah-anytime.md).
Execution queue: [plan](../knowledge-base/strategy/plan.md) and
[partnership lane](../knowledge-base/strategy/parallel-execution.md).

## Build only what the demo needs

1. Node Settings: editable **Logo for light mode / Logo for dark mode**,
   persisted through the existing `logo_light` / `logo_dark` fields and used
   by the actual demo UI. This feature is queued, not implemented here.
2. A real server/edge password gate around the isolated demo and its content
   routes. Normal web10 account authorization remains behind it.
3. A small selection of rabbis/shiurim from TorahAnytime's supported downloads,
   with permission, attribution and working media—not placeholder cards.

Use the existing applications; this folder is their operating kit, not a
forked social app. Full synchronization and expanded role presets stay in the
later partner rollout. No claim of production Torah-only enforcement follows
from a curated private demo.

## Start here

Read OPS.md before making changes. Get the approved target server/public IP,
private access mechanism, logo pair, content selection/limits and permission
to rehost the sample. Provision secrets out of band. Do not paste passwords,
tokens, signed media URLs or private server addresses into these docs.

No live DNS/server changes, downloads or deployment were performed when this
kit was created. No executable deploy configuration is supplied yet; routing
and access-gate design must be resolved before building one.
