"""Checkpoint integrity/fail-stop controls and opt-in real-engine derived reuse."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import realism_checkpoints as checkpoint
import realism_clickhouse as engine


class FakeDB:
    profile='bounded'
    settings=engine.SETTINGS

    def __init__(self,work):
        self.work=work


class CheckpointTests(unittest.TestCase):
    def test_completed_skip_interruption_whole_replay_and_report_reuse(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=FakeDB(Path(tmp))
            manifest={'dataset_id':'fixture','files':{}}
            cp=checkpoint.Checkpoints(db,manifest)
            cp.evaluate('one',lambda:True)
            with self.assertRaises(TimeoutError):
                cp.evaluate('two',lambda:(_ for _ in ()).throw(TimeoutError()))
            self.assertFalse((cp.root/'verdicts/two.json').exists())
            again=checkpoint.Checkpoints(db,manifest,resume=True)
            again.evaluate('one',lambda:self.fail('completed check repeated'))
            again.evaluate('two',lambda:True)
            self.assertEqual(again.checks,{'one':True,'two':True})
            db.query=lambda sql:[[42]]
            self.assertEqual(again.read('SELECT 42'),[[42]])
            db.query=lambda sql:self.fail('report repeated')
            self.assertEqual(again.read('SELECT 42'),[[42]])
            proof=json.loads((cp.root/'verdicts/one.json').read_text())['record']
            self.assertGreaterEqual(proof['elapsed_seconds'],0)

    def test_tampered_verdict_and_changed_context_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=FakeDB(Path(tmp))
            manifest={'dataset_id':'fixture','files':{}}
            cp=checkpoint.Checkpoints(db,manifest)
            cp.evaluate('one',lambda:True)
            path=cp.root/'verdicts/one.json'
            original=path.read_bytes()
            value=json.loads(original)
            value['record']['verdict']=False
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError,'tampered'):
                checkpoint.Checkpoints(db,manifest,resume=True)
            path.write_bytes(original)
            with self.assertRaisesRegex(ValueError,'context'):
                checkpoint.Checkpoints(db,{**manifest,'dataset_id':'wrong'},resume=True)
            with patch.object(checkpoint,'sha',return_value='changed-source'):
                with self.assertRaisesRegex(ValueError,'context'):
                    checkpoint.Checkpoints(db,manifest,resume=True)
            db.profile='performance'
            with self.assertRaisesRegex(ValueError,'context'):
                checkpoint.Checkpoints(db,manifest,resume=True)

    def test_memory_denied_hash_stays_denied_on_resume_and_tamper_refuses(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=FakeDB(Path(tmp))
            manifest={'dataset_id':'fixture','files':{}}
            cp=checkpoint.Checkpoints(db,manifest)
            def oom():
                raise RuntimeError('ClickHouse exit 241: DB::Exception: Memory limit (total) exceeded')
            with self.assertRaisesRegex(RuntimeError,'Memory limit'):
                cp.evaluate('big',oom,{'settings':{'join_algorithm':'hash'}})
            self.assertNotIn('big',cp.checks)
            cp.evaluate('plain',lambda:True)
            self.assertIn('big',cp.denied)
            self.assertNotIn('plain',cp.denied)
            again=checkpoint.Checkpoints(db,manifest,resume=True)
            self.assertIn('big',again.denied)
            record=cp.root/'admissions.json'
            value=json.loads(record.read_text())
            value['denied']=[]
            record.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError,'tampered admission'):
                checkpoint.Checkpoints(db,manifest,resume=True)

    def test_fail_is_synced_and_never_skippable(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=FakeDB(Path(tmp))
            manifest={'dataset_id':'fixture','files':{}}
            cp=checkpoint.Checkpoints(db,manifest)
            with self.assertRaises(checkpoint.CheckFailed):
                cp.evaluate('bad',lambda:False)
            self.assertFalse(json.loads((cp.root/'verdicts/bad.json').read_text())['record']['verdict'])
            with self.assertRaises(checkpoint.CheckFailed):
                checkpoint.Checkpoints(db,manifest,resume=True)
            with self.assertRaisesRegex(ValueError,'explicit resume'):
                checkpoint.Checkpoints(db,manifest)


@unittest.skipUnless(os.environ.get('REALISM_CLICKHOUSE_TESTS')=='1','opt in to actual engine')
class DerivedTests(unittest.TestCase):
    def test_derived_reuse_and_stale_marker_rebuild_refuses_dependent_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            db=engine.ClickHouse(root,root)
            self.addCleanup(db.close)
            manifest={'dataset_id':'fixture','files':{}}
            db.bind_imports(manifest)
            cp=checkpoint.Checkpoints(db,manifest)
            cp.derived('tiny','SELECT number AS n FROM numbers(3)','n')
            cp.evaluate('three',lambda:db.scalar('SELECT count()=3 FROM tiny'))
            marker=(cp.root/'derived/tiny.json').read_bytes()
            again=checkpoint.Checkpoints(db,manifest,resume=True)
            with patch.object(db,'table',side_effect=AssertionError('valid derived table rebuilt')):
                again.derived('tiny','SELECT number AS n FROM numbers(3)','n')
            again.evaluate('three',lambda:self.fail('completed verdict rerun'))
            self.assertEqual((cp.root/'derived/tiny.json').read_bytes(),marker)
            db.query('INSERT INTO tiny VALUES (9)')
            stale=checkpoint.Checkpoints(db,manifest,resume=True)
            stale.derived('tiny','SELECT number AS n FROM numbers(3)','n')
            self.assertEqual(db.scalar('SELECT count() FROM tiny'),3)
            with self.assertRaisesRegex(ValueError,'table binding'):
                stale.evaluate('three',lambda:self.fail('stale verdict must not run or skip'))
            db.close()

    def test_false_verdict_stops_default_validator(self):
        import importlib.util
        import realism_validate as validator
        spec=importlib.util.spec_from_file_location('engine_fixture',Path(__file__).with_name('realism_clickhouse.test.py'))
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        fixture=module.EngineTests()
        self.addCleanup(fixture.doCleanups)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            directory,_=fixture.fixture(root)
            result=validator.validate(directory,root/'failed.json',keep_work=True)
            self.assertFalse(result['complete'])
            self.assertEqual(result['checks'],{'registered_population':False})
            work=next(root.glob('realism-clickhouse-*'))
            self.assertTrue((work/'checkpoints/verdicts/registered_population.json').exists())
            self.assertFalse((work/'checkpoints/verdicts/latent_population.json').exists())


if __name__=='__main__':
    unittest.main()
