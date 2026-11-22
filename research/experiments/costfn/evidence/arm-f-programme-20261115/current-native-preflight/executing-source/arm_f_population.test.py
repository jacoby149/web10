"""No-engine controls: bounds, full identities/routes, fail-closed gate ordering."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import sqlglot
from sqlglot import exp

import arm_f_population as population


class PopulationTests(unittest.TestCase):
    def test_native_sql_parses_without_a_global_join_or_unbounded_reader_set(self):
        for sql in (population.MEMBERS_DDL, population.current_members(['g']),
                    population.membership_insert(['g']), population.window_sql(['alice', 'bob'], 7),
                    population.stored_sql(['alice'])):
            sqlglot.parse_one(sql, read='clickhouse')
        sql = population.window_sql(['alice', 'bob'], 7)
        tree = sqlglot.parse_one(sql, read='clickhouse')
        tables = {node.name for node in tree.find_all(exp.Table)}
        self.assertTrue({'documents', 'doc_groups', 'doc_groups_t', 'f_seed_members'} <= tables)
        self.assertNotIn('content_events', tables)
        self.assertNotIn('counting_numbers', tables)
        self.assertIn('PARTITION BY reader_key ORDER BY created_at DESC,doc_id DESC,author_key DESC', sql)
        self.assertIn('position<=200', sql)
        self.assertNotIn('DISTINCT', sql)
        self.assertIn('ORDER BY updated_at DESC,deleted DESC', sql)

    def test_bounds_refuse_empty_duplicate_or_oversized_batches(self):
        for values in ([], ['a', 'a'], [''], ['a', None]):
            with self.assertRaises(ValueError):
                population.window_sql(values, 1)
        with self.assertRaises(ValueError):
            population.current_members([str(i) for i in range(population.GROUP_BATCH + 1)])
        with self.assertRaises(ValueError):
            population.window_sql([str(i) for i in range(population.READER_BATCH + 1)], 1)
        for version in (0, -1, True, 2**63):
            with self.assertRaises(ValueError):
                population.window_sql(['alice'], version)

    def test_cutoff_is_after_canonical_membership_winners_and_reserved_keys(self):
        sql = population.membership_insert(['g'])
        self.assertIn('WHERE rn=1 AND deleted=0', sql)
        self.assertIn("NOT IN ('anyone','authenticated','anon')", sql)
        self.assertIn('members<2000', sql)
        tree = sqlglot.parse_one(sql, read='clickhouse')
        self.assertEqual({t.name for t in tree.find_all(exp.Table)}, {'group_members', 'f_seed_members'})

    def test_duplicate_output_is_refused_not_collapsed_and_all_routes_survive(self):
        row = dict(reader_key='r', created_ms='1', author_key='a', doc_id='same', group_id='g1')
        other_author = {**row, 'author_key': 'b'}
        other_route = {**row, 'group_id': 'g2'}
        self.assertEqual(len(population.logical([row, other_author, other_route])), 3)
        with self.assertRaisesRegex(ValueError, 'duplicate seed route'):
            population.logical([row, row])

    def test_global_window_counts_full_identities_not_services_or_routes(self):
        rows = [dict(reader_key='r', created_ms=i, author_key='a', doc_id=str(i), group_id='g1') for i in range(205)]
        rows += [{**rows[-1], 'group_id': 'g2'}, {**rows[-1], 'author_key': 'b'}]
        kept = population.window(rows)
        self.assertEqual(len({(row[2], row[3]) for row in kept}), 200)
        self.assertEqual(len(kept), 201)
        self.assertEqual(sum(row[3] == '204' for row in kept), 3)
        self.assertEqual(population.window(list(reversed(rows))), kept)

    def test_sample_oracle_is_canonical_only_and_latest_before_deletion(self):
        tree = sqlglot.parse_one(population.reference_sql(['author'], ['g1', 'g2']), read='clickhouse')
        self.assertEqual({t.name for t in tree.find_all(exp.Table)}, {'documents', 'doc_groups'})
        self.assertIn('d.rn=1 AND d.deleted=0', population.reference_sql(['author'], ['g1']))

    def test_tighter_runtime_limits_cannot_increase_the_parent_envelope(self):
        from datetime import UTC, datetime, timedelta
        from arm_f_runtime import Session
        with tempfile.TemporaryDirectory() as directory:
            session = Session.__new__(Session)
            session.root, session.operation, session.host_id = Path(directory), {}, 123
            session.deadline = datetime.now(UTC) + timedelta(hours=1)
            session.stopped, session.compose, session.env = False, [], {}
            session.record = lambda row: None
            with patch('arm_f_runtime.admitted'), patch('arm_f_runtime.restore.command', return_value=b'') as command:
                session.query('bounded', 'SELECT 1', settings=population.LIMITS)
                options = command.call_args.args
                self.assertEqual(sum(str(arg).startswith('--max_memory_usage=') for arg in options), 1)
                self.assertIn('--max_memory_usage=4294967296', options)
                self.assertIn('--read_overflow_mode=throw', options)
                for settings in ({'max_memory_usage': 23 * 1024**3}, {'max_rows_to_read': 0}, {'unknown': 1}):
                    command.reset_mock()
                    with self.assertRaises(ValueError):
                        session.query('denied', 'SELECT 1', settings=settings)
                    command.assert_not_called()

    def test_detached_worker_survives_vpn_loss_without_renewing_its_lease(self):
        from arm_f_deploy import worker_command
        detached = worker_command(9000, '/research/', detach=True)
        self.assertNotIn('--pipe', detached)
        self.assertNotIn('--wait', detached)
        self.assertIn('--property=StandardOutput=append:/opt/fanout/step0-service.log', detached)
        self.assertIn('--property=RuntimeMaxSec=9000', detached)
        self.assertIn('--pipe', worker_command(9000, '/research/'))
        for remaining in (0, True, 14400, 14101):
            with self.assertRaises(ValueError):
                worker_command(remaining, '/research/', detach=True)

    def test_reconciliation_never_tombstones_a_desired_route_at_the_same_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            builder = population.Builder(None, Path(directory) / 'build')
            queries = []
            builder.query = lambda label, sql, **kwargs: queries.append(sql)
            builder.reconcile(['r'], 17, 'batch')
            self.assertEqual(len(queries), 2)
            self.assertIn('NOT IN (SELECT reader_key,created_ms,author_key,doc_id,group_id', queries[0])
            self.assertIn(',17,1 FROM', queries[0])
            for sql in queries:
                sqlglot.parse_one(sql, read='clickhouse')

    def test_every_builder_query_carries_limits_including_ddl(self):
        class Session:
            calls = []
            def query(self, label, sql, **kwargs):
                self.calls.append((label, sql, kwargs))
                return '', 'query'
            def native(self, query):
                return {'exception_code': 0}
        with tempfile.TemporaryDirectory() as directory:
            session = Session()
            population.Builder(session, Path(directory) / 'build').query('ddl', population.MEMBERS_DDL)
            self.assertEqual(session.calls[0][2]['settings'], population.LIMITS)
            self.assertEqual(session.calls[0][1].count('SETTINGS'), 1)
            self.assertLess(population.LIMITS['max_memory_usage'], 22 * 1024**3)

    def test_absent_or_failed_early_gate_prevents_any_population_session(self):
        import json
        with tempfile.TemporaryDirectory() as directory, patch('arm_f_population.Session') as session:
            with self.assertRaises(FileNotFoundError):
                population.build(directory)
            session.assert_not_called()
            path = Path(directory) / 'F-gates/T4'
            path.mkdir(parents=True)
            (path / 'result.json').write_text(json.dumps({'gate': 'T4', 'outcome': 'FAIL'}))
            with self.assertRaises(ValueError):
                population.build(directory)
            session.assert_not_called()


if __name__ == '__main__':
    unittest.main()
