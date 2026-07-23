# Persona Orchestration

Live-testing personas that make the social platform look alive. Five users with funny names, distinct personalities, real photos, and a plan to go ham.

## The Cast

| # | Username | Display Name | Vibe |
|---|----------|--------------|------|
| 1 | `solar-flare-69` | Solar Flare | The unhinged crypto-bro podcaster who thinks he's the next Joe Rogan |
| 2 | `noodle-empress` | Noodle Empress | Chaotic food blogger, posts pictures of ramen at 3am, aggressively nice |
| 3 | `void-walker` | Void Walker | Dark academia aesthetic, quotes Nietzsche at 2am, secretly soft |
| 4 | `butterfly-mechanic` | Butterfly Mechanic | DIY everything — fixes bugs literally and metaphorically, workshop pics |
| 5 | `disco-donkey` | Disco Donkey | Pure chaos energy, dance memes, unhinged DMs, the class clown |

## How It Works

1. **Seed the accounts + content** — run `seed_personas.py` against your local, dev,
   or prod API. It creates the 5 users, whitelists `anon` on their `public_posts`
   service (the discovery gate), sets profiles, cross-follows, and writes posts,
   reactions, comments, and DMs.
2. **Content lands in the real feed** — posts go to `public_posts` and get indexed
   into the cross-user discovery feed; reactions/comments go to the public ledger.
3. **Follow the action plan** — each persona has an `actions.md` file with their
   first week of content.

`seed_personas.py` is the source of truth. `seed_personas.sh` is a bash
fallback that only does accounts + profiles + follows (no posts/ledger/DMs) and
is **superseded** — prefer the Python script.

## Quick Start

```bash
# Dev (reachable on VPN) — provider/site are derived from the host:
python3 seed_personas.py --api https://api.dev.web10.app

# Local node:
python3 seed_personas.py --api http://api.localhost:6000

# Prod:
python3 seed_personas.py --api https://api.web10.app

# Override the derived identity if needed:
python3 seed_personas.py --api https://api.dev.web10.app \
    --provider api.dev.web10.app --site social.dev.web10.app

# Accounts only (skip posts/ledger/DMs):
python3 seed_personas.py --api https://api.dev.web10.app --skip-content
```

## How seeding reaches the discovery feed (post-D5.5)

The public/private discovery split (D5.5, landed 1.0.92) changed the contract.
The seeder now matches it:

- **Provider & site are derived from `--api`, never hardcoded.** `--api
  https://api.dev.web10.app` yields provider `api.dev.web10.app` and login site
  `social.dev.web10.app` (the `api.` prefix is swapped for `social.`). Override
  with `--provider` / `--site`. The node mints the token's provider itself from
  its own `PROVIDER` setting; the derived provider is used for cross-references
  (contacts, follows, inbox, DM sender/recipient, ledger payloads).
- **Posts go to `public_posts`** (service, `visibility: "public"`), not the
  legacy `posts` service. The returned `_id` is captured for engagement targets.
- **A post is indexed into discovery only if its service whitelists `anon`.**
  Signup ships an *empty* whitelist (`services_record()`), so the seeder writes
  an anon-whitelist term record to `public_posts` (`POST /{user}/services`)
  before posting. Re-runs get `409 DUPLICATE_SERVICE` — treated as already-set.
- **Reactions & comments go to the public ledger** via `POST /public/entries`
  with `{schema_id, target, payload}`:
  - The seeder first registers the `Reaction` and `Comment` schemas
    (`POST /schemas/register`) and references their real `_id`.
  - `target` is the discovery engine's post key:
    `"{author}/public_posts/{post_id}"` (see
    `documentdb._discovery_post_to_dict` / `_ledger_engagement_for_post`).
  - Each `payload` includes the schema-required fields (`type`+`target` for
    reactions, `text`+`target` for comments) plus `action` (`like`/`comment`)
    so the discovery index counts engagement (it groups on `payload.action`).
- **DMs go to the single `dms` service** with sender/recipient fields (matching
  web10-social `dms.ts`), not a per-conversation service.

### dev vs prod database caveat

- **dev** (`api.dev.web10.app`) runs on **FerretDB and starts empty** — seeding is
  how it gets content. As of this writing the dev node's public-ledger / discovery
  read path is being fixed in parallel: `POST /schemas/register` and
  `POST /public/entries` can return `500`, and `PATCH /discover/posts` may 500 /
  422. When that happens the seeder still creates accounts, sets terms, posts to
  `public_posts`, and sends DMs successfully; reactions/comments are skipped
  (they can't reference an unregistered schema). The feed read may not reflect
  writes until the node fix lands — **that is a node bug, not a seeding bug.**
- **prod** (`api.web10.app`) runs the real MongoDB with real accounts. Seed prod
  deliberately and sparingly — this writes live personas and content.

## File Structure

```
persona-orchestration/
├── README.md              # This file
├── seed_personas.sh       # Bash seed script
├── seed_personas.py       # Python seed script (full control)
├── photos/                # Profile photos & post media (stock/CC0)
├── solar-flare-69/
│   └── actions.md         # First week of content plan
├── noodle-empress/
│   └── actions.md
├── void-walker/
│   └── actions.md
├── butterfly-mechanic/
│   └── actions.md
└── disco-donkey/
    └── actions.md
```

## Passwords

All personas use `web10test!2026` as their password. Change it in `seed_personas.sh` / `seed_personas.py` if needed.

## API Endpoints Used

- `POST /signup` — create account (idempotent here: existing user is treated as ok)
- `POST /web10token` — login, get JWT
- `POST /{user}/services` — write the anon-whitelist term record for `public_posts`
- `POST /schemas/register` — register the `Reaction` / `Comment` ledger schemas
- `POST /{user}/profile` — set display name, bio
- `POST /{user}/public_posts` — create discoverable posts
- `POST /{user}/contacts` — add contacts
- `POST /{user}/follows` — follow other personas
- `POST /{user}/inbox` — fan-out delivery to follower inboxes
- `POST /{user}/dms` — send DMs (single `dms` service, sender/recipient fields)
- `POST /public/entries` — reactions & comments (public ledger, schema-validated)