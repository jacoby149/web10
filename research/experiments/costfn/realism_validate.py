"""Independent finished-record validator/oracle; never replays generator logic.

All semantic checks query actual Parquet rows, including zero-activity users,
distinct exposure audiences and each study cohort. No generator imports.
"""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import tempfile

import duckdb

from realism_contract import FORMAT, contract, encoded, identity, sha

TABLES = ("users", "documents", "doc_groups", "group_contracts", "group_members",
          "app_contracts", "content_events", "population", "cohorts")
VALIDATOR_SOURCE_AT_IMPORT = sha(__file__)


@contextmanager
def partitions(db, table, keys, parent=None, *, max_rows=2500000):
    """One streamed disk partitioning pass; equal keys never cross buckets.

    Start with 64 writers, then refine oversized buckets independently. A
    fixed 64-way pass fits the 160M floor but not the 1.6B headline. Never
    open thousands of Parquet writers at once. No sampling or raised budget.
    Only internal fixed table/key identifiers are accepted, never artifact SQL.
    """
    allowed = {"documents": ("doc_id", "author_key"),
               "content_events": ("doc_id", "reader_key")}
    if table not in allowed or tuple(keys) != allowed[table]:
        raise ValueError("undeclared validator partition")
    if type(max_rows) is not int or max_rows<1:
        raise ValueError('positive partition row budget required')
    if parent is None:
        parent = Path(__file__).resolve().parents[3] / ".context"
    with tempfile.TemporaryDirectory(prefix="realism-partitions-", dir=parent) as tmp:
        target = str(Path(tmp)/"facts").replace("'", "''")
        print(f'[realism-validator] partition pass start table={table} writers=64 max_rows={max_rows}',flush=True)
        db.execute(f"COPY (SELECT *, hash({','.join(keys)})%64 AS bucket FROM {table}) "
                   f"TO '{target}' (FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY(bucket), "
                   "ROW_GROUP_SIZE 2048)")
        parts=[]
        rows=0
        for directory in sorted((Path(tmp)/"facts").glob("bucket=*")):
            quoted=str(directory/"*.parquet").replace("'", "''")
            relation=f"read_parquet('{quoted}', hive_partitioning=true)"
            size=db.execute(f"SELECT count(*) FROM {relation}").fetchone()[0]
            rows += size
            if size<=max_rows:
                parts.append(relation)
                continue
            # Aim below the hard cap to tolerate hash imbalance. Complete keys
            # stay together under an independently salted hash. A skewed single
            # key cannot be split without invalidating its window; refuse it.
            shards=2
            while shards<size/(max_rows*.75):
                shards*=2
            if shards>64:
                raise ValueError('partition refinement needs more than 64 writers; preserve/refuse rather than exceed budget')
            refined=Path(tmp)/('refined-'+directory.name.split('=',1)[1])
            quoted=str(refined).replace("'","''")
            print(f'[realism-validator] refine start table={table} bucket={directory.name} rows={size} writers={shards}',flush=True)
            db.execute(f"COPY (SELECT * EXCLUDE(bucket), hash({','.join(keys)},'refinement-v1')%{shards} AS bucket FROM {relation}) "
                       f"TO '{quoted}' (FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY(bucket), ROW_GROUP_SIZE 2048)")
            refined_rows=0
            for sub in sorted(refined.glob('bucket=*')):
                subpath=str(sub/'*.parquet').replace("'","''")
                subrelation=f"read_parquet('{subpath}', hive_partitioning=true)"
                subrows=db.execute(f'SELECT count(*) FROM {subrelation}').fetchone()[0]
                if subrows>max_rows:
                    raise ValueError('complete-key partition exceeds row budget after refinement')
                refined_rows+=subrows
                parts.append(subrelation)
            if refined_rows!=size:
                raise ValueError('validator refinement lost or duplicated records')
            print(f'[realism-validator] refine complete table={table} bucket={directory.name} rows={refined_rows}',flush=True)
        if rows != db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]:
            raise ValueError("validator partition pass lost or duplicated records")
        print(f'[realism-validator] partition pass complete table={table} rows={rows} parts={len(parts)}',flush=True)
        yield parts


