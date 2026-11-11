"""Exact rows include multiplicity and every payload field; no cloud access."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import duckdb
import realism_parity as parity


class ParityTests(unittest.TestCase):
    def compare(self,other):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            db=duckdb.connect()
            db.execute("CREATE TABLE events(doc_id VARCHAR,reader_key VARCHAR,payload VARCHAR)")
            db.execute("INSERT INTO events VALUES ('p','a','one'),('p','a','one'),('q','b','two')")
            db.execute(f"COPY events TO '{root}/a.parquet' (FORMAT PARQUET)")
            db.execute(other)
            db.execute(f"COPY (SELECT * FROM events ORDER BY reader_key DESC) TO '{root}/b.parquet' (FORMAT PARQUET)")
            db.close()
            return parity.compare_events(root/'a.parquet',root/'b.parquet',root)

    def test_physical_order_does_not_change_exact_row_multiset(self):
        self.assertTrue(self.compare('SELECT 1')['equal'])

    def test_duplicate_multiplicity_is_not_deduplicated_away(self):
        self.assertFalse(self.compare("DELETE FROM events; INSERT INTO events VALUES ('p','a','one'),('q','b','two'),('q','b','two')")['equal'])

    def test_payload_change_is_not_ignored(self):
        self.assertFalse(self.compare("UPDATE events SET payload='changed' WHERE doc_id='q'")['equal'])

    def test_grouped_counts_match_except_all_with_nulls_and_duplicates(self):
        db=duckdb.connect()
        self.addCleanup(db.close)
        x="SELECT * FROM (VALUES ('p','a',NULL),('p','a',NULL),('q','b','x')) t(doc_id,reader_key,payload)"
        y="SELECT * FROM (VALUES ('p','a',NULL),('q','b','x'),('q','b','changed')) t(doc_id,reader_key,payload)"
        expected=tuple(db.execute(f'SELECT count(*) FROM (({a}) EXCEPT ALL ({b}))').fetchone()[0] for a,b in ((x,y),(y,x)))
        self.assertEqual(parity._difference(db,x,y,['doc_id','reader_key','payload']),expected)
        self.assertEqual(expected,(1,1))

    def test_interrupted_buckets_resume_and_changed_inputs_are_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            db=duckdb.connect()
            db.execute("CREATE TABLE events AS SELECT 'p'||i AS doc_id,'a'||i AS reader_key,i AS payload FROM range(100) t(i)")
            for name in ('a','b'):
                db.execute(f"COPY events TO '{root}/{name}.parquet' (FORMAT PARQUET)")
            db.close()
            checkpoint=root/'progress.json'
            original=parity._difference
            calls=0
            def interrupted(*args):
                nonlocal calls
                calls+=1
                if calls==2:
                    raise RuntimeError('simulated interruption')
                return original(*args)
            with patch.object(parity,'_difference',side_effect=interrupted):
                with self.assertRaisesRegex(RuntimeError,'interruption'):
                    parity.compare_events(root/'a.parquet',root/'b.parquet',root,checkpoint)
            with patch.object(parity,'_difference',wraps=original) as counter:
                result=parity.compare_events(root/'a.parquet',root/'b.parquet',root,checkpoint)
            self.assertTrue(result['complete'] and result['equal'])
            self.assertEqual(counter.call_count,len(result['buckets'])-1)
            with patch.object(parity,'_difference',side_effect=AssertionError('must skip all')):
                self.assertTrue(parity.compare_events(root/'a.parquet',root/'b.parquet',root,checkpoint)['equal'])
            db=duckdb.connect()
            db.execute(f"COPY (SELECT 'changed' AS doc_id,'a' AS reader_key,0::BIGINT AS payload) TO '{root}/b.parquet' (FORMAT PARQUET)")
            db.close()
            with self.assertRaisesRegex(ValueError,'binding differs'):
                parity.compare_events(root/'a.parquet',root/'b.parquet',root,checkpoint)


if __name__=='__main__':
    unittest.main()
