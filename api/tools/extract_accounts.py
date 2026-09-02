#!/usr/bin/env python3
"""
extract_accounts.py — read-only extraction of v2 user accounts for the v2→v3
migration (Phase 0 of knowledge/knowledge-base/web10-v3/migration/v2-to-v3-accounts.md).

Reads every user collection's star record from the prod mongo and emits a JSON
manifest of {username, password_hash, phone, phone_verified, email,
email_verified}. This manifest is the backup — the only copy of the password
hashes outside the live mongo. It is PII + credentials and must go to an
encrypted, access-controlled location. NEVER the repo, NEVER a PR.

READ-ONLY: no writes, no updates, no deletes against the mongo.

Two star-record shapes exist in prod and both are read:
  - current (the to_db convention): {service: "services", body: {service: "*", ...}}
  - legacy  (pre-convention, bare): {service: "*", ...}
A collection is a user if and only if it has a star record in either shape.

The tool refuses to finalize (exit 1, no manifest written) if any user's star
record is missing its username or hashed_password — those are the rows that
would silently lose a login.

Run from the ubuntu box (or any host that can reach the prod mongo):
    python extract_accounts.py --uri mongodb://192.168.8.25:27017/ --db deploy \\
        --out /encrypted/path/web10-accounts-$(date +%F).json
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import UTC, datetime

import pymongo

# Secondary guard only — the primary test for "is this a user" is "has a star
# record". These are the known non-user collections.
SYSTEM_COLLECTIONS = {
    "web10",
    "apps",
    "phone_number",
    "metering_events",
    "discovery_posts",
    "public",
    "email_index",
}

# The two star-record queries, current first (the canonical get_star shape).
_CURRENT_STAR_QUERY = {"service": "services", "body.service": "*"}
_LEGACY_STAR_QUERY = {"service": "*"}


def read_star_record(col):
    """Read a collection's star record, handling both shapes.

    Returns (record, shape) where record is the star fields dict and shape is
    'current' or 'legacy'. Returns (None, None) if the collection has no star
    record (i.e. it is not a user).
    """
    doc = col.find_one(_CURRENT_STAR_QUERY)
    if doc is not None:
        # to_db convention: the star fields live under body.
        return doc.get("body", {}), "current"
    doc = col.find_one(_LEGACY_STAR_QUERY)
    if doc is not None:
        # Pre-convention: the star fields are at the top level. Drop _id.
        return {k: v for k, v in doc.items() if k != "_id"}, "legacy"
    return None, None


def extract_user(col):
    """Extract one account row from a user collection.

    Returns a row dict, or None if the collection is not a user (no star
    record in either shape).
    """
    star, shape = read_star_record(col)
    if star is None:
        return None
    return {
        "username": star.get("username"),
        "password_hash": star.get("hashed_password"),
        "phone": star.get("phone_number") or "",
        "phone_verified": bool(star.get("verified", False)),
        "email": star.get("email") or "",
        "email_verified": bool(star.get("email_verified", False)),
        "star_shape": shape,
    }


def extract_all(db):
    """Extract every user account from the database.

    Returns (rows, issues): rows is the sorted list of account rows, issues is
    a list of human-readable problem strings (a user whose star record is
    missing its username or hashed_password).
    """
    rows = []
    issues = []
    for name in sorted(db.list_collection_names()):
        if name in SYSTEM_COLLECTIONS:
            continue
        row = extract_user(db[name])
        if row is None:
            # No star record — an orphaned data collection, not a user. Skip.
            continue
        if not row["username"]:
            issues.append(f"collection '{name}': star record has no username")
            continue
        if not row["password_hash"]:
            issues.append(f"user '{row['username']}': star record has no hashed_password")
            continue
        rows.append(row)
    rows.sort(key=lambda r: r["username"])
    return rows, issues


def _sha256_of_rows(rows):
    """A stable fingerprint of the extracted rows (canonical JSON)."""
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_manifest(rows, uri, db_name):
    """Assemble the manifest envelope around the extracted rows."""
    return {
        "extracted_at": datetime.now(UTC).isoformat(),
        "source": {"uri": uri, "db": db_name},
        "count": len(rows),
        "sha256": _sha256_of_rows(rows),
        "users": rows,
    }


def _git_repo_root():
    """Return the git toplevel for the current dir, or None if not in a repo."""
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _refuse_repo_output(out_path):
    """Raise SystemExit(2) if out_path resolves inside the git repo.

    The manifest is PII + credentials; it must never be written somewhere git
    can track it.
    """
    root = _git_repo_root()
    if not root:
        print("WARNING: not in a git repo — cannot verify --out is outside it.", file=sys.stderr)
        return
    real_out = os.path.realpath(out_path)
    real_root = os.path.realpath(root)
    if real_out == real_root or real_out.startswith(real_root + os.sep):
        print(
            f"REFUSED: --out '{out_path}' is inside the git repo ({root}).\n"
            "The manifest is PII + credentials and must go to an encrypted, "
            "access-controlled location outside the repo. Pass --allow-repo to "
            "override (you should not need to).",
            file=sys.stderr,
        )
        raise SystemExit(2)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Extract v2 user accounts (read-only)")
    parser.add_argument("--uri", default="mongodb://192.168.8.25:27017/", help="Mongo URI")
    parser.add_argument("--db", default="deploy", help="Database name (default: deploy)")
    parser.add_argument("--out", default=None, help="Output JSON path (refused if inside the git repo)")
    parser.add_argument(
        "--allow-repo",
        action="store_true",
        help="Allow writing --out inside the git repo (DANGEROUS — the manifest is PII)",
    )
    args = parser.parse_args(argv)

    if args.out and not args.allow_repo:
        _refuse_repo_output(args.out)

    client = pymongo.MongoClient(args.uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client[args.db]

    try:
        rows, issues = extract_all(db)
    finally:
        client.close()

    if issues:
        print(f"EXTRACT INCOMPLETE — {len(issues)} user(s) would lose a login:", file=sys.stderr)
        for issue in issues:
            print(f"  - {issue}", file=sys.stderr)
        print("No manifest written. Fix the data (or accept the loss explicitly) and re-run.", file=sys.stderr)
        return 1

    manifest = build_manifest(rows, args.uri, args.db)
    payload = json.dumps(manifest, indent=2)
    if args.out:
        with open(args.out, "w") as f:
            f.write(payload)
        print(f"Wrote {manifest['count']} accounts to {args.out}", file=sys.stderr)
    else:
        print(payload)

    print(f"Extracted {manifest['count']} accounts. SHA-256: {manifest['sha256']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
