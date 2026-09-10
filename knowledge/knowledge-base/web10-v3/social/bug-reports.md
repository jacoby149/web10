# Bug Reports: The Bugbot (D70)

**Status:** decided (D70). A submitted bug report is durable in the
`bug_reports` table (public `POST /bug_report`, wired from web10-social +
marketing-ui) and is **pushed to every node admin as a DM from the `bugbot`
user** — the same DM contract as any conversation. The admin review queue UI
(browse + fetch screenshots in the console) is a separate surface, not part of
this.

## The Problem

The report pipeline had a missing last mile. Submission worked (public,
durable, screenshots and all). Review endpoints worked (`POST
/admin/bug_reports` list, `POST /admin/bug_reports/{id}` detail — admin-token
gated). But **nothing showed the reports**: no UI called the admin endpoints,
so "did anyone report a bug?" was a token ceremony or a ClickHouse query.
Push beats pull — the operator should get the report in the app they already
live in (web10-social Messages), not have to go looking.

## Why a DM, not email / not a push channel

- **DMs are plain CRUD.** A conversation is a 2-member group
  (`dm-{a}-{b}`, `invite_only`, both members equal); a message is a `posts`
  doc in that group. WebRTC/P2P is only presence + the D69 nudge — it is not
  the delivery path. So a server-side writer has nothing to "be online" for:
  the DM lands in the store and the recipient sees it on their next read
  (or instantly, if online, via the nudge the app already sends).
- **The API can act as a user.** The node mints JWTs with its own private key
  (`/v3/login` does `jwt.encode(…, settings.PRIVATE_KEY, …)`). Acting as
  `bugbot` is in-protocol: the bot is a real user, the DM is a group post, and
  every write goes through the same `insert_document` + group-attach path a
  human DM does — the D58 write gate applies to the bot exactly as to anyone.
- **Email** would add a provider dependency (SMTP/Resend) to a self-hostable
  node that has zero email infra today (recovery is phone/Twilio, D61). It
  stays open as a second channel; the DM reuses the protocol and needs no new
  surface.
- **A server push channel (WebSocket/SSE)** is rejected by D66/D69 — no
  fan-out infra, and the DM is already a durable, in-app, re-readable record.

## The Bot

`bugbot` is a **real node user**, provisioned by the node, not by a human:

- **Lazy + idempotent.** `ensure_bugbot_user()` runs on the first report:
  `get_user("bugbot")` → if absent, `create_user("bugbot", <random
  password hash>, no phone, no email)`. The password is random and
  unguessable; nobody logs in as the bot — the API signs its tokens directly.
- **Reserved username.** A human who signs up as `bugbot` gets the normal
  `EXISTS` (the account exists). The bot is provisioned at the node level,
  never through `/v3/signup`.
- **Harmless side effect.** `create_user` auto-enrolls in the discover group
  (every account is). The bot never posts to the board, so this is inert.

## Delivery

On `POST /bug_report`, **after** the ClickHouse insert lands (the report is
durable first; the DM is a pointer into it):

```
submit_bug_report
    │
    ▼
insert into bug_reports          ← durable, always
    │
    ▼
for each admin in list_admins():
    ensure dm-bugbot-{admin} group
    │   (check BOTH creator-embedded id shapes — the admin may have
    │    DM'd the bot first, so the group may be owned by the admin)
    ▼
    insert posts doc authored by bugbot
    │
    ▼
any failure → log + swallow      ← never blocks / never 500s the submit
```

- **Recipients:** `config.list_admins()` — the node's `admins` config ∪
  `DEFAULT_ADMINS`. The same list `check_admin` gates the review endpoints
  on, so "who can review in the console" and "who gets the DM" cannot drift.
  No admins configured → no delivery, no error (a fresh node has no one to
  tell yet).
- **The group.** Name `dm-bugbot-{admin}` (sorted, the deterministic DM name
  — `dm-{a}-{b}` with both usernames sorted). Group id
  `{provider}/groups/users/{creator}/dm-bugbot-{admin}` — the creator-embedded
  shape, so the bot checks both `{…}/users/bugbot/…` and
  `{…}/users/{admin}/…` before creating (creator = `bugbot`). Contract:
  `invite_only`, one `member` role with `posts` + `comments`
  (`readAll`, `create`, `updateOwn`, `deleteOwn`) — the exact DM contract
  (`groups/social-contracts.md` §5).
- **The message.** A `posts` doc in the group, body in the `sendDm` shape so
  the social app renders it like any DM (`fromV3DocToDm`):

  | field | value |
  |---|---|
  | `subject` | `Bug report {report_id}` (the mail view's thread list + bubble render it) |
  | `message` | the report summary — description, page URL, app version, device, browser, error message, reporter (username/email when present) |
  | `sender_username` / `sender_provider` | `bugbot` / the node provider |
  | `recipient_username` / `recipient_provider` | the admin / the node provider |
  | `report_id` | the `bug_reports` row id (the pointer) |
  | `screenshot_count` | how many screenshots are on the row |

  Screenshots themselves stay in the table — base64 blobs are too big for a
  DM body; the admin detail endpoint (`POST /admin/bug_reports/{id}`) is the
  fetch path. The stack trace is summarized (first line) in the message; the
  full trace is on the row.

## Invariants

- **I1/I2 hold.** The bot's token (when minted) is signed with the node's
  private key and verified like any other; no unsigned decode anywhere.
- **I3 holds.** The bot's DM doc is readable by the group members (bugbot +
  the admin) and by no one else — a stranger's read of the group is the
  standard "not a member" 403. The bot writes only into groups it is a member
  of; the D58 write gate enforces it the same way as for any user.
- **Durability first.** The `bug_reports` row is the record; the DM is a
  notification. A delivery failure loses a nudge, never a report.
- **Best-effort, never blocking.** Delivery runs after the insert and inside
  a try/except that logs and swallows. The submitter's response is unchanged
  (`report_id`, `status: submitted`) whether or not any DM went out.

## Open

- **The review queue UI** — browse `bug_reports` in the console (the admin
  endpoints exist; the surface doesn't). Separate lane item.
- **Email as a second channel** — open, gated on a provider decision.
- **P2P nudge** — the social app sends a nudge for DMs *it* sends; a
  server-authored DM has no client to nudge from. An online admin sees it on
  their next conversation read (the D69 model: CRUD is truth, the nudge is an
  optimization). A server-side nudge would need the signaling server to fan
  out — D66 says no.
