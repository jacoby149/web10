#!/usr/bin/env python3
"""
audit_mongo.py — read-only inspection of the real production MongoDB.

Run from the ubuntu box (or any host that can reach 192.168.8.25:27017):
    python audit_mongo.py                          # defaults to host mongo
    python audit_mongo.py --uri mongodb://other:27017/

What it reports:
  1. Total collections (user count — each user = one collection)
  2. web10.apps count + list of registered apps
  3. Record-shape audit per user:
     - Does every collection have a star record (service="*")?
     - Does every star record have the expected fields?
     - Do non-star records follow {service, body} shape?
     - Records that predate to_gui/to_db conventions (bare docs with no
       service/body wrapper) are flagged as shape drift.
  4. Star-record field inventory: union of all fields seen across all
     star records, with counts (shows legacy fields vs. current schema).
  5. Service distribution: which service names exist, doc counts.

READ-ONLY: no writes, no updates, no deletes.
"""

import argparse
import sys
from collections import Counter, defaultdict

import pymongo


def main():
    parser = argparse.ArgumentParser(description="Audit real web10 MongoDB (read-only)")
    parser.add_argument(
        "--uri",
        default="mongodb://192.168.8.25:27017/",
        help="Mongo URI (default: host mongo on ubuntu box)",
    )
    parser.add_argument(
        "--db", default="deploy", help="Database name (default: deploy — the real web10 data)"
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=0,
        help="If >0, only audit this many user collections (for quick checks)",
    )
    args = parser.parse_args()

    client = pymongo.MongoClient(args.uri, serverSelectionTimeoutMS=5000)
    # Force connection check
    client.admin.command("ping")
    db = client[args.db]

    print("=" * 60)
    print("WEB10 MONGODB AUDIT (read-only)")
    print("=" * 60)
    print(f"  URI: {args.uri}")
    print(f"  DB:  {args.db}")
    print()

    # ── System collections (not user collections) ──
    all_collections = set(db.list_collection_names())
    system_collections = {"web10", "apps", "phone_number", "metering_events", "config", "jwt_keys"}
    # Filter: web10 internal collections start with "web10" or are known system names
    # User collections are named by username.
    known_system = {"web10", "apps", "phone_number", "metering_events"}
    # Heuristic: user collections are anything not in the known system set
    # and not starting with "web10" (web10.config etc. might exist as separate names)
    user_collections = sorted(
        c for c in all_collections
        if c not in known_system
    )

    # ── 1. User count ──
    print(f"TOTAL COLLECTIONS: {len(all_collections)}")
    print(f"USER COLLECTIONS:  {len(user_collections)}")
    print(f"SYSTEM COLLECTIONS: {len(all_collections) - len(user_collections)}")
    print()

    # ── 2. Apps ──
    apps_col = db["web10"]["apps"] if "apps" in all_collections else None
    if apps_col:
        apps = list(apps_col.find({}))
        print(f"REGISTERED APPS: {len(apps)}")
        for app in sorted(apps, key=lambda a: a.get("visits", 0), reverse=True):
            print(f"  {app.get('url', '?')}  (visits: {app.get('visits', 0)})")
    else:
        print("REGISTERED APPS: 0 (no apps collection found)")
    print()

    # ── 3. Record-shape audit ──
    star_fields_seen = Counter()
    star_records_missing = []
    star_records_partial = []
    shape_drift = []  # records without {service, body} wrapper
    service_counter = Counter()
    total_docs = 0
    services_record_missing = []

    limit = args.sample or len(user_collections)
    for i, username in enumerate(user_collections[:limit]):
        col = db[username]
        docs = list(col.find({}))
        total_docs += len(docs)

        star_doc = col.find_one({"service": "*"})
        services_doc = col.find_one({"service": "services"})

        if not star_doc:
            star_records_missing.append(username)
        else:
            # Audit star record fields
            body = star_doc.get("body", star_doc)  # handle pre-convention docs
            for k in body:
                star_fields_seen[k] += 1
            # Check for expected fields
            expected = {"username", "hashed_password", "credit_limit", "space_limit", "credits_spent"}
            missing_fields = expected - set(body.keys())
            if missing_fields:
                star_records_partial.append((username, missing_fields))

        if not services_doc:
            services_record_missing.append(username)

        # Check non-star records for shape
        for doc in docs:
            svc = doc.get("service")
            if svc is not None:
                service_counter[svc] += 1
                # Has service field — check if it also has body
                if "body" not in doc and svc != "*":
                    # Non-star records should have {service, body}
                    # But older records might just have {service, ...data}
                    shape_drift.append({
                        "user": username,
                        "service": svc,
                        "shape": "no-body-wrapper",
                        "keys": list(doc.keys()),
                    })
            else:
                # No service field at all — pre-convention record
                shape_drift.append({
                    "user": username,
                    "service": "UNKNOWN",
                    "shape": "no-service-field",
                    "keys": list(doc.keys()),
                })

        if args.sample and (i + 1) % 10 == 0:
            print(f"  ... audited {i+1}/{limit} user collections")

    print(f"TOTAL DOCS ACROSS {limit} USER COLLECTIONS: {total_docs}")
    print()

    # ── 3a. Star record audit ──
    print("STAR RECORDS:")
    if star_records_missing:
        print(f"  MISSING star record: {len(star_records_missing)} users")
        for u in star_records_missing[:10]:
            print(f"    - {u}")
        if len(star_records_missing) > 10:
            print(f"    ... and {len(star_records_missing)-10} more")
    else:
        print(f"  All {limit} users have a star record.")
    print()

    if star_records_partial:
        print(f"  PARTIAL star records (missing expected fields): {len(star_records_partial)}")
        for u, missing in star_records_partial[:5]:
            print(f"    - {u}: missing {missing}")
        if len(star_records_partial) > 5:
            print(f"    ... and {len(star_records_partial)-5} more")
    print()

    # ── 3b. Services record audit ──
    print("SERVICES RECORDS:")
    if services_record_missing:
        print(f"  MISSING services record: {len(services_record_missing)} users")
        for u in services_record_missing[:10]:
            print(f"    - {u}")
    else:
        print(f"  All {limit} users have a services record.")
    print()

    # ── 3c. Shape drift ──
    print("SHAPE DRIFT:")
    if shape_drift:
        drift_by_type = defaultdict(list)
        for d in shape_drift:
            drift_by_type[d["shape"]].append(d)
        for shape_type, records in drift_by_type.items():
            print(f"  {shape_type}: {len(records)} records")
            for r in records[:5]:
                print(f"    - {r['user']}/{r['service']}: keys={r['keys'][:8]}")
            if len(records) > 5:
                print(f"    ... and {len(records)-5} more")
    else:
        print("  No shape drift detected — all records follow {service, body} convention.")
    print()

    # ── 4. Star-record field inventory ──
    print("STAR RECORD FIELD INVENTORY (across all audited users):")
    for field, count in star_fields_seen.most_common():
        pct = count / limit * 100
        print(f"  {field}: present in {count}/{limit} users ({pct:.0f}%)")
    print()

    # ── 5. Service distribution ──
    print("SERVICE DISTRIBUTION:")
    for svc, count in service_counter.most_common():
        print(f"  {svc}: {count} docs")
    print()

    # ── Summary ──
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Users (collections):     {len(user_collections)}")
    print(f"  Registered apps:         {len(apps) if apps_col else 0}")
    print(f"  Total docs audited:      {total_docs}")
    print(f"  Star records missing:    {len(star_records_missing)}")
    print(f"  Services records missing:{len(services_record_missing)}")
    print(f"  Shape drift records:     {len(shape_drift)}")
    print(f"  Unique star fields:      {len(star_fields_seen)}")

    if shape_drift:
        print()
        print("  NOTE: shape drift detected. Older records may predate")
        print("  the to_gui/to_db convention. The code handles this:")
        print("  - to_gui() extracts doc['body'] — records without a body")
        print("    wrapper will return the raw doc (keys leak service field).")
        print("  - q_t() prefixes fields with body. — queries on bare docs")
        print("    won't match unless the service field is at the top level.")
        print("  Consider a migration pass for affected collections.")

    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())