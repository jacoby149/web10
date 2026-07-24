# CLAUDE.md — orientation for agents working on web10

Read this first. Then read `plan.txt` (what/why) and `parallel execution.txt`
(how work splits across parallel branches). `GLOSSARY.md` decodes the jargon;
`decisions.md` records why big calls were made so you don't re-litigate them.
If your task touches ANY user-facing surface, also read `design.md` — the
UI/brand standard — before writing code (see conventions below).

## What web10 is
A system for users to **own their data**. Each user gets their own database
collection; every record is `{service, body}`. Apps are stateless frontends
that hold a **scoped, expiring token** and talk to the user's collection over
a tiny CRUD API. The data outlives any app. The long-term vision:
**WordPress for social media/streaming** — open, self-hostable nodes;
creators (influencers) run nodes and monetize; user accounts are free;
web10 Inc. takes a small % of revenue through its payment rails.

**Strategic orientation (D20, 18.07.2026): social platform first, protocol
second.** The product is a platform for influencers — own your audience, no
shadow ban (100% delivery by architecture) — and the protocol exists to make
that ownership possible. Protocol/feature decisions are judged by whether
they make the creator platform better (the pitch truer, the creator P&L
stronger, fan conversion higher); generality for its own sake goes to
`later.md`. Read THE STORY at the top of `plan.txt` before touching product
surfaces; the fan-facing voice lives in `manifesto.md`, the creator pitch in
`outreach.md`.

## The stack (as of now — being modernized, see plan.txt phase 0)
- `api/` — FastAPI. The node. All data + auth + billing + media. Entry: `api/app/main.py`.
  - Layered (since 1.0.31): `main.py` app init + middleware + router includes;
    `models/` Pydantic schemas; `services/` business logic (auth, mongo, media,
    stripe, twilio, records); `endpoints/` routers (auth, crud, media, payments,
    system); `settings.py` config.
- `ui/` — React admin/consent UI (renamed from `auth2/` in 1.0.26; legacy `auth/` deleted).
- `sdk/` — `wapi.js`, the frontend library apps are built with.
- `api/rtc/` — WebRTC signaling (merged into api, becomes load-bearing for e2e encryption).
- `mobile/encryptor/` — Expo app, the seed of the phone-as-keychain.
- `marketing/` — everything that makes web10 accessible:
    - `marketing-ui/` — web10 Inc.'s site: landing page + docs + App Store + Exporter UI.
        Vite + React 19 + TS + Bun + react-router. Own vhost, never in node compose.
        Dev docs (protocol-spec, conventions, schemas) live in `marketing/marketing-ui/public/docs/`.
    - `marketing-api/` — FastAPI backend for marketing-ui: ZIP import pipeline
        (server-side parse, validate, dedup, batch write), analytics (pageview, funnel).
    - `web10-cli/` — CLI tool for web10.
    - `web10-social/` — the killer app: all-in-one social lens (instagram-shaped,
        video + streaming). CRM and Mail live here as sub-apps (since 1.0.30).

## How the data model works (know this cold before touching mongo.py)
- One MongoDB collection **per user**, named by username.
- Every doc is `{service, body}`; `to_gui`/`to_db` translate for read/write.
- Queries are scoped by `service`; `q_t`/`u_t` prefix user fields to `body.`
  so user input can never name protected fields. This is a security boundary.
- The `services` service holds terms/ACL records. The `*` (star) record holds
  the account (password hash, plan, phone, stripe ids). **Star protection**
  stops CRUD from touching it — never weaken this.

## Auth model (the heart of the product)
- Tokens are JWTs carrying `username, site, target, provider, expires`.
- `certify` verifies a token; `is_permitted` checks the terms records to
  decide if a token may do an action on a user's service.
- Federation: identity is `(username, provider)`, like email. A provider
  vouches for its own tokens; other providers verify via the provider's key.

## SECURITY INVARIANTS — do not break these (see plan.txt for detail)
These are enforced by the conformance/permission test suite. If your change
touches auth, the DB layer, or tokens, run those tests and keep them green.
- I1. A provider verifies ANY token's issuer cryptographically, without
      trusting the token's own claims. (Currently broken: HS256 → RS256 fix
      is in flight. Do not add code that deepens the HS256 assumption.)
- I2. Authorization decisions use only VERIFIED token data — never an
      unsigned decode.
