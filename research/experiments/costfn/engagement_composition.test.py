"""Source-only composition controls. No cloud, Docker or local native execution."""
import copy
import hashlib
import sqlite3
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

import sqlglot
from sqlglot import exp

import engagement_billboard_reads as ad_reads
import engagement_billboards as ads
import engagement_composition as composition
import engagement_composition_setup as setup
import engagement_composition_run as runner
import engagement_pairs as pairs
import engagement_tally_sql as tally
from arm_satellite_sql import literal as q

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
from app.v3.services.safe_query import build_safe_query  # noqa: E402


def post(author='a', doc='p', **fields):
    return dict(author_key=author, doc_id=doc, group_id='allowed', **fields)


def creative(author='a', doc='ad'):
    return dict(author_key=author, doc_id=doc, posted_by=author, body={'text': doc}, tags=['ad'])


def proof(name):
    result = dict(parity='PASS', source_binding={'test': 'source'}, query_ids=['native'])
    if name == 'refs':
        result.update(batches=list(range(32)), mismatches=0, multi_ref=True, pins=True, fat_universe=True, same_question_parity=True)
    elif name == 'paired-tallies':
        roots = ['root-' + str(i) for i in range(20)]
        result.update(actual_oracle_roots=roots, queried_domains={name: list(roots) for name in (
            'main:reactions', 'main:comments', 'main:posts', 'reactions:reactions', 'comments:comments')},
            ordinary=True, fat=True, store_sample=True, values_exact=True)
    elif name == 'views':
        result.update(profiles=['ordinary', 'fixture'], exact_impressions_and_reach=True,
            all_time_parity='PASS', daily_parity='PASS')
    else:
        result.update(profiles=['ordinary', 'fixture'], exact_creative_identity_required=True,
            pin_semantics=ads.PIN_SEMANTICS, setup_sha256='setup')
    return result


