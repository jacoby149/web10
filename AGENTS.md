# AGENTS.md — for every coding agent (Codex, Qwen, Claude, ...)

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

## PRs always go to `dev`, never `main`

The base branch for every PR is `dev`. `main` is only updated by an
explicit, deliberate merge from `dev`. Merging to `main` directly
causes conflicts when `dev` later merges into `main` because both
branches diverge on shared files (CHANGELOG.md, CLAUDE.md, plan.txt,
CI workflows). If you're unsure, target `dev`.
