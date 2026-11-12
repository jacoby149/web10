"""Refine complete keys without opening unbounded writers or losing rows."""
from contextlib import redirect_stdout
import io
from pathlib import Path
import tempfile
import unittest

import duckdb
import realism_validate as validator


class PartitionTests(unittest.TestCase):
    def test_refinement_preserves_multiset_schema_and_complete_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as tmp,duckdb.connect() as db:
            db.execute("CREATE TABLE content_events AS SELECT 'doc-'||i::VARCHAR doc_id, 'reader-'||(i%17)::VARCHAR reader_key, 'feed' surface, TIMESTAMP '2026-01-01'+j*INTERVAL '24 hours' seen_at, NULL::VARCHAR payload FROM range(10000) a(i) CROSS JOIN range(3) b(j)")
            db.execute('CREATE TABLE actual AS SELECT *,0 part FROM content_events WHERE false')
            with redirect_stdout(io.StringIO()) as log,validator.partitions(db,'content_events',('doc_id','reader_key'),tmp,max_rows=256) as parts:
                self.assertGreater(len(parts),64)
                for index,relation in enumerate(parts):
                    self.assertLessEqual(db.execute(f'SELECT count(*) FROM {relation}').fetchone()[0],256)
                    db.execute(f'INSERT INTO actual SELECT * EXCLUDE(bucket),{index} FROM {relation}')
                self.assertEqual(db.execute('SELECT count(*) FROM (SELECT doc_id,reader_key FROM actual GROUP BY ALL HAVING count(DISTINCT part)!=1)').fetchone()[0],0)
                for left,right in (('content_events','(SELECT * EXCLUDE(part) FROM actual)'),('(SELECT * EXCLUDE(part) FROM actual)','content_events')):
                    self.assertEqual(db.execute(f'SELECT count(*) FROM (SELECT * FROM {left} EXCEPT ALL SELECT * FROM {right})').fetchone()[0],0)
                self.assertIn('refine complete',log.getvalue())
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


if __name__=='__main__':
    unittest.main()
