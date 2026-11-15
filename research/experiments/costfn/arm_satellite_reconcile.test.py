"""No-engine AST/algebra/receipt controls; native memory/parity remain unproven."""
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import sqlglot
from sqlglot import exp

import arm_satellite_metadata as metadata
import arm_satellite_reconcile as check


FIELDS = ('group_id', 'created_at', 'doc_id', 'author_key', 'link_created_at', 'updated_at', 'deleted',
          'collection_name', 'tags', 'ref_value', 'comment_post_id', 'repost_of')


def fixture():
    docs = [dict(doc_id=doc, author_key=author, created_at=1, updated_at=1, deleted=0,
                 collection_name='posts', tags=('tag',), ref_value='', comment_post_id='', repost_of='')
            for doc, author in [('same-id', 'a'), ('same-id', 'b'), ('second', 'a'), ('dead', 'a')]]
    docs += [{**docs[-1], 'updated_at': 2, 'deleted': 1}, {**docs[2], 'updated_at': 2, 'tags': ('edited',)}]
    links = [dict(doc_id=doc, group_id=group, created_at=1, updated_at=1, deleted=0)
             for doc, group in [('same-id', 'g1'), ('same-id', 'g2'), ('second', 'g1'), ('dead', 'g1'), ('second', 'removed')]]
    links += [{**links[-1], 'updated_at': 2, 'deleted': 1}]
    return docs, links


def canonical(docs, links):
    def latest(rows, keys):
        result = {}
        for row in rows:
            identity = tuple(row[key] for key in keys)
            if identity not in result or (row['updated_at'], row['deleted']) > (result[identity]['updated_at'], result[identity]['deleted']):
                result[identity] = row
        return [row for row in result.values() if not row['deleted']]
    output = []
    for doc in latest(docs, ('author_key', 'doc_id')):
        for link in latest(links, ('doc_id', 'group_id')):
            if doc['doc_id'] == link['doc_id']:
                output.append({**doc, 'group_id': link['group_id'], 'link_created_at': link['created_at'],
                               'updated_at': link['updated_at'], 'deleted': link['deleted']})
    return output


def algebra(actual, expected, index):
    matched, mismatched = 0, 0
    for row in actual:
        for want in expected:
            if all(row[key] == want[key] for key in ('doc_id', 'author_key', 'group_id')):
                matched += 1
                mismatched += any(row[key] != want[key] for key in FIELDS)
    keys = Counter(tuple(row[key] for key in ('doc_id', 'author_key', 'group_id')) for row in actual)
    return dict(batch=index, expected=len(expected), stored=len(actual), matched=matched,
                mismatched=mismatched, duplicate_keys=sum(number > 1 for number in keys.values()))


