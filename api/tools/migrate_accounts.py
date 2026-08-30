#!/usr/bin/env python3
"""
migrate_accounts.py — Phase 1 (pilot) + Phase 3 (full) of the v2→v3 account
migration (knowledge/knowledge-base/web10-v3/migration/v2-to-v3-accounts.md).

Reads the Phase 0 manifest and idempotently migrates accounts into the v3
ClickHouse users table — the bcrypt hash carried over verbatim (no re-hash) —
plus discover-group enrollment. Reuses the node's own ClickHouse service
(app.v3.services.clickhouse), so it writes through the same code path a signup
does.

Idempotent: re-running is a no-op for accounts already present.

Usage:
    # 1. Pilot — preview, then write, ONE account (the operator's own):
    python migrate_accounts.py --manifest /encrypted/manifest.json --user alice --dry-run
    python migrate_accounts.py --manifest /encrypted/manifest.json --user alice
    # 2. Full run — every account in the manifest:
    python migrate_accounts.py --manifest /encrypted/manifest.json --all

The ClickHouse connection comes from the environment (CLICKHOUSE_HOST, etc.) —
the same settings the API uses. Run from a host that can reach the v3 node.
"""

import argparse
import json
import sys

from app.v3.services import clickhouse as ch


def load_manifest(path):
    with open(path) as f:
        return json.load(f)


def select_targets(manifest, user=None, all_users=False):
    """Return (targets, error). targets is the list of manifest rows to migrate."""
    users = {u["username"]: u for u in manifest.get("users", [])}
    if user:
        if user not in users:
            return None, f"'{user}' is not in the manifest"
        return [users[user]], None
    if all_users:
        return manifest.get("users", []), None
    return None, "specify --user <name> or --all"


def _mask(hash_str):
    """Mask a password hash for display (it's a credential — never print it whole)."""
    if not hash_str:
        return "(none)"
    return hash_str[:7] + "..."


def preview(row):
    """A dry-run preview of the row that would be written (no DB access)."""
    return {
        "username": row["username"],
        "created": "dry-run",
        "enrolled": "dry-run",
        "would_write": {
            "password_hash": _mask(row.get("password_hash")),
            "phone": row.get("phone", ""),
            "phone_verified": row.get("phone_verified", False),
            "email": row.get("email", ""),
            "email_verified": row.get("email_verified", False),
        },
    }


def migrate_one(row, dry_run):
    """Migrate one account (or preview it when dry_run)."""
    if dry_run:
        return preview(row)
    return ch.migrate_user(
        username=row["username"],
        password_hash=row.get("password_hash", ""),
        phone=row.get("phone", ""),
        phone_verified=bool(row.get("phone_verified", False)),
        email=row.get("email", ""),
        email_verified=bool(row.get("email_verified", False)),
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description="Migrate v2 accounts into v3 (idempotent)")
    parser.add_argument("--manifest", required=True, help="Path to the Phase 0 manifest JSON")
    parser.add_argument("--user", help="Migrate a single account (the pilot)")
    parser.add_argument("--all", action="store_true", help="Migrate every account in the manifest")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be written; do not write")
    args = parser.parse_args(argv)

    try:
        manifest = load_manifest(args.manifest)
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERROR: could not read manifest: {e}", file=sys.stderr)
        return 2

    targets, error = select_targets(manifest, user=args.user, all_users=args.all)
    if error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    created = skipped = 0
    for row in targets:
        result = migrate_one(row, args.dry_run)
        if result.get("created") is True:
            created += 1
        elif result.get("created") is False:
            skipped += 1
        # dry-run rows have created="dry-run" — neither created nor skipped
        detail = ""
        if args.dry_run:
            ww = result["would_write"]
            detail = (
                f" [would write: hash={ww['password_hash']} phone={ww['phone']!r} "
                f"phone_verified={ww['phone_verified']} email={ww['email']!r} "
                f"email_verified={ww['email_verified']}]"
            )
        print(f"  {result['username']}: created={result['created']} enrolled={result['enrolled']}{detail}")

    prefix = "DRY RUN — would " if args.dry_run else ""
    print(
        f"\n{prefix}migrated: {created}, skipped (already present): {skipped}, total: {len(targets)}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
