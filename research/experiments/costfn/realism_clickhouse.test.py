"""Fail-closed receipt controls and opt-in actual ClickHouse/DuckDB parity."""
from contextlib import redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import duckdb
import realism_contract as contract
import realism_clickhouse as engine
import realism_validate as validator


class ReceiptTests(unittest.TestCase):
    def proof(self):
        return {'validator_sha256':contract.sha(validator.__file__),
                'validator_dependencies':validator.validator_dependencies(),
                'validator_engine':{'name':'ClickHouse','version':engine.VERSION}}

    def test_engine_and_every_dependency_are_required(self):
        proof=self.proof()
        self.assertTrue(validator.current_receipt(proof))
        for field in ('validator_sha256','validator_dependencies','validator_engine'):
            changed={**proof,field:None}
            self.assertFalse(validator.current_receipt(changed))
        proof['validator_engine']['name']='DuckDB-reference'
        self.assertFalse(validator.current_receipt(proof))

    def test_no_engine_fallback_and_failed_receipt_is_retained(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory=root/'dataset'
            directory.mkdir()
            (directory/'manifest.json').write_text(json.dumps({'dataset_id':'synthetic','recipe':{'accounts':10000}}))
            with patch.object(validator,'verify_inputs'),patch.object(engine,'ClickHouse',side_effect=FileNotFoundError('clickhouse missing')),patch.object(validator,'validate_duckdb_reference',side_effect=AssertionError('no fallback')):
                with redirect_stdout(io.StringIO()):
                    result=validator.validate(directory,root/'failed.json',keep_work=True)
            self.assertFalse(result['complete'])
            self.assertFalse(result['checks']['validator_execution'])
            self.assertEqual(result['error_type'],'FileNotFoundError')
            self.assertTrue((root/'failed.json').exists())
            self.assertTrue(list(root.glob('realism-clickhouse-*')))
            with self.assertRaises(FileExistsError):
                validator.validate(directory,root/'failed.json')

    def test_resource_and_exactness_settings_are_explicit(self):
        self.assertEqual(engine.SETTINGS['max_memory_usage'],'2000000000')
        self.assertEqual(engine.SETTINGS['max_threads'],'4')
        self.assertEqual(engine.SETTINGS['max_insert_threads'],'4')
        self.assertEqual(engine.SETTINGS['max_execution_time'],'5400')
        self.assertEqual(engine.SETTINGS['count_distinct_implementation'],'uniqExact')
        self.assertEqual(engine.SETTINGS['join_use_nulls'],'1')
        self.assertEqual(engine.SETTINGS['max_temporary_data_on_disk_size_for_query'],'100000000000')

    def test_wrong_engine_version_is_refused_and_closed(self):
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{'REALISM_CLICKHOUSE_DOCKER':'0'}):
            with patch.object(engine.ClickHouse,'query',return_value=[['unapproved-version']]),patch.object(engine.ClickHouse,'close') as close:
                with self.assertRaisesRegex(ValueError,'required, found'):
                    engine.ClickHouse(tmp,tmp)
                close.assert_called_once()

    def test_dependency_drift_cannot_stamp_a_passing_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory=root/'dataset'
            directory.mkdir()
            (directory/'manifest.json').write_text(json.dumps({'dataset_id':'synthetic','recipe':{'accounts':10000}}))
            before=validator.validator_dependencies()
            after={**before,'realism_clickhouse.py':'changed-during-run'}
            with patch.object(validator,'verify_inputs'),patch.object(engine,'ClickHouse') as client,patch.object(engine,'inspect',return_value={'complete':True,'checks':{'facts':True}}),patch.object(validator,'validator_dependencies',side_effect=[before,after]),redirect_stdout(io.StringIO()):
                client.return_value.context={}
                result=validator.validate(directory,root/'receipt.json')
            self.assertFalse(result['complete'])
            self.assertFalse(result['checks']['unchanged_validator_during_run'])

    def test_lease_deadline_refuses_query_before_process_start(self):
        db=object.__new__(engine.ClickHouse)
        db.prefix=[]
        db.path='unused'
        db.settings=dict(engine.SETTINGS)
        with patch.dict(os.environ,{'REALISM_PREP_DEADLINE':'1'}),patch.object(engine.subprocess,'Popen') as process:
            with self.assertRaisesRegex(RuntimeError,'deadline'):
                db.query('SELECT 1')
            process.assert_not_called()

    def test_performance_profile_only_changes_memory_and_time(self):
        with patch.dict(os.environ,{'REALISM_CLICKHOUSE_PROFILE':'performance'}):
            profile,settings=engine.resource_settings()
        self.assertEqual(profile,'performance')
        self.assertEqual(settings,{**engine.SETTINGS,'max_memory_usage':str(22*1024**3),'max_execution_time':'14400'})
        self.assertEqual(engine.import_semantics(),engine.PREVIOUS_IMPORT_SEMANTICS)
        with patch.dict(os.environ,{'REALISM_CLICKHOUSE_PROFILE':'typo'}):
            with self.assertRaises(ValueError):
                engine.resource_settings()

    def test_unterminated_native_error_is_retained_in_log_and_receipt_diagnostic(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=object.__new__(engine.ClickHouse)
            db.work=Path(tmp)
            db.path=tmp
            db.settings=dict(engine.SETTINGS)
            db.prefix=[sys.executable,'-c',
                "import sys;sys.stderr.write('synthetic allocation failure');sys.exit(241)"]
            with self.assertRaisesRegex(RuntimeError,'241: synthetic allocation failure'):
                db.query('SELECT 1')
            self.assertIn('synthetic allocation failure',(db.work/'clickhouse.log').read_text())

    def test_reviewed_lineage_keeps_context_and_denies_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            db=object.__new__(engine.ClickHouse)
            db.work=root
            db.profile='performance'
            manifest={'dataset_id':'fixture','files':{}}
            old={'dataset_id':'fixture','files':{},'engine':engine.VERSION,
                'source':engine.PREVIOUS_IMPORT_SOURCE,'entrypoint':engine.PREVIOUS_ENTRYPOINT}
            path=root/'import-context.json'
            path.write_text(json.dumps(old))
            before=path.read_bytes()
            with patch.dict(os.environ,{'REALISM_CLICKHOUSE_REUSE_WORK':str(root)}):
                db.bind_imports(manifest)
                self.assertEqual(db.context,old)
                self.assertEqual(path.read_bytes(),before)
                for key in ('dataset_id','engine','source','entrypoint','files'):
                    path.write_text(json.dumps({**old,key:'changed'}))
                    with self.subTest(key=key),self.assertRaisesRegex(ValueError,'stale'):
                        db.bind_imports(manifest)
                path.write_bytes(before)
                with patch.object(engine,'import_semantics',return_value='changed'):
                    with self.assertRaisesRegex(ValueError,'stale'):
                        db.bind_imports(manifest)
            with patch.dict(os.environ,{'REALISM_CLICKHOUSE_REUSE_WORK':''}):
                with self.assertRaisesRegex(ValueError,'stale'):
                    db.bind_imports(manifest)

    def test_explicit_workspace_requires_retention_profile_and_existing_sibling(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for keep,profile in ((False,'performance'),(True,'bounded'),(True,'performance')):
                with patch.dict(os.environ,{'REALISM_CLICKHOUSE_REUSE_WORK':str(root/'missing'),
                        'REALISM_CLICKHOUSE_PROFILE':profile}):
                    with self.subTest(keep=keep,profile=profile),self.assertRaises(ValueError):
                        with validator.clickhouse_workspace(root/'dataset',{},keep):
                            self.fail('invalid workspace admitted')


class AdmissionTests(unittest.TestCase):
    def test_exact_payload_admits_only_bounded_builds(self):
        self.assertEqual(engine.join_admission([100,50],200),{'join_algorithm':'hash'})
        self.assertEqual(engine.join_admission([201],200),{})
        self.assertEqual(engine.join_admission([100,None],200),{})
        self.assertEqual(engine.join_admission([-1],200),{})
        self.assertEqual(engine.join_admission([True],200),{})

    def test_calibration_receipt_binds_engine_profile_source_and_range(self):
        source=contract.sha(Path(engine.__file__).with_name('realism_calibration.py'))
        receipt={'engine':engine.VERSION,'profile':'performance','calibration_source':source,
            'rows':83_200_000,'overhead':150}
        self.assertEqual(engine.calibration_overhead(receipt,'performance'),150)
        for bad in ({**receipt,'engine':'wrong'},{**receipt,'profile':'bounded'},
                {**receipt,'calibration_source':'wrong'},{**receipt,'rows':9},
                {**receipt,'overhead':engine.BUILD_ROW_OVERHEAD},{**receipt,'overhead':0},
                {**receipt,'overhead':'150'},'not-a-receipt'):
            with self.subTest(bad=bad):
                self.assertIsNone(engine.calibration_overhead(bad,'performance'))


@unittest.skipUnless(os.environ.get('REALISM_CLICKHOUSE_TESTS')=='1','opt in to real ClickHouse binary/container')
class EngineTests(unittest.TestCase):
    def diagnostic_validate(self,*args,**kwargs):
        # These deliberately incomplete fixtures compare every individual SQL
        # verdict against the reference. Catch FAIL only in this test adapter;
        # production fail-stop is separately exercised without this adapter.
        from realism_checkpoints import Checkpoints, CheckFailed
        evaluate=Checkpoints.evaluate
        def collect(cp,*values,**options):
            try:
                return evaluate(cp,*values,**options)
            except CheckFailed:
                return False
        with patch.object(Checkpoints,'evaluate',collect),patch.object(Checkpoints,'completed',lambda cp:dict(cp.checks)):
            return validator.validate(*args,**kwargs)

    def fixture(self,root,mutation=None):
        # Independent small finished-record fixture; no generator model calls.
        spec=importlib.util.spec_from_file_location('reference_controls',Path(__file__).with_name('realism.test.py'))
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        controls=module.FinishedRecordGateTests()
        db=controls.database()
        self.addCleanup(controls.doCleanups)
        db.execute('CREATE TABLE app_contracts(user_key VARCHAR)')
        if mutation:
            db.execute(mutation)
        directory=root/'dataset'
        directory.mkdir()
        policy=contract.contract(10000,readers=2)
        manifest={'format':contract.FORMAT,'contract':policy,'recipe':policy['recipe'],
                  'readers':['reader','reader2'],'files':{}}
        for table in validator.TABLES:
            path=directory/f'{table}.parquet'
            db.execute(f"COPY {table} TO '{path.as_posix()}' (FORMAT PARQUET)")
            manifest['files'][table]={'name':path.name,'rows':db.execute(f'SELECT count(*) FROM {table}').fetchone()[0],
                                    'bytes':path.stat().st_size,'sha256':contract.sha(path)}
        manifest['dataset_id']=contract.identity(manifest)
        (directory/'manifest.json').write_bytes(contract.encoded(manifest))
        return directory,manifest

    def test_actual_engine_all_fifty_checks_match_reference(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,_=self.fixture(root)
            with redirect_stdout(io.StringIO()):
                reference=validator.validate_duckdb_reference(directory,root/'reference.json')
                with patch.object(duckdb,'connect',side_effect=AssertionError('default validation must use ClickHouse')):
                    actual=self.diagnostic_validate(directory,root/'actual.json',keep_work=True)
            self.assertNotIn('validator_execution',actual['checks'],actual)
            self.assertEqual(len(actual['checks']),50)
            self.assertEqual(actual['checks'],reference['checks'])
            for key in ('per_account','per_post','authorship','concentration','cells'):
                self.assertEqual(actual[key],reference[key],key)

    def test_duplicate_delivery_and_dangling_actor_are_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,_=self.fixture(root,"INSERT INTO content_events SELECT doc_id,service,'missing',surface,event_type,seen_at FROM content_events; INSERT INTO content_events SELECT * FROM content_events WHERE reader_key='b'")
            with redirect_stdout(io.StringIO()):
                reference=validator.validate_duckdb_reference(directory,root/'reference.json')
                actual=self.diagnostic_validate(directory,root/'actual.json')
            self.assertNotIn('validator_execution',actual['checks'],actual)
            self.assertEqual(actual['checks'],reference['checks'])
            self.assertFalse(actual['checks']['delivery_window'])
            self.assertFalse(actual['checks']['deliveries_resolve'])

    def test_exact_even_median_and_discrete_quantile_ranks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            db=engine.ClickHouse(root,root)
            self.addCleanup(db.close)
            with duckdb.connect() as reference:
                for n in (1,2,3,100,101,200):
                    actual=engine.summary(db,f'SELECT number AS v FROM numbers({n})')
                    expected=validator.summary(reference,f'SELECT range AS v FROM range({n})')
                    self.assertEqual(actual,expected,n)

    def test_late_exposure_denies_only_engagement_exposure_causality(self):
        # Drives the flipped check 13 (total-good, build side = engagements)
        # through its fail path on the actual engine.
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,_=self.fixture(root,"UPDATE content_events SET seen_at=TIMESTAMP '2026-01-04 00:00:00' WHERE reader_key='b'")
            with redirect_stdout(io.StringIO()):
                reference=validator.validate_duckdb_reference(directory,root/'reference.json')
                actual=self.diagnostic_validate(directory,root/'actual.json')
            self.assertNotIn('validator_execution',actual['checks'],actual)
            self.assertEqual(actual['checks'],reference['checks'])
            self.assertFalse(actual['checks']['engagement_exposure_causality'])
            self.assertTrue(actual['checks']['engagement_targets'])
            self.assertTrue(actual['checks']['deliveries_resolve'])
            self.assertTrue(actual['checks']['delivery_window'])
            self.assertEqual(actual['per_post'],reference['per_post'])

    def test_time_and_target_mutations_match_reference_denials(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,_=self.fixture(root,"UPDATE documents SET ref_value='missing' WHERE doc_id='comment'; "
                "UPDATE documents SET created_at=TIMESTAMP '2025-01-01' WHERE doc_id='like'")
            with redirect_stdout(io.StringIO()):
                reference=validator.validate_duckdb_reference(directory,root/'reference.json')
                actual=self.diagnostic_validate(directory,root/'actual.json')
            self.assertNotIn('validator_execution',actual['checks'],actual)
            self.assertEqual(actual['checks'],reference['checks'])
            self.assertFalse(actual['checks']['engagement_targets'])
            self.assertFalse(actual['checks']['engagement_exposure_causality'])
            self.assertFalse(actual['checks']['comment_like_causality'])

    def test_folded_cohort_counts_keep_duplicate_targets_and_inactive_authors(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,_=self.fixture(root,"INSERT INTO cohorts SELECT * FROM cohorts; "
                "INSERT INTO cohorts SELECT DISTINCT cell,reader_key,'b' FROM cohorts")
            with redirect_stdout(io.StringIO()):
                reference=validator.validate_duckdb_reference(directory,root/'reference.json')
                actual=self.diagnostic_validate(directory,root/'actual.json')
            self.assertNotIn('validator_execution',actual['checks'],actual)
            self.assertEqual(actual['checks'],reference['checks'])
            self.assertEqual(actual['cells'],reference['cells'])

    def test_raw_duplicates_tombstone_ties_and_microsecond_window_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            db=engine.ClickHouse(root,root)
            self.addCleanup(db.close)
            db.query('CREATE TABLE documents (doc_id String,author_key String,updated_at DateTime64(6),'
                     'deleted UInt8) ENGINE=MergeTree ORDER BY (doc_id,author_key,updated_at)')
            db.query("INSERT INTO documents VALUES ('p','a','2026-01-01',0),('p','a','2026-01-01',1),('q','a','2026-01-01',0)")
            self.assertEqual(db.scalar('SELECT count() FROM documents'),3)
            db.table('current_docs',engine.CANONICAL_DOCUMENTS_SQL,'doc_id,author_key')
            self.assertEqual(db.query('SELECT doc_id FROM current_docs'),[['q']])
            db.query('CREATE TABLE content_events (doc_id String,reader_key String,surface String,seen_at DateTime64(6)) '
                     'ENGINE=MergeTree ORDER BY (doc_id,reader_key,surface,seen_at)')
            db.query("INSERT INTO content_events VALUES ('p','r','feed','2026-01-01 00:00:00'),('p','r','feed','2026-01-02 00:00:00')")
            self.assertTrue(db.scalar(engine.DELIVERY_WINDOW_SQL))
            db.query("INSERT INTO content_events VALUES ('p','r','other','2026-01-01 00:00:00.000001')")
            self.assertTrue(db.scalar(engine.DELIVERY_WINDOW_SQL))
            db.query("INSERT INTO content_events VALUES ('p','r','feed','2026-01-01 23:59:59.999999')")
            self.assertFalse(db.scalar(engine.DELIVERY_WINDOW_SQL))

    def test_completed_import_reuse_partial_refusal_and_stale_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,manifest=self.fixture(root)
            work=root/'work'
            work.mkdir()
            db=engine.ClickHouse(work,directory)
            self.addCleanup(db.close)
            db.bind_imports(manifest)
            info=manifest['files']['documents']
            with patch.object(engine,'atomic_json',side_effect=RuntimeError('interrupted before completion marker')):
                with self.assertRaisesRegex(RuntimeError,'interrupted'):
                    db.import_table('documents',info)
            self.assertFalse((work/'imports/documents.json').exists())
            db.import_table('documents',info)
            self.assertEqual(db.scalar("SELECT count() FROM system.tables WHERE database='validation' AND name LIKE 'interrupted_documents_%'"),1)
            before=json.loads((work/'imports/documents.json').read_text())
            db.close()
            db=engine.ClickHouse(work,directory)
            self.addCleanup(db.close)
            db.bind_imports(manifest)
            with patch.object(db,'table',side_effect=AssertionError('completed import must not rerun')):
                db.import_table('documents',info)
            self.assertEqual(json.loads((work/'imports/documents.json').read_text()),before)
            with self.assertRaisesRegex(ValueError,'stale input/source/engine'):
                db.bind_imports({**manifest,'dataset_id':'changed'})
            db.query('INSERT INTO documents SELECT * FROM documents LIMIT 1')
            with self.assertRaisesRegex(ValueError,'no longer matches'):
                db.import_table('documents',info)
            db.close()

    def test_performance_profile_reuses_reviewed_import_without_rewriting_lineage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,manifest=self.fixture(root)
            work=root/'realism-clickhouse-compatibility'
            work.mkdir()
            db=engine.ClickHouse(work,directory)
            self.addCleanup(db.close)
            db.bind_imports(manifest)
            db.import_table('documents',manifest['files']['documents'])
            old={**db.context,'source':engine.PREVIOUS_IMPORT_SOURCE,'entrypoint':engine.PREVIOUS_ENTRYPOINT}
            engine.atomic_json(work/'import-context.json',old)
            marker=(work/'imports/documents.json').read_bytes()
            db.close()
            with patch.dict(os.environ,{'REALISM_CLICKHOUSE_PROFILE':'performance',
                    'REALISM_CLICKHOUSE_REUSE_WORK':str(work)}):
                db=engine.ClickHouse(work,directory)
                self.addCleanup(db.close)
                self.assertEqual(db.scalar('SELECT getSetting(\'max_memory_usage\')'),22*1024**3)
                db.bind_imports(manifest)
                with patch.object(db,'table',side_effect=AssertionError('do not reimport')):
                    db.import_table('documents',manifest['files']['documents'])
                self.assertEqual(db.context,old)
                self.assertEqual((work/'imports/documents.json').read_bytes(),marker)
                self.assertEqual(json.loads((work/'import-context.json').read_text()),old)
                db.query('INSERT INTO documents SELECT * FROM documents LIMIT 1')
                with self.assertRaisesRegex(ValueError,'no longer matches'):
                    db.import_table('documents',manifest['files']['documents'])
                db.close()


if __name__=='__main__':
    unittest.main()
