# v2 → v3 Account Migration (the 580)

Prod runs v2 on real MongoDB — the live node at web10.app, ~580 users, data in
the host mongo (`mongodb://192.168.8.25:27017/`, db `deploy`). v3 is a different
data model, not a newer deploy. This doc is the **account** half of the Phase 4
cutover: the thing that decides whether 580 people keep their login or lose it.
The content half (posts, groups, media) is a separate doc and a separate gate —
this one is the safety-critical part and it runs first.

The constraint that shapes everything: **one day, no user loss.** Every step is
sized so a single operator can run it start to finish in a working day, with a
hard rollback at every seam, and with the phone-recovery flow live *before* the
flip so a user who can't get in has a way back in.

## The one insight that makes this safe

v2 and v3 hash passwords with the **same algorithm** — `passlib` + **bcrypt**
(`api/app/services/auth.py:13`, one `CryptContext` shared by both the v2 Mongo
path and the v3 ClickHouse path). A v2 `hashed_password` is therefore a valid v3
`password_hash`. We do **not** re-hash, we do **not** force a reset, we do **not**
email 580 people a temp password. The hash moves as a string. `authenticate_user`
(`clickhouse.py:2255`) verifies it against the v3 `users` table with zero
special-casing.

This is the whole reason the migration is a one-day job instead of a
password-reset campaign. Everything else is plumbing around this fact.

## The map: what moves where

Each v2 user is a Mongo collection named after their username. Their **star
record** (`service: "services"`, `body.service: "*"`) is the account row — it
carries the credentials and the phone. That is the only record this migration
reads.

| v2 (Mongo star record, `body.*`) | v3 (ClickHouse `users`) | Notes |
|---|---|---|
| `username` | `username` | the collection name; the `user_key` everywhere |
| `hashed_password` | `password_hash` | **bcrypt, carried verbatim** — the load-bearing field |
| `phone_number` | `phone` | E.164-ish string, as stored |
| `verified` | `phone_verified` | `True` → `1` |
| `email` | `email` | may be `null` |
| `email_verified` | `email_verified` | `True` → `1` |
| — | `created_at` / `updated_at` | set to the migration timestamp |
| — | `deleted` | `0` |

**What is NOT in this migration** (named so nobody assumes it moved):
- **Content** — posts, comments, reactions, DMs, media. That is the content
  half of Phase 4, its own doc, its own gate. A migrated account signs in to an
  *empty* v3 profile until content is ported. That is expected and safe — the
  login works, the data is still in the mongo, nothing is destroyed.
- **Billing / credits** — `credits_spent`, `credit_limit`, `space_limit`,
  `customer_id`, `business_id`. v3 billing is a different model (v4 money path).
  Dropped here; re-derived or re-billed if/when v3 billing lands.
- **Terms / ACL / service contracts** — v2's whitelist/blacklist term records.
  v3 replaced them with groups + app contracts. Not carried; re-derived by the
  social app's consent flow on first sign-in.

The `web10.phone_number` collection (phone → username) is a **cross-check
source only** — it confirms the phone↔username pairing but is not the source of
truth (the star record is). If the two disagree, the star record wins and the
discrepancy is logged for manual review.

## The one-day timeline

```
08:00  Phase 0  Extract the manifest        (read-only, ~10 min)  ← the insurance
08:30  Phase 1  Pilot: move ONE account     (your account, ~30 min)
09:30  Phase 2  Recovery flow live on dev   (API + UI, pre-built, deploy)
11:00  Phase 3  Full migration: all 580     (~20 min, idempotent)
12:00  Verify: sample logins + recovery dry-run
13:00  SMS cutover notice to all 580
14:00  Soak: watch for recovery requests, fix stragglers
17:00  Done. v2 mongo stays up as a cold backup for 30 days.
```

The day is front-loaded on the two irreversible-adjacent steps (extract, pilot)
and back-loaded on the reversible ones (full migration, SMS). If anything goes
wrong before 11:00, the blast radius is one account. After 11:00, the rollback
is "point the node back at v2" — the mongo is never touched, so it is always
intact.

## Phase 0 — Extract the manifest (the insurance)

**Run this first. Before anything else touches prod.** It is read-only and it is
the artifact that means "we lose no one" is true even if the migration itself
fails.

`api/tools/extract_accounts.py` (new, mirrors `audit_mongo.py`):

```
python extract_accounts.py --uri mongodb://192.168.8.25:27017/ --db deploy \
    --out /tmp/web10-accounts-$(date +%F).json
```

For every collection, read the star record and emit one row. **A collection is
a user if and only if it has a star record** — that is the filter, not a name
blocklist (the name set `{web10, apps, phone_number, metering_events,
discovery_posts, public, email_index}` is a secondary guard, not the test).

**Two star-record shapes exist in prod** and the extraction must read both —
this is the detail that decides whether a login is silently lost:

