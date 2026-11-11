"""Network-free contract, allocation, envelope and independent-oracle regressions."""
import json
import csv
import statistics
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import duckdb
import core_feed

import realism_contract as c
import realism_dataset as generator
import realism_runner as runner
import realism_validate as validator


class ContractTests(unittest.TestCase):
    def test_total_and_horizon_adjust_not_the_sourced_shapes(self):
        for n in (10000,100000,1000000):
            spec=c.contract(n)
            self.assertEqual(spec["targets"]["post_shares"],[.747,.240,.013])
            self.assertEqual(spec["targets"]["nonposting"],.85)
            self.assertEqual(spec["targets"]["posts"],4*n)
            self.assertEqual(spec["targets"]["impressions"],1600*n)
            self.assertEqual(spec["arithmetic"]["attention_horizon_days"],320)
            self.assertGreaterEqual(1600*n,spec["arithmetic"]["necessary_minimum_impressions_at_chosen_posts"])
            self.assertFalse(spec["admission"]["paid_provisioning"])

    def test_bad_or_undeclared_recipe_refused(self):
        for args in ({"accounts":1000},{"accounts":10000,"seed":True},
                     {"accounts":10000,"readers":10001},{"accounts":10000,"follow":21},
                     {"accounts":10000,"locality":"anything"}):
            with self.subTest(args=args),self.assertRaises(ValueError):
                c.contract(**args)

    def test_integer_capped_allocation_closes_and_repeats(self):
        for total in (7,20,29):
            result=generator.allocate(total,[10,2,1],[10,10,10],minimum=1)
            self.assertEqual(sum(result),total)
            self.assertTrue(all(1<=v<=10 for v in result))
            self.assertEqual(result,generator.allocate(total,[10,2,1],[10,10,10],minimum=1))
        for total,weights,caps in ((31,[1,1,1],[10,10,10]),(1,[1,1],[2,2]),(10,[0,1],[10,10])):
            with self.assertRaises(ValueError):
                generator.allocate(total,weights,caps,minimum=1)

    def test_million_does_not_create_output_without_floor_receipts(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/"million"
            with self.assertRaises(ValueError):
                generator.build(out,c.contract(1000000))
            self.assertFalse(out.exists())

    def test_receipt_booleans_alone_cannot_open_million_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths=[]
            for n in (10000,100000):
                p=Path(tmp)/f"{n}.json"
                p.write_text(json.dumps({"accounts":n,"complete":True,"format":c.FORMAT,
                                         "validator_sha256":c.sha(validator.__file__),"checks":{"fake":True}}))
                paths.append(p)
            with self.assertRaises((ValueError,KeyError)):
                validator.verify_floor_receipts(paths)

    def test_validator_cannot_stamp_new_source_hash_on_old_loaded_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            (directory/"manifest.json").write_text('{}')
            out=directory/"receipt.json"
            with patch.object(validator,"sha",return_value="edited-after-import"):
                with self.assertRaisesRegex(ValueError,"fresh process"):
                    validator.validate(directory,out)
            self.assertFalse(out.exists())

    def test_envelope_and_sensitivity_are_explicit_and_disjoint(self):
        normal=runner.compose("web10-costfn-frozen-rd-test")
        sensitivity=runner.compose("web10-costfn-frozen-rd-test",sensitivity=True)
        self.assertEqual(normal["envelope"]["container_bytes"],28*1024**3)
        self.assertEqual(normal["envelope"]["clickhouse_server_bytes"],22*1024**3)
        self.assertTrue(any(p.endswith("realism.compose.yml") for p in normal["command"]))
        self.assertFalse(any(p.endswith("realism.compose.yml") for p in sensitivity["command"]))
        self.assertEqual(sensitivity["envelope"]["container_bytes"],5*1024**3)
        import xml.etree.ElementTree as ET
        root=ET.parse(Path(__file__).with_name("clickhouse-config")/"realism-memory.xml")
        self.assertEqual(int(root.findtext("max_server_memory_usage")),22*1024**3)
        with self.assertRaises(ValueError):
            runner.compose("production")

    def test_model_budgets_and_repeat_exposure_times_close_before_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            generator.model(c.contract(10000),Path(tmp))
            with (Path(tmp)/"population.csv").open() as stream:
                people=list(csv.DictReader(stream))
            counts=sorted((int(p["post_count"]) for p in people),reverse=True)
            self.assertEqual(statistics.median(int(p["degree"]) for p in people),75.5)
            self.assertEqual(sum(v==0 for v in counts),8500)
            self.assertEqual(sum(counts),40000)
            self.assertEqual(sum(counts[:100]),29880)
            self.assertEqual(sum(counts[100:1000]),9600)
            self.assertEqual(sum(counts[1000:]),520)
            totals={k:0 for k in ("impressions","likes","comments")}
            stamps=set()
            impression_counts=[]
            with (Path(tmp)/"posts.csv").open() as stream:
                for raw in csv.DictReader(stream):
                    row={k:int(v) for k,v in raw.items()}
                    impression_counts.append(row["impressions"])
                    for key in totals:
                        totals[key]+=row[key]
                    self.assertNotIn(row["age_ms"],stamps)
                    stamps.add(row["age_ms"])
                    self.assertLessEqual(row["likes"],row["reach"])
                    self.assertLessEqual(row["comments"],row["likes"])
                    if row["impressions"]>row["reach"]:
                        self.assertGreaterEqual(row["reach"]*row["age_ms"]/(row["impressions"]+1),86400000)
            self.assertEqual(totals,{"impressions":16000000,"likes":640000,"comments":192000})
            self.assertEqual(statistics.median(impression_counts),50)


class IndependentOracleTests(unittest.TestCase):
    def setUp(self):
        self.db=duckdb.connect()
        self.addCleanup(self.db.close)
        self.db.execute("CREATE TABLE originals(doc_id VARCHAR,author_key VARCHAR,created_at TIMESTAMP)")
        self.db.execute("INSERT INTO originals VALUES ('one','a','2026-01-01'),('two','a','2026-02-01'),('other','b','2026-03-01')")
        self.db.execute("CREATE TABLE doc_groups(doc_id VARCHAR,group_id VARCHAR)")
        self.db.execute("INSERT INTO doc_groups VALUES ('one','node/users/a/followers'),('two','node/users/a/followers'),('other','node/users/b/followers')")
        self.db.execute("CREATE TABLE group_members(group_id VARCHAR,member_key VARCHAR,role VARCHAR)")
        self.db.execute("INSERT INTO group_members VALUES ('node/users/a/followers','reader','member')")
        self.oracle=validator.Oracle(self.db,{"readers":["reader"]})

    def test_multiple_posts_zeros_and_actual_membership_drive_expectation(self):
        with patch.object(generator,"model",side_effect=AssertionError("oracle must not call generator")):
            self.assertEqual([r["doc_id"] for r in self.oracle.expected("reader")],["two","one"])
            self.assertEqual(self.oracle.expected("ungranted"),[])
            self.assertEqual([r["doc_id"] for r in self.oracle.expected("reader","2026-02-01")],["one"])
            self.db.execute("DELETE FROM group_members")
            self.assertEqual(self.oracle.expected("reader"),[])

    def test_live_views_never_degrade_to_lower_bound_acceptance(self):
        with self.assertRaisesRegex(ValueError,"independently receipted"):
            self.oracle.check("reader",[],[])

    def test_derived_data_never_enters_legacy_one_post_checker(self):
        manifest={"format":c.FORMAT,"readers":["reader"]}
        with self.assertRaisesRegex(ValueError,"never the V2"):
            core_feed.check_result(manifest,0,[],[])
        with patch.object(self.oracle,"check",return_value={"routed":True}) as checked:
            self.assertEqual(core_feed.check_result(manifest,0,[],[],self.oracle,{}),{"routed":True})
            checked.assert_called_once_with("reader",[],[],live_delivery_delta={})

    def test_derived_session_without_oracle_refuses_before_network(self):
        import asyncio
        with self.assertRaisesRegex(ValueError,"membership oracle"):
            asyncio.run(core_feed.prepare(None,{"format":c.FORMAT},1))

    def prepared_answers(self):
        self.db.execute("CREATE TABLE current_docs(doc_id VARCHAR,author_key VARCHAR,collection_name VARCHAR,body VARCHAR,ref_value VARCHAR)")
        self.db.execute("INSERT INTO current_docs VALUES ('profile','a','profile','{\"display_name\":\"A\"}',''),"
                        "('l1','b','reactions','{\"type\":\"like\"}','two'),"
                        "('l2','c','reactions','{\"type\":\"like\"}','two'),"
                        "('c1','b','comments','{}','two')")
        self.db.execute("CREATE TABLE content_events(doc_id VARCHAR,reader_key VARCHAR)")
        self.db.execute("INSERT INTO content_events VALUES ('two','b'),('two','b'),('two','c'),('one','b')")
        rows=[{**r,"profile_body":{"display_name":"A"}} for r in self.oracle.expected("reader")]
        followups=[{"rows":[{"ref_value":"two","like_count":2,"dislike_count":0}]},
                   {"rows":[{"post_id":"two","comment_count":1}]},
                   {"two":{"impressions":3,"reach":2},"one":{"impressions":1,"reach":1}}]
        return rows,followups

    def test_exact_canonical_counts_not_one_like_per_author(self):
        rows,followups=self.prepared_answers()
        self.assertTrue(self.oracle.check("reader",rows,followups,{})["exact_views_with_independent_live_delta"])
        followups[0]["rows"][0]["like_count"]=1
        with self.assertRaisesRegex(ValueError,"engagement"):
            self.oracle.check("reader",rows,followups,{})

    def test_overcounted_views_and_wrong_profiles_denied(self):
        rows,followups=self.prepared_answers()
        followups[2]["two"]["impressions"]=999
        with self.assertRaisesRegex(ValueError,"exact views"):
            self.oracle.check("reader",rows,followups,{})
        followups[2]["two"]["impressions"]=3
        rows[0]["profile_body"]={"display_name":"Wrong"}
        with self.assertRaisesRegex(ValueError,"joined profile"):
            self.oracle.check("reader",rows,followups,{})

    def test_big_intervals_do_not_truncate_to_int32(self):
        self.assertGreater(self.db.execute("SELECT epoch(to_milliseconds(26007525331::BIGINT))").fetchone()[0],26000000)


class FinishedRecordGateTests(unittest.TestCase):
    def database(self):
        db=duckdb.connect()
        self.addCleanup(db.close)
        db.execute("CREATE TABLE users(username VARCHAR,created_at TIMESTAMP)")
        db.execute("INSERT INTO users VALUES ('a','2025-01-01'),('b','2025-01-01'),('reader','2025-01-01'),('reader2','2025-01-01')")
        db.execute("CREATE TABLE population AS SELECT row_number() OVER() id,username,1.0/row_number() OVER() activity,1.0/row_number() OVER() popularity FROM users")
        db.execute("CREATE TABLE documents(doc_id VARCHAR,author_key VARCHAR,collection_name VARCHAR,body VARCHAR,ref_value VARCHAR,tags VARCHAR[],created_at TIMESTAMP,updated_at TIMESTAMP,deleted INTEGER,ad_mode VARCHAR)")
        db.execute("INSERT INTO documents VALUES "
                   "('post','a','posts','{}','',[],'2026-01-01','2026-01-01',0,'none'),"
                   "('like','b','reactions','{\"type\":\"like\"}','post',[],'2026-01-02','2026-01-02',0,'none'),"
                   "('comment','b','comments','{\"post_id\":\"post\"}','post',[],'2026-01-03','2026-01-03',0,'none')")
        db.execute("CREATE VIEW current_docs AS SELECT * FROM documents WHERE deleted=0")
        db.execute("CREATE VIEW originals AS SELECT * FROM current_docs WHERE collection_name='posts'")
        db.execute("CREATE TABLE doc_groups AS SELECT 'post' doc_id,'api.localhost/groups/web10/discover' group_id,TIMESTAMP '2026-01-01' created_at,TIMESTAMP '2026-01-01' updated_at,0 deleted "
                   "UNION ALL SELECT 'post','api.localhost/groups/users/a/followers',TIMESTAMP '2026-01-01',TIMESTAMP '2026-01-01',0")
        db.execute("CREATE TABLE group_contracts AS SELECT 'api.localhost/groups/users/a/followers' group_id")
        db.execute("CREATE TABLE group_members AS SELECT 'api.localhost/groups/users/a/followers' group_id,'reader' member_key,'member' AS role "
                   "UNION ALL SELECT 'api.localhost/groups/users/a/followers','reader2','member'")
        db.execute("CREATE TABLE content_events AS SELECT 'post' doc_id,'posts' service,'b' reader_key,'feed' surface,'delivery' event_type,TIMESTAMP '2026-01-01 01:00:00' seen_at")
        db.execute("CREATE TABLE cohorts AS SELECT k::VARCHAR||'-'||locality cell,username reader_key,'a' target_key "
                   "FROM (VALUES (10),(20),(100),(1000)) x(k) CROSS JOIN (VALUES ('hot'),('dispersed')) y(locality) "
                   "CROSS JOIN users WHERE username IN ('reader','reader2')")
        return db

    def manifest(self):
        return {"contract":c.contract(10000,readers=2),"readers":["reader","reader2"],
                "files":{t:{"rows":1} for t in validator.TABLES}}

    def test_full_validator_executes_all_sql_and_rejects_tiny_population(self):
        result=validator.inspect(self.database(),self.manifest())
        self.assertFalse(result["complete"])
        self.assertFalse(result["checks"]["registered_population"])
        self.assertTrue(result["checks"]["engagement_exposure_causality"])
        self.assertTrue(result["checks"]["delivery_window"])
        self.assertEqual(len(result["cells"]),8)

    def test_dangling_and_pre_exposure_interaction_is_denied(self):
        db=self.database()
        db.execute("UPDATE documents SET ref_value='missing' WHERE doc_id='comment'")
        db.execute("UPDATE documents SET created_at=TIMESTAMP '2025-01-01' WHERE doc_id='like'")
        result=validator.inspect(db,self.manifest())
        self.assertFalse(result["checks"]["engagement_targets"])
        self.assertFalse(result["checks"]["engagement_exposure_causality"])

    def test_canonical_validator_scratch_is_materialized_and_deletion_wins(self):
        db=self.database()
        db.execute("CREATE TABLE app_contracts(user_key VARCHAR)")
        db.execute("INSERT INTO documents VALUES ('post','a','posts','{}','',[],"
                   "'2026-01-01','2026-02-01',1,'none')")
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            manifest={"format":c.FORMAT,"contract":c.contract(10000,readers=2),
                      "recipe":c.contract(10000,readers=2)["recipe"],"files":{}}
            for table in validator.TABLES:
                path=directory/f"{table}.parquet"
                db.execute(f"COPY {table} TO '{path.as_posix()}' (FORMAT PARQUET)")
                manifest["files"][table]={"name":path.name,"rows":db.execute(f"SELECT count(*) FROM {table}").fetchone()[0],
                                          "bytes":path.stat().st_size,"sha256":c.sha(path)}
            manifest["dataset_id"]=c.identity(manifest)
            (directory/"manifest.json").write_bytes(c.encoded(manifest))
            other=duckdb.connect()
            self.addCleanup(other.close)
            validator.attach(other,directory,manifest)
            self.assertEqual(other.execute("SELECT table_type FROM information_schema.tables WHERE table_name='current_docs'").fetchone()[0],"BASE TABLE")
            self.assertEqual(other.execute("SELECT count(*) FROM originals").fetchone()[0],0)


if __name__=="__main__":
    unittest.main()
