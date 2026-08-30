# Content Moderation: Sensitive Language Detection + Discover Suppression

**Status:** decided (D58) + built (3.37.0). The detection layer, the write-path auto-hide, the `moderation_flags` review queue, the `auto_hide_users` list, and the Node Config Moderation card are all in. The open questions below are resolved by the v0 build: whole-word matching, forward-only (no retroactive scan), profile name/bio are flagged-only (not scanned on the post path), and the queue is human-in-the-loop (the operator suppresses; the machine only flags).

## The Problem

A node operator needs to keep the discover board clean. Slurs, hate speech, and severe profanity make the board hostile. The operator needs:

1. **Detection** — flag content containing blocked language.
2. **Auto-hide** — when enabled, offending posts are automatically hidden from the discover board.
3. **Operator review** — flagged users surface: "this user has N hidden posts, keep hiding their future ones?"
4. **User-level** — once the operator confirms, the user's *future* posts are auto-hidden too. Their data is intact, their profile resolves, their followers still see them. D41 holds.

## The Design: Use What's Already There

The discover board is a group (`web10.app/groups/web10/discover`). It already has:

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

### User-Level: "Keep Hiding Their Future Posts"

When the operator confirms a user in the review queue, the user's username is added to `node_config.auto_hide_users` (a JSON array). On every subsequent post by that user, the write path checks: is this username in `auto_hide_users`? If yes → auto-hide from discover, no blocklist match needed.

This is a **node-level curation list**, not a user penalty. The operator curates the board. The user's data is untouched. Removing the username from the list restores their discover visibility for future posts (already-hidden posts stay hidden until individually unhidden).

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

No `resolved` column. The queue is: `SELECT username, count(*), max(created_at), arbitrary(matched_words) FROM moderation_flags GROUP BY username HAVING count(*) > 0 ORDER BY max(created_at) DESC`. The operator's action (add to `auto_hide_users` or dismiss) is a `node_config` update, not a mutation of this table. The table is an append-only audit log.

### The UI surface

A "Moderation" card in the Node Config panel (authenticator):

- **The blocklist editor** — tag input, add/remove words
- **Auto-moderate toggle** — on/off
- **Master switch** — moderation enabled/disabled
- **The queue** — "Users with hidden posts in discover": username, count, last flagged, snippet. Two actions per user:
  - **"Keep hiding"** → adds username to `node_config.auto_hide_users`
  - **"Dismiss"** → does nothing to the table (it's an audit log); the operator simply doesn't add them to `auto_hide_users`

### The "keep hiding" behavior

`node_config.auto_hide_users` is a JSON array of usernames. On every post create:

```python
if user.username in config.auto_hide_users:
    hide_from_discover(doc_id)
    insert_flag(username, doc_id, ["auto_hide_users"])
```

No blocklist match needed. The user is on the list, their posts get hidden. Removing them from the list stops future auto-hides.

## Node Settings

New fields on `node_config`:

| Field | Type | Default | Description |
|---|---|---|---|
| `sensitive_words` | String (JSON array) | `["...defaults..."]` | The blocklist. Empty array = off. |
| `auto_moderate` | UInt8 | 1 | When 1, matching posts are auto-hidden from discover. |
| `moderation_enabled` | UInt8 | 1 | Master switch. 0 = no detection runs. |
| `auto_hide_users` | String (JSON array) | `[]` | Usernames whose future posts are always auto-hidden from discover. |

All set in the Node Config UI. Changes apply immediately (read on each write, no cache).

## What This Is NOT

- **Not a ban.** A hidden user can still post, DM, follow, be followed. Their data is intact. They're just not on the board.
- **Not content deletion.** The post exists in the author's collection. It's hidden from the group's read, not deleted.
- **Not a shadow ban.** The operator's action is visible in the authenticator (the queue, the `auto_hide_users` list). The user can see their post is missing from discover and ask the operator. The thesis says "no shadow ban" — this is an *operator curation decision*, transparent and reversible, not a silent algorithmic suppression.
- **Not an AI classifier.** Blocklist only. Transparent, auditable, operator-curated.

## Security Invariants

- **I3 holds.** Hiding a post from a group is the existing mechanism. It doesn't grant or revoke access to any user's data. A follower can still read a hidden user's posts in the followers group.
- **The blocklist is not a secret.** It's a node setting, readable by the operator. Same trust model as the telemetry IDs.
- **Reversible.** Unhiding a post is the existing `unhide` endpoint. Removing a user from `auto_hide_users` stops future auto-hides. No data is lost.

## Open Questions

1. **Retroactive scan** — when the operator adds a new word, do we scan existing posts? (Recommendation: no. Forward-only. A one-time admin command is a v1 consideration.)

2. **Profile name/bio match** — flag only (enters the queue) or also auto-hide the user's discover posts? (Recommendation: flag only. The operator decides from the queue.)

3. **Notification** — when a post is auto-hidden, does the user get a notification? (Recommendation: yes, a simple in-app notice: "Your post was hidden from Discover by the node's content filter. Contact the node operator if you believe this is an error." Not a ban notice, not a strike. Just transparency.)

4. **The `auto_hide_users` list and multi-node** — if a user migrates to another node, the list doesn't follow (it's node-local). Correct behavior: suppression is a node-operator decision, not a user property.

## Build Bites (proposed)

1. **KB + decision** — this doc finalized + D58 in `decisions.md`
2. **`node_config` fields** — `sensitive_words`, `auto_moderate`, `moderation_enabled`, `auto_hide_users` (DDL + boot ALTER + `effective_config` defaults + `ConfigUpdate` model)
3. **Detection service** — `api/app/v3/services/moderation.py`: `check_text(text, words) -> list[str]` (whole-word, case-insensitive)
4. **Write-path hook** — on `/v3/create` (posts): if `moderation_enabled` AND (match OR username in `auto_hide_users`) AND `auto_moderate` → hide from discover group + insert flag
5. **`moderation_flags` table** — DDL + boot self-heal + insert on flag
6. **Review queue API** — `GET /v3/moderation/flags` (grouped by username) + `POST /v3/moderation/auto-hide` (add/remove username from `auto_hide_users`)
7. **Node Config UI** — Moderation card: blocklist tag input, auto-moderate toggle, master switch, the queue with "Keep hiding" / "Dismiss"
8. **User notification** — in-app notice on auto-hide (the social app's notification surface)
9. **Tests** — API unit (detection, auto-hide, `auto_hide_users`, I3: hidden post still readable in followers group) + e2e (post with flagged word → hidden from board → operator adds to `auto_hide_users` → next post auto-hidden → operator removes → next post visible)
