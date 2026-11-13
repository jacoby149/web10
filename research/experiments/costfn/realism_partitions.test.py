"""One physical write pass with exact key/row admission and bounded writers."""
from contextlib import redirect_stdout
import io
from pathlib import Path
import tempfile
import unittest

import duckdb
import realism_validate as validator


class PartitionTests(unittest.TestCase):
    def test_one_pass_preserves_multiset_schema_and_complete_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as tmp,duckdb.connect() as db:
            db.execute("CREATE TABLE content_events AS SELECT 'doc-'||i::VARCHAR doc_id, 'reader-'||(i%17)::VARCHAR reader_key, 'feed' surface, TIMESTAMP '2026-01-01'+j*INTERVAL '24 hours' seen_at, NULL::VARCHAR payload FROM range(10000) a(i) CROSS JOIN range(3) b(j)")
            db.execute('CREATE TABLE actual AS SELECT *,0 part FROM content_events WHERE false')
            with redirect_stdout(io.StringIO()) as log,validator.partitions(db,'content_events',('doc_id','reader_key'),tmp,max_rows=256) as parts:
                self.assertGreater(len(parts),64)
                self.assertEqual(len(list(Path(tmp).rglob('*.parquet'))),len(parts))
                for index,relation in enumerate(parts):
                    self.assertLessEqual(db.execute(f'SELECT count(*) FROM {relation}').fetchone()[0],256)
                    db.execute(f'INSERT INTO actual SELECT * EXCLUDE(bucket),{index} FROM {relation}')
                self.assertEqual(db.execute('SELECT count(*) FROM (SELECT doc_id,reader_key FROM actual GROUP BY ALL HAVING count(DISTINCT part)!=1)').fetchone()[0],0)
                for left,right in (('content_events','(SELECT * EXCLUDE(part) FROM actual)'),('(SELECT * EXCLUDE(part) FROM actual)','content_events')):
                    self.assertEqual(db.execute(f'SELECT count(*) FROM (SELECT * FROM {left} EXCEPT ALL SELECT * FROM {right})').fetchone()[0],0)
                self.assertNotIn('refine',log.getvalue())
                self.assertEqual(log.getvalue().count('partition pass start'),1)
                self.assertIn('open_files=16 flush_rows=8192',log.getvalue())
                self.assertIn('rows=30000',log.getvalue())
            self.assertEqual(list(Path(tmp).iterdir()),[])

    def test_indivisible_hot_key_refused_instead_of_splitting_or_relaxing(self):
        with tempfile.TemporaryDirectory() as tmp,duckdb.connect() as db:
            db.execute("CREATE TABLE content_events AS SELECT 'same' doc_id,'reader' reader_key FROM range(100)")
            with self.assertRaisesRegex(ValueError,'complete-key partition exceeds'),redirect_stdout(io.StringIO()):
                with validator.partitions(db,'content_events',('doc_id','reader_key'),tmp,max_rows=32):
                    self.fail('oversized complete key must not be yielded')
            for limit in (0,-1,True):
                with self.assertRaises(ValueError):
                    with validator.partitions(db,'content_events',('doc_id','reader_key'),tmp,max_rows=limit):
                        self.fail('invalid limit')

    def test_planner_scales_from_physical_rows_and_refuses_unbounded_inputs(self):
        self.assertEqual(validator.partition_count(16000000),64)
        self.assertEqual(validator.partition_count(160000000),128)
        self.assertEqual(validator.partition_count(1600000000),1024)
        for rows,limit in ((-1,10),(True,10),(1,0),(1,True),(1000000000000,10)):
            with self.assertRaises(ValueError):
                validator.partition_count(rows,limit)

    def test_writer_settings_restored(self):
        with tempfile.TemporaryDirectory() as tmp,duckdb.connect() as db:
            db.execute("CREATE TABLE content_events AS SELECT 'p' doc_id,'r' reader_key")
            db.execute('SET partitioned_write_max_open_files=7')
            db.execute('SET partitioned_write_flush_threshold=10000')
            with redirect_stdout(io.StringIO()),validator.partitions(db,'content_events',('doc_id','reader_key'),tmp):
                self.assertEqual(db.execute("SELECT current_setting('partitioned_write_max_open_files')").fetchone()[0],7)
                self.assertEqual(db.execute("SELECT current_setting('partitioned_write_flush_threshold')").fetchone()[0],10000)

    def test_copy_failure_restores_settings_and_empty_input_is_supported(self):
        with tempfile.TemporaryDirectory() as tmp,duckdb.connect() as db:
            db.execute('CREATE TABLE content_events(doc_id VARCHAR,reader_key VARCHAR)')
            with redirect_stdout(io.StringIO()),validator.partitions(db,'content_events',('doc_id','reader_key'),tmp) as parts:
                self.assertEqual(parts,[])
            class BrokenCopy:
                def execute(self,sql,*args):
                    if sql.startswith('COPY'):
                        raise RuntimeError('injected copy failure')
                    return db.execute(sql,*args)
            with self.assertRaisesRegex(RuntimeError,'injected copy'),redirect_stdout(io.StringIO()):
                with validator.partitions(BrokenCopy(),'content_events',('doc_id','reader_key'),tmp):
                    self.fail('failed write must never yield a partition witness')
            self.assertEqual(db.execute("SELECT current_setting('partitioned_write_max_open_files')").fetchone()[0],100)
            self.assertEqual(db.execute("SELECT current_setting('partitioned_write_flush_threshold')").fetchone()[0],524288)
            self.assertEqual(list(Path(tmp).iterdir()),[])


if __name__=='__main__':
    unittest.main()
