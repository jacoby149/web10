"""Mounted preparation disk and log/path checks; no cloud or mount operations."""
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

import realism_cloud_lease as lease
import realism_cloud_worker as worker
from realism_volume import preparation_directory

FS_UUID='11111111-2222-4333-8444-555555555555'
VOLUME_ID='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'


class VolumeTests(unittest.TestCase):
    def test_exact_mount_is_required_before_any_directory_is_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            mount=Path(tmp).resolve()
            good={'target':str(mount),'uuid':FS_UUID,'fstype':'ext4'}
            for row,code in ((good,1),({**good,'target':'/'},0),({**good,'uuid':VOLUME_ID},0),
                             ({**good,'fstype':'tmpfs'},0)):
                with self.subTest(row=row,code=code),patch('realism_volume.subprocess.run',
                        return_value=SimpleNamespace(returncode=code,stdout=json.dumps({'filesystems':[row]}))):
                    with self.assertRaises(ValueError):
                        preparation_directory(mount,FS_UUID)
                    self.assertFalse((mount/'costfn-prep').exists())
            with patch('realism_volume.subprocess.run',return_value=SimpleNamespace(
                    returncode=0,stdout=json.dumps({'filesystems':[good]}))) as run:
                root=preparation_directory(mount,FS_UUID)
                self.assertEqual(root,mount/'costfn-prep')
                self.assertIn('--mountpoint',run.call_args.args[0])
                self.assertNotIn('--target',run.call_args.args[0])
                self.assertEqual(preparation_directory(mount,FS_UUID),root)

    def test_worker_outputs_state_and_appended_logs_are_on_the_volume(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)/'repo'
            (repo/'.context').mkdir(parents=True)
            root=Path(tmp)/'volume/costfn-prep'
            root.mkdir(parents=True)
            manifest={'dataset_id':'test','files':{}}
            proof={'complete':False,'checks':{'semantic':False}}
            with patch('realism_volume.preparation_directory',return_value=root), \
                    patch('realism_dataset.build',return_value=manifest) as build, \
                    patch('realism_validate.validate',return_value=proof) as validate:
                for _ in range(2):
                    self.assertEqual(worker.run(repo,skip_floor_gates=True,work_volume=root.parent,filesystem_uuid=FS_UUID),1)
            self.assertEqual(build.call_args.args[0],root/'realism-1m-prep')
            self.assertEqual(validate.call_args.kwargs,{'keep_work':True,'resume':False})
            self.assertEqual(validate.call_args.args[1],root/'cloud-validation.json')
            self.assertTrue((root/'cloud-status.json').exists())
            self.assertFalse((repo/'.context/cloud-status.json').exists())
            self.assertEqual((root/'run.log').read_text().count('attempt start'),2)
            self.assertEqual(json.loads((root/'cloud-status.json').read_text())['phase'],'validation-failed')
            self.assertTrue(json.loads((root/'cloud-status.json').read_text())['persistent_work'])

    def test_incomplete_volume_arguments_refuse(self):
        for args in ({'work_volume':'/mnt/work'},{'filesystem_uuid':FS_UUID}):
            with self.assertRaises(ValueError):
                worker.run('/unused',**args)

    def test_failed_attempt_keeps_its_traceback_and_state_on_the_volume(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch('realism_volume.preparation_directory',return_value=root), \
                    patch('realism_dataset.build',side_effect=ValueError('synthetic generation failure')):
                with self.assertRaisesRegex(ValueError,'synthetic generation failure'):
                    worker.run(root,skip_floor_gates=True,work_volume=root,filesystem_uuid=FS_UUID)
            log=(root/'run.log').read_text()
            self.assertIn('Traceback',log)
            self.assertIn('synthetic generation failure',log)
            self.assertEqual(json.loads((root/'cloud-status.json').read_text())['phase'],'failed')

    def test_symlink_log_is_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            target=root/'untouched'
            target.write_text('keep')
            (root/'run.log').symlink_to(target)
            with patch('realism_volume.preparation_directory',return_value=root),self.assertRaises(ValueError):
                worker.run(root,work_volume=root,filesystem_uuid=FS_UUID)
            self.assertEqual(target.read_text(),'keep')

    def test_creation_requires_an_actual_pinned_volume_and_cleanup_preserves_it(self):
        row={'run_id':'a123456789ab','name':'web10-realism-prep-a123456789ab',
             'tag':'web10-realism-prep-a123456789ab','size':'s-8vcpu-32gb-amd',
             'created_epoch':100,'deadline':14500,'max_usd':5,'account_uuid':'account',
             'prep_volume_id':VOLUME_ID,'prep_volume_name':'web10-costfn-prep',
             'prep_volume_size_gib':200,'region':'nyc3'}
        volume={'id':VOLUME_ID,'name':row['prep_volume_name'],'region':{'slug':'nyc3'},
                'size_gigabytes':200,'droplet_ids':[]}
        for change in ({'name':'other'},{'region':{'slug':'sfo3'}},{'size_gigabytes':100},{'droplet_ids':[999]}):
            with patch.object(lease,'assert_account'),patch.object(lease,'api',return_value=[{**volume,**change}]), \
                    self.assertRaises(ValueError):
                lease.admits_creation(row,now=200)
        with patch.object(lease,'assert_account'),patch.object(lease,'api',return_value=[volume]):
            lease.admits_creation(row,now=200)
        missing={k:v for k,v in row.items() if k!='prep_volume_id'}
        with self.assertRaises(ValueError):
            lease.admits_creation(missing,now=200)
        with patch.object(lease,'api',side_effect=lambda *args:[{'uuid':'account'}] if args==('account','get') else []) as api:
            lease.cleanup({**row,'creation_complete':True})
        self.assertFalse(any('volume' in call.args for call in api.call_args_list))


if __name__=='__main__':
    unittest.main()
