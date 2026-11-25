"""Offline controls for the exact attachment history substitution."""
import unittest
from unittest.mock import Mock
from pathlib import Path
from tempfile import TemporaryDirectory

import sqlglot
from sqlglot import exp

import hybrid_k20_attachment as links


class AttachmentTests(unittest.TestCase):
    def test_only_marked_canonical_history_tables_change(self):
        sql = ("/* ENGAGEMENT_DOC_COUNTS TALLY */ /* projected_resolution_keys */ "
            "SELECT doc_id FROM (SELECT doc_id,group_id,deleted,"
            "row_number() OVER (PARTITION BY doc_id,group_id ORDER BY updated_at DESC,deleted DESC) AS rn "
            "FROM doc_groups WHERE doc_id IN ('page')) WHERE rn=1 AND deleted=0 ORDER BY doc_id LIMIT 21")
        got = sqlglot.parse_one(links.rewrite(sql), read='clickhouse')
        old = sqlglot.parse_one(sql, read='clickhouse')
        original, replacement = next(old.find_all(exp.Table)), next(got.find_all(exp.Table))
        self.assertEqual(original.name, links.SOURCE)
        self.assertEqual(replacement.name, links.TABLE)
        replacement.set('this', exp.to_identifier(links.SOURCE))
        self.assertEqual(old, got)
        self.assertEqual(links.rewrite('SELECT * FROM doc_groups'), 'SELECT * FROM doc_groups')

    def test_native_census_compares_versions_tombstones_and_multiplicity(self):
        for bucket in range(links.BUCKETS):
            query = links.census(bucket)
            self.assertIn('tuple(doc_id,group_id,updated_at,deleted)', query)
            self.assertIn('UNION ALL', query)
            self.assertIn('HAVING balance!=0', query)
            self.assertEqual(query.count(f'%{links.BUCKETS}={bucket}'), 2)
            sqlglot.parse_one(query, read='clickhouse')
        self.assertIn('min(deleted)!=max(deleted)', links.tie_census(0))

    def test_unpublished_missing_or_drifted_parts_fail_closed(self):
        canonical = [{'name': 'canonical', 'content': 'one'}]
        satellite = [{'name': 'skinny', 'content': 'two'}]
        proof = {'parts': links.fingerprints(Mock(side_effect=[canonical, satellite]))}
        links.verify_parts(Mock(side_effect=[canonical, satellite]), proof)
        for actual in ([canonical, []], [canonical, [{'name': 'skinny', 'content': 'corrupt'}]], [satellite, satellite]):
            with self.subTest(parts=actual), self.assertRaises(ValueError):
                links.verify_parts(Mock(side_effect=actual), proof)

    def test_publish_is_idempotent_and_cannot_overwrite_original(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'proof.json'
            proof = dict(parity='PASS', checks=[dict(mismatches=0, ties=0)], parts={'table': 'approved'})
            with self.assertRaisesRegex(ValueError, 'not publishable'):
                links.publish(path, {**proof, 'checks': [dict(mismatches=1, ties=0)]})
            self.assertFalse(path.exists())
            self.assertEqual(links.publish(path, proof), proof)
            self.assertEqual(links.publish(path, proof), proof)
            with self.assertRaisesRegex(ValueError, 'conflicting'):
                links.publish(path, {**proof, 'parts': {}})


if __name__ == '__main__':
    unittest.main()
