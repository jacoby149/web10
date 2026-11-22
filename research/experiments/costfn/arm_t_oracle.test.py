"""Oracle rewrite controls; no engine execution or expected-value substitution."""
import unittest

import arm_t_oracle as oracle


class OracleTests(unittest.TestCase):
    def sql(self):
        return (oracle.PREFIX + "WHERE ref_value IN ('post-a','post-b') "
                "AND collection_name IN ('reactions','comments') AND deleted=0 "
                "AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE group_id IN ('shared','discover') AND deleted=0)"
                + oracle.SUFFIX)

    def test_only_original_link_subquery_gains_full_canonical_id_bound(self):
        old = self.sql()
        new = oracle.bounded(old)
        self.assertEqual(new.count('FROM documents FINAL'), 2)
        self.assertIn("FROM doc_groups FINAL WHERE doc_id IN (SELECT doc_id FROM documents FINAL", new)
        self.assertTrue(new.startswith(oracle.PREFIX))
        self.assertTrue(new.endswith(oracle.SUFFIX))
        self.assertIn("group_id IN ('shared','discover') AND deleted=0", new)
        self.assertNotIn('doc_groups_t', new)

    def test_unrelated_queries_remain_byte_identical(self):
        self.assertEqual(oracle.bounded('SELECT count() FROM documents'), 'SELECT count() FROM documents')

    def test_recognized_scope_or_deadline_drift_refuses(self):
        for sql in (self.sql().replace('GROUP BY ref_value', 'GROUP BY ref_value,body'),
                    self.sql().replace('max_execution_time=120', 'max_execution_time=121'),
                    self.sql().replace('AND deleted=0)', ')')):
            with self.assertRaises(ValueError):
                oracle.bounded(sql)


if __name__ == '__main__':
    unittest.main()
