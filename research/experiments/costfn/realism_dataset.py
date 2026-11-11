"""Generate new joint synthetic node facts as portable Parquet, never V2 edits.

Only local files are written. Parquet contains actual rows (including every
delivery), not weights masquerading as physical event counts. The validator
does not call this model or its allocation functions.
"""
import argparse
from array import array
import csv
import json
import math
from pathlib import Path
import random
import shutil
import tempfile
import time
import platform

import duckdb

from realism_contract import FORMAT, contract, encoded, identity, sha

HERE = Path(__file__).resolve().parent
TABLES = ("users", "documents", "doc_groups", "group_contracts", "group_members",
          "app_contracts", "content_events", "population", "cohorts")
PROVIDER = "api.localhost"
ORIGIN = "https://costfn.research.invalid"
DISCOVER = PROVIDER + "/groups/web10/discover"
PASSWORD = "costfn-bench-password"
PASSWORD_HASH = "$2b$12$4qSIbZm5Inl2Gp4V1npoXeCmBPhfKbOSnITTaR0ZO757uNY6yGrgG"


def allocate(total, weights, caps=None, minimum=0):
    """Integer, capped, deterministic largest-remainder allocation."""
    caps = caps if caps is not None else [total] * len(weights)
    if len(caps) != len(weights) or any(c < minimum for c in caps):
        raise ValueError("inconsistent allocation capacities")
    result = [minimum] * len(weights)
    left = total - sum(result)
    if left < 0 or sum(caps) < total or any(w <= 0 or not math.isfinite(w) for w in weights):
        raise ValueError("infeasible allocation budget")
    while left:
        indices = [i for i in range(len(weights)) if result[i] < caps[i]]
        denominator = sum(weights[i] for i in indices)
        if not denominator:
            raise ValueError("no remaining allocation capacity")
        shares = [(i, left * weights[i] / denominator) for i in indices]
        used = 0
        for i, share in shares:
            delta = min(caps[i] - result[i], int(share))
            result[i] += delta
            used += delta
        left -= used
        if left and not used:
            for i, _ in sorted(shares, key=lambda x: (-x[1], x[0])):
                result[i] += 1
                left -= 1
                if not left:
                    break
    return result