- I3. A request can only touch the addressed user's collection. No
      cross-collection access, ever. (This is why aggregate is sandboxed.)
- I4. Private content is unreadable by the node operator (e2e encryption).
- I5. Every actor (app, agent, llm) acts under a scoped, expiring,
      revocable token. Least privilege.

## Working conventions for parallel agents
- **UI work reads `design.md` first — every time, no exceptions.** Any
  change under `ui/`, `marketing/marketing-ui/`, or `marketing/web10-social/`
  (or any new user-facing surface) is judged against `design.md`: the
  quality bar (the screenshot test), the canonical brand assets (the files
  named `logo*.png` are NOT the logos — design.md §3 names the real ones),
  the shared tokens (§13), and the UI definition of done (§12, PR
  screenshots included). Hardcoded colors/fonts are a review rejection.
- **Check it isn't already done.** Before starting a plan/lane item, check
  the lane queues in `parallel execution.txt` (`[✓ x.y.z]` = merged,
  `[~]` = in flight elsewhere), the `[✓]` ticks in plan.txt, and the top
  of `CHANGELOG.md`. If it's done, say so and pick the next unticked item.
- **Stay in your lane.** `parallel execution.txt` assigns directory
  ownership. Don't edit another lane's files; if you need a change there
  (e.g. `docker-compose.yml`, `settings`), leave a note, don't reach in.
- **Merge small, merge often.** Days-long branches, not weeks.
- **Tests are the seatbelt.** The permission-matrix suite must exist and
  pass before/through the phase-0 dependency upgrades. Nothing merges red.
- **A PR isn't done at creation.** Right after `gh pr create`: check for
  merge conflicts (`gh pr view --json mergeable,mergeStateStatus`) and
  resolve them, then watch ALL CI checks (`gh pr checks --watch`) — optional
  checks count too; `UNSTABLE` is red, not green — and fix failures until
  everything passes. Never report "ready to go" with any check failing.
  Full procedure in `AGENTS.md`.
- **Don't invent crypto or protocols.** Reuse: OIDC/JWKS for federation,
  Signal sender-keys / MLS for group keys, S3 API for blobs.
- **Match the surrounding code** until a phase explicitly modernizes it.
- **Update `CHANGELOG.md`.** Any improvement or change to the project gets a
  line in the changelog (newest entry at top, `version || DD.MM.YYYY`). This
  is a project rule, not a nicety — do it in the same branch as the change.
  If your work completes a `plan.txt` item, tick it there AND tick your
  lane item in `parallel execution.txt` — that file is the parallel
  agents' task board and stale status there causes redone work.
  Version collisions between parallel branches are expected: CHANGELOG.md
  union-merges (`.gitattributes`), and after merging `origin/dev` you
  renumber your own entry past the highest — procedure in `AGENTS.md`.
- **Keep the docs true.** If you change the stack, the data model, or the
  auth flow, update `CLAUDE.md`/`GLOSSARY.md` in the same branch. A big
  architectural decision gets an entry in `decisions.md`. Stale orientation
  docs are worse than none.
- **Hand off the next task.** After your work merges (or the PR is up), end
  your final message with the next unticked item in your lane from
  `parallel execution.txt` AND a paste-ready kickoff prompt for a fresh
  workspace: the task text verbatim, its gates (what must merge first —
  check the lane file), the directories that lane owns, and the acceptance
  bar. If the next item is gated on unmerged work, say so in the kickoff so
  the next agent checks the gate before building. This keeps the parallel
  conveyor moving without the operator re-deriving state.

## The `web10web10!!!` code word (operator → strong model)

When the operator says `web10web10!` (any number of `!`s), it is addressed
to a strong, large-context model (Claude-class). Small-context agents can
ignore this section. It means: run the full plan-alignment pass, refactor
if needed, THEN hand out parallel work. In this order — the audit comes
before the kickoff blocks, always:

1. **Re-read the strategy stack.** `plan.txt` (THE STORY at the top + the
   current priority block), `manifesto.md`, `outreach.md`, `timeline.md`,
   recent `decisions.md`, the lane queues + CURRENT CONDUCTOR BOARD in
   `parallel execution.txt`, and the top ~10 entries of `CHANGELOG.md`.
