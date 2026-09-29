# Content Moderation: Sensitive Language Detection + Discover Suppression

**Status:** decided (D59) + built (3.37.0). The detection layer, the write-path auto-hide, the `moderation_flags` review queue, the `auto_hide_users` list, and the node-level **ban** (`banned_users`) are all in. The operator's moderation surface lives in the **social app's Node Settings** (the node owner's surface — see "The UI surface" below); the authenticator's Node Config moderation card is retired (it's social-related, not node-infrastructure). The open questions below are resolved by the v0 build: whole-word matching, profile name/bio are flagged-only (not scanned on the post path), and the queue is human-in-the-loop (the operator suppresses; the machine only flags). **User-level suppression is retroactive** (hiding a user hides their existing discover posts, not just future ones), and a **ban** is a stronger, node-level read-path filter (see "The Ban" below).

## The Problem

A node operator needs to keep the discover board clean. Slurs, hate speech, and severe profanity make the board hostile. The operator needs:

1. **Detection** — flag content containing blocked language.
2. **Auto-hide** — when enabled, offending posts are automatically hidden from the discover board.
3. **Operator review** — flagged users surface: "this user has N hidden posts, keep hiding their future ones?"
4. **User-level** — once the operator confirms, the user's *future* posts are auto-hidden too. Their data is intact, their profile resolves, their followers still see them. D41 holds.

## The Design: Use What's Already There

The discover board is a group (`{provider}/groups/web10/discover` — `{provider}` is the node's configured `PROVIDER`, its API host, so each node's board has a unique global id). It already has:

- **`group_hidden_docs`** — individual posts hidden from the group's read
- **`POST /v3/groups/{hide,unhide,hidden}`** — gated by `hideAll` role permission OR node admin
- **Read path** — already anti-joins against `group_hidden_docs`

The moderation feature is a **detection layer on top of the existing hide mechanism**. No new role, no new column on `group_members`, no new read-path change. The board read doesn't change at all.

### The Flow

```
post created
    │
    ▼
detection: text matches blocklist?
    │
    ├── no → normal flow, post visible on discover
    │
    └── yes
         │
         ├── auto_moderate ON → hide post from discover group (existing endpoint)
         │                       + insert flag row (for the review queue)
         │
         └── auto_moderate OFF → insert flag row only (post stays visible,
                                 operator reviews manually)
```

### User-Level: "Hide This User" (retroactive)

When the operator hides a user (review queue "Keep hiding", the People tab, or the Link tab), the user's username is added to `node_config.auto_hide_users` (a JSON array). This is **retroactive**: the `POST /v3/moderation/auto-hide` endpoint, on `hide=true`, also sweeps the user's **existing** discover posts and hides each from the board (the existing `group_hidden_docs` mechanism); on `hide=false` it restores them. The write-path hook still runs on every subsequent post (is this username in `auto_hide_users`? → auto-hide, no blocklist match needed), so future posts are covered too.

This is a **node-level curation list**, not a user penalty. The operator curates the board. The user's data is untouched (their copy and their followers' feed are intact — I3). Removing the username from the list restores their discover visibility (existing posts restored, future posts no longer auto-hidden).

### The Ban: `node_config.banned_users` (node-level read-path filter)

A **ban** is stronger than a hide. A hide (`auto_hide_users`) is *board curation* — it suppresses the user's docs from the **discover board** only; their profile, their followers' feed, and their docs in other groups are untouched. A ban is a **node-level read-path filter**: the user's username is added to `node_config.banned_users` (a JSON array, the same shape as `auto_hide_users`), and **every read path filters out docs created by a banned user** — the board read (`_board_base_sql`) and the query engine (`_boundary_cte_sql`) both carry a `author_key NOT IN (banned_users)` predicate. A banned user's content does not surface in any read (discover, feed, profile, the D73 query engine) — **for any service, not just social** (D60: the ban is a generic node-owner feature, a read-path predicate on `author_key`, app-agnostic).

The ban is **node-level** (a node_config list, not a user property — it does not follow the user across nodes), **reversible** (remove the username from the list and their content returns), and **admin-only** (`POST /v3/moderation/ban`, gated by `check_admin`). It is the operator's "this account is not welcome on this node" lever — distinct from the board-curation hide, which is "keep this user off the public board". A banned user is also hidden from the discover board (the ban subsumes the hide for board visibility), but the ban's reach is the whole read path, not just the board.

## Detection

### Blocklist: `node_config.sensitive_words`

A JSON array of words/phrases. Operator-curated in the Node Config UI (authenticator), same pattern as the telemetry IDs (3.27.3). The node ships with a sensible default (slurs, severe slurs, worst profanity). Blank array = detection off.

**Matching rules (v0):**
- Case-insensitive
- Whole-word only (word boundaries) — "ass" does not match "assassin"
- No regex (v1 consideration)

### Detection scope

| Field | Scanned? |
|---|---|
| Post `text` | Yes |
| Profile `bio` | Yes (flag only, no auto-hide — a bio isn't a discover post) |
| Profile `name` | Yes (flag only) |
| DMs | No |
| Group names/descriptions | No (v1) |

### Detection timing

**On write, server-side.** The client never sees the blocklist. The check runs in the `/v3/create` handler (and profile update handler) before the response returns. If a match:

1. The post is **created normally** (the write succeeds)
2. If `auto_moderate` is on AND the post is attached to the discover group → call the existing hide
3. Insert a row in `moderation_flags` (the review queue)

## The Review Queue

### `moderation_flags` table

The one new table. Append-only, latest-wins:

```
moderation_flags (
    username String,
    doc_id String,
    matched_words String,    -- JSON array of matched words
    created_at DateTime
) ORDER BY (username, created_at)
```

No `resolved` column. The queue is: `SELECT username, count(*), max(created_at), arrayFlatten(groupArray(matched_words)) FROM moderation_flags GROUP BY username ORDER BY max(created_at) DESC` — **one row per user** (the `arrayFlatten` collects every matched word across the user's flags into a single array on that one row; an `arrayJoin` here would split a multi-flag user into one row per flag, duplicating them in the queue). The operator's action (add to `auto_hide_users` or dismiss) is a `node_config` update, not a mutation of this table. The table is an append-only audit log.

### The UI surface

The operator's moderation surface lives in the **social app's Node Settings** (`/node-settings`, `marketing/web10-social/src/components/NodeSettings/`), reachable from the "More" menu (desktop popover + mobile sheet) and gated by the node-owner check (`useNodeAdmin` → `POST /am_admin`). It is social-related (it curates the social app's discover board), so it lives in the social app, not the authenticator's Node Config (that card + the Board Moderation card are retired). Three tabs, deep-linkable (`?tab=`):

- **Moderation** (default) — the sensitive-words blocklist (tag input, add/remove), the **master switch** (`moderation_enabled`), the **auto-moderate toggle** (`auto_moderate`), the **Hidden from Discover** list (`auto_hide_users`, with unhide), the **Hidden Posts** list (the discover group's `group_hidden_docs` via `POST /v3/groups/hidden`, with a per-post **Unhide** — the surface the authenticator's retired Board Moderation card had), and the **review queue** (`/v3/moderation/flags`: username, flag count, matched words, a **Keep hiding / Hiding** action that adds/removes the username from `auto_hide_users`, and a **Ban / Unban** action that adds/removes the username from `banned_users`).
- **People** — builds on the D0 people directory: search the node's people; **clicking a person opens their profile** (`/u/:username`); expand one to **see their posts**, and **Hide** a user (adds to `auto_hide_users`, retroactive), **Ban** a user (adds to `banned_users`), or **Hide** a specific post (board takedown, `POST /v3/groups/hide`).
- **Link** — paste a web10 permalink (`/u/:username/p/:postId` or `/u/:username`); it pulls up the post + the author and offers **Hide this post** (board takedown) + **Hide user** (`auto_hide_users`) + **Ban user** (`banned_users`). This is the operator's "I got a link to a bad post (e.g. an escort ad), let me deal with it" surface.

The data seam is `marketing/web10-social/src/data/moderation.ts` (the `/v3/moderation/*` + `/config/update` + `/v3/groups/{hide,unhide,hidden}` calls, the `parseWeb10Link` parser mirroring `preview/server.mjs`, and the `readUserPostsForModeration` read).

### The "hide a user" behavior (retroactive)

`node_config.auto_hide_users` is a JSON array of usernames. Two mechanisms keep a hidden user off the board:

1. **The write-path hook** — on every post create by a listed user, the post is hidden from the discover group + flagged (no blocklist match needed):

```python
if user.username in config.auto_hide_users:
    hide_from_discover(doc_id)
    insert_flag(username, doc_id, ["auto_hide_users"])
```

2. **The retroactive sweep** — `POST /v3/moderation/auto-hide` with `hide=true` also hides the user's **existing** discover-board docs (a query for their docs on the discover group, each `hide_doc_from_group`); `hide=false` restores them. The sweep is **service-agnostic** (D60 — no `posts` hardcode): a hide is "take this user off the board", so every doc they have on the board is swept, whatever service it lives in. This is what makes "hide a user" take effect immediately, not just on their next post.

Removing them from the list stops future auto-hides and restores their existing discover posts.

## Node Settings

New fields on `node_config`:

| Field | Type | Default | Description |
|---|---|---|---|
| `sensitive_words` | String (JSON array) | `["...defaults..."]` | The blocklist. Empty array = off. |
| `auto_moderate` | UInt8 | 1 | When 1, matching posts are auto-hidden from discover. |
| `moderation_enabled` | UInt8 | 1 | Master switch. 0 = no detection runs. |
| `auto_hide_users` | String (JSON array) | `[]` | Usernames whose posts are hidden from discover (retroactive + future). Board curation. |
| `banned_users` | String (JSON array) | `[]` | Banned usernames — their content is filtered out of every read path (node-level ban). |

All set in the Node Config UI / Node Settings. Changes apply immediately (read on each read, no cache).

## Copyright Takedowns: the "Post-It Note" DMCA rule

Content moderation (above) is the **operator's** curation lever — the node owner keeps the board clean. **Copyright takedowns** are a different, **legal-compliance** surface: a third-party rights holder (not the operator) asks for infringing content to be removed. web10 follows the **"Post-It Note" rule** — the deliberately-small takedown path that keeps a node legally protected while it's small.

**The model (no backend, no queue, no database):**

1. **The designated agent** is an email address — `copyright@web10.com` for the web10 reference node / web10-social. A self-hosted node names its **own** agent in its own terms (the node stays generic, D60 — the agent is a terms-level thing, not a node-config column).
2. **The report is an email.** The rights holder sends the agent a link to the infringing content + their name + how to reach them + a statement that they are the rights holder (or authorized to act).
3. **The operator acts fast.** They open the link and remove the content **manually** — the existing board takedown (`POST /v3/groups/hide`) or, for a full removal, the author's own delete. Acting quickly on valid notices is the legal protection: a small node that responds promptly to valid DMCA notices is safe.

**Why this is the right shape (and not a takedown queue):**

- **It is not a node feature.** There is no `takedowns` table, no `/v3/takedowns` endpoint, no in-app report queue. The email **is** the report. Adding a node surface for it would violate D60 (the node stays app-agnostic; a DMCA queue is a legal/operational concern, not a platform primitive).
- **The in-app affordance is a `mailto:` composer, not a write.** The social app's **Settings → About → Report copyright** opens a dialog that shows the designated agent's email + a pre-filled message (the content's link, the author, a rights statement) and hands it to the user's mail client. It never sends anything itself — no data write, no node call. This is the **single** entry point (not a per-post button on every surface: video, shorts, hot gossip, profile — the mechanism is an email, so the button lives in one always-reachable place, not scattered across the content surfaces).
- **The terms of service publish the address** (`marketing-ui /docs/terms`, the "Copyright & DMCA" section) so a rights holder who doesn't use the app can still find it.

**The seam:** `marketing/web10-social/src/components/shared/ReportCopyright.tsx` (the `mailto:` dialog + the `COPYRIGHT_EMAIL` constant), reached from `SettingsScreen` (the About section). The public doc is `marketing/marketing-ui/public/docs/terms.md`.

**What this is NOT:**

- **Not a strike system.** No counter, no account penalty, no "three strikes and you're out". A valid notice removes the content; that's the whole mechanism.
- **Not a substitute for the operator's moderation.** The operator's board curation (hide/ban above) is for *their* node's health; a DMCA takedown is for *someone else's* rights. They share the same removal lever (the board takedown) but are different intents.
- **Not a legal guarantee.** The "Post-It Note" rule is the small-node posture: a real, published, fast-acting takedown path. It is not a substitute for the operator's own legal counsel, and a self-hosted node's terms govern its own exposure.

## What This Is NOT

- **The hide is not a ban.** A *hidden* user (`auto_hide_users`) can still post, DM, follow, be followed; their profile and followers' feed are intact. They're just not on the board. The **ban** (`banned_users`) is the stronger lever: their content is filtered out of every read path (see "The Ban" above).
- **Not content deletion.** The post exists in the author's collection. It's hidden from the group's read, not deleted.
- **Not a shadow ban.** The operator's action is visible in the authenticator (the queue, the `auto_hide_users` list). The user can see their post is missing from discover and ask the operator. The thesis says "no shadow ban" — this is an *operator curation decision*, transparent and reversible, not a silent algorithmic suppression.
- **Not an AI classifier.** Blocklist only. Transparent, auditable, operator-curated.

## Security Invariants

- **I3 holds.** Hiding a post from a group is the existing mechanism. It doesn't grant or revoke access to any user's data. A follower can still read a hidden user's posts in the followers group.
- **The blocklist is not a secret.** It's a node setting, readable by the operator. Same trust model as the telemetry IDs.
- **Reversible.** Unhiding a post is the existing `unhide` endpoint. Removing a user from `auto_hide_users` stops future auto-hides. No data is lost.

## Open Questions

1. **Retroactive scan on a new word** — when the operator adds a new blocklist word, do we scan existing posts? (Recommendation: no. The retroactive sweep runs on **user-hide** (hide a user → their existing discover posts are hidden), not on a word change. A one-time "rescan the board for a new word" admin command is a v1 consideration.)

2. **Profile name/bio match** — flag only (enters the queue) or also auto-hide the user's discover posts? (Recommendation: flag only. The operator decides from the queue.)

3. **Notification** — when a post is auto-hidden, does the user get a notification? (Recommendation: yes, a simple in-app notice: "Your post was hidden from Discover by the node's content filter. Contact the node operator if you believe this is an error." Not a ban notice, not a strike. Just transparency.)

4. **The `auto_hide_users` / `banned_users` lists and multi-node** — if a user migrates to another node, the lists don't follow (they're node-local). Correct behavior: suppression and bans are node-operator decisions, not user properties.

## Build Bites (proposed)

1. **KB + decision** — this doc finalized + D59 in `decisions.md`
2. **`node_config` fields** — `sensitive_words`, `auto_moderate`, `moderation_enabled`, `auto_hide_users` (DDL + boot ALTER + `effective_config` defaults + `ConfigUpdate` model)
3. **Detection service** — `api/app/v3/services/moderation.py`: `check_text(text, words) -> list[str]` (whole-word, case-insensitive)
4. **Write-path hook** — on `/v3/create` (posts): if `moderation_enabled` AND (match OR username in `auto_hide_users`) AND `auto_moderate` → hide from discover group + insert flag
5. **`moderation_flags` table** — DDL + boot self-heal + insert on flag
6. **Review queue API** — `GET /v3/moderation/flags` (grouped by username) + `POST /v3/moderation/auto-hide` (add/remove username from `auto_hide_users`)
7. **Node Config UI** — Moderation card: blocklist tag input, auto-moderate toggle, master switch, the queue with "Keep hiding" / "Dismiss"
8. **User notification** — in-app notice on auto-hide (the social app's notification surface)
9. **Tests** — API unit (detection, auto-hide, `auto_hide_users`, I3: hidden post still readable in followers group) + e2e (post with flagged word → hidden from board → operator adds to `auto_hide_users` → next post auto-hidden → operator removes → next post visible)