| Shape | Query | Where the fields live |
|---|---|---|
| **Current** (the `to_db` convention) | `{"service": "services", "body.service": "*"}` | `body.username`, `body.hashed_password`, `body.phone_number`, … |
| **Legacy** (pre-convention, bare doc) | `{"service": "*"}` | `username`, `hashed_password`, `phone_number`, … at top level |

`get_star` (`documentdb.py:250`) uses the current shape. The existing
`audit_mongo.py` queries only the legacy shape (`{"service": "*"}`) — so it
under-counts current-shape users. The extraction tries **current first, then
legacy**, reads the fields from whichever matched (`body.*` or top-level), and
flags any collection that has *neither* (a collection with no star record is not
a user — it is an orphaned data collection, logged and skipped, never migrated).

```json
{
  "username": "alice",
  "password_hash": "$2b$12$...",
  "phone": "+15551234567",
  "phone_verified": true,
  "email": "alice@example.com",
  "email_verified": false,
  "star_shape": "current",
  "extracted_at": "2026-08-30T08:00:00Z"
}
```

**The manifest is the backup.** It is the only copy of the password hashes
outside the live mongo. It is PII + credentials — it goes to an encrypted,
access-controlled location, never the repo, never a PR. The tool prints a
checksum + row count and refuses to run if a user has no star record or no
`hashed_password` (those are the rows that would silently lose a login).

**Gate:** the manifest row count matches `audit_mongo.py`'s user-collection
count, and zero users are flagged missing-a-hash. If it doesn't, stop — the
extraction is wrong and nothing else runs.

## Phase 1 — Pilot: move one account

Move **your** account. Not a test user — the operator's real account, because
the acceptance bar is "the operator can sign in and it's their data."

`api/tools/migrate_accounts.py` (new):

```
python migrate_accounts.py --manifest /tmp/web10-accounts-....json \
    --user alice --dry-run          # 1. show what it would write
python migrate_accounts.py --manifest /tmp/web10-accounts-....json \
    --user alice                    # 2. write it
```

The tool is **idempotent and per-user.** For `alice` it:
1. Inserts a `users` row (`username, password_hash, phone, phone_verified,
   email, email_verified, now, now, 0`) if one isn't already there.
2. Enrolls `alice` in the node-default discover group (`add_group_member`,
   the same call `create_user` makes — a migrated account is discoverable the
   way a fresh signup is).
3. Prints the row it wrote.

Running it twice is a no-op (the `users` table is `ReplacingMergeTree(updated_at)`
keyed on `username`; a second insert with the same values is deduped).

**Acceptance bar (the pilot is not done until all four are true):**
1. `POST /v3/login {username: alice, password: <the real one>}` → 200 + JWT.
   This proves the carried-over bcrypt hash verifies. **This is the single most
   important check in the entire migration.**
2. `POST /v3/profile` with that token → returns `alice`'s phone.
3. The operator signs in through the real authenticator popup and sees their
   account (empty profile is fine — content is a separate phase).
4. The account is a member of the discover group (a post attached to it is
   discoverable).

If step 1 fails, the hash did not carry. Stop. Do not migrate the other 579.
Diagnose (is the v2 hash actually bcrypt? is `verify_password` being called with
the right field?) before proceeding.

## Phase 2 — The phone-recovery flow (live before the flip)

This is the safety net that makes "no user loss" true for the people who *can't*
remember their password. It is **net-new** — the current "forgot" path is broken
(`ForgotForm` → `I.recover` → `setRecoveryPhone`, and `POST /v3/set_recovery_phone`
requires an authenticated token and just overwrites the phone; it never sends a
code). And `get_phone_record` returns only **one** user, but a phone number can
back several accounts, so the flow needs the full list.

The flow the operator wants, end to end:

```
enter phone → 6-digit code (SMS) → "which account?" (list) → pick → signed in → change password
```

### The endpoints (new, `api/app/v3/endpoints/recovery.py`, mounted at `/v3`)

