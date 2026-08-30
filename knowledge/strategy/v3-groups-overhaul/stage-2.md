# Stage 2 — The Social App + Authenticator (D58, parallel)

**Fully parallel — one workspace per feature.** Fan-facing
(`marketing/web10-social/`) and admin-facing (`ui/src/components/Groups/`) are
separate apps → separate lanes. Different files → they run in parallel.

**Spec:** `knowledge-base/web10-v3/groups/access.md` + D58 +
`knowledge/strategy/design.md` (this is UI — read it first, every time).
**Lane:** `d58-social` in `parallel-execution.md`.
**Gate:** **Stage 0 (the backend) is merged.** Ideally **Stage 1 (the demos)
is green** too — the demos are the proven reference, so the social work is
"wire up what works," not "debug backend + app at once."

## The two surfaces

- **Fan-facing (`web10-social`)** — what a user *sees*: the group's face
  (the Facebook-shaped hero), the public/private badge, the create-group
  visibility control, the feed/detail rendering the role-gated read.
- **Admin-facing (`ui/` authenticator)** — what an admin *does*: the profile
  editor (set the group's face), the "who can read" control (grant/revoke
  publicness). Group management already lives here (Settings / Roles / Members
  dialogs) — the new controls sit next to them.

## The feature lanes

### Role definitions (shared seam, small — do early)
- **Owns:** `marketing/web10-social/src/data/groups.ts` (+ `sdk/src/` if the `V3GroupRole` type isn't done in Stage 1).
- **Task:** the social app's `FOLLOWER_ROLES` / `COMMUNITY_ROLES` / `DM_ROLES` (in `groups.ts`) are the old `{services, permissions}` shape. Convert them to the per-service map shape (the same conversion the demos did — `groups-demo`'s `ROLE_PRESETS` is the template). This is the shared seam the other social features build on, so it's small and goes first.
- **Acceptance bar:** all three role sets in the map shape; the social app's group-creating flows (follow, DM, create-group) still work; social-app unit tests green + `tsc` clean.

### Group profile — fan-facing (the Facebook hero)  ⭐ the visual win
- **Owns:** `marketing/web10-social/src/components/Groups/GroupDetailScreen.tsx` (+ the data read it needs).
- **Task:** render the group's **face** from the public `group_identity` read: a **banner** (cover) + an **overlapping avatar** + the **name** + **about** (description) + **tags** + **website** — the Facebook-group-shaped hero, in the web10 dark/violet language (design.md: the screenshot test applies — Facebook's *information architecture*, not a reskin). The `GroupDetail` type already carries `banner_ref` / `avatar_ref` / `name` / `description` / `tags` / `website` — resolve the media refs (the app's existing media-resolution path) and render them. All states: no banner (solid brand fallback), no avatar (the initial-letter fallback that exists today), no description (hidden), loading (skeleton), 404.
- **Gates:** Stage 0 (the identity read is public — already there). The media-resolution path exists (3.28.1).
- **Acceptance bar:** the detail hero shows banner + overlapping avatar + name + about + tags + website when set; the fallbacks render when not; no layout shift (reserve the banner space); `tsc` clean + social-app unit tests green; PR screenshots at desktop + 375px (design.md §12).

### Public/private — fan-facing
- **Owns:** `marketing/web10-social/src/components/Groups/` (`GroupsScreen.tsx` cards + `GroupDetailScreen.tsx` + `CreateGroupDialog.tsx`).
- **Task:** (1) a **public/private badge** on the group cards + the detail (does the group grant `anyone`/`authenticated` a read role? — the directory/detail read needs to surface this, or the client infers it from the group's roles). (2) the **create-group dialog** gains a **visibility control** (public / signed-in-only / private) that carries the initial `anyone`/`authenticated` read grant in the `create_group` GCR (the authenticator's `applyGCR` creates the group + the grant).
- **Gates:** Stage 0 (the grants + the read). The role-definitions lane (the GCR role shape).
- **Acceptance bar:** the badge reflects the group's publicness; the create-group dialog's visibility control sends the right grant (public → `anyone` reader, signed-in-only → `authenticated` reader, private → none); a freshly created public group is readable by a signed-out visitor; `tsc` clean + unit tests green; PR screenshots.

### Group profile editor — admin-facing
- **Owns:** `ui/src/components/Groups/` (a new `GroupProfileDialog` next to Settings/Roles/Members).
- **Task:** the admin-facing **profile editor** — name, description, website, tags, **banner upload**, **avatar upload** — that calls the Stage 0 identity write endpoint. Reuse the authenticator's existing media-upload path (the ads upload, 3.28.0) for banner/avatar. All states (design.md): empty (the group has no face yet → CTA), loading, error, saved.
- **Gates:** Stage 0 Item 3 (the identity write endpoint). The existing authenticator media upload.
- **Acceptance bar:** an owner/curator sets the group's face (name/description/website/tags + banner + avatar) → it persists → the fan-facing hero (the other lane) renders it; a member can't open the editor (the `group-identity-service` gate); UI unit tests green + `tsc` clean; PR screenshots.

### Public/private control — admin-facing
- **Owns:** `ui/src/components/Groups/` (the "who can read" control, in `GroupSettingsDialog` or a new control).
- **Task:** the admin-facing **"who can read"** control — public / signed-in-only / private — that grants / revokes the `anyone` / `authenticated` read role on the group (a `group_members` row for the reserved key). This is the owner's visibility switch, separate from the `discoverable` (directory) toggle — the two-controls model (`discoverability.md`).
- **Gates:** Stage 0 (the reserved-key grants).
- **Acceptance bar:** flipping the control grants/revokes the `anyone`/`authenticated` read role → a bystander's read changes accordingly (public → reads posts, private → identity only); it does **not** touch `discoverable` (the two controls stay separate); UI unit tests green + `tsc` clean; PR screenshots.

### Feed + detail effective-role read — fan-facing (verification)
- **Owns:** `marketing/web10-social/` (the feed read + the group detail render).
- **Task:** **mostly a render verification** — the API does the role-gating (Stage 0); this lane confirms the social app renders what the role-gated read returns: a bystander on a **private** group sees the face + "join to view" (no posts); on a **public** group sees the posts; a member sees their group's posts. If the feed read or the detail needs a small change to surface the new read shape, make it. The I3 anti-surface (a non-member never sees a private group's posts) is the key assertion.
- **Gates:** Stage 0. The group-profile + public/private lanes (the render targets).
- **Acceptance bar:** the three render forks (private → face + join-to-view; public → posts; member → posts) are correct; a non-member never sees a private group's posts (I3); `tsc` clean + unit tests green.

## Stage 2 done-ness

Stage 2 is done when: a user can **see** a group's face (the hero) + its
publicness, **create** a group with a visibility at birth, an admin can **edit**
the face + **flip** publicness, and the feed/detail render exactly what the
role-gated read allows. **The v3 groups overhaul is complete** — the Facebook-
shaped group, admin-managed, with AWS-level access control underneath.
