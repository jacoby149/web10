"""No-engine controls for the fixed-slice selectors and oracle fence."""
from copy import deepcopy
import unittest

import sqlglot

import hybrid_k20_slice as slice


class SliceTest(unittest.TestCase):
    def test_admitted_scopes_not_oracle_winners_seed_the_slice(self):
        profile = dict(dataset_id=slice.DATASET, reader='reader', groups=['requested'],
            reference_page=[{'doc_id': 'must-not-be-used'}],
            actual_readable_by_kind={'main': {'posts': ['post']}, 'reactions': {'reactions': ['react']},
                'comments': {'comments': ['comment']}})
        groups, readers = slice.scope({'ordinary': profile, 'fixture': {**profile, 'reader': 'paired'}})
        self.assertEqual(groups, ['comment', 'post', 'react', 'requested'])
        self.assertEqual(readers, ['paired', 'reader'])
        sql = slice.seed_sql(groups, readers)
        sqlglot.parse_one(sql, read='clickhouse')
        self.assertNotIn('must-not-be-used', sql)
        self.assertNotIn(' FINAL', sql)
        self.assertNotIn('deleted', sql)

    def test_all_history_and_physical_buckets(self):
        closure = slice.expand_sql()
        sqlglot.parse_one(closure, read='clickhouse')
        for key in ('post_id', 'parent_id', 'target_id', 'repost_of', 'ad_id', 'ref_value'):
            self.assertIn(key, closure)
        self.assertNotIn(' FINAL', closure)
        self.assertNotIn('deleted', closure)
        for table in slice.TABLES:
            statements = [slice.copy_sql(table, ['doc_id', 'deleted'], i) for i in range(slice.BUCKETS)]
            self.assertEqual(len(set(statements)), slice.BUCKETS)
            for sql in statements:
                sqlglot.parse_one(sql, read='clickhouse')
                self.assertIn('`deleted`', sql)
                self.assertNotIn(' FINAL', sql)
        with self.assertRaises(ValueError):
            slice.copy_sql('users', ['doc_id'], 0)

    def test_exact_oracle_does_not_accept_reordered_rows_or_changed_types(self):
        expected = dict(rows=[{'value': 1}, {'value': 2}], lower_rows=[], ids=['a','b'],
            views_readable_groups=['g'], followups=[[{'count': 1}, {'count': 2}], []], eligible_ads=[])
        actual = deepcopy(expected)
        actual['followups'][0].reverse()
        slice.oracle_matches(expected, actual)
        actual['rows'].reverse()
        with self.assertRaisesRegex(ValueError, 'differs: rows'):
            slice.oracle_matches(expected, actual)
        actual = deepcopy(expected)
        actual['rows'][0]['value'] = True
        with self.assertRaisesRegex(ValueError, 'differs: rows'):
            slice.oracle_matches(expected, actual)


if __name__ == '__main__':
    unittest.main()
