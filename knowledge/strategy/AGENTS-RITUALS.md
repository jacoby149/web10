# Agent Rituals

The big procedural rituals — only the strong model runs these. Triggered by
operator code words in `AGENTS.md`. Read on demand, not at wake-up.

## The `web10web10!!!` code word (operator → strong model)

When the operator says `web10web10!` (any number of `!`s), it is addressed
to a strong, large-context model (Claude-class). Small-context agents can
ignore this section. It means: run the full ritual — SHIP FIRST (gate the
dev batch and promote if clean), THEN plan (audit alignment + Qwen runway),
THEN hand out parallel work. You cannot plan honestly against an unpromoted
or broken batch, so the ship gate comes before the audits, and the audits
come before the kickoff blocks — always.

1. **Gather the state of the world.** `git fetch`; read `knowledge/strategy/plan.md`
   (THE STORY at the top + the current priority block), `knowledge/strategy/manifesto.md`,
   `knowledge/strategy/outreach.md`, `knowledge/strategy/timeline.md`, recent `knowledge/strategy/decisions.md`, the lane queues
   + CURRENT CONDUCTOR BOARD in `knowledge/strategy/parallel-execution.md`, and the top
   ~10 entries of `knowledge/changelogs/CHANGELOG.md`. PLUS the two live-state scans the
   docs alone can't give you:
   - **Dangling PRs:** `gh pr list --state open` — every open PR in ANY
     workspace, not just this one. For each: how old, mergeable or
     conflicting, checks green or red, does it duplicate/conflict with a
     board item? A red, stale, or conflicting open PR makes kickoff
     blocks lie about gates — name each one in the report (fix, close,
     or flag for the operator), never silently work around it.
   - **The dev batch:** `git log --oneline origin/main..origin/dev` +
     `gh pr list --base dev --state merged` — what's merged to `dev`
     but not yet shipped, for the gate in step 2.
2. **Gate the dev batch, and SHIP it if clean** (the full rules live
   below under "The dev-batch gate + dev→main promotion"): read the batch
    diffs, hunt for really-broken only (invariants I1–I5, auth/DB
    regressions, red checks, seam collisions between
   merged PRs, `knowledge/strategy/design.md` flunks, missing CHANGELOG/lane
   ticks — style nitpicks are NOT findings). If broken: emit paste-ready
   fix kickoff blocks and DO NOT promote (unless the operator explicitly
   overrides — then restate what is broken first, in one line). If clean:
   say so plainly, promote dev→main with a MERGE COMMIT (never squash),
   watch deploy-prod + cd until actually green, verify prod live via the
   public slice of `ubuntu-deployment/scripts/smoke.sh`, and report what
   prod now serves.
3. **Audit alignment — dead honest, no cheerleading.** Is the plan still
   aligned with the business (social platform first, protocol second — D20)
   and with the manifesto's promises? On target against
   `knowledge/strategy/timeline.md`? Anything on the board that reads as an
   infra company rather than a social platform gets flagged for parking.
   Concede to evidence; don't re-litigate settled decisions
   (`knowledge/strategy/decisions.md`).
4. **Audit parallelizability for small-window agents.** The workhorse
   agents are Qwen-class: ~27B, 256k context, sharp (olympiad-level),
   multimodal (they CAN look at app screenshots — use that in acceptance
   bars). They cannot hold `knowledge/strategy/plan.md` + CHANGELOG + a
   whole lane file at once. Check every board item: self-contained? names
   exact files? gates and seams explicit? one sub-lane, no shared-seam
   collisions? Include the **board inventory + autonomy horizon**: count
   `[ ]` vs `[~]` vs `[✓]`, how many bites remain before the next gate,
   and whether each open bite can be picked up WITHOUT coordination. Then
   give an explicit verdict in the report: "Qwens can run independently —
   horizon is ~X PRs before the next intervention" or "No — here are the
   markdown fixes that extend the horizon." The long-term strategy is use
   the strong model less, Qwens more: sharper tasks upfront (more bite-
   splits, exact file lists, one acceptance check) beat interventions
   after a brick. Each Qwen PR costs far less than a mastermind pass, so
   markdown that buys independence is a win even when it means more
   markdown.
5. **Refactor IF needed.** Docs-only changes to `knowledge/strategy/plan.md` /
   `knowledge/strategy/parallel-execution.md` / this file, changelog entry,
   PR to dev per `AGENTS.md`. If nothing needs changing, say so plainly
   and don't churn.
6. **Then produce copy-pastable kickoff blocks**, one per Conductor
   workspace, per the spec below. Not before steps 1-5. ~5 is the
   default width, but the number is whatever the board actually
   supports: fewer if fewer items are truly parallel-safe, more if the
   lanes are wide open.

### Kickoff block spec (for 256k-context agents)

Each block must be self-contained — assume the agent reads ONLY what the
block names. Point at files; never inline what a file already says. The
window is for code, not prose.

