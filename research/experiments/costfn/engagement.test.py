"""No-engine seam/semantic controls, not native optimizer or performance proof."""
import ast
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

import sqlglot
from sqlglot import exp

import engagement_events as events
import engagement_ref as refs


def row(doc, service, ref='', body=None, **extra):
    return dict(doc_id=doc, author_key='alice', collection_name=service,
        ref_value=ref, body=json.dumps(body or {}), updated_at=1, deleted=0, **extra)


class EngagementTests(unittest.TestCase):
    def fixture(self):
        return [row('post', 'posts'), row('top', 'comments', 'post', {'post_id': 'post', 'text': 'hello'}),
            row('reply', 'comments', 'top', {'post_id': 'post'}),
            row('deep', 'comments', 'reply', {'post_id': 'post'}),
            row('like', 'reactions', 'reply', {'type': 'like'}),
            row('dislike', 'reactions', 'deep', {'type': 'dislike'}),
            row('repost', 'posts', body={'repost_of': 'post', 'text': 'quote'}),
            row('direct-like', 'reactions', 'post', {'type': 'like'})]

    def test_uniform_refs_preserve_reply_reaction_and_repost_semantics_without_mutating_input(self):
        old = self.fixture()
        before = deepcopy(old)
        transformed = refs.restructure(old)
        self.assertEqual(old, before)
        self.assertEqual(len(transformed), len(old))
        self.assertTrue(all(r['ref_value'] == 'post' for r in transformed[1:]))
        by_id = {r['doc_id']: r for r in transformed}
        self.assertEqual(json.loads(by_id['reply']['body']), {'parent_id': 'top'})
        self.assertEqual(json.loads(by_id['like']['body']), {'type': 'like', 'target_id': 'reply'})
        self.assertEqual(json.loads(by_id['repost']['body']), {'text': 'quote'})
        tree = refs.threads(transformed)
        self.assertEqual([r['document']['doc_id'] for r in tree], ['top'])
        self.assertEqual(tree[0]['replies'][0]['replies'][0]['document']['doc_id'], 'deep')

    def test_every_physical_history_version_and_tombstone_survives(self):
        data = self.fixture()
        deleted = deepcopy(data[2])
        deleted.update(updated_at=2, deleted=1)
        data.append(deleted)
        result = refs.restructure(data)
        self.assertEqual([(r['doc_id'], r['author_key'], r['updated_at'], r['deleted']) for r in result],
            [(r['doc_id'], r['author_key'], r['updated_at'], r['deleted']) for r in data])

    def test_missing_ambiguous_cyclic_and_conflicting_roots_are_refused(self):
        mutations = [lambda r: r[1].update(ref_value='missing'),
            lambda r: r.append({**r[1], 'author_key': 'bob'}),
            lambda r: r[1].update(ref_value='deep'),
            lambda r: r[2].update(body='{"post_id":"different"}'),
            lambda r: r[2].update(body='{"post_id":"post","parent_id":"forged"}'),
            lambda r: r[-2].update(ref_value='other')]
        for mutate in mutations:
            data = self.fixture()
            mutate(data)
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                refs.restructure(data)

    def test_thread_missing_parent_does_not_fetch_or_invent_private_parent(self):
        data = refs.restructure(self.fixture())
        result = refs.threads([r for r in data if r['doc_id'] != 'top'])
        self.assertEqual(result[0]['document']['doc_id'], 'reply')
        self.assertTrue(result[0]['parent_unavailable'])

    def test_exactly_one_skinny_projection_shape_and_no_body_or_legacy_read_key(self):
        setting, ddl, materialize = refs.projection()
        self.assertIn("deduplicate_merge_projection_mode='rebuild'", setting)
        self.assertIn('ref_sorted', ddl)
        self.assertIn('ORDER BY (ref_value,collection_name,created_at,doc_id,updated_at)', ddl)
        self.assertNotIn('SELECT *', ddl)
        self.assertNotIn('comment_post_id', ddl)
        self.assertNotIn('repost_of', ddl)
        self.assertIn('JSONExtractString(body', ddl)
        self.assertIn('MATERIALIZE PROJECTION', materialize)

    def test_actual_canonical_boundary_retains_policy_and_history(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
        from app.v3.services.safe_query import _boundary_cte_sql
        boundary = _boundary_cte_sql('comments', ['allowed'], 'reader')
        rewritten = refs.segment(boundary, ['post'], table='engagement_documents')
        original = sqlglot.parse_one(boundary, read='clickhouse')
        tree = sqlglot.parse_one(rewritten, read='clickhouse')
        self.assertEqual(len(list(original.find_all(exp.Window))), len(list(tree.find_all(exp.Window))))
        for table in {t.name for t in original.find_all(exp.Table)} - {'documents'}:
            self.assertIn(table, {t.name for t in tree.find_all(exp.Table)})
        self.assertIn('(author_key, doc_id) IN', rewritten)
        self.assertNotIn('repost_of', rewritten)
        self.assertNotIn('post_id', rewritten)

    def test_moved_ref_or_tombstone_cannot_resurrect_old_candidate(self):
        # Execute the same full-key candidate + full-history-winner shape, not
        # a Python imitation of winner selection. SQLite is not native proof.
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.create_function('unhex', 1, lambda value: bytes.fromhex(value).decode())
        db.executescript("CREATE TABLE documents(author_key TEXT,doc_id TEXT,ref_value TEXT,updated_at INT,deleted INT,collection_name TEXT);"
            "INSERT INTO documents VALUES ('a','moved','p',1,0,'comments'),('a','moved','q',2,0,'comments'),"
            "('a','dead','p',1,0,'comments'),('a','dead','p',2,1,'comments'),('a','live','p',1,0,'comments'),('b','live','p',1,0,'comments');")
        boundary = 'SELECT * FROM (SELECT *,row_number() OVER (PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents) WHERE rn=1 AND deleted=0'
        sql = refs.segment(boundary, ['p'])
        actual = db.execute('SELECT author_key,doc_id FROM (' + sql + ') ORDER BY author_key').fetchall()
        self.assertEqual(actual, [('a', 'live'), ('b', 'live')])

    def test_real_boundary_execution_keeps_all_policy_denials_and_shared_multiplicity(self):
        api = Path(__file__).resolve().parents[3] / 'api'
        sys.path.insert(0, str(api))
        from app.v3.services.safe_query import _boundary_cte_sql
        node = next(n for n in ast.parse((api / 'tests/test_query_partition_pruning.py').read_text()).body
            if isinstance(n, ast.FunctionDef) and n.name == 'history_db')
        node.decorator_list = []
        namespace = dict(sqlite3=sqlite3)
        exec(compile(ast.Module(body=[node], type_ignores=[]), '<real-history-fixture>', 'exec'), namespace)
        history = namespace['history_db']()
        db = next(history)
        self.addCleanup(history.close)
        db.create_function('unhex', 1, lambda value: bytes.fromhex(value).decode())
        db.execute("UPDATE documents SET ref_value='post'")
        sql = refs.segment(_boundary_cte_sql('posts', ['allowed', 'second'], 'reader'), ['post'])
        def read():
            return db.execute('SELECT doc_id,group_id FROM (' + sql + ') ORDER BY doc_id,group_id').fetchall()
        self.assertEqual(read(), [('active', 'allowed'), ('multiple', 'allowed'), ('multiple', 'second'), ('own', 'allowed')])
        for mutation in ("INSERT INTO user_blacklist VALUES ('alice','reader',4,0)",
                         "INSERT INTO group_blacklist VALUES ('alice','allowed','reader',4,0)",
                         "INSERT INTO group_hidden_docs VALUES ('allowed','active',4,0)",
                         "INSERT INTO banned_users VALUES ('alice',4,0)",
                         "INSERT INTO user_group_sharing VALUES ('alice','allowed',0,4,0)"):
            db.execute('SAVEPOINT denial')
            db.execute(mutation)
            with self.subTest(mutation=mutation):
                self.assertNotIn(('active', 'allowed'), read())
                self.assertIn(('own', 'allowed'), read())
            db.execute('ROLLBACK TO denial')
            db.execute('RELEASE denial')

    def test_bad_ids_and_table_identifiers_are_refused(self):
        for ids in ([], [''], [None]):
            with self.assertRaises(ValueError):
                refs.seek(ids)
        with self.assertRaises(ValueError):
            refs.seek(['p'], table='documents; DROP TABLE users')

    def test_in_scope_is_not_a_multiplying_join_and_overread_is_not_event_count(self):
        sql = events.read(['p'], 'posts', ['g'], aggregate=False)
        native = dict(read_rows=1000, read_bytes=50000, exception_code=0)
        result = events.diagnostic(sql, native, 8, 8)
        self.assertEqual(result['cause'], 'RAW_EVENT_AGGREGATION')
        self.assertEqual(result['top_level_join_count'], 0)
        self.assertEqual(result['true_event_count'], 8)
        self.assertEqual(result['excess_rows_not_automatically_join_fanout'], 992)
        self.assertEqual(result['projection_only_views'], 'UNAFFECTED')
        self.assertEqual(events.diagnostic(sql, native, 8, 16)['cause'], 'INVALID_EVENT_PARITY')
        self.assertEqual(events.diagnostic(sql, native, 0, 0)['cause'], 'NO_POSITIVE_EVENT_EVIDENCE')

    def test_aggregate_build_refuses_no_diagnostic_live_writers_and_reseed(self):
        for cause, stopped, seeded in [('UNKNOWN', True, False), ('RAW_EVENT_AGGREGATION', False, False),
                                      ('RAW_EVENT_AGGREGATION', True, True)]:
            with self.assertRaises(ValueError):
                events.build({'cause': cause}, writers_stopped=stopped, seed_completed=seeded)
        ddl, mv, seed = events.build({'cause': 'RAW_EVENT_AGGREGATION'}, writers_stopped=True)
        self.assertIn('AggregatingMergeTree', ddl)
        self.assertIn('FROM content_events ', mv)
        self.assertNotIn('POPULATE', mv)
        self.assertNotIn('documents', mv)
        self.assertNotIn('doc_groups', mv)
        self.assertNotIn('IF NOT EXISTS', seed)

    def test_aggregate_reads_merge_exact_reader_states_and_keep_service_event_scope(self):
        sql = events.read(['p'], 'posts', ['g'])
        self.assertIn('uniqExactMerge(reach)', sql)
        self.assertIn('countMerge(impressions)', sql)
        self.assertNotIn('sum(reach)', sql)
        self.assertIn('ORDER BY updated_at DESC,deleted DESC', sql)
        self.assertIn("event_type='delivery'", sql)
        self.assertIn('service=', sql)
        # Independent overlapping-day/insert-block oracle: summing distinct
        # per-bucket counts would produce4 rather than the correct3.
        readers = [{'a', 'b'}, {'b', 'c'}]
        self.assertEqual(len(set.union(*readers)), 3)
        self.assertNotEqual(sum(map(len, readers)), 3)

    def test_native_json_uint64_normalization_is_exact_and_rejects_floats(self):
        value = 2**63 + 17
        self.assertEqual(events.integer_counts([{'doc_id': 'p', 'reach': str(value)}]), [{'doc_id': 'p', 'reach': value}])
        for wrong in (1.5, True, -1, '1.5', '1e3', '１２'):
            with self.subTest(wrong=wrong), self.assertRaises(ValueError):
                events.integer_counts([{'impressions': wrong}])

    def test_migration_is_separate_copy_and_keeps_full_physical_schema(self):
        checks, statements = refs.migration()
        self.assertIn('comment_identity_ambiguous', checks)
        self.assertIn('comment_parent_wrong_root', checks)
        sql = '\n'.join(statements)
        self.assertNotIn('ALTER TABLE documents UPDATE', sql)
        self.assertNotIn('DELETE FROM', sql)
        self.assertNotIn('ANY JOIN', sql)
        self.assertIn('updated_at,deleted,ad_mode,ad_target,posted_by', sql)
        self.assertIn('parent_id', sql)
        self.assertIn('target_id', sql)
        self.assertEqual(sql.count('ADD PROJECTION'), 1)
        self.assertNotIn('"post_id":null', sql)
        self.assertIn('JSONExtractKeysAndValuesRaw', sql)

    def test_roundtrip_oracle_compares_full_values_and_multiplicity_not_scalar_hashes(self):
        sql = refs.roundtrip_check(0, 2)
        self.assertIn('GROUP BY value HAVING balance!=0', sql)
        self.assertIn('UNION ALL', sql)
        self.assertIn('updated_at,deleted,ad_mode,ad_target,posted_by', sql)
        self.assertEqual(sql.count('cityHash64(author_key,doc_id)%2=0'), 2)
        self.assertNotIn('ANY JOIN', sql)
        for batch, batches in ((-1, 2), (2, 2), (False, 2), (0, 65)):
            with self.assertRaises(ValueError):
                refs.roundtrip_check(batch, batches)

    def test_stage_native_failure_and_parity_mismatch_cannot_be_reported_pass(self):
        from engagement_run import measure, verify_sample
        with TemporaryDirectory() as directory:
            output = Path(directory)
            def failed_native(*args, **kwargs):
                raise ValueError('over10M stop')
            session = SimpleNamespace(rows=lambda *a, **k: ([{'n': 1}], 'q1'), native=failed_native)
            with self.assertRaisesRegex(ValueError, 'over10M'):
                measure(session, output, 'bad', 'SELECT 1')
            receipt = json.loads((output / 'bad.json').read_bytes())
            self.assertEqual(receipt['outcome'], 'STOP')
            sample = dict(label='wrong', rows=[dict(n=1)], outcome='OBSERVED_NOT_PARITY_VERIFIED')
            with self.assertRaisesRegex(ValueError, 'parity mismatch'):
                verify_sample(output, sample, [dict(n=2)])
            self.assertNotEqual(sample['outcome'], 'PARITY_PASS_NATIVE_STAGE_ONLY')

    def test_projection_only_legacy_comment_counts_and_uniform_post_reactions_remain_distinct(self):
        from engagement_run import aggregate_segment
        old = aggregate_segment('SELECT * FROM comments', 'comments', uniform=False)
        new = aggregate_segment('SELECT * FROM comments', 'comments', uniform=True)
        self.assertIn("JSONExtractString(body,'post_id')", old)
        self.assertNotIn('post_id', new)
        self.assertIn('ref_value AS root', new)
        reactions = aggregate_segment('SELECT * FROM reactions', 'reactions', uniform=True)
        self.assertIn("JSONExtractString(body,'target_id')=''", reactions)


if __name__ == '__main__':
    unittest.main()
