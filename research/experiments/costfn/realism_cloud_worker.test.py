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


if __name__=='__main__':
    unittest.main()