def verify_floor_receipts(paths, spec=None):
    if len(paths) != 2:
        raise ValueError("exactly two independently validated floor receipts required")
    receipts = [json.loads(Path(p).read_bytes()) for p in paths]
    if {r.get("accounts") for r in receipts if r.get("complete") is True
        and r.get("validator_sha256") == sha(__file__) and r.get("format") == FORMAT} != {10000, 100000}:
        raise ValueError("1M build requires current independent passing 10k AND 100k floor receipts")
    if any(not r.get("checks") or not all(r["checks"].values()) for r in receipts):
        raise ValueError("floor receipts include missing or failed checks")
    for path, receipt in zip(paths, receipts):
        directory = (Path(path).resolve().parent / receipt["dataset_directory"]).resolve()
        manifest = json.loads((directory / "manifest.json").read_bytes())
        if (manifest.get("dataset_id") != receipt["dataset_id"] or identity(manifest) != receipt["dataset_id"]
                or manifest.get("generator_sha256") != sha(Path(__file__).with_name("realism_dataset.py"))
                or manifest.get("contract_sha256") != sha(Path(__file__).with_name("realism_contract.py"))):
            raise ValueError("floor source/manifest identity is no longer current")
        if spec and any(manifest["recipe"][k] != spec["recipe"][k] for k in ("seed","follow","locality")):
            raise ValueError("floor seed/selected cohort differs from the proposed 1M build")
        for info in manifest["files"].values():
            if info["name"] not in {t + ".parquet" for t in TABLES} or sha(directory / info["name"]) != info["sha256"]:
                raise ValueError("floor input bytes changed after validation")


def attach(db, directory, manifest):
    if manifest.get("format") != FORMAT or manifest.get("dataset_id") != identity(manifest):
        raise ValueError("derived manifest format/identity mismatch")
    spec = manifest["contract"]
    if spec != contract(**spec["recipe"]) or manifest.get("recipe") != spec["recipe"]:
        raise ValueError("manifest differs from frozen executable contract")
    if set(manifest["files"]) != set(TABLES):
        raise ValueError("missing/unknown derived table")
    if {p.name for p in directory.iterdir()} != {"manifest.json", *(t + ".parquet" for t in TABLES)}:
        raise ValueError("unexpected dataset directory entries")
    for table in TABLES:
        path = directory / f"{table}.parquet"
        info = manifest["files"][table]
        if path.is_symlink() or info["name"] != path.name or path.stat().st_size != info["bytes"] or sha(path) != info["sha256"]:
            raise ValueError(f"file integrity mismatch: {table}")
        # Only fixed local filenames/table names enter SQL; no artifact SQL.
        quoted = str(path).replace("'", "''")
        db.execute(f"CREATE VIEW {table} AS SELECT * FROM read_parquet('{quoted}')")
        if db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] != info["rows"]:
            raise ValueError(f"row count mismatch: {table}")
    # Materialize canonical versions ONCE. Inlined views duplicated the
    # version-ranking operator on both sides of the 100k engagement-target
    # join and exhausted 2 GB. This is validator scratch, not a node/query
    # optimization or a changed input. All history/tombstone rules remain.
    print("[realism-validator] materialize canonical documents once", flush=True)
    db.execute("CREATE TABLE current_docs AS SELECT * FROM documents LIMIT 0")
    with partitions(db,"documents",("doc_id","author_key"),directory.parent) as parts:
        for index,relation in enumerate(parts):
            print(f"[realism-validator] canonical partition {index+1}/{len(parts)}",flush=True)
            db.execute("INSERT INTO current_docs SELECT * EXCLUDE(rn,bucket) FROM "
                       "(SELECT *, row_number() OVER(PARTITION BY doc_id,author_key "
                       f"ORDER BY updated_at DESC,deleted DESC) rn FROM {relation}) WHERE rn=1 AND deleted=0")
    db.execute("CREATE TABLE originals AS SELECT * FROM current_docs WHERE collection_name='posts' "
               "AND ad_mode='none' AND NOT list_contains(tags,'ad')")


def summary(db, query):
    return dict(zip(("total", "mean", "median", "p99", "max", "top_1pct_share"),
                    db.execute("WITH vals AS (" + query + "), ordered AS "
                               "(SELECT v,row_number() OVER(ORDER BY v DESC) rank,count(*) OVER() n FROM vals) "
                               "SELECT sum(v),avg(v),median(v),quantile_disc(v,.99),max(v), "
                               "sum(CASE WHEN rank<=ceil(n*.01) THEN v ELSE 0 END)/nullif(sum(v),0) FROM ordered").fetchone()))