class ReconcileTests(unittest.TestCase):
    def test_every_input_filtered_before_join_without_changing_fields_or_final(self):
        original = sqlglot.parse_one(metadata.TRANSPOSE_CHECK, read='clickhouse')
        for index in range(8):
            sql = check.partition(metadata.TRANSPOSE_CHECK, index, 8, {'doc_groups_t', 'documents', 'doc_groups'})
            tree = sqlglot.parse_one(sql, read='clickhouse')
            self.assertEqual([e.sql() for e in tree.expressions], [e.sql() for e in original.expressions])
            self.assertEqual([j.args['on'].sql() for j in tree.args['joins']], [j.args['on'].sql() for j in original.args['joins']])
            self.assertEqual(len(list(tree.find_all(exp.Final))), 2)
            self.assertFalse(list(tree.find_all(exp.Limit)))
            self.assertEqual(sql.count('cityHash64(doc_id) % 8 = ' + str(index)), 3)
            for table in tree.find_all(exp.Table):
                parent = table.find_ancestor(exp.Select)
                self.assertIn('cityHash64', parent.args['where'].sql(dialect='clickhouse'))
                self.assertEqual(len(parent.expressions), 1)
                self.assertIsInstance(parent.expressions[0], exp.Star)

    def test_disjoint_batches_preserve_histories_authors_shared_routes_and_multiplicity(self):
        docs, links = fixture()
        expected = canonical(docs, links)
        # Any stable doc-id-only partition proves this relational identity;
        # the AST control above pins the actual native cityHash64 expression.
        def bucket(row):
            return hashlib.sha256(row['doc_id'].encode()).digest()[0] % 8
        results = []
        for index in range(8):
            d = [row for row in docs if bucket(row) == index]
            g = [row for row in links if bucket(row) == index]
            t = [row for row in expected if bucket(row) == index]
            self.assertEqual(Counter(tuple(r[k] for k in FIELDS) for r in canonical(d, g)),
                             Counter(tuple(r[k] for k in FIELDS) for r in t))
            results.append(algebra(t, canonical(d, g), index))
        self.assertEqual(check.totals(results, 8)['matched'], len(expected))
        self.assertEqual(len([row for row in expected if row['doc_id'] == 'same-id']), 4)

    def test_all_independent_full_multiset_checks_partition_all_sources(self):
        import arm_satellite_verify as verifier
        for label, sql in verifier.checks().items():
            original = sqlglot.parse_one(sql, read='clickhouse')
            tables = {table.name for table in original.find_all(exp.Table)}
            self.assertTrue(any(any(isinstance(column, exp.Column) and column.name == 'doc_id'
                                   for column in group.expressions) for group in original.find_all(exp.Group)))
            for index in range(8):
                tree = sqlglot.parse_one(check.partition(sql, index, 8, tables), read='clickhouse')
                with self.subTest(surface=label, batch=index):
                    self.assertFalse(list(tree.find_all(exp.Limit)))
                    self.assertEqual(len(list(tree.find_all(exp.Final))), len(list(original.find_all(exp.Final))))
                    for table in tree.find_all(exp.Table):
                        self.assertIn('cityHash64', table.find_ancestor(exp.Select).args['where'].sql(dialect='clickhouse'))

    def test_every_compared_field_and_orphan_or_missing_row_is_denied(self):
        expected = canonical(*fixture())
        for field in FIELDS:
            actual = copy.deepcopy(expected)
            value = actual[0][field]
            actual[0][field] = value + 1 if isinstance(value, int) else value + (('bad',) if isinstance(value, tuple) else '-bad')
            with self.subTest(field=field), self.assertRaises(ValueError):
                check.totals([algebra(actual, expected, 0), algebra([], [], 1)], 2)
        with self.assertRaises(ValueError):
            check.totals([algebra(expected[:-1], expected, 0), algebra([], [], 1)], 2)

    def test_duplicate_and_missing_row_cannot_cancel_inside_or_between_batches(self):
        expected = canonical(*fixture())
        actual = [expected[0], expected[0], *expected[2:]]
        result = algebra(actual, expected, 0)
        # Reproduce the old scalar check's blind spot; do not call it exact.
        self.assertEqual((result['stored'], result['matched'], result['mismatched']), (len(expected), len(expected), 0))
        with self.assertRaises(ValueError):
            check.totals([result, algebra([], [], 1)], 2)
        one, two = algebra(expected[:1], expected[:2], 0), algebra(expected[2:] * 2, expected[2:], 1)
        with self.assertRaises(ValueError):
            check.totals([one, two], 2)

    def test_missing_duplicate_bool_and_malformed_results_never_pass(self):
        valid = [algebra([], [], index) for index in range(8)]
        check.totals(valid, 8)
        for rows in (valid[:-1], [*valid[:-1], valid[0]], [{**valid[0], 'batch': False}, *valid[1:]]):
            with self.assertRaises(ValueError):
                check.totals(rows, 8)
        for value in (True, -1, '1.0', '1e2', '-1', None):
            with self.assertRaises(ValueError):
                check.uint(value)
        self.assertEqual(check.uint('92200600'), 92200600)
        for count in (0, -1, True, 257):
            with self.assertRaises(ValueError):
                check.partition(metadata.TRANSPOSE_CHECK, 0, count, {'documents', 'doc_groups', 'doc_groups_t'})
        with self.assertRaises(ValueError):
            check.partition('SELECT * FROM new_source', 0, 8, {'documents'})

    def test_failed_native_attempt_receipt_and_original_question_stay_unchanged(self):
        path = Path(__file__).with_name('evidence') / 'arm-f-20261115/P-setup-stop/stop.json'
        receipt = json.loads(path.read_bytes())
        self.assertEqual(hashlib.sha256((metadata.TRANSPOSE_CHECK + ' FORMAT JSON').encode()).hexdigest(),
                         receipt['query_ledger'][0]['sql_sha256'])
        self.assertEqual(receipt['native_exception_code'], 241)
        self.assertEqual(receipt['F_native_gates'], 'NOT_RUN')

    def test_mismatch_stops_before_next_batch_and_persists_no_pass(self):
        class Session:
            def rows(self, label, sql, **kwargs):
                if label == 'reconcile_canonical_keys':
                    return ([dict(name=n, engine=engine, sorting_key=k, partition_key='', uuid=n)
                        for n, k, engine in [('documents', 'author_key, doc_id', 'ReplacingMergeTree'),
                            ('doc_groups', 'doc_id, group_id', 'ReplacingMergeTree'),
                            ('doc_groups_t', 'group_id, created_at, doc_id', 'MergeTree')]], 'schema')
                if label.endswith('_fields'):
                    return ([{'matched': '1', 'mismatched': '1'}], label)
                return ([{'n': '0' if label.endswith('_duplicates') else '1'}], label)
            def native(self, query_id):
                return {'query_id': query_id, 'exception_code': 0}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'check'
            with self.assertRaises(ValueError):
                check.transpose(Session(), path, metadata.TRANSPOSE_CHECK)
            result = json.loads((path / 'result.json').read_bytes())
            self.assertEqual(result['outcome'], 'STOP')
            self.assertEqual(len(result['rows']), 1)
            self.assertNotIn('totals', result)


if __name__ == '__main__':
    unittest.main()
