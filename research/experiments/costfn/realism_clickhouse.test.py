"""Fail-closed receipt controls and opt-in actual ClickHouse/DuckDB parity."""
from contextlib import redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
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
        self.assertEqual(engine.SETTINGS['max_threads'],'1')
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
            with patch.object(validator,'verify_inputs'),patch.object(engine,'ClickHouse'),patch.object(engine,'inspect',return_value={'complete':True,'checks':{'facts':True}}),patch.object(validator,'validator_dependencies',side_effect=[before,after]),redirect_stdout(io.StringIO()):
                result=validator.validate(directory,root/'receipt.json')
            self.assertFalse(result['complete'])
            self.assertFalse(result['checks']['unchanged_validator_during_run'])


@unittest.skipUnless(os.environ.get('REALISM_CLICKHOUSE_TESTS')=='1','opt in to real ClickHouse binary/container')
class EngineTests(unittest.TestCase):
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
                    actual=validator.validate(directory,root/'actual.json',keep_work=True)
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
                actual=validator.validate(directory,root/'actual.json')
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

    def test_time_and_target_mutations_match_reference_denials(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,_=self.fixture(root,"UPDATE documents SET ref_value='missing' WHERE doc_id='comment'; "
                "UPDATE documents SET created_at=TIMESTAMP '2025-01-01' WHERE doc_id='like'")
            with redirect_stdout(io.StringIO()):
                reference=validator.validate_duckdb_reference(directory,root/'reference.json')
                actual=validator.validate(directory,root/'actual.json')
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
                actual=validator.validate(directory,root/'actual.json')
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


if __name__=='__main__':
    unittest.main()
