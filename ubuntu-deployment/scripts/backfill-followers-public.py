#!/usr/bin/env python3
"""Backfill the reserved `anyone -> reader` public grant on user followers groups.

Context (the "profiles are faceless on every anon surface" legacy state,
diagnosed on production 05.11.2026 — the operator's web10.app/trending
screenshot: personal authors rendered as initials while group faces painted):

- #994 (3.148.0/3.149.0, 23.09.2026) made profiles public by default: the
  followers group gets a `reader` role (profile: [readAll]) and a reserved
  `anyone` member row at creation, plus a sign-in heal for pre-existing
  groups.
- #1041 (3.168.0, 28.09.2026) removed the sign-in anyone re-heal (the
  consensual contract self-heal must never touch the `anyone` row — the
  owner's publicness choice), but the choice was never persisted
  (`setProfilePublic` has no UI caller), so followers groups created before
  #994 stay without the row: the I3 read gate denies the `profile` face to
  anon on every surface (marketing feed/search, the D0 people directory,
  link-preview cards, stranger social views).
- The operator authorized converging ALL current users to the
  public-by-default product rule (no private choice was ever expressible or
  recorded in-app, so no owner intent is clobbered).

What this one-shot does, per live followers group
(`{PROVIDER}/groups/users/{username}/followers`):
  1. adds the `reader` role definition to the group contract when missing
     (an `anyone -> reader` row on a contract without the role is inert —
     the D58 role lookup returns no permissions),
  2. adds the reserved `anyone` member row (role `reader`) when missing
     (latest-row dedup, tombstone-aware: a removed row does not count).
Groups whose `anyone` row exists under a different role are REPORTED, not
touched (that is an owner-shape judgment, not legacy drift).

Idempotent: a re-run is a no-op. DRY-RUN by default — pass `--apply` to
write. After applying, the script re-verifies each healed group through the
node's own D58 gate (`can_read_group(gid, 'anon', 'profile', False)`).

Uses the node's own write primitives (get_group / update_group /
add_group_member / get_group_member) — no raw SQL, no schema drift.

Run inside the API container (the node's env + app are there):
  # dry-run (report only):
  docker exec -i web10-prod-api-1 uv run python - < backfill-followers-public.py
  # apply:
  docker exec -i web10-prod-api-1 uv run python - < backfill-followers-public.py --apply
"""

import sys

from app import settings
from app.v3.services import clickhouse as ch

APPLY = "--apply" in sys.argv[1:]
PROVIDER = settings.PROVIDER
PATTERN = f"{PROVIDER}/groups/users/%/followers"
READER_ROLE = {"name": "reader", "permissions": {"profile": ["readAll"]}}


def log(*args):
    print("[backfill-followers-public]", *args, flush=True)


def live_followers_groups():
    """Every live followers group on this node (dedup: latest row wins,
    tombstones included — the node's house pattern)."""
    result = ch.client.query(
        "SELECT group_id FROM ("
        "SELECT group_id, deleted, "
        "row_number() OVER (PARTITION BY group_id ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM group_contracts WHERE group_id LIKE %(pattern)s"
        ") WHERE rn = 1 AND deleted = 0 ORDER BY group_id",
        {"pattern": PATTERN},
    )
    return [row[0] for row in result.result_rows]


def main():
    log(f"provider={PROVIDER} apply={APPLY}")
    gids = live_followers_groups()
    log(f"followers groups found: {len(gids)}")

    healed, ok, reported, errors = [], [], [], []
    for gid in gids:
        try:
            contract = ch.get_group(gid)
            if contract is None:
                # The dedup list and the point read disagree (a merge race) —
                # skip; a re-run catches it.
                log(f"{gid}: contract vanished between list and read; skipped")
                continue
            roles = contract.get("roles") or []
            role_names = {r.get("name") for r in roles if isinstance(r, dict)}
            member = ch.get_group_member(gid, "anyone")

            role_missing = "reader" not in role_names
            row_missing = member is None
            anomalous = member is not None and member.get("role") != "reader"

            if role_missing or row_missing:
                if anomalous:
                    reported.append((gid, f"anyone row present with role {member.get('role')!r}; left untouched"))
                    log(f"{gid}: REPORT — anyone row present under role {member.get('role')!r} (not healed)")
                if APPLY:
                    if role_missing:
                        ch.update_group(gid, roles=list(roles) + [READER_ROLE])
                        log(f"{gid}: added reader role definition")
                    if row_missing:
                        ch.add_group_member(gid, "anyone", "reader")
                        log(f"{gid}: added anyone -> reader member row")
                    healed.append(gid)
                else:
                    log(f"{gid}: WOULD HEAL" + ("" if not role_missing else " (role)") + ("" if not row_missing else " (anyone row)"))
            elif anomalous:
                reported.append((gid, f"anyone row present with role {member.get('role')!r}; left untouched"))
            else:
                ok.append(gid)
        except Exception as e:  # noqa: BLE001 — one bad group must not kill the sweep
            errors.append((gid, repr(e)))
            log(f"{gid}: ERROR {e!r}")

    # Verification: the D58 gate itself must now allow the anon face read.
    verified, failed = 0, []
    for gid in gids:
        readable = ch.can_read_group(gid, "anon", "profile", authenticated=False)
        if readable:
            verified += 1
        else:
            failed.append(gid)
            log(f"{gid}: VERIFY FAIL — anon still cannot read profile")

    log(
        f"summary: groups={len(gids)} already-public={len(ok)} "
        f"healed={'applied' if APPLY else 'planned'}={len(healed) if APPLY else sum(1 for g in gids if g not in ok and g not in [e[0] for e in errors])} "
        f"reported-untouched={len(reported)} errors={len(errors)} "
        f"verified-anon-readable={verified}/{len(gids)}"
    )
    if APPLY and failed:
        log(f"FAILED verification for: {failed}")
        sys.exit(1)
    if APPLY:
        log("done — re-run is a no-op (idempotent)")
    else:
        log("dry-run — no writes. Re-run with --apply to heal.")


if __name__ == "__main__":
    main()
