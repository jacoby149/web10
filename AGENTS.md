# AGENTS.md — for every coding agent (Codex, Qwen, Claude, ...)

Now read `CLAUDE.md`. Despite the name it is the orientation file for
ALL agents working on this repo — architecture, security invariants,
and working conventions. Everything there applies to you.

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

## PRs always go to `dev`, never `main`

The base branch for every PR is `dev`. `main` is only updated by an
explicit, deliberate merge from `dev`. Merging to `main` directly
causes conflicts when `dev` later merges into `main` because both
branches diverge on shared files (CHANGELOG.md, CLAUDE.md, plan.txt,
CI workflows). If you're unsure, target `dev`.