2. **Audit alignment — dead honest, no cheerleading.** Is the plan still
   aligned with the business (social platform first, protocol second —
   D20) and with the manifesto's promises? On target against
   `timeline.md`? Anything on the board that reads as an infra company
   rather than a social platform gets flagged for parking. Concede to
   evidence; don't re-litigate settled decisions (`decisions.md`).
3. **Audit parallelizability for small-window agents.** The workhorse
   agents are Qwen-class: ~27B, 256k context, sharp (olympiad-level),
   multimodal (they CAN look at app screenshots — use that in acceptance
   bars). They cannot hold plan.txt + CHANGELOG + a whole lane file at
   once. Check every board item: self-contained? names exact files?
   gates and seams explicit? one sub-lane, no shared-seam collisions?
4. **Refactor IF needed.** Docs-only changes to `plan.txt` /
   `parallel execution.txt` / this file, changelog entry, PR to dev per
   `AGENTS.md`. If nothing needs changing, say so plainly and don't churn.
5. **Then produce copy-pastable kickoff blocks**, one per Conductor
   workspace, per the spec below. Not before steps 1-4. ~5 is the
   default width, but the number is whatever the board actually
   supports: fewer if fewer items are truly parallel-safe, more if the
   lanes are wide open.

### Kickoff block spec (for 256k-context agents)
Each block must be self-contained — assume the agent reads ONLY what the
block names. Point at files; never inline what a file already says. The
window is for code, not prose.

- **Opening line:** "Read `AGENTS.md`, then `CLAUDE.md`. If this task
  touches anything a user sees, read `design.md` before writing code."
  Then the SHORT list of extra reads: the item's own text in
  `parallel execution.txt` (give the line range), and the specific
  source files in play.
- **Lane + ownership:** the lane/sub-lane, the directories it owns, and
  one line restating "don't edit outside these; leave a `.context/` note
  if you need another lane's file."
- **The task:** the lane-queue text verbatim, its gates (what must be
  merged first), and the freshness check: confirm the item is still
  `[ ]` in `parallel execution.txt` AND not in the top of `CHANGELOG.md`
  before writing code — if done, stop and say so.
- **Acceptance bar:** tests green (`tsc -b`/build clean where relevant);
  for UI, the `design.md` §12 definition of done — and since the agent
  is multimodal, tell it to screenshot at desktop + 375px and LOOK at
  the screenshots before calling it done.
- **Finish ritual:** CHANGELOG line, tick plan.txt + the lane item,
  type-prefixed branch, PR to `dev`, then conflicts + ALL checks green
  per `AGENTS.md`.
- **Selection rule:** the items must be truly parallel — different
  lanes/sub-lanes, no shared seams, all gates merged. The count follows
  the board, not a quota: fewer safe blocks beats a fixed number of
  colliding ones.

## The `web10 gather up!` code word (operator → strong model)

When the operator says `web10 gather up!`, it is addressed to a strong,
large-context model (Claude-class). Small-context agents can ignore this
section. It means: **inspect the recent PRs merged to `dev` that are not
yet on `main`, and report honestly whether anything is really off or
broken.** This is a quality gate before dev promotes, not a plan audit
(that's `web10web10!!!`).

1. **Gather the batch.** `git fetch`, then `git log --oneline
   origin/main..origin/dev` for the commit list and `gh pr list --base dev
   --state merged` to map commits back to PRs. Read the diffs
   (`git diff origin/main...origin/dev` per area, or per-PR).
2. **Look for really-broken, not nitpicks.** Security invariants I1–I5,
   auth/DB-layer regressions, star-record protection, broken builds or
   red/skipped checks, two merged PRs stepping on the same seam,
   user-facing surfaces that flunk `design.md` (screenshot if runnable),
   missing/wrong CHANGELOG or lane ticks that will cause redone work.
   Style preferences and could-be-nicer are NOT findings.
3. **If nothing is broken, say so plainly** — one short paragraph, no
   manufactured work, no churn.
4. **If something IS broken, produce paste-ready fix blocks** for
   Qwen-class agents (~27B, 256k context), one per independent fix,
   following the kickoff block spec above: name the exact files and the
   offending PR/commit, quote the failing behavior, state the acceptance
   bar (tests green, checks green, screenshots for UI) and the finish
   ritual. Fixes that collide on a seam go in ONE block, not two.

## Running it
`docker-compose.yml` brings the stack up locally (`*.localhost` vhosts).
The target one-container experience (`docker run … web10/node`) is plan
phase 3 — not built yet.
