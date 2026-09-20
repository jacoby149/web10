# Group as a Profile — the edit + create model (operator pass, 18.09.2026)

**Status: PLANNED.** A group **is** a profile. The group page is the profile
page (banner + avatar + about + tabs), **Feed** tab front and center,
**Media** (insta) grid second. An admin edits via a **pencil → inline edit
mode on the page** (face *and* settings). Creating a group opens that same
page **in edit mode as a draft** (auto-saved) → **Publish** / **Delete**.

> **The one-liner (operator, 18.09.2026):** "it should feel just like i am
> editing on the profile page … a little pencil" + "the feed view should be
> front and center, the insta style view … second tab" + "creating a group it
> made a profile looking page come up in the edit mode … hit publish group. or
> delete. … always save the group as draft."

**Companion docs:** `discover-reorg.md` (the group *directory* these pages
are found in) · `global-search.md` (the top-bar search that can land on a
group). This doc is the group *page* — the detail + edit + create.

---

## The operator's intent (verbatim, 18.09.2026)

> "editing the group, i am an admin of the group it should feel just like i am
> editing on the profile page, where i make the group and there is a little
> pencil, like the profile page, but with only the feed view not the insta
> style view. maybe could have the insta style view to see the media in the
> group."

> "the feed view should be front and center, the insta style view has the
> posts and the media, but second tab unlike the profile view which had it
> first."

> "currently when i open a group dont see way to edit the settings, and in a
> new group creation scenario seeing limited settings as well."

> "would be cool if creating a group it made a profile looking page come up in
> the edit mode and let you configure up the group, then hit publish group. or
> delete. when you make changes it could always save the group as draft … that
> would feel much more premium than the current thing."

**Decisions locked (operator, 18.09.2026, on the risk pass):**
1. **No duplicate groups — a create-time *slug* check.** The slug (the
   group_id's last segment) is unique; the draft maker derives it from the
   initial name and checks `get_group` before create → *"name already taken"*
   blocks create (the node's `create_group` has **no** collision guard — bare
   `INSERT`, latest-row-wins — so the client must check). After create the slug
   is the group's identity; the **display name is free** (like a profile's
   @handle vs display name).
2. **One edit model, atomic commit — for drafts *and* published groups.**
   Edit mode (draft or published) **stages** changes (face **and** settings);
   **Save** (published) / **Publish** (draft) **atomically commits** face +
   settings together (the "atomic go" — name + profile + settings land in one
   go, never partially). The **live state is frozen at the last commit** while
   you edit; **Cancel** discards the stage. No continuous two-write, no torn
   states, no divergent stores (this is what makes published-group editing
   safe — the commit is the only write to live, and it's atomic).
3. **Uploads** — a nav-away while an upload is in flight shows a warning
   ("your upload will be canceled if you leave"); **no auto-save mid-upload**.
4. **The slug is a vanity identifier, not a uuid.** It's the group's "domain
   name" — shareable, sellable, namespaced under the owner
   (`web10/groups/{owner}/{slug}`). **Changeable by the owner with a redirect
   from the old slug** (like a profile @handle change). A uuid is only an
   internal fallback id, never the public identifier.

---

## Current state (verified, 18.09.2026)

| Surface | Today | Gap |
|---|---|---|
| **Group detail** (`GroupDetailScreen.tsx`, 3.116.0) | Profile-shaped hero (always) + the **feed** (reference `PostCard` + composer) + a manager-only **"Manage" button** → a sheet (Profile/Settings/Members/Roles) | No **tabs** (feed-only, no media grid); editing is a **separate sheet**, not a profile-style pencil → inline; "don't see a way to edit the settings" |
| **Profile** (`UserProfileScreen.tsx`) — the reference | Banner + avatar + name + bio + **tabs: Posts (grid default / feed toggle) \| Media**; owner **"Edit profile"** → **inline edit mode** (fields → inputs, Save/Cancel) | — the shape the group matches (tab order flipped) |
| **Create group** (`CreateGroupSheet.tsx`) | A **modal**: cover+avatar, name, about, who-can-read, how-join, list-in-directory, tags, website → **Create** (born live) | A form in a modal, not a page; no members/roles; no draft; not premium |

**The node primitives exist** (D60 face doc, D53 `discoverable`, D58 read
grant, `join_policy`, member/role ops). What's missing: a **draft state** and
the client composition. **Verified node facts that shape the design:**
- `create_group` (`clickhouse.py:865`) is a bare `INSERT` — **no collision
  guard**; `get_group` dedups latest-row-wins. → the client checks before
  create (decision 1).
- `delete_group` (`:917`) is a **tombstone** (soft delete) — delete-then-
  recreate the same group_id is safe (the new row wins). So the draft
  create→abandon→recreate cycle is safe at the contract level.
- `list_discoverable_groups` (`:1243`) filters `discoverable=1` — a draft
  (`discoverable=false`) is **already** invisible to the directory. No leak.

---

## The design

### 1. The group page = the profile page (tabs, feed first)
The group detail gains the profile's tab row, **order flipped** (the
operator: feed front and center, insta second):
- **Feed** (default, bare URL) — today's composer + reference `PostCard` feed.
- **Media** (`?tab=media`) — the insta grid of the group's media posts (reuse
  the profile's media grid + lightbox).
