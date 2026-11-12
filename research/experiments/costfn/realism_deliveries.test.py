"""Exact delivery multiset, duplicate/timestamp retention and bounded exports."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest

import duckdb
import realism_dataset as generator


class DeliveryTests(unittest.TestCase):
    def test_chunks_preserve_all_fields_duplicates_and_zero_posts(self):
        with tempfile.TemporaryDirectory() as tmp, duckdb.connect() as db:
            db.execute("SET threads=1; SET memory_limit='2GB'; SET preserve_insertion_order=true")
            db.execute("CREATE TABLE people AS SELECT i AS id, 'viewer-' || i::VARCHAR AS username FROM range(10) r(i)")
            db.execute("CREATE TABLE post_facts(ordinal BIGINT, doc_id VARCHAR, author_id BIGINT, impressions BIGINT, reach BIGINT, age_ms BIGINT, created_at TIMESTAMP)")
            db.execute("INSERT INTO post_facts VALUES (0,'viral',9,101,9,864000000,TIMESTAMP '2026-01-01'), (1,'zero',1,0,0,1000,TIMESTAMP '2026-01-02'), (2,'other',3,17,4,864000000,TIMESTAMP '2026-01-03')")
            # Independently pinned pre-repair expression, not the new builder.
            db.execute("CREATE TABLE expected AS SELECT p.doc_id, 'posts' AS service, u.username AS reader_key, 'feed' AS surface, 'delivery' AS event_type, '{}' AS payload, p.created_at + to_milliseconds(((j+1)::DOUBLE/(p.impressions+1)*p.age_ms)::BIGINT) AS seen_at FROM post_facts p, LATERAL range(p.impressions) x(j) JOIN people u ON u.id=(p.author_id+1+(j%p.reach))%10")
            for budget in (1,30,1000):
                work=Path(tmp)/str(budget)
                work.mkdir()
                output=work/'events.parquet'
                with redirect_stdout(io.StringIO()) as log:
                    generator._export_deliveries(db,10,output,work,budget)
                db.read_parquet(str(output)).create_view('actual',replace=True)
                for left,right in (('expected','actual'),('actual','expected')):
                    self.assertEqual(db.execute(f'SELECT count(*) FROM (SELECT * FROM {left} EXCEPT ALL SELECT * FROM {right})').fetchone()[0],0)
                self.assertEqual(db.execute('SELECT count(*) FROM actual').fetchone()[0],118)
                records=[json.loads(line.split(' ',1)[1]) for line in log.getvalue().splitlines()]
                chunks=[r for r in records if r['stage']=='delivery-batch' and r['event']=='complete']
                self.assertTrue(chunks)
                self.assertLessEqual(max(r['rows'] for r in chunks),budget+101)
                self.assertEqual(chunks[-1]['completed_rows'],118)

    def test_empty_and_invalid_budget(self):
        with tempfile.TemporaryDirectory() as tmp, duckdb.connect() as db:
            db.execute('CREATE TABLE people(id BIGINT,username VARCHAR)')
            db.execute('CREATE TABLE post_facts(ordinal BIGINT, doc_id VARCHAR, author_id BIGINT, impressions BIGINT, reach BIGINT, age_ms BIGINT, created_at TIMESTAMP)')
            for budget in (0,-1,True):
                with self.assertRaises(ValueError):
                    generator._export_deliveries(db,10,Path(tmp)/'invalid.parquet',tmp,budget)
            with redirect_stdout(io.StringIO()):
                generator._export_deliveries(db,10,Path(tmp)/'empty.parquet',tmp)
            self.assertEqual(db.execute('SELECT count(*) FROM read_parquet(?)',[str(Path(tmp)/'empty.parquet')]).fetchone()[0],0)

    def test_failed_scratch_retained_success_scratch_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError,'synthetic failure'),redirect_stdout(io.StringIO()) as log:
                with generator._retained_work(tmp) as failed:
                    (failed/'proof').write_text('preserve')
                    raise RuntimeError('synthetic failure')
            self.assertEqual((failed/'proof').read_text(),'preserve')
            self.assertIn('not a completed-stage witness',log.getvalue())
            with generator._retained_work(tmp) as successful:
                (successful/'proof').write_text('complete')
            self.assertFalse(successful.exists())


if __name__=='__main__':
    unittest.main()