def inspect(db, manifest, progress=None, *, scratch_parent=None):
    spec, checks = manifest["contract"], {}
    n, targets = spec["recipe"]["accounts"], spec["targets"]
    progress = progress if progress is not None else {}

    def stage(name):
        progress["stage"] = name
        print(f"[realism-validator] stage={name}", flush=True)

    def check(name, sql):
        stage(name)
        checks[name] = bool(db.execute(sql).fetchone()[0])

    check("registered_population", f"SELECT count(*)={n} AND count(DISTINCT username)={n} FROM users")
    check("latent_population", f"SELECT count(*)={n} AND count(DISTINCT username)={n} "
          "AND count(*) FILTER(WHERE u.username IS NULL)=0 FROM population p LEFT JOIN users u USING(username)")
    check("document_identity", "SELECT count(*)=count(DISTINCT doc_id) FROM documents")
    check("document_actors_exist", "SELECT count(*)=0 FROM documents d ANTI JOIN users u ON d.author_key=u.username")
    check("document_times", "SELECT count(*)=0 FROM documents d JOIN users u ON d.author_key=u.username "
          "WHERE d.created_at<u.created_at OR d.updated_at<d.created_at OR d.updated_at>TIMESTAMP '2026-11-10 12:00:00'")
    check("links_resolve", "SELECT count(*)=0 FROM doc_groups g ANTI JOIN documents d USING(doc_id)")
    check("link_times", "SELECT count(*)=0 FROM doc_groups g JOIN documents d USING(doc_id) "
          "WHERE g.created_at<d.created_at OR g.updated_at<g.created_at")
    check("link_groups_resolve", "SELECT count(*)=0 FROM doc_groups g ANTI JOIN group_contracts c USING(group_id) "
          "WHERE g.group_id!='api.localhost/groups/web10/discover'")
    check("public_original_links", "SELECT count(*)=0 FROM originals p WHERE NOT EXISTS "
          "(SELECT 1 FROM doc_groups g WHERE g.doc_id=p.doc_id AND g.group_id='api.localhost/groups/web10/discover') "
          "OR NOT EXISTS(SELECT 1 FROM doc_groups g WHERE g.doc_id=p.doc_id AND "
          "g.group_id='api.localhost/groups/users/'||p.author_key||'/followers')")
    check("engagement_targets", "SELECT count(*)=0 FROM current_docs d LEFT JOIN originals p ON d.ref_value=p.doc_id "
          "WHERE d.collection_name IN ('reactions','comments') AND (p.doc_id IS NULL OR d.created_at<p.created_at "
          "OR (d.collection_name='comments' AND json_extract_string(d.body,'post_id')!=p.doc_id))")
    check("deliveries_resolve", "SELECT count(*)=0 FROM content_events e LEFT JOIN originals p USING(doc_id) "
          "LEFT JOIN users u ON e.reader_key=u.username WHERE p.doc_id IS NULL OR u.username IS NULL "
          "OR e.service!='posts' OR e.event_type!='delivery' OR e.seen_at<p.created_at "
          "OR e.seen_at>TIMESTAMP '2026-11-10 12:00:00'")
    # Distinct exposure audiences come from actual event records, not a
    # generator 'reach' column. Reuse for causal interaction validation.
    stage("materialize_distinct_exposure_audiences")
    db.execute("CREATE TABLE exposures AS SELECT doc_id,reader_key,min(seen_at) first_seen "
               "FROM content_events WHERE false GROUP BY doc_id,reader_key")
    checks["delivery_window"] = True
    with partitions(db,"content_events",("doc_id","reader_key"),scratch_parent) as parts:
        for index,relation in enumerate(parts):
            stage(f"exposure_partition_{index+1}_of_{len(parts)}")
            ok=db.execute("SELECT count(*)=0 FROM (SELECT seen_at-lag(seen_at) OVER "
                          f"(PARTITION BY doc_id,reader_key,surface ORDER BY seen_at) gap FROM {relation}) "
                          "WHERE gap<INTERVAL '24 hours'").fetchone()[0]
            checks["delivery_window"] = checks["delivery_window"] and bool(ok)
            db.execute("INSERT INTO exposures SELECT doc_id,reader_key,min(seen_at) first_seen "
                       f"FROM {relation} GROUP BY doc_id,reader_key")
    check("engagement_exposure_causality", "SELECT count(*)=0 FROM current_docs d LEFT JOIN exposures e "
          "ON d.ref_value=e.doc_id AND d.author_key=e.reader_key WHERE d.collection_name IN ('reactions','comments') "
          "AND (e.doc_id IS NULL OR d.created_at<e.first_seen)")
    check("unique_likes", "SELECT count(*)=count(DISTINCT (author_key,ref_value)) FROM current_docs WHERE collection_name='reactions'")
    check("comment_like_causality", "SELECT count(*)=0 FROM current_docs c LEFT JOIN current_docs l "
          "ON c.author_key=l.author_key AND c.ref_value=l.ref_value AND l.collection_name='reactions' "
          "WHERE c.collection_name='comments' AND (l.doc_id IS NULL OR c.created_at<l.created_at)")
    stage("materialize_actual_post_metrics")
    db.execute("CREATE TABLE post_metrics AS WITH l AS (SELECT ref_value,count(*) likes FROM current_docs WHERE collection_name='reactions' GROUP BY ref_value), "
               "c AS (SELECT ref_value,count(*) AS comments FROM current_docs WHERE collection_name='comments' GROUP BY ref_value), "
               "v AS (SELECT doc_id,count(*) impressions FROM content_events GROUP BY doc_id), "
               "r AS (SELECT doc_id,count(*) reach FROM exposures GROUP BY doc_id) "
               "SELECT p.doc_id,p.author_key,coalesce(l.likes,0) likes,coalesce(c.comments,0) AS comments, "
               "coalesce(v.impressions,0) impressions,coalesce(r.reach,0) reach FROM originals p "
               "LEFT JOIN l ON l.ref_value=p.doc_id LEFT JOIN c ON c.ref_value=p.doc_id "
               "LEFT JOIN v USING(doc_id) LEFT JOIN r USING(doc_id)")
    stage("materialize_closed_graph")
    db.execute("CREATE TABLE graph AS SELECT member_key AS reader_key,regexp_extract(group_id, '/users/([^/]+)/followers$',1) AS target_key "
               "FROM group_members WHERE role='member' AND group_id LIKE '%/followers'")
    check("closed_simple_graph", "SELECT count(*)=count(DISTINCT (reader_key,target_key)) "
          "AND count(*) FILTER(WHERE a.username IS NULL OR b.username IS NULL OR reader_key=target_key)=0 "
          "FROM graph LEFT JOIN users a ON a.username=reader_key LEFT JOIN users b ON b.username=target_key")
    stage("materialize_actual_account_metrics")
    db.execute("CREATE TABLE account_metrics AS SELECT p.*,coalesce(o.posts,0) posts,coalesce(i.followers,0) followers, "
               "coalesce(f.following,0) AS following,coalesce(v.impressions,0) impressions,coalesce(l.given,0) likes_given "
               "FROM population p LEFT JOIN (SELECT author_key,count(*) posts FROM originals GROUP BY author_key) o ON o.author_key=p.username "
               "LEFT JOIN (SELECT target_key,count(*) followers FROM graph GROUP BY target_key) i ON i.target_key=p.username "
               "LEFT JOIN (SELECT reader_key,count(*) AS following FROM graph GROUP BY reader_key) f ON f.reader_key=p.username "
               "LEFT JOIN (SELECT author_key,sum(impressions) impressions FROM post_metrics GROUP BY author_key) v ON v.author_key=p.username "
               "LEFT JOIN (SELECT author_key,count(*) given FROM current_docs WHERE collection_name='reactions' GROUP BY author_key) l ON l.author_key=p.username")
    stage("distribution_summaries_and_joint_correlations")
    nonposting = db.execute("SELECT count(*) FILTER(WHERE posts=0)/count(*) FROM account_metrics").fetchone()[0]
    shares = list(db.execute("WITH ranked AS (SELECT posts,row_number() OVER(ORDER BY posts DESC) r FROM account_metrics) "
                            f"SELECT sum(CASE WHEN r<={n//100} THEN posts ELSE 0 END)/sum(posts), "
                            f"sum(CASE WHEN r>{n//100} AND r<={n//10} THEN posts ELSE 0 END)/sum(posts), "
                            f"sum(CASE WHEN r>{n//10} THEN posts ELSE 0 END)/sum(posts) FROM ranked").fetchone())
    checks["authorship_nonposting"] = abs(nonposting - .85) <= spec["tolerances"]["nonposting_absolute"]
    checks["authorship_shares"] = all(abs(a-b) <= .05 for a,b in zip(shares, [.747,.240,.013]))
    metrics = {k: summary(db, f"SELECT {k} v FROM account_metrics") for k in ("posts", "followers", "following", "impressions", "likes_given")}
    per_post = {k: summary(db, f"SELECT {k} v FROM post_metrics") for k in ("likes", "comments", "impressions", "reach")}
    def count(sql):
        return db.execute(sql).fetchone()[0]
    totals = {t: info["rows"] for t,info in manifest["files"].items()}
    checks["post_total"] = metrics["posts"]["total"] == targets["posts"]
    checks["like_conservation"] = per_post["likes"]["total"] == metrics["likes_given"]["total"] == targets["likes"]
    checks["comment_conservation"] = per_post["comments"]["total"] == targets["comments"] == count("SELECT count(*) FROM current_docs WHERE collection_name='comments'")
    checks["impression_conservation"] = per_post["impressions"]["total"] == targets["impressions"] == totals["content_events"]
    checks["graph_conservation"] = metrics["followers"]["total"] == metrics["following"]["total"] == count("SELECT count(*) FROM graph")
    checks["following_mean"] = abs(metrics["following"]["mean"] - 150) <= 150*.15
    checks["following_median"] = 70 <= metrics["following"]["median"] <= 80
    checks["followers_median"] = 10 <= metrics["followers"]["median"] <= 100
    checks["like_marginals"] = per_post["likes"]["median"] == 0 and abs(per_post["likes"]["mean"] - 16) < .01
    check("like_zero_fraction", "SELECT abs(count(*) FILTER(WHERE likes=0)::DOUBLE/count(*)-.8871)<=.001 FROM post_metrics")
    checks["comment_ratio"] = abs(per_post["comments"]["total"] / per_post["likes"]["total"] - .3) < .001
    checks["impression_median"] = per_post["impressions"]["median"] == 50
    checks["viral_head"] = per_post["impressions"]["max"] == 1000000
    checks["eligible_reach"] = count(f"SELECT count(*) FROM post_metrics WHERE reach>impressions OR reach>{n-1} OR likes>reach") == 0
    concentration = {}
    for key, fraction, target in [("impressions",.037,.93),("likes",.0016,.5)]:
        share = count(f"WITH ranked AS (SELECT {key} v,row_number() OVER(ORDER BY {key} DESC) r,count(*) OVER() n FROM post_metrics) "
                      f"SELECT sum(CASE WHEN r<=ceil(n*{fraction}) THEN v ELSE 0 END)/sum(v) FROM ranked")
        concentration[key] = share
        checks[key + "_concentration"] = abs(share-target) <= .05
    correlations = dict(zip(("activity_posts", "popularity_followers", "followers_impressions", "activity_likes_given"),
                           db.execute("SELECT corr(activity,posts),corr(popularity,followers),corr(followers,impressions),corr(activity,likes_given) FROM account_metrics").fetchone()))
    checks["joint_correlations"] = all(v is not None and v > 0 for v in correlations.values())
    checks["no_dormant_viral_author"] = count("SELECT count(*) FROM account_metrics WHERE posts=0 AND impressions>0") == 0
    checks["prolific_time_span"] = count("SELECT count(*) FROM (SELECT author_key FROM originals GROUP BY author_key HAVING count(*)>=100 "
                                      "AND max(created_at)-min(created_at)<INTERVAL '30 days')") == 0
    checks["node_ads"] = count("SELECT count(*) FROM current_docs d WHERE list_contains(tags,'ad') AND list_contains(tags,'node_ad') "
                              "AND json_extract_string(body,'status')='active' AND EXISTS "
                              "(SELECT 1 FROM doc_groups g WHERE g.doc_id=d.doc_id AND g.group_id='api.localhost/groups/web10/discover')") == 300
    checks["profiles_not_originals"] = count("SELECT count(*) FROM current_docs WHERE collection_name='profile'") == n
    # Cohort distributions are computed from raw graph definitions and raw
    # posts, independently of the sampling code. All eight cells are reported.
    check("cohort_references", "SELECT count(*)=0 FROM cohorts c LEFT JOIN users a ON c.reader_key=a.username "
          "LEFT JOIN users b ON c.target_key=b.username WHERE a.username IS NULL OR b.username IS NULL OR c.reader_key=c.target_key")
    stage("per_cell_candidate_distributions")
    db.execute("CREATE TABLE candidate_metrics AS SELECT c.cell,c.reader_key,count(DISTINCT c.target_key) k, "
               "count(DISTINCT p.author_key) active_authors,count(p.doc_id) candidate_posts "
               "FROM cohorts c LEFT JOIN originals p ON p.author_key=c.target_key GROUP BY c.cell,c.reader_key")
    cell_stats = {}
    for k in (10,20,100,1000):
        for locality in ("hot","dispersed"):
            cell = f"{k}-{locality}"
            rows = db.execute("SELECT k,active_authors,candidate_posts FROM candidate_metrics WHERE cell=?", [cell]).fetchall()
            checks["cohort_"+cell] = len(rows) == spec["recipe"]["readers"] and all(r[0]==k and r[2]>0 for r in rows)
            cell_stats[cell] = {"readers":len(rows), "nonempty_readers":sum(r[2]>0 for r in rows),
                                "active_authors": summary(db, f"SELECT active_authors v FROM candidate_metrics WHERE cell='{cell}'"),
                                "candidate_posts": summary(db, f"SELECT candidate_posts v FROM candidate_metrics WHERE cell='{cell}'")}
            ordinary = manifest["readers"][1:]
            ordinary_values=db.execute("SELECT active_authors,candidate_posts FROM candidate_metrics "
                                       "WHERE cell=? AND reader_key!=?",[cell,manifest["readers"][0]]).fetchall()
            cell_stats[cell]["ordinary_readers"]={"count":len(ordinary),"nonempty":sum(v[1]>0 for v in ordinary_values),
                                                  "active_authors_min":min(v[0] for v in ordinary_values),
                                                  "candidate_posts_min":min(v[1] for v in ordinary_values)}
            cell_stats[cell]["viral_probe_reader"]=manifest["readers"][0]
    selected = f"{spec['recipe']['follow']}-{spec['recipe']['locality']}"
    check("selected_cohort_matches_graph", "SELECT NOT EXISTS(SELECT * FROM graph WHERE reader_key IN (SELECT reader_key FROM cohorts) "
          f"EXCEPT SELECT reader_key,target_key FROM cohorts WHERE cell='{selected}') AND NOT EXISTS "
          f"(SELECT reader_key,target_key FROM cohorts WHERE cell='{selected}' EXCEPT SELECT * FROM graph)")
    check("viral_probe_in_selected_feed", "SELECT EXISTS(SELECT 1 FROM cohorts c JOIN originals p ON c.target_key=p.author_key "
          "JOIN post_metrics m USING(doc_id) WHERE c.cell='"+selected+"' AND m.impressions=1000000)")
    return {"checks": checks, "complete": all(checks.values()), "accounts":n, "tables":totals,
            "authorship":{"nonposting":nonposting,"shares_top1_next9_bottom90":shares,"top10_derived":sum(shares[:2])},
            "per_account":metrics,"per_post":per_post,"concentration":concentration,
            "correlations":correlations,"cells":cell_stats,
            "arithmetic":spec["arithmetic"],"scope":"Finished synthetic records, not node/browser performance or private/lifecycle acceptance"}