- **Opening line:** "Read `AGENTS.md`. If this task touches anything a
  user sees, read `knowledge/strategy/design.md` before writing code."
  Then the SHORT list of extra reads: the item's own text in
   `knowledge/strategy/parallel-execution.md` (give the line range), and
  the specific source files in play.
- **Lane + ownership:** the lane/sub-lane, the directories it owns, and
  one line restating "don't edit outside these; leave a `.context/` note
  if you need another lane's file."
- **The task:** the lane-queue text verbatim, its gates (what must be
  merged first), and the freshness check: confirm the item is still
   `[ ]` in `knowledge/strategy/parallel-execution.md` AND not in the top
   of `knowledge/changelogs/CHANGELOG.md` before writing code — if done,
   stop and say so.
- **Acceptance bar:** tests green (`tsc -b`/build clean where relevant);
  for UI, the `knowledge/strategy/design.md` §12 definition of done — and
  since the agent is multimodal, tell it to screenshot at desktop + 375px
  and LOOK at the screenshots before calling it done.
- **Finish ritual:** CHANGELOG line, tick `knowledge/strategy/plan.md` +
  the lane item, type-prefixed branch, PR to `dev`, then conflicts + ALL
  checks green per `AGENTS.md`.
- **Selection rule:** the items must be truly parallel — different
  lanes/sub-lanes, no shared seams, all gates merged. The count follows
  the board, not a quota: fewer safe blocks beats a fixed number of
  colliding ones.
- **Bite sizing** (rule 5 in `knowledge/strategy/parallel-execution.md`;
  operator, 27.07): one kickoff = ONE BITE = one PR ≈ 20-40 focused
  minutes — a couple of files, one seam, one acceptance check the agent
  can hold in its head. Never hand an agent a whole chain or an item
  whose description needs an "AND"; split those into a BITES: breakdown
  inside the lane item first, kick off only the next unblocked bite, and
  name the follow-up bite so the agent queues it after merge. The audit
  (step 3) is where oversized items get split — a `web10web10!` that
  emits un-bitten blocks has skipped its own step 3.

## The `unbrick!` code word (operator or night-owl → strong model)

`unbrick!` is deliberately NOT part of `web10web10!`: it is the fire
alarm, not a planning ritual. It fires when a workspace BREAKS — a
workhorse agent choked, bricked, stalled, or burned a workspace on a
task. The trigger is either the operator describing the failure (the
task, what the agent did, roughly why) or **D-night-owl** (parallel
execution.txt, lane ws-E/infra): the supervisor loop watches Conductor,
notices a stalled/looping/errored workspace, and raises `unbrick!`
itself — that detection-and-trigger path is a night-owl acceptance
criterion, so build it in when night-owl lands. The goal is the same
either way: **turn the failure into a process fix so it cannot recur.**
**The bricked workspace itself is disposable — do NOT spend the ritual
rescuing it.** The task gets re-issued (step 3) into a fresh workspace;
the fix targets every future workspace, not the dead one. Then:

1. **Diagnose the failure CLASS, not the instance.** Was it context
   overflow (item too big / too many files named)? A missing gate
   (built against unmerged work)? A seam collision? An ambiguous
   acceptance bar? Missing environment knowledge (a command that
   needs a flag, a test that needs a running stack, `--legacy-peer-deps`
   -class friction)? A doc that lied (stale tick, wrong line number)?
2. **Fix the FLOW — default to code, infra, dev tools. Docs are the
   fallback, not the fix.** A Qwen 27B is a sharp SWE; if it got
   mixed up, the first question is not "what rule was missing" but
   "why was the system complex enough to mix up a competent SWE?" —
   that complexity is the bug, and the brick is the opportunity to
   remove it (operator, 27.07). The unbrick IS a structural software
   change: code, infra, dev ops, dev tools. Anything that makes the
   workflow foolproof for Qwen so no markdown adjustment is needed —
   pure enhancement of the ease of use of the system to devs.
   Default to the staff-SWE fix that makes the failure IMPOSSIBLE or
   self-explaining: split the monolithic suite/file agents choke on,
   add the fixture/harness that removes setup archaeology, add a
   one-command runner for a fast feedback loop, extract the seam two
   lanes keep colliding on, add a guard that fails fast with the
   exact fix in its error message, a script for the step agents
   fumble, a scaffold that makes the correct shape the path of least
   resistance. Precedent: Qwen was bricking on the e2e testing; the
   unbrick was a structural change to the suite plus making the
   tests easier to RUN — the bricking stopped with no new rule.
   Structural unbricks are code: full finish ritual (tests green,
   checks green), often zero markdown touched. Fall back to a doc
   fix (an `AGENTS.md` checklist line, a bite-split or gate fix in
    `knowledge/strategy/parallel-execution.md`, a sharper kickoff bullet
    here, an environment note next to the thing that bit) only when
   code genuinely can't encode the lesson.
