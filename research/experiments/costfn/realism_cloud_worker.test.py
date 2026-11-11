"""Worker lifecycle tests use mocked facts, no paid resources or network."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import realism_cloud_worker as worker


class WorkerTests(unittest.TestCase):
    def run_worker(self,validation,build_error=None):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)
            (repo/'.context').mkdir()
            manifest={'dataset_id':'synthetic','files':{'documents':{'rows':2,'bytes':100}}}
            with patch('realism_dataset.build',return_value=manifest,side_effect=build_error), \
                    patch('realism_validate.validate',return_value=validation):
                if build_error:
                    with self.assertRaises(ValueError):
                        worker.run(repo)
                    code=None
                else:
                    code=worker.run(repo)
            result=json.loads((repo/'.context/cloud-status.json').read_bytes())
            return code,result

    def test_success_waits_for_private_staging_never_claims_publication(self):
        code,result=self.run_worker({'complete':True,'checks':{'facts':True}})
        self.assertEqual(code,0)
        self.assertEqual(result['phase'],'validated-awaiting-private-staging')
        self.assertTrue(result['validation_complete'])
        self.assertFalse(result['minio_staged'])
        self.assertFalse(result['spaces_staged'])

    def test_failed_validation_never_becomes_staging_ready(self):
        code,result=self.run_worker({'complete':False,'checks':{'facts':False}})
        self.assertEqual(code,1)
        self.assertEqual(result['phase'],'validation-failed')
        self.assertFalse(result['validation_complete'])

    def test_generation_failure_is_persisted_and_not_relabelled(self):
        _,result=self.run_worker({},ValueError('local preparation admission'))
        self.assertEqual(result['phase'],'failed')
        self.assertEqual(result['error_type'],'ValueError')
        self.assertFalse(result['validation_complete'])

    def test_source_refresh_checks_both_floors_and_passes_their_receipts_to_1m(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)
            (repo/'.context').mkdir()
            manifest={'dataset_id':'new-source','files':{'documents':{'rows':2,'bytes':100,'sha256':'same-data'}}}
            for folder in ('realism-10k-r7','realism-100k-r1'):
                path=repo/'.context'/folder
                path.mkdir()
                (path/'manifest.json').write_text(json.dumps({'files':manifest['files']}))
            with patch('realism_dataset.build',return_value=manifest) as build, \
                    patch('realism_validate.validate',return_value={'complete':True,'checks':{'facts':True}}) as validate:
                code=worker.run(repo,refresh_floors='allocator-v2')
            self.assertEqual(code,0)
            self.assertEqual(build.call_count,3)
            self.assertEqual(validate.call_count,3)
            self.assertEqual(len(build.call_args.args[2]),2)
            result=json.loads((repo/'.context/cloud-status.json').read_bytes())
            self.assertTrue(all(v['data_bytes_unchanged'] for v in result['source_refresh_floors'].values()))

    def test_source_refresh_data_drift_refuses_1m_before_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)
            (repo/'.context/realism-10k-r7').mkdir(parents=True)
            (repo/'.context/realism-10k-r7/manifest.json').write_text(json.dumps({'files':{'documents':{'sha256':'old'}}}))
            with patch('realism_dataset.build',return_value={'files':{'documents':{'sha256':'different'}}}) as build, \
                    patch('realism_validate.validate') as validate:
                with self.assertRaisesRegex(ValueError,'data bytes differ'):
                    worker.run(repo,refresh_floors='allocator-v2')
            self.assertEqual(build.call_count,1)
            validate.assert_not_called()

    def test_reference_prefix_cannot_escape_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError,'path-safe'):
                worker.run(Path(tmp),refresh_floors='new',reference_floor_prefix='../outside')


if __name__=='__main__':
    unittest.main()