def validate(directory, out):
    directory, out = Path(directory).resolve(), Path(out)
    if out.exists():
        raise FileExistsError("refusing to overwrite validation receipt")
    manifest = json.loads((directory / "manifest.json").read_bytes())
    validator_pin = sha(__file__)
    if validator_pin != VALIDATOR_SOURCE_AT_IMPORT:
        raise ValueError("validator source changed since module import; restart in a fresh process")
    progress = {"stage":"integrity"}
    with tempfile.TemporaryDirectory(prefix="realism-validate-", dir=directory.parent) as tmp:
        db = duckdb.connect(str(Path(tmp)/"validation.duckdb"))
        db.execute("SET memory_limit='2GB'; SET threads=1; SET preserve_insertion_order=false")
        db.execute("SET temp_directory=?", [str(Path(tmp)/"spill")])
        try:
            print("[realism-validator] integrity start", flush=True)
            attach(db, directory, manifest)
            print("[realism-validator] finished-record semantic checks start", flush=True)
            result = inspect(db, manifest, progress, scratch_parent=Path(tmp))
        except Exception as error:
            result = {"complete":False,"accounts":manifest.get("recipe",{}).get("accounts"),
                      "checks":{"validator_execution":False},"error_type":type(error).__name__,
                      "stage":progress["stage"],"diagnostic":str(error)[:500]}
        finally:
            db.close()
    if validator_pin != sha(__file__):
        result["complete"] = False
        result["checks"]["unchanged_validator_during_run"] = False
    result.update({"format":FORMAT,"dataset_id":manifest["dataset_id"],"validator_sha256":validator_pin,
                   "dataset_directory":os.path.relpath(directory,out.resolve().parent)})
    with out.open("xb") as stream:
        stream.write(encoded(result))
    print(f"[realism-validator] complete={result['complete']}; failed={[k for k,v in result['checks'].items() if not v]}", flush=True)
    return result