class CompositionTests(unittest.TestCase):
    def test_complete_N_ref_oracle_keeps_roles_history_and_full_author_keys(self):
        rows = [dict(author_key='a', doc_id='same', ref_value='root', deleted=0,
            body={'parent_id': 'parent', 'target_id': 'target', 'ad_id': 'ad', 'refs': ['extra', 'target', 'root']}),
            dict(author_key='a', doc_id='same', ref_value='old-root', deleted=1, body={}),
            dict(author_key='b', doc_id='same', ref_value='foreign-root', deleted=0, body={})]
        expected = {('a', 'same', v, 'target') for v in ('parent', 'target', 'ad', 'extra', 'root')}
        expected |= {('a', 'same', 'root', 'root'), ('a', 'same', 'old-root', 'root'), ('b', 'same', 'foreign-root', 'root')}
        self.assertEqual(pairs.oracle(rows), expected)
        self.assertEqual(len(pairs.oracle(rows + rows)), len(expected))
        for body in ({'refs': 'not-an-array'}, {'refs': [1]}, {'parent_id': 1}):
            with self.subTest(body=body), self.assertRaises(ValueError):
                pairs.declared(dict(ref_value='root', body=body))

    def test_native_constructors_parse_without_projection_or_early_tombstone_filters(self):
        for sql in (pairs.DDL, pairs.build(), pairs.census(), pairs.seek(['p']), pairs.validate_source(),
                pairs.census('tally_verify_documents', 'pairs_refs_fat', batches=1)):
            sqlglot.parse_one(sql, read='clickhouse')
            self.assertNotIn('ref_sorted', sql)
        self.assertNotIn('deleted=0', pairs.source())
        self.assertIn('UNION ALL', pairs.census())
        self.assertIn('HAVING balance!=0', pairs.census())
        with self.assertRaises(ValueError):
            pairs.census(batch=32)

    def test_actual_canonical_boundary_keeps_all_policy_and_full_key_history_after_pair_seek(self):
        boundary = tally.boundary('comments', ['allowed'], 'reader', table='documents')
        sql = pairs.segment(boundary, ['root'])
        tree = sqlglot.parse_one(sql, read='clickhouse')
        self.assertIn('pairs_refs', sql)
        self.assertIn('author_key, doc_id', tree.sql(dialect='clickhouse'))
        for name in ('group_hidden_docs', 'user_blacklist', 'group_blacklist', 'banned_users', 'user_group_sharing'):
            self.assertIn(name, sql)
        self.assertIn('deleted DESC', sql)
        self.assertIn('WHERE ref_value IN (' + q('root') + ')', sql)
        for table in tree.find_all(exp.Table):
            if table.name == 'engagement_documents':
                where = table.find_ancestor(exp.Select).args['where']
                self.assertNotIn('deleted', where.sql())
                self.assertNotIn('ref_value', where.sql())

    def test_author_always_wins_and_round_robin_is_across_posts_not_readers(self):
        posts = [post(doc='p' + str(i)) for i in range(6)]
        collection = [creative(doc='author-' + str(i)) for i in range(2)]
        nodes = [creative('node', 'node-' + str(i)) for i in range(2)]
        selected = {ads.key(v) for v in posts[:3]}
        plan = ads.plan(posts, {'a': collection}, nodes, author_posts=selected, node_ratio=1, seed='frozen')
        self.assertEqual([v['placement'] for v in plan['posts']], ['author'] * 3 + ['node'] * 3)
        self.assertEqual([v['ad']['doc_id'] for v in plan['posts']],
            ['author-0', 'author-1', 'author-0', 'node-0', 'node-1', 'node-0'])
        self.assertEqual(plan, ads.plan(list(reversed(posts)), {'a': collection}, nodes,
            author_posts=selected, node_ratio=1, seed='frozen'))
        for pin in plan['pins']:
            self.assertEqual(len(pairs.declared(pin)), 2)
        for row in ads.expected_rows(posts, plan):
            self.assertNotEqual('ad' in row, 'node_ad' in row)

    def test_ratio_zero_one_and_declared_subset_are_exact_and_not_probabilistic_tests(self):
        posts = [post()]
        for value in (-1, 2, True):
            with self.assertRaises(ValueError):
                ads.ratio(value)
        no = ads.plan(posts, {}, [], author_posts=[], node_ratio=0, seed='s')
        self.assertEqual(no['posts'][0]['placement'], 'none')
        self.assertEqual(no['pins'], [])
        with self.assertRaises(ValueError):
            ads.plan(posts, {}, [], author_posts=[('a', 'unknown')], node_ratio=0, seed='s')
        with self.assertRaises(ValueError):
            ads.plan(posts, {'a': [creative('other')]}, [], author_posts=[], node_ratio=0, seed='s')

    def test_exact_ad_oracle_denies_other_eligible_creative_reselection_and_unknown_root(self):
        rows = [post()]
        plan = ads.plan(rows, {}, [creative('node', 'n1'), creative('node', 'n2')], author_posts=[], node_ratio=1, seed='s')
        expected = ads.expected_rows(rows, plan)
        ads.compare(expected, rows, plan)
        wrong = copy.deepcopy(expected)
        wrong[0]['node_ad'] = creative('node', 'n2')
        with self.assertRaises(ValueError):
            ads.compare(wrong, rows, plan)
        with self.assertRaises(ValueError):
            ads.expected_rows([post('b')], plan)

    def test_read_adapter_point_fetches_creative_through_actual_compiler_and_keeps_reader_denial(self):
        pin = dict(author_key='a', doc_id='pin', ref_value='p', body=dict(
            post_author='a', target_id='ad', target_author='a', placement='author'))
        sqls = []
        def execute(sql):
            sqls.append(sql)
            return [pin] if len(sqls) % 2 else [creative()]
        rows = ad_reads.attach([post(ad={'forged': 'old'})], 'reader', execute=execute,
            readable=lambda reader, service: ['allowed'], compile=build_safe_query)
        self.assertEqual(rows[0]['ad'], creative())
        self.assertIn('pairs_refs', sqls[0])
        self.assertIn('deleted DESC', sqls[0])
        for name in ('engagement_documents', 'group_hidden_docs', 'user_blacklist'):
            self.assertIn(name, sqls[1])
        self.assertIn('(' + q('a') + ', ' + q('ad') + ')', sqlglot.parse_one(sqls[1], read='clickhouse').sql(dialect='clickhouse'))
        denied = ad_reads.attach([post()], 'denied', execute=lambda sql: [pin],
            readable=lambda reader, service: [], compile=Mock(side_effect=AssertionError('must not fetch')))
        self.assertNotIn('ad', denied[0])

    def test_pin_conflict_or_foreign_author_collection_refuses_instead_of_replacing_author(self):
        pin = dict(author_key='a', doc_id='pin', ref_value='p', body=dict(
            post_author='a', target_id='ad', target_author='a', placement='author'))
        # D124 amends agreeing duplicates only; conflicting targets still refuse.
        conflict = {**pin, 'doc_id':'other-pin', 'body':{**pin['body'], 'target_id':'other-ad'}}
        for values in ([pin, conflict], [{**pin, 'body': {**pin['body'], 'target_author': 'b'}}]):
            with self.subTest(values=values), self.assertRaises(ValueError):
                ad_reads.attach([post()], 'reader', execute=lambda sql, values=values: values,
                    readable=Mock(side_effect=AssertionError('must refuse before fetch')), compile=Mock())

    def test_each_required_gate_failure_blocks_every_measured_cell(self):
        for failed in composition.GATES:
            calls = []
            class Actions:
                def checkpoint(self, *args):
                    pass
                def stage(self, name, previous, calls=calls, failed=failed):
                    calls.append(name)
                    if name.startswith('verify-'):
                        kind = name.removeprefix('verify-')
                        return {**proof(kind), 'parity': 'FAIL' if kind == failed else 'PASS'}
                    return {}
            with tempfile.TemporaryDirectory() as directory:
                result = composition.run(Actions(), Path(directory) / 'attempt')
            self.assertFalse(set(composition.CELLS) & set(calls))
            self.assertTrue(all(result[name]['outcome'] == 'BLOCKED_PRE_MEASUREMENT_VERIFICATION' for name in composition.CELLS))

    def test_repaired_paired_domain_refuses_omission_even_with_zero_value_claim(self):
        value = proof('paired-tallies')
        composition.gate('paired-tallies', value)
        value['queried_domains']['main:posts'].pop()
        with self.assertRaisesRegex(ValueError, 'all20'):
            composition.gate('paired-tallies', value)
        for name in composition.GATES:
            with self.assertRaises(ValueError):
                composition.gate(name, {})

    def test_measurement_timeout_preserves_failure_and_continues_independent_cells(self):
        calls = []
        class Actions:
            def checkpoint(self, *args):
                pass
            def stage(self, name, previous):
                calls.append(name)
                if name.startswith('verify-'):
                    return proof(name.removeprefix('verify-'))
                if name == 'uniform-K20':
                    raise TimeoutError('native600 partial actuals retained')
                return {}
        with tempfile.TemporaryDirectory() as directory:
            result = composition.run(Actions(), Path(directory) / 'attempt')
        self.assertEqual(result['uniform-K20']['outcome'], 'INCOMPLETE')
        self.assertTrue(set(composition.CELLS) <= set(calls))

    def test_statement_inventory_reports_each_identity_and_actual_cost_and_denies_retired_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def record(sql):
                digest = hashlib.sha256(sql.encode()).hexdigest()
                (root / (digest + '.sql')).write_text(sql)
                return dict(query_id='q', sql_sha256=digest, stage='unclassified',
                    native=dict(read_rows=7, read_bytes=91, query_duration_ms=3, exception_code=0))
            value = composition.statement_inventory(root, [record('SELECT doc_id FROM pairs_refs')])
            self.assertEqual(value['read_bytes'], 91)
            self.assertIn('read:pairs_refs:', value['statements'][0]['identity'])
            self.assertEqual(value['statements'][0]['previous_stage'], 'unclassified')
            for sql in ('SELECT count() FROM content_events', 'SELECT 1 /* ref_sorted */',
                    "SELECT * FROM engagement_documents WHERE has(tags,'node_ad')"):
                with self.assertRaises(ValueError):
                    composition.statement_inventory(root, [record(sql)])

    def test_migration_does_not_build_obsolete_projection_or_repeat_banked_inverse_proof(self):
        class Session:
            def __init__(self):
                self.sql = []
            def query(self, label, sql):
                self.sql.append(sql)
                return '', label
            def rows(self, label, sql):
                self.sql.append(sql)
                return ([dict(source=10, copy=10)] if label == 'composition_copy_count' else [dict(n=0)]), label
        session = Session()
        with tempfile.TemporaryDirectory() as directory:
            value = setup.migrate(session, Path(directory))
        self.assertFalse(value['projection_installed'])
        self.assertTrue(all('PROJECTION' not in sql for sql in session.sql))
        self.assertEqual(len(value['checks']), 9)

    def test_stale_edges_do_not_resurrect_moved_tombstoned_or_foreign_author_documents(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.create_function('UNHEX', 1, lambda v: bytes.fromhex(v).decode())
        db.execute('CREATE TABLE engagement_documents (author_key TEXT,doc_id TEXT,ref_value TEXT,updated_at INTEGER,deleted INTEGER)')
        db.execute('CREATE TABLE pairs_refs (author_key TEXT,doc_id TEXT,ref_id TEXT,role TEXT)')
        rows = [('a','moved','root',1,0),('a','moved','elsewhere',2,0),
            ('a','deleted','root',2,0),('a','deleted','root',2,1),
            ('a','same','root',1,0),('b','same','elsewhere',1,0),('a','live','root',1,0)]
        db.executemany('INSERT INTO engagement_documents VALUES (?,?,?,?,?)', rows)
        db.executemany('INSERT INTO pairs_refs VALUES (?,?,?,?)', [(a,d,r,'root') for a,d,r,_,_ in rows])
        boundary = ('SELECT author_key,doc_id,ref_value FROM (SELECT *,row_number() OVER '
            '(PARTITION BY author_key,doc_id ORDER BY updated_at DESC) AS rn FROM documents) WHERE rn=1 AND deleted=0')
        sql = pairs.segment(boundary, ['root'])
        translated = sqlglot.transpile(sql, read='clickhouse', write='sqlite')[0]
        self.assertEqual(set(db.execute(translated)), {('a','same','root'),('a','live','root')})

    def test_real_runner_cites_baseline_without_creating_a_session_before_restore(self):
        action = runner.Actions.__new__(runner.Actions)
        action.approval = dict(composition_admitted=True, run_directive=composition.DIRECTIVE)
        with patch.object(runner.modern, 'remaining', return_value=2000), \
                patch.object(runner.modern, 'Session', side_effect=AssertionError('restore has not happened')):
            result = action.stage('banked', {})
        self.assertEqual(result['baseline_status'], 'CITED_NOT_REMEASURED')

    def test_actual_read_single_ref_equality_and_cursor_keep_indexed_root_seek(self):
        statement = ("SELECT doc_id,author_key,body FROM comments WHERE ref_value='root' "
            "AND (created_at>'2026-01-01' OR (created_at='2026-01-01' AND doc_id>'cursor')) "
            'ORDER BY created_at,doc_id LIMIT 50')
        compiled = build_safe_query(statement, {'comments':['allowed']}, member_key='reader', allowed_services={'comments'})
        tree = sqlglot.parse_one(compiled, read='clickhouse')
        self.assertEqual(pairs.root_targets(tree), ['root'])
        self.assertIsNone(pairs.root_targets(sqlglot.parse_one("SELECT * FROM comments WHERE doc_id IN ('id')")))
        with self.assertRaises(ValueError):
            pairs.root_targets(sqlglot.parse_one("SELECT * FROM comments WHERE ref_value='root' OR author_key='other'"))
        with self.assertRaises(ValueError):
            pairs.segment('SELECT * FROM documents', ['fine-target'], role='target')


if __name__ == '__main__':
    unittest.main()
