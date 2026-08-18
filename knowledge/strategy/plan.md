# web10 v3 Plan

> **THE RULE:** docs first, then code. If the docs are perfect, the LLM
> implements perfect. If the docs are vague, the code is vague. No
> exceptions.

> The previous plan (phases 0–3, all lane items) is archived at
> `archive/plan-17.08.2026.md`. This is a fresh plan. Fill it in as work
> is scoped — one phase at a time, docs before code.

## Hierarchy of Reliance

Every layer depends on the one above it. An LLM implementing any layer
reads only the layer directly above it — never skips, never guesses.

```
Plan (this file)
  ↓
Knowledge base (web10-v3/ — architecture, data model, contracts)
  ↓
Marketing docs (marketing-ui/public/docs/ — customer-facing, derived from KB)
  ↓
Backend / API implementation (ClickHouse, SDK server, CRUD endpoints)
  ↓
Authenticator implementation (ui/ — consent, tokens, service contracts)
  ↓
Social app implementation (marketing/web10-social/ — screens, feeds, groups)
```

If a lower layer contradicts its source above, the source wins. Always.

---

## Phases

<!--
Format per phase:

## Phase N — <name>

**Where:** `<dir>`

<one-paragraph why this phase exists and what "done" looks like>

- [ ] **<area>** (`<file>`) — <the bite>
-->

## Phase 1 — Demo Apps: Hello, Notes, Messages, Groups

**Where:** `marketing/marketing-ui/public/docs/{hello,notes,messages,groups}/`

The demos are the first thing a developer sees. If they don't work
flawlessly, the whole project looks broken. "Done" = each demo runs
end-to-end (auth → CRUD → data persists across reload), the UI is clean
and responsive, and the code is readable enough to copy-paste into a
real app. No console errors, no dead buttons, no stale state. Every demo
has a full E2E test that exercises the real auth popup flow and verifies
the console log sequence.

- [ ] **Hello demo** (`hello/`) — auth flow completes, greeting shows username, groups listed. No console errors. Full E2E with popup + log sequence verification.
- [ ] **Notes demo** (`notes/`) — full CRUD works: create, read, update, delete a note. Auth flow completes. Data persists after reload. No console errors. Full E2E with popup + log sequence verification.
- [ ] **Messages demo** (`messages/`) — send and receive messages between two identities. Auth flow completes. Messages persist after reload. No console errors.
- [ ] **Groups demo** (`groups/`) — create a group, add members, post to group, read group posts. Auth flow completes. Data persists after reload. No console errors.
