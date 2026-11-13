"""Complete graph windows can be scheduled independently without changing rows."""
from contextlib import redirect_stdout
import io
import unittest

import duckdb
import realism_dataset as generator


def legacy_query(n):
    """Frozen pre-batching SQL, independent of the new query builder."""
    active=n*15//100
    return (f"WITH budgets AS (SELECT *, least({active - 1}, "
            f"greatest(1, floor(k*.8)::BIGINT)) AS a FROM target_requests), "
            f"candidates AS (SELECT b.*, CASE WHEN j<a+1 THEN "
            f"(floor({active} * pow((hash(salt)::DOUBLE % 1000003)/1000003, 4.6))::BIGINT+j)%{active} "
            f"ELSE {active}+(hash(salt+1)%{n-active}+j-a-1)%{n-active} END AS target_id, "
            f"CASE WHEN j<a+1 THEN 0 ELSE 1 END AS band, j "
            f"FROM budgets b, LATERAL range(k+2) r(j)), "
            f"numbered AS (SELECT *, row_number() OVER (PARTITION BY cell,reader_id,band ORDER BY j) rn "
            f"FROM candidates WHERE target_id != reader_id) "
            f"SELECT reader_id,target_id,cell FROM numbered WHERE (band=0 AND rn<=a) OR (band=1 AND rn<=k-a)")


class GraphTests(unittest.TestCase):
    def setUp(self):
        self.db=duckdb.connect()
        self.addCleanup(self.db.close)
        self.db.execute("SET memory_limit='2GB'; SET threads=1; SET preserve_insertion_order=true")
        self.db.execute('CREATE TABLE target_requests(reader_id BIGINT,k BIGINT,cell VARCHAR,salt BIGINT)')

    def test_exact_multiset_for_all_cells_head_degrees_and_self_exclusion(self):
        rows=[]
        for reader in (0,1,1499,1500,4999,9999):
            for k in (10,20,100,1000):
                for locality in ('hot','dispersed'):
                    rows.append((reader,k,f'{k}-{locality}',42 if locality=='hot' else reader+42))
            rows.append((reader,999,'population',reader+42))
        self.db.executemany('INSERT INTO target_requests VALUES (?,?,?,?)',rows)
        self.db.execute('CREATE TABLE reference AS '+legacy_query(10000))
        for budget in (127,2048,250000):
            with self.subTest(budget=budget),redirect_stdout(io.StringIO()) as log:
                generator._build_edges(self.db,10000,budget)
                for left,right in (('reference','edges'),('edges','reference')):
                    self.assertEqual(self.db.execute(f'SELECT count(*) FROM (SELECT * FROM {left} EXCEPT ALL SELECT * FROM {right})').fetchone()[0],0)
                self.assertEqual(self.db.execute('SELECT count(*) FROM edges WHERE reader_id=target_id').fetchone()[0],0)
                candidates=[int(line.split('candidates=')[1]) for line in log.getvalue().splitlines() if 'candidates=' in line]
                self.assertTrue(candidates)
                self.assertLessEqual(max(candidates),budget+1002)
                self.db.execute('DROP TABLE edges')

    def test_duplicate_window_keys_are_refused_instead_of_split(self):
        self.db.execute("INSERT INTO target_requests VALUES (1,10,'same',42),(1,20,'same',42)")
        with self.assertRaisesRegex(ValueError,'unique complete window keys'):
            generator._build_edges(self.db,10000)

    def test_empty_requests_and_invalid_batch_budget(self):
        with redirect_stdout(io.StringIO()):
            generator._build_edges(self.db,10000)
        self.assertEqual(self.db.execute('SELECT count(*) FROM edges').fetchone()[0],0)
        for budget in (0,-1,True):
            with self.assertRaises(ValueError):
                generator._build_edges(self.db,10000,budget)


if __name__=='__main__':
    unittest.main()
