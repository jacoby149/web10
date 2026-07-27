# AGENTS.md — for every coding agent (Codex, Qwen, Claude, ...)

## WAKE-UP (before answering ANYTHING beyond a greeting)

This file is the ONLY file guaranteed to be in your context at session
start. Everything else is a read you must choose to make. So, on every
session start in this repo, before doing or answering anything else:
**read `CLAUDE.md`.** If the operator's first message is a code word
below, this is not optional.

## Operator code words — recognize instantly, never treat as banter

- `web10web10!` (any number of `!`s) → run the full ritual defined in
  `CLAUDE.md` ("The `web10web10!!!` code word" section), in this order:
  SHIP FIRST — gather the state of the world (dangling open PRs in ANY
  workspace, not just this one; the dev batch), gate the batch and
  promote dev→main + verify prod if it's clean (fix blocks if not) —
  THEN plan — re-read the strategy stack, audit alignment
  dead-honestly, audit bite-size parallelizability + give the Qwen
  autonomy horizon, refactor planning docs IF needed — THEN emit
  copy-pastable kickoff blocks. (This one command also covers the
  retired `should we do it?` and `web10 gather up!` code words —
  folded 27.07.)
- `unbrick!` → a workspace BROKE (agent choked/stalled/burned it).
  Deliberately separate from `web10web10!` — the fire alarm, not a
  planning ritual. Triggered by the operator OR by D-night-owl (the
  supervisor loop notices a bricked workspace and raises it). Diagnose
  the failure CLASS and fix the SYSTEM (code/infra/tooling first; docs
  are the fallback). Full ritual in `CLAUDE.md`'s `unbrick!` section.

A code word is a command, not a greeting. If you are a large-context
model and one of these arrives, run the ritual — do not reply with
banter.

Now read `CLAUDE.md`. Despite the name it is the orientation file for
ALL agents working on this repo — architecture, security invariants,
and working conventions. Everything there applies to you.

## Before starting ANY UI task: read design.md

If your task touches anything a user sees — `ui/`,
`marketing/marketing-ui/`, `marketing/web10-social/`, any screen or
component — read `design.md` BEFORE writing code, every time. It is
the binding standard: the quality bar (the screenshot test), the
canonical brand assets (the files named `logo*.png` are NOT the
logos — §3 names the real ones), the shared design tokens (§13), and
the UI definition of done (§12: PR screenshots at desktop + 375px
mobile, tokens-only colors, all states designed).

## UI screens: the URL holds the state (deep links everywhere)