def model(spec, work):
    n = spec["recipe"]["accounts"]
    seed = spec["recipe"]["seed"]
    rng = random.Random(seed)
    p = spec["targets"]["posts"]
    top, middle, bottom = n // 100, n * 9 // 100, n // 20
    counts = (allocate(p * 747 // 1000, [(i + 1) ** -.7 for i in range(top)],
                       caps=[5000] * top, minimum=1)
              + allocate(p * 240 // 1000, [1] * middle, minimum=1)
              + allocate(p * 13 // 1000, [1] * bottom, minimum=1)
              + [0] * (n * 85 // 100))
    authors = array("I")
    for author, count in enumerate(counts):
        authors.extend([author] * count)
    # Intrinsic post quality varies within an author. Popularity and activity
    # are shared latent causes, not independently shuffled marginal labels.
    ranked = sorted(range(p), key=lambda i: -(1 / (authors[i] + 1) ** .55) *
                    (1 + rng.paretovariate(2.0)))
    h = math.ceil(p * .037)
    impressions = [1000000] + allocate(p * 400 * 93 // 100 - 1000000,
        [(i + 1) ** -.4 for i in range(1, h)], caps=[999999] * (h - 1), minimum=100)
    body = p // 2 + 1 - h
    body_total = p * 400 - sum(impressions)
    # For an even post count both middle order statistics must be 50;
    # reserving only one would give (50 + next-positive)/2, not median 50.
    impressions += allocate(body_total - 100, [(i + 1) ** -.25 for i in range(body - 2)], minimum=50) + [50, 50]
    impressions += [0] * (p - len(impressions))
    reach = [min(n - 1, int(v * .8)) for v in impressions]
    lh, positive = math.ceil(p * .0016), round(p * .1129)
    likes = allocate(p * 8, [(i + 1) ** -.2 for i in range(lh)],
                     caps=reach[:lh], minimum=1)
    smallest_head_like = min(likes)
    likes += allocate(p * 8, [(i + 1) ** -1.5 for i in range(lh, positive)],
                      caps=[min(reach[i], smallest_head_like - 1) for i in range(lh, positive)], minimum=1)
    likes += [0] * (p - len(likes))
    comments = allocate(spec["targets"]["comments"], [v for v in likes if v],
                        caps=[v for v in likes if v]) + [0] * (p - positive)
    degrees = ([max(1, 75 - int(74 * i / (n // 2))) for i in range(n // 2)]
               + [0] * (n - n // 2))
    # Assign the heavy following tail to active accounts. Median stays ~75;
    # exact population mean is 150 before declared study-reader overrides.
    # Retain one endpoint at 76 so the population's two middle degrees are
    # 75 and 76, rather than leaving a large allocation-induced gap.
    high = allocate(n * 150 - sum(degrees) - 76, [(i + 1) ** -.75 for i in range(n // 2 - 1)],
                    caps=[min(10000, n - 1)] * (n // 2 - 1), minimum=76) + [76]
    degrees = high + degrees[:n // 2]
    with (work / "population.csv").open("w") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "username", "activity", "popularity", "post_count", "degree"])
        for i in range(n):
            writer.writerow([i, f"rd{seed}-u{i:07d}", 1 / (i + 1) ** .5,
                             1 / (i + 1) ** .6, counts[i], degrees[i]])
    multiplier = 7919
    while math.gcd(multiplier, p) != 1:
        multiplier += 2
    with (work / "posts.csv").open("w") as handle:
        writer = csv.writer(handle)
        writer.writerow(["ordinal", "author_id", "pop_rank", "age_ms", "impressions", "reach", "likes", "comments"])
        for rank, ordinal in enumerate(ranked):
            # Actual node delivery dedupe is 24h per (post, reader, surface).
            # A million impressions from 10k floor accounts needs >100 days,
            # not an impossible one-day viral burst. Unique intra-day offsets
            # keep cursor order exact, including capped minimum-age cohorts.
            age_days = max(2 + ((ordinal * multiplier) % p) * (spec["arithmetic"]["attention_horizon_days"] - 4) // p,
                           math.ceil(impressions[rank] / max(1, reach[rank])) + 1)
            age = age_days * 86400000 + (ordinal + 1) * 86400000 // (p + 1)
            writer.writerow([ordinal, authors[ordinal], rank, age, impressions[rank],
                             reach[rank], likes[rank], comments[rank]])


def build(directory, spec, floor_receipts=()):
    directory = Path(directory).resolve()
    n = spec["recipe"]["accounts"]
    if n == 1000000:
        from realism_validate import verify_floor_receipts
        verify_floor_receipts(floor_receipts, spec)
    if duckdb.__version__ != "1.4.2":
        raise ValueError("use the pinned realism-requirements.txt environment")
    source_pins = {"generator_sha256": sha(__file__), "contract_sha256": sha(HERE / "realism_contract.py")}
    # Conservative local disk admission, before any new output. This estimate
    # is not a generated/native-size measurement or cache-residency claim.
    estimated = n * 1600 * 40 + n * 1000
    free = shutil.disk_usage(directory.parent).free
    if free < estimated * 1.2 + 2 * 1024**3:
        raise ValueError(f"local disk admission failed: need estimate+reserve {estimated * 1.2 + 2 * 1024**3:.0f} bytes; free {free}")
    directory.mkdir(exist_ok=False)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="realism-work-", dir=directory.parent) as tmp:
        work = Path(tmp)
        model(spec, work)
        db = duckdb.connect(str(work / "stage.duckdb"))
        db.execute("SET memory_limit='2GB'; SET threads=1; SET preserve_insertion_order=true")
        db.execute("SET temp_directory=?", [str(work / "spill")])
        db.execute("CREATE TABLE people AS SELECT * FROM read_csv_auto(?)", [str(work / "population.csv")])
        db.execute("CREATE TABLE plan AS SELECT * FROM read_csv_auto(?)", [str(work / "posts.csv")])
        db.execute("CREATE VIEW post_facts AS SELECT p.*, u.username AS author_key, "
                   "CAST(CAST(md5('rd-post-' || ordinal::VARCHAR) AS UUID) AS VARCHAR) AS doc_id, "
                   "TIMESTAMP '2026-11-10 12:00:00' - to_milliseconds(age_ms) AS created_at "
                   "FROM plan p JOIN people u ON p.author_id=u.id")
        readers = spec["recipe"]["readers"]
        # Population and study targets use the SAME rule: 80% active targets,
        # popularity-biased starts, contiguous unique cyclic targets. Self
        # exclusion is done before row_number truncation, never by dropping K.
        active = n * 15 // 100
        db.execute(f"CREATE TABLE target_requests AS SELECT id AS reader_id, degree AS k, "
                   f"'population' AS cell, (id+{spec['recipe']['seed']}) AS salt FROM people "
                   f"WHERE id < {n - readers} UNION ALL "
                   f"SELECT id, k, k::VARCHAR || '-' || locality, "
                   f"CASE WHEN locality='hot' THEN {spec['recipe']['seed']} ELSE id+{spec['recipe']['seed']} END "
                   f"FROM people CROSS JOIN (VALUES (10),(20),(100),(1000)) x(k) "
                   f"CROSS JOIN (VALUES ('hot'),('dispersed')) y(locality) WHERE id >= {n - readers}")
        db.execute(f"CREATE TABLE edges AS WITH budgets AS (SELECT *, least({active - 1}, "
                   f"greatest(1, floor(k*.8)::BIGINT)) AS a FROM target_requests), "
                   f"candidates AS (SELECT b.*, CASE WHEN j<a+1 THEN "
                   f"(floor({active} * pow((hash(salt)::DOUBLE % 1000003)/1000003, 4.6))::BIGINT+j)%{active} "
                   f"ELSE {active}+(hash(salt+1)%{n-active}+j-a-1)%{n-active} END AS target_id, "
                   f"CASE WHEN j<a+1 THEN 0 ELSE 1 END AS band, j "
                   f"FROM budgets b, LATERAL range(k+2) r(j)), "
                   f"numbered AS (SELECT *, row_number() OVER (PARTITION BY cell,reader_id,band ORDER BY j) rn "
                   f"FROM candidates WHERE target_id != reader_id) "
                   f"SELECT reader_id,target_id,cell FROM numbered WHERE (band=0 AND rn<=a) OR (band=1 AND rn<=k-a)")
        viral_author = db.execute("SELECT author_id FROM plan WHERE pop_rank=0").fetchone()[0]
        for k in (10,20,100,1000):
            for locality in ("hot","dispersed"):
                cell=f"{k}-{locality}"
                if not db.execute("SELECT count(*) FROM edges WHERE cell=? AND reader_id=? AND target_id=?",
                                  [cell,n-readers,viral_author]).fetchone()[0]:
                    replace=db.execute("SELECT max(target_id) FROM edges WHERE cell=? AND reader_id=?",[cell,n-readers]).fetchone()[0]
                    db.execute("DELETE FROM edges WHERE cell=? AND reader_id=? AND target_id=?",[cell,n-readers,replace])
                    db.execute("INSERT INTO edges VALUES (?,?,?)",[n-readers,viral_author,cell])
        group_expr = f"'{PROVIDER}/groups/users/' || username || '/followers'"
        db.execute("CREATE VIEW population AS SELECT id, username, activity, popularity FROM people")
        db.execute("CREATE VIEW cohorts AS SELECT cell, a.username AS reader_key, b.username AS target_key "
                   "FROM edges e JOIN people a ON a.id=e.reader_id JOIN people b ON b.id=e.target_id WHERE cell!='population'")
        db.execute(f"CREATE VIEW users AS SELECT username, '{PASSWORD_HASH}' AS password_hash, "
                   "'' AS phone, '' AS email, '' AS domain, 0 AS phone_verified, 0 AS email_verified, "
                   "0 AS domain_verified, TIMESTAMP '2025-01-01' AS created_at, "
                   "TIMESTAMP '2025-01-01' AS updated_at, 0 AS deleted FROM people")
        selected = f"{spec['recipe']['follow']}-{spec['recipe']['locality']}"
        roles = json.dumps([{ "name": "owner", "permissions": {s: ["readAll", "create", "updateOwn", "deleteOwn"] for s in ("posts", "profile", "reactions", "comments")}},
                            {"name": "member", "permissions": {s: ["readAll"] for s in ("posts", "profile", "reactions", "comments")}}], separators=(",", ":"))
        db.execute(f"CREATE VIEW group_contracts AS SELECT {group_expr} AS group_id, "
                   f"'{roles}' AS roles, 'open' AS join_policy, 1 AS discoverable, "
                   "['web10-social-followers'] AS tags, 'public' AS membership_visibility, "
                   "TIMESTAMP '2025-01-01' AS created_at, TIMESTAMP '2025-01-01' AS updated_at, 0 AS deleted FROM people")
        db.execute(f"CREATE VIEW group_members AS SELECT {group_expr} AS group_id, username AS member_key, "
                   "'owner' AS role, TIMESTAMP '2025-01-01' AS joined_at, TIMESTAMP '2025-01-01' AS updated_at, 0 AS deleted FROM people "
                   f"UNION ALL SELECT '{DISCOVER}',username,'member',TIMESTAMP '2025-01-01',TIMESTAMP '2025-01-01',0 FROM people "
                   f"UNION ALL SELECT '{PROVIDER}/groups/users/' || b.username || '/followers', a.username, 'member', "
                   "TIMESTAMP '2025-01-01',TIMESTAMP '2025-01-01',0 FROM edges e JOIN people a ON a.id=e.reader_id "
                   f"JOIN people b ON b.id=e.target_id WHERE cell IN ('population','{selected}')")
        permissions = json.dumps({s: ["readAll"] for s in ("posts", "profile", "reactions", "comments")}, separators=(",", ":"))
        db.execute(f"CREATE VIEW app_contracts AS SELECT username AS user_key, '{ORIGIN}' AS allowed_origin, "
                   f"'{permissions}' AS permissions, '' AS client_id, TIMESTAMP '2025-01-01' AS created_at, "
                   f"TIMESTAMP '2025-01-01' AS updated_at, 0 AS deleted FROM people WHERE id>={n-readers}")
        # All reactions/comments are written by actual exposed viewers. The
        # first delivery precedes the like, which precedes the comment.
        db.execute(f"CREATE VIEW interactions AS SELECT p.doc_id AS ref_value, a.username AS author_key, "
                   "p.doc_id || ':' || kind || ':' || j::VARCHAR AS stable_id, kind, "
                   "p.created_at + to_milliseconds(((j+1)::DOUBLE/(p.impressions+1)*p.age_ms "
                   "+ CASE WHEN kind='reactions' THEN 1 ELSE 2 END)::BIGINT) AS created_at "
                   "FROM post_facts p CROSS JOIN (VALUES ('reactions'),('comments')) t(kind), "
                   "LATERAL range(CASE WHEN kind='reactions' THEN p.likes ELSE p.comments END) x(j) "
                   f"JOIN people a ON a.id=(p.author_id+1+j)%{n}")
        db.execute("CREATE TABLE document_facts AS SELECT doc_id, author_key, 'posts' AS collection_name, "
                   "json_object('text','Derived synthetic post ' || ordinal::VARCHAR)::VARCHAR AS body, "
                   "'' AS ref_value, []::VARCHAR[] AS tags, created_at, created_at AS updated_at, "
                   "0 AS deleted, 'none' AS ad_mode, '' AS ad_target, author_key AS posted_by FROM post_facts "
                   "UNION ALL SELECT CAST(CAST(md5('rd-profile-' || id::VARCHAR) AS UUID) AS VARCHAR), username, 'profile', "
                   "json_object('display_name','Account ' || id::VARCHAR)::VARCHAR, '', []::VARCHAR[], "
                   "TIMESTAMP '2025-01-01',TIMESTAMP '2025-01-01',0,'none','',username FROM people "
                   "UNION ALL SELECT CAST(CAST(md5(stable_id) AS UUID) AS VARCHAR),author_key,kind, "
                   "CASE WHEN kind='reactions' THEN '{\"type\":\"like\"}' "
                   "ELSE json_object('text','Synthetic comment','post_id',ref_value)::VARCHAR END,ref_value,[]::VARCHAR[], "
                   "created_at,created_at,0,'none','',author_key FROM interactions "
                   "UNION ALL SELECT CAST(CAST(md5('rd-ad-' || j::VARCHAR) AS UUID) AS VARCHAR), p.username, 'posts', "
                   "'{\"text\":\"Synthetic node ad\",\"status\":\"active\"}', '', ['ad','node_ad'],TIMESTAMP '2026-11-09',TIMESTAMP '2026-11-09', "
                   "0,'none','',p.username FROM range(300) r(j) JOIN people p ON p.id=j")
        db.execute("CREATE VIEW documents AS SELECT * FROM document_facts")
        db.execute(f"CREATE VIEW doc_groups AS SELECT doc_id, '{DISCOVER}' AS group_id, created_at,updated_at,deleted FROM documents "
                   f"WHERE collection_name IN ('posts','reactions','comments') UNION ALL SELECT doc_id, "
                   f"'{PROVIDER}/groups/users/' || author_key || '/followers', created_at,updated_at,deleted "
                   "FROM documents WHERE collection_name IN ('posts','profile')")
        db.execute(f"CREATE VIEW content_events AS SELECT p.doc_id, 'posts' AS service, u.username AS reader_key, "
                   "'feed' AS surface, 'delivery' AS event_type, '{}' AS payload, "
                   "p.created_at + to_milliseconds(((j+1)::DOUBLE/(p.impressions+1)*p.age_ms)::BIGINT) AS seen_at "
                   "FROM post_facts p, LATERAL range(p.impressions) x(j) "
                   f"JOIN people u ON u.id=(p.author_id+1+(j%p.reach))%{n}")
        files = {}
        for table in TABLES:
            print(f"[realism] export start {table}", flush=True)
            path = directory / f"{table}.parquet"
            quoted_path = path.as_posix().replace("'", "''")
            db.execute(f"COPY (SELECT * FROM {table}) TO '{quoted_path}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 122880)")
            count = db.execute("SELECT count(*) FROM read_parquet(?)", [str(path)]).fetchone()[0]
            files[table] = {"name": path.name, "rows": count, "bytes": path.stat().st_size, "sha256": sha(path)}
            print(f"[realism] export complete {table}: {count:,} rows", flush=True)
        read_users = db.execute(f"SELECT username FROM people WHERE id>={n-readers} ORDER BY id").fetchall()
        db.close()
    if source_pins != {"generator_sha256": sha(__file__), "contract_sha256": sha(HERE / "realism_contract.py")}:
        raise ValueError("generator/contract changed during build; retain incomplete attempt, rerun with fresh output")
    manifest = {"format": FORMAT, "contract": spec, "recipe": spec["recipe"], "files": files,
                "provider": PROVIDER, "origin": ORIGIN, "credential_kind": "public-synthetic-only",
                "password": PASSWORD, "readers": [r[0] for r in read_users], "reader": read_users[0][0],
                **source_pins,
                "dependency": {"duckdb": duckdb.__version__, "python":platform.python_version(),
                               "architecture":platform.machine(),"threads":1},
                "floor_receipts": [sha(p) for p in floor_receipts],
                "limitations": ["Synthetic public text; not production traffic", "no media bytes", "no private/lifecycle proof",
                                "selected cohort overrides existing readers' outgoing edges; all cells reported separately",
                                "reader zero includes the viral author (replacing one follow, same K); ordinary cohort statistics separate",
                                "viral probe requires a historical cursor; original posts span the declared horizon"]}
    manifest["dataset_id"] = identity(manifest)
    (directory / "manifest.json").write_bytes(encoded(manifest))
    print(f"[realism] generated dataset={manifest['dataset_id']} elapsed={time.monotonic()-started:.1f}s; independent validation REQUIRED", flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--accounts", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--readers", type=int)
    parser.add_argument("--floor-receipt", type=Path, action="append", default=[])
    args = parser.parse_args()
    build(args.directory, contract(args.accounts, args.seed, args.readers), args.floor_receipt)
