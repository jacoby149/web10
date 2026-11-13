"""Completed-stage witnesses are rehashed; partial/stale/failed work is not success."""
import json
from pathlib import Path
import tempfile
import unittest

from realism_contract import FORMAT,contract,identity,sha
import realism_resume as resume
from realism_validate import validator_dependencies
from realism_clickhouse import VERSION


class ResumeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.directory=self.root/'dataset'
        self.directory.mkdir()
        self.floors=[self.root/'floor.json']
        self.floors[0].write_text('preserved floor witness')
        self.spec=contract(1000000)
        self.manifest={'format':FORMAT,'contract':self.spec,'recipe':self.spec['recipe'],
                       'generator_sha256':sha(resume.HERE/'realism_dataset.py'),
                       'contract_sha256':sha(resume.HERE/'realism_contract.py'),
                       'floor_receipts':[sha(p) for p in self.floors],'files':{}}
        for table in resume.TABLES:
            path=self.directory/(table+'.parquet')
            path.write_bytes(('synthetic file '+table).encode())
            self.manifest['files'][table]={'name':path.name,'bytes':path.stat().st_size,'sha256':sha(path),'rows':1}
        self.write_manifest()

    def write_manifest(self):
        self.manifest['dataset_id']=identity(self.manifest)
        (self.directory/'manifest.json').write_text(json.dumps(self.manifest))

    def generation(self):
        return resume.generation(self.directory,self.spec,self.floors)

    def proof(self,**changes):
        proof={'format':FORMAT,'complete':True,'dataset_id':self.manifest['dataset_id'],
               'accounts':1000000,'dataset_directory':'dataset',
               'validator_sha256':sha(resume.HERE/'realism_validate.py'),
               'validator_dependencies':validator_dependencies(),
               'validator_engine':{'name':'ClickHouse','version':VERSION},'checks':{'facts':True}}
        proof.update(changes)
        path=self.root/'validation.json'
        path.write_text(json.dumps(proof))
        return path

    def test_completed_generation_and_validation_reuse_without_rewrite(self):
        self.assertEqual(self.generation(),self.manifest)
        path=self.proof()
        before=path.read_bytes()
        self.assertTrue(resume.validation(path,self.directory,self.manifest)['complete'])
        self.assertEqual(path.read_bytes(),before)

    def test_missing_stage_is_eligible_but_partial_generation_is_not(self):
        self.assertIsNone(resume.generation(self.root/'missing',self.spec,self.floors))
        self.assertIsNone(resume.validation(self.root/'missing.json',self.directory,self.manifest))
        (self.directory/'manifest.json').unlink()
        with self.assertRaisesRegex(ValueError,'partial generation'):
            self.generation()

    def test_same_size_changed_table_is_denied(self):
        p=self.directory/'users.parquet'
        p.write_bytes(b'X'*p.stat().st_size)
        with self.assertRaisesRegex(ValueError,'bytes changed'):
            self.generation()

    def test_source_contract_and_floor_drift_are_denied(self):
        for field in ('generator_sha256','contract_sha256','floor_receipts'):
            old=self.manifest[field]
            self.manifest[field]='changed'
            self.write_manifest()
            with self.assertRaisesRegex(ValueError,'stale'):
                self.generation()
            self.manifest[field]=old
        self.write_manifest()
        self.floors[0].write_text('changed floor witness')
        with self.assertRaisesRegex(ValueError,'stale'):
            self.generation()

    def test_manifest_identity_and_unexpected_file_are_denied(self):
        self.manifest['dataset_id']='wrong'
        (self.directory/'manifest.json').write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError,'stale'):
            self.generation()
        self.write_manifest()
        (self.directory/'partial.tmp').write_text('incomplete')
        with self.assertRaisesRegex(ValueError,'unexpected'):
            self.generation()

    def test_unchanged_failed_validation_is_preserved_not_blindly_retried(self):
        path=self.proof(complete=False,checks={'facts':False})
        before=path.read_bytes()
        with self.assertRaisesRegex(ValueError,'previously failed'):
            resume.validation(path,self.directory,self.manifest)
        self.assertEqual(before,path.read_bytes())

    def test_stale_validator_receipt_is_archived_before_revalidation(self):
        path=self.proof(validator_sha256='old-validator')
        before=path.read_bytes()
        self.assertIsNone(resume.validation(path,self.directory,self.manifest))
        archives=list(self.root.glob('validation.json.stale-*'))
        self.assertEqual(len(archives),1)
        self.assertEqual(archives[0].read_bytes(),before)
        self.assertFalse(path.exists())

    def test_wrong_format_directory_or_missing_checks_never_reuses_success(self):
        for changes in ({'format':'wrong'},{'dataset_directory':'elsewhere'}, {'accounts':1}, {'checks':{}}):
            path=self.proof(**changes)
            with self.assertRaises(ValueError):
                resume.validation(path,self.directory,self.manifest)

    def test_waived_preparation_requires_explicit_skip_again_on_resume(self):
        self.floors=[]
        self.manifest['floor_receipts']=[]
        self.manifest['floor_admission']={'mode':'operator-skipped','final_validation_required':True}
        self.write_manifest()
        with self.assertRaisesRegex(ValueError,'admission mode'):
            self.generation()
        self.assertEqual(resume.generation(self.directory,self.spec,[],skip_floor_gates=True),self.manifest)


if __name__=='__main__':
    unittest.main()