Deep-linkable (`?tab=`), refresh-safe. The hero (3.116.0) stays above the tabs.

### 2. Admin editing = the profile's pencil → inline edit mode
- A manager sees an **"Edit" pencil** in the hero (where the profile puts
  "Edit profile"). This is the obvious entry point — fixes "don't see a way
  to edit the settings."
- Tapping it flips the **page into edit mode** (the profile's `editing`
  state): the hero's fields become inputs **inline** — name, about, website,
  tags, banner/avatar pickers — **plus the settings** (who-can-read,
  how-people-join, list-in-directory). The group's edit mode is a **superset**
  of the profile's (face *and* settings).
- **Save / Cancel** (the profile's footer). The Manage sheet's **Profile +
  Settings sections fold in and are retired** as tabs.
- **Members + Roles stay a secondary surface** — a manager **kebab** (not the
  pencil) opens the existing Members + Roles sections. They're list ops, not
  profile fields, so they don't fit inline editing. The visual hierarchy:
  **pencil = edit (primary)**, **kebab = manage members/roles/delete
  (secondary)** — two entry points, clearly ranked, so it doesn't recreate
  the "don't see a way to edit" confusion.

### 3. The draft + edit model (one model, atomic commit — decision 2)
- **Create** ("New group") opens the group page **in edit mode** for a new
  group. The group contract is inserted **now** (`discoverable=false`, owner
  is the only member) — it's inert: the directory filters `discoverable=1`
  (so it's invisible) and no one else is a member (so no one else's list shows
  it). The face doc is written with `status:'draft'`.
- **Edit mode is the same for a draft and a published group.** You're always
  editing a **stage** (face + settings). The **live** group (what others see)
  is frozen at the last commit while you edit. **Cancel** discards the stage.
  - *Draft:* the stage is the face doc (`status:'draft'`); auto-save writes it
    freely (nothing is live). The settings are staged (not applied to the
    contract until commit — the contract is inert anyway).
  - *Published:* the live face is the face doc (`status:'published'`); edits
    are staged (client-side / a transient draft) and **not** auto-saved to the
    live face doc — the live face is unchanged until you commit.
- **Slug validation (create-time, decision 1):** the slug is derived from the
  initial name and checked against `get_group` **before create**. If an
  **active** group exists at that slug → *"name already taken"* blocks create.
  After create the slug is the group's identity (the display name is free —
  decision 4). This is the client-side guard the node lacks.