Operator rule (26.07.2026): every screen and meaningful screen STATE
in web10-social (and any user-facing app) must be reachable by URL —
refresh restores it, back/forward work, and the link is shareable
when the content is public or bookmarkable when it's private (a DM
thread can't be opened by another user, but the owner bookmarking it
must land back on that exact thread). When you ADD a page, a tab, a
view toggle, a detail panel, or a lightbox: encode which one is open
in the route or query string (react-router is already the stack —
routes for screens, params/query for state like
`/messages/:conversationKey?view=mail` or `/u/:username/p/:postId`).
A screen whose state lives only in useState is a review rejection —
the address bar is part of the product ("everything should be a deep
hyperlink"). Auth-gated routes keep the intended destination through
login and redirect after (the D-url-routing pattern, 1.0.155).

## Before starting ANY task: check it isn't already done

Task completion state lives in three places. Check all three before
writing code — merged work must not be redone:

1. `parallel execution.txt` — the lane queues carry live status:
   `[✓ x.y.z]` = merged (the x.y.z points at the CHANGELOG entry),
   `[~]` = in flight in another workspace, `[ ]` = open.
2. `plan.txt` — completed items are ticked `[✓]`.
3. `CHANGELOG.md` — newest entry at top. Work merged after the lane
   queues were last ticked shows up here first, so always scan the
   top few entries.

If the task you were given is already done, say so and pick the next
unticked item in the same lane instead of redoing it.

## When you finish a task

In the SAME branch as the change: add a `CHANGELOG.md` line (newest at
top, `version || DD.MM.YYYY`), tick the item in `plan.txt`, and tick
your lane item in `parallel execution.txt`. If you changed the stack,
data model, or auth flow, keep `CLAUDE.md`/`GLOSSARY.md` true and
record big calls in `decisions.md`.

## CHANGELOG.md in parallel branches: union-merge, then renumber

Every branch prepends an entry to `CHANGELOG.md`, usually claiming the
same next version number — collisions are expected, not exceptional.
`.gitattributes` sets `CHANGELOG.md merge=union`, so a local
`git merge origin/dev` keeps BOTH sides' entries instead of
conflicting. (GitHub's merge button ignores custom merge drivers, so
a conflicted PR is still resolved locally: merge `origin/dev` into
your branch and push.)

After ANY merge that touched `CHANGELOG.md`:

1. Look at the top of the file — all entries should be intact, none
   duplicated or interleaved. Union merge is line-based, and it dedupes
   identical lines: two entries claiming the same version collapse into
   ONE header with both bodies concatenated under it.
2. If you collided on a version number: the already-merged entry keeps
   it. Renumber YOURS to the next free number (strictly above the
   highest anywhere in the file — the changelog CI check enforces
   this), restore the other entry's header and the blank line between
   entries, and update any `[✓ x.y.z]` / `[~]` refs you made in
   `plan.txt` and `parallel execution.txt` to match.
3. Never rewrite, reorder, or renumber someone else's entry.

## After opening a PR: conflicts first, then EVERY check green

Creating the PR is not the end of the task. "Ready to go" with a
failing check — required OR optional — is a false report. Right after
`gh pr create`, in this order:

1. **Check for conflicts immediately.**
   `gh pr view <n> --json mergeable,mergeStateStatus`
   If `mergeable` is `CONFLICTING`, merge the base into your branch
   (`git fetch origin && git merge origin/dev`), resolve, push.
   `UNKNOWN` means GitHub is still computing — wait a few seconds and
   re-run until it settles.
2. **Watch the checks — all of them.**
   `gh pr checks <n> --watch`
   Every check counts. Optional / non-required checks failing still
   means the PR is red — `mergeStateStatus: UNSTABLE` means a
   non-required check failed; treat it as a failure, not a pass. Do
   not stop at "required checks passed".
3. **Fix until green.** For each failing check, read the log
   (`gh run view --job <job-id> --log-failed`), fix it on the same
   branch, push, and re-watch. Repeat until every check passes.

Only then report the PR ready. The one exception: if a failure is
pre-existing on `dev` and not caused by your branch, prove it (link
the same failure on a `dev` run or another PR) and say so explicitly —
never silently call a red PR ready.

## Branch naming conventions

Every branch must use a type prefix so the history is scannable:

| Prefix | Use when |
|--------|----------|
| `feature/` | New functionality, UI screens, endpoints |
| `fix/` | Bug fixes, security patches, regression fixes |
| `refactor/` | Code restructuring with no behavioral change |
| `chore/` | Deps, CI, tooling, docs, config |
| `test/` | Test additions or test infrastructure |
| `docs/` | Documentation only (CLAUDE.md, plan.txt, etc.) |

**Format:** `type/short-description` — e.g. `fix/auth-token-expiry`, `feature/social-feed`.

Keep descriptions imperative, hyphen-separated, under ~40 characters. No need to include your username or lane — `git log` and the PR already carry that.

Existing `lane-x/` and `username/` branches are fine historically. New branches after this rule should follow the type-prefix format.

## PRs always go to `dev`, never `main`

The base branch for every PR is `dev`. `main` is only updated by an
explicit, deliberate merge from `dev`. Merging to `main` directly
causes conflicts when `dev` later merges into `main` because both
branches diverge on shared files (CHANGELOG.md, CLAUDE.md, plan.txt,
CI workflows). If you're unsure, target `dev`.