All three are **unauthenticated** (the user has no token — that's the point).
Rate-limited per phone number (the anti-brute-force is the phone number itself,
not a token).

**`POST /v3/recovery/request`** — `{phone}`
- Look up the phone in `users`. No account → generic "if that number is
  registered, a code was sent" (no existence oracle).
- Account(s) found → `twilio.send_verification(phone, <first username>)` (the
  existing Verify service, `api/app/services/twilio.py:16`).
- Return `{sent: true}`. Never return the username list here (that's the
  next step, gated on the code).

**`POST /v3/recovery/verify`** — `{phone, code}`
- `twilio.check_verification(phone, code)` (`twilio.py:28`). Wrong/expired →
  `WRONG_CODE`.
- On approve → return **all** usernames on that number:
  `{accounts: [{username, phone_verified, email}]}`. This is the "which
  account are you signing into?" list. A new `get_users_by_phone(phone)` in
  `clickhouse.py` (the `get_phone_record` single-row query, pluralized).

**`POST /v3/recovery/complete`** — `{phone, code, username, new_password?}`
- Re-verify the code (a fresh check — the code is the credential for this
  whole flow, not a one-shot from `verify`).
- Confirm `username` is actually on that phone (the list came from `verify`;
  re-check so a forged `username` can't be used to reset someone else).
- If `new_password` present → `change_password(username, hash(new_password))`.
- Mint a JWT for `username` (same shape as `/v3/login`) and return it. The
  client is now signed in.

**The "change your password super easy" half:** because `complete` returns a
live token, the UI drops the user straight into a "set a new password" step
(pre-filled form, one field, done). If they skip it, they're signed in with
their old password — which is fine, it's *their* old password, it still works.
The reset is an offer, not a gate.

### The "more aggressive code"

The 6-digit SMS code is the floor and it's the right one (phones handle 6
digits well; longer codes get mistyped). "Aggressive" is applied to the
**policy**, not the length:
- **Expiry:** 90 seconds (Twilio Verify default is 10 min — too long for a
  recovery credential).
- **Max attempts:** 3 per code, then the verification is void and a new one
  must be requested.
- **Request rate-limit:** 1 new code per phone per 60s, 5 per hour.
These are Twilio Verify service settings + a thin rate-limit in the endpoint.
The code itself stays 6 digits.

### The UI (`ui/src/components/CredentialPage/`)

`ForgotForm` becomes a three-step state machine (phone → code → account list),
deep-linkable per the URL-holds-state rule (`?recovery=phone|code|pick`). On
`complete`, the token lands in the cookie (the normal `authListen` path) and the
UI routes to a "set a new password" screen. The existing `LoginForm` is
untouched — recovery is a parallel door into the same signed-in state.

**Why this is before the flip, not after:** the moment the node points at v3, a
user who forgot their password needs a way back in. If the recovery flow ships
*with* the flip, the first locked-out user is a support incident. If it ships
*before*, the flip is boring.

## Phase 3 — Full migration: all 580

```
python migrate_accounts.py --manifest /tmp/web10-accounts-....json --all
```

Same idempotent per-user logic as the pilot, over every row in the manifest.
~580 inserts into a `ReplacingMergeTree` — seconds. The tool prints a running
count and a final summary: `migrated: 579, skipped (already present — the
pilot): 1, failed: 0`. Any `failed > 0` stops the day.

**Verification (the sample, not the census):**
- Log in as 5–10 accounts spread across the manifest (oldest, newest, a few
  with phones, a few without). Each must return a JWT.
- Re-run `migrate_accounts.py --all` → `skipped: 580, migrated: 0` (idempotency
  proof).
- `SELECT count() FROM users WHERE deleted = 0` → 580 (plus any v3-native
  signups since).

## The SMS cutover notice

After the data flip, text all 580 (the manifest has every phone) that they were
migrated, over the existing Twilio send path (`twilio.recovery_prompt`'s
messaging client, `twilio.py:41`). The message says "you're migrated," not "you
will be." Copy is drafted pre-gate; the send list is the manifest's phones,
deduped, verified-numbers-only. This is a Phase 4 item that runs *after* the
flip — it confirms, it doesn't announce.

## Rollback

The mongo is **never written to** by this migration. It is read-only, end to
end. So rollback is not a data operation — it is a config operation:

1. **Before the content flip / before dev→main:** point the node back at the v2
   deploy. The 580 logins still work on v2 exactly as before. The v3 `users`
   rows are inert.
2. **After the flip, if a user is stuck:** the recovery flow (Phase 2) gets them
   back in on v3. No rollback needed for a single locked-out user.
3. **The v2 mongo stays up as a cold backup for 30 days** after the cutover.
   Nothing is decommissioned on the day. The decommission is a separate,
   deliberate, 30-days-later decision.

The only truly irreversible step is the SMS notice (you can't un-send a text),
and it runs last, after every login is verified.

## What this doc is the spec for

Per the Phase 4 rule — *no tooling before the doc* — this is the spec the two
tools and the recovery endpoints implement:

- `api/tools/extract_accounts.py` — Phase 0 (new, read-only).
- `api/tools/migrate_accounts.py` — Phase 1 + 3 (new, idempotent, per-user).
- `api/app/v3/endpoints/recovery.py` + `get_users_by_phone` — Phase 2 (new).
- `ui/src/components/CredentialPage/` recovery state machine — Phase 2 (new).

Each is its own PR, merge small. The order is the timeline: extract → pilot →
recovery → full → SMS. Nothing in Phase 3 runs until Phase 1's acceptance bar
(the pilot login) is green, and nothing touches prod before the manifest
(Phase 0) is verified complete.