- **Uploads (decision 3):** banner/avatar pick → upload (async). **No
  auto-save while an upload is in flight** (you can't save a `banner_ref`
  that hasn't resolved). Navigating away mid-upload shows a **warning**
  ("Your upload will be canceled if you leave" — stay / leave). The ref is
  written to the stage only when the upload resolves.
- **The commit is atomic (decision 2).** **Publish** (draft) / **Save**
  (published) applies the staged face **and** the settings **together**, in one
  ordered sequence: face `status→'published'` + `update_group` (join_policy /
  discoverable per who-can-read / the read-grant member rows — the 3.71.0
  rule). Name + profile + settings land in one go — never a partial live
  state. For a draft the group goes live (directory if listed); for a published
  group the live state updates in place.
- **Delete** — two distinct paths, never conflated: **draft-delete** (lightweight,
  in the create flow's action row — discards the draft) vs **published-delete**
  (the existing two-tap confirm, in the kebab — kills a live community). The
  lightweight path is only reachable on a draft.

---

## Bite sizing (small, one owner each)

- [✓ 3.117.0] **G0: the draft state + slug guard** (keystone, `src/data/groups.ts` +
  the D60 identity doc) — `GroupIdentity` gains `status?: 'draft'|'published'`
  (default `published` for existing) **and staging-setting fields** (who-can-read
  / how-join / list-in-directory staged in the face during edit — decision 2);
  `createCommunityGroup` gains a `draft` mode (group `discoverable=false` +
  `status:'draft'` face); a `slugTaken(slug)` helper (the **create-time**
  `get_group` collision check — decision 1); `publishGroup` / `saveGroup`
  (the **atomic** commit: face `status→published` + `update_group`
  join_policy/discoverable/read-grants — one ordered sequence, decision 2);
  `deleteGroup` (exists). My Groups shows the owner's drafts, marked "Draft"
  (the directory is already safe — `discoverable=1`). Unit tests (a draft is
  absent from the directory + others' lists, present to the owner; `slugTaken`
  true on an active group / false on a tombstone; the commit flips it live +
  listed atomically; delete discards). **Gates G2, G4.**
 - [✓ 3.125.0] **G1: the group page tabs** (`GroupDetailScreen.tsx`) — the **Feed**
  (default) | **Media** (`?tab=media`) tab row, feed first; the Media tab is a
  **paged** insta grid of the group's media posts (**infinite scroll** — next
  page as you scroll, not "pull everything") **+ a count** (total media posts,
  so the grid shows "N photos" and knows when it's exhausted); reuse the
  profile's media grid + lightbox. Needs a paged group-media read (`limit`/
  `offset` + count) — verify the detail read is paged enough, else add it.
  Hero + feed unchanged (no regression). `groupsScreens.test.tsx` (tab switch
  + `?tab=` deep link + the media grid pages on scroll + the count).
- [ ] **G2: the inline edit mode** (`GroupDetailScreen.tsx` + a new
  `ManageGroup/GroupEditMode.tsx`) — the manager **"Edit" pencil** in the hero
  → the page flips to edit mode: face fields (name/about/website/tags/
  banner/avatar) **and** settings (who-can-read / how-join / list-in-directory)
  as inline inputs, Save / Cancel. **One model for a draft and a published
  group** (decision 2): edit mode **stages** the changes (the live group is
  frozen at the last commit); **Save/Publish is the atomic commit** (face +
  settings together); **Cancel** discards. **No auto-save mid-upload** + a
  **nav-away upload warning** (decision 3). (The slug-taken guard is
  create-time only — decision 1; in edit mode the display name is free.) The
  Manage sheet's Profile + Settings sections fold in and are retired.
  `groupsScreens.test.tsx` (pencil manager-only; edit mode shows face +
  settings; the commit is atomic (face + settings land together); the upload
  warning; no auto-save mid-upload; Cancel restores the live state; works the
  same on a draft and a published group).
- [ ] **G3: the members/roles secondary surface** — the manager **kebab**
  (secondary to the pencil) opens the existing Members + Roles sections
  (unchanged components, new home) + the **published-delete** two-tap confirm.
  `groupsScreens.test.tsx` (the kebab is manager-only; it opens the sections;
  the published-delete is two-tap).
- [ ] **G4: create = the group page in edit mode (draft)** (`GroupsScreen.tsx`
  + `GroupDetailScreen.tsx` + `groups.ts`) — "New group" opens the group page
  in edit mode for a **draft** (G0); changes **auto-save** (the face doc); the
  action row is **Publish group** / **Delete** (the lightweight draft-delete);
  the name-taken guard is live. The `CreateGroupSheet` is retired (fields +
  tests re-pointed). `groupsCreate.test.ts` + `createGroupSheet.test.tsx`
  re-cut (a new group is a draft — absent from the directory until Publish;
  auto-save persists the face; name-taken blocks; Publish flips it live +
  listed; Delete discards). **Gated on G0, G2.**
- [ ] **G5: the screenshot pass** (`screenshots/`) — `group-{feed,media}-
  {desktop,375}.png`, `group-edit-{desktop,375}.png`, `group-create-{desktop,
  375}.png` (the draft edit-mode page); the screenshot test on every state;
  the harness seeds (a group with media posts, a manager for the pencil, a
  draft for the create flow). **Gated on G1–G4.**

**Ownership:** this lane owns `GroupDetailScreen.tsx`, `ManageGroup/`,
`GroupsScreen.tsx` (the create entry), `groups.ts` (the draft/publish fns).
It does **not** touch `DiscoverScreen.tsx` (discover-reorg) or `Layout.tsx`
(global-search). The one shared file is `groups.ts` — discover-reorg D3
threads `offset` (additive, the directory read), this lane adds the draft
fns (additive, distinct area); **sequence G0 before D3** so the draft filter
+ `offset` land without a conflict.

---

## Acceptance bar (design.md §12)
- Every state at desktop (≥1280) + 375px passes the screenshot test; tokens
  only; all states designed (feed / media / edit-mode / draft-create; manager
  / member / bystander on the pencil; the name-taken error; the upload
  warning; loading / empty on the media grid).
- **Deep links:** `?tab=feed|media` refresh-safe + shareable; the feed is the
  bare URL.
- **The profile feel:** a manager's group page reads as a profile they own —
  the pencil is obvious, edit mode is inline (no modal), creating a group is
  configuring a page, not a form.
- **I3 holds:** a draft is invisible to everyone but the owner (directory +
  others' lists); a non-manager never sees the pencil/kebab or can call the
  edit/publish ops (the API enforces it; the UI hides it).
- `data-testid` hooks on every new control; the existing `groupsScreens` /
  `groupsCreate` / `createGroupSheet` suites stay green (re-pinned where the
  shape moved). The 3.116.0 feed + hero are a no-regression.

## Out of scope (filed, not built)
- The group *directory* + the top-bar search (separate docs).
- Group presence / last-active (no presence data yet).
