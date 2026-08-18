# Parallel Execution

Companion to `plan.md`. That file says **what** and **why**; this file
says what can happen **at the same time**.

> The previous lane queues are archived at
> `archive/parallel-execution-17.08.2026.md`. This is a fresh board. Add
> lanes as work is scoped.

---

## Rules

1. **Lane ownership** — each lane owns its directories. No lane edits
   another lane's files. Cross-lane seams go through `.context/` notes.
2. **Merge small, merge often** — branches live days, not weeks.
3. **Every branch updates the changelog** — add a `CHANGELOG.md` line,
   tick the `plan.md` item, tick your lane item here.
4. **Bite sizing** — one bite = one PR ≈ 20-40 focused minutes.
   If an item needs an "AND", split it.

## Status Key

| Mark | Meaning |
|------|---------|
| `[✓]` | Merged |
| `[~]` | In flight in another workspace |
| `[ ]` | Open |

---

## Lanes

<!--
Format per lane:

### Lane: <name> (Phase N)
**Owns:** `<dir>`

- [ ] <bite>
-->

### Lane: hello-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/hello/`

- [ ] Auth flow completes without errors
- [ ] Greeting shows correct username
- [ ] Groups listed correctly
- [ ] Session restores on page reload
- [ ] No console errors in any flow
- [ ] Full E2E test with popup + log sequence verification

### Lane: notes-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/notes/`

- [ ] Auth flow completes without errors
- [ ] Create note works
- [ ] Read/list notes works
- [ ] Update note works
- [ ] Delete note works
- [ ] Data persists after page reload
- [ ] No console errors in any flow
- [ ] UI is clean, responsive, readable code

### Lane: messages-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/messages/`

- [ ] Auth flow completes without errors
- [ ] Send message works
- [ ] Receive/read messages works
- [ ] Two-identity conversation works
- [ ] Data persists after page reload
- [ ] No console errors in any flow
- [ ] UI is clean, responsive, readable code

### Lane: groups-demo (Phase 1)
**Owns:** `marketing/marketing-ui/public/docs/groups/`

- [ ] Auth flow completes without errors
- [ ] Create group works
- [ ] Add member to group works
- [ ] Post to group works
- [ ] Read group posts works
- [ ] Data persists after page reload
- [ ] No console errors in any flow
- [ ] UI is clean, responsive, readable code