class Oracle:
    """Expected real feed rows/counts from canonical finished records.

    Caller owns this connection's lifetime; no generator functions, constants,
    sampled IDs or predicted counts enter the expectation query.
    """
    def __init__(self, db, manifest):
        self.db, self.manifest = db, manifest

    def groups(self, reader):
        return [r[0] for r in self.db.execute("SELECT group_id FROM group_members WHERE member_key=? "
                "AND role='member' AND group_id LIKE '%/followers' ORDER BY group_id", [reader]).fetchall()]

    def expected(self, reader, cursor=None):
        rows = self.db.execute("SELECT p.doc_id,p.author_key,p.created_at FROM originals p JOIN doc_groups g USING(doc_id) "
            "JOIN group_members m USING(group_id) WHERE m.member_key=? AND m.role='member' "
            "AND g.group_id LIKE '%/followers' AND (? IS NULL OR p.created_at<?) "
            "ORDER BY p.created_at DESC,p.doc_id LIMIT 21", [reader,cursor,cursor]).fetchall()
        return [{"doc_id":r[0],"author_key":r[1],"created_at":r[2]} for r in rows]

    def check(self, reader, rows, followups, live_delivery_delta=None):
        if live_delivery_delta is None:
            raise ValueError("derived oracle requires an explicit independently receipted live-delivery delta; no lower-bound bypass")
        expected = self.expected(reader)
        if [(r["doc_id"],r["author_key"]) for r in rows] != [(r["doc_id"],r["author_key"]) for r in expected]:
            raise ValueError("derived oracle: wrong candidate IDs/authors/order/count")
        likes = {r["ref_value"]:(int(r["like_count"]),int(r["dislike_count"])) for r in followups[0]["rows"]}
        comments = {r["post_id"]:int(r["comment_count"]) for r in followups[1]["rows"]}
        for row in expected:
            doc = row["doc_id"]
            like_count,comment_count = self.db.execute("SELECT count(*) FILTER(WHERE collection_name='reactions'), "
                "count(*) FILTER(WHERE collection_name='comments') FROM current_docs WHERE ref_value=?", [doc]).fetchone()
            if likes.get(doc,(0,0)) != (like_count,0) or comments.get(doc,0) != comment_count:
                raise ValueError("derived oracle: wrong engagement counts")
            profile = next(r.get("profile_body") for r in rows if r["doc_id"]==doc)
            actual_profile = self.db.execute("SELECT body FROM current_docs WHERE author_key=? AND collection_name='profile'", [row["author_key"]]).fetchone()
            if isinstance(profile,str):
                profile=json.loads(profile)
            if not actual_profile or profile!=json.loads(actual_profile[0]):
                raise ValueError("derived oracle: wrong joined profile")
            impressions,reach = self.db.execute("SELECT count(*),count(DISTINCT reader_key) FROM content_events WHERE doc_id=?", [doc]).fetchone()
            v = followups[2].get(doc,{})
            # The read path adds delivery rows. Seeded history is not an
            # excuse for accepting arbitrary overcounts. The connected runner
            # must supply the separately verified delta (not the HTTP answer).
            di, dr = live_delivery_delta.get(doc, (0, 0))
            if any(type(v) is not int or v < 0 for v in (di,dr)) or dr > di:
                raise ValueError("invalid independent live-delivery delta")
            if (v.get("impressions",0),v.get("reach",0)) != (impressions+di,reach+dr):
                raise ValueError("derived oracle: wrong exact views/reach")
        return {"fetched":len(rows),"exact_order":True,"engagement":True,"profiles":True,
                "exact_views_with_independent_live_delta":True}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory",type=Path)
    parser.add_argument("--out",type=Path,required=True)
    args=parser.parse_args()
    raise SystemExit(0 if validate(args.directory,args.out)["complete"] else 1)