3. **Re-issue the kickoff block** for the bricked task, corrected —
   with the failure's lesson baked in (smaller bite, explicit gate,
   the exact command that works) — so the operator can paste it into
   a fresh workspace immediately.
4. **Log it:** CHANGELOG line (`docs: unbrick — <failure class>`),
    and if the fix changed a rule, keep `AGENTS.md` true in
   the same branch. PR to dev per `AGENTS.md`.

Rules of the ritual: no blaming the model in the docs (the docs
failed the agent); one failure = one class = one durable fix — don't
speculatively add rules for failures that haven't happened (rule
bloat chokes small windows exactly like big tasks do); if the same
class bricks twice, the previous fix was wrong — replace it, don't
stack another rule on top.

## The `imma rant` code word (operator → any agent)

`imma rant` means the operator is about to fire a stream of complaints
(usually with screenshots). Every complaint becomes a lane item in
`knowledge/strategy/parallel-execution.md` + `knowledge/strategy/plan.md`
(verbatim quote, screenshot referenced, diagnosis if cheap, acceptance
bar, sub-lane + gates, bite-sized per rule 5) on one docs branch with
a CHANGELOG line — and NOTHING gets implemented in this workspace,
however small the fix feels. The next `web10web10!` turns the filings
into Qwen kickoff blocks. Outside a declared rant, small direct fixes
remain fine.

## The dev-batch gate + dev→main promotion (executed as `web10web10!` step 2)

**Quality-gate the dev batch, and if it's clean, SHIP IT — promote
dev→main and verify prod is actually live.** Two halves, in order: the
audit (steps 1–4), then the promotion (steps 5–7).

1. **Gather the batch.** `git fetch`, then `git log --oneline
   origin/main..origin/dev` for the commit list and `gh pr list --base dev
   --state merged` to map commits back to PRs. Read the diffs
   (`git diff origin/main...origin/dev` per area, or per-PR).
2. **Look for really-broken, not nitpicks.** Security invariants I1–I5,
    auth/DB-layer regressions, broken builds or
   red/skipped checks, two merged PRs stepping on the same seam,
   user-facing surfaces that flunk `knowledge/strategy/design.md`
   (screenshot if runnable), missing/wrong CHANGELOG or lane ticks that
   will cause redone work. Style preferences and could-be-nicer are NOT
   findings.
3. **If nothing is broken, say so plainly** — one short paragraph, no
   manufactured work, no churn — then go straight to step 5.
4. **If something IS broken, produce paste-ready fix blocks** for
   Qwen-class agents (~27B, 256k context), one per independent fix,
   following the kickoff block spec above: name the exact files and the
   offending PR/commit, quote the failing behavior, state the acceptance
   bar (tests green, checks green, screenshots for UI) and the finish
   ritual. Fixes that collide on a seam go in ONE block, not two.
   **A red batch does not promote** — stop after the fix blocks; the
   promotion happens on the next `web10web10!` once the fixes merge.
   (If the operator explicitly says ship anyway, obey — but restate
   what is known-broken first, in one line.)
5. **Promote dev→main with a MERGE COMMIT, never squash.** Open the
   promotion PR (`gh pr create --base main --head dev`), check conflicts
   (`gh pr view --json mergeable,mergeStateStatus`), then merge with
   `gh pr merge --merge`. Squash-merging dev→main destroys the shared
   merge base, so every later promote hits add/add conflicts on the
   union-merged files (knowledge/changelogs/CHANGELOG.md, knowledge/strategy/plan.md,
   workflows) — this happened once and the cleanup (80378e92) was
   manual; don't repeat it. Known pre-existing red that does NOT block
   promotion: the e2e MinIO host-port checks (no host port mapping in
   e2e/docker-compose.yml, documented in 1.0.167) — name it in the
   report instead of chasing it.
6. **Watch the deploy until it is actually green.** The push to `main`
   fires the deploy (deploy-prod) and cd (publish images) workflows:
   `gh run list --branch main`, then `gh run watch` each. A red deploy
   job means prod is SILENTLY PINNED at the previous build while `main`
   moves on — exactly how prod sat broken at 1.0.161 for a day
   (CHANGELOG 1.0.169). Never end the ritual with a red deploy:
   diagnose, fix (directly if small, else a fix block), re-deploy.
7. **Verify prod is live, then report.** Hit the public prod endpoints
   from the workspace — the prod slice of
   `ubuntu-deployment/scripts/smoke.sh` (api `/docs` + `/`, auth,
   social, www + apex, marketing-api `/docs`; all public). The dev
   vhosts resolve only on the box/VPN — if unreachable, say "dev smoke
   needs the box", don't pretend. If a user-facing surface changed,
   load it and LOOK at it. The final report states: what merged, what
   prod now serves (version/commit), any pre-existing reds by name,
   and anything deliberately not done.
