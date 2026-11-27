"""Modern programme/read composition controls. No engine, cloud or API import."""
from datetime import UTC, datetime, timedelta
import ast
from concurrent.futures import ThreadPoolExecutor
import inspect
import json
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import sqlglot
from sqlglot import exp

import engagement_modern as modern
import engagement_programme as programme
import engagement_queries as queries
import core_feed
import arm_f
import engagement_events as events
import engagement_observe

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
from app.v3.services.safe_query import build_safe_query  # noqa: E402


class ModernTests(unittest.TestCase):
    def function(self, file, name, namespace):
        if (file, name) == ('engagement_api.py', 'checked_query'):
            self.function(file, 'use_uniform_copy', namespace)
            self.function(file, 'uniform_sql', namespace)
        node = next(node for node in ast.parse(Path(__file__).with_name(file).read_text()).body
            if isinstance(node, ast.FunctionDef) and node.name == name)
        exec(compile(ast.Module(body=[node], type_ignores=[]), file, 'exec'), namespace)
        return namespace[name]

    def approval(self):
        now = datetime.now(UTC)
        return dict(configuration='F', approved_by='Jacob', dataset_id=modern.arm_t.DATASET,
            droplet_id=123, budget_usd=2, cleanup_model='agent-supervised-self-kill', host_self_kill_verified=True,
            cutoff=2000, T7_admitted=False, sort_order_arm_admitted=False, approved_utc=now.isoformat(),
            deadline_utc=(now + timedelta(hours=4)).isoformat(), engagement_engine=modern.ENGINE,
            engagement_directive=modern.DIRECTIVE, purpose='ENGAGEMENT_FULL_STORE_A_D', engagement_ref_admitted=True)

    def test_setup_memory_cap_takes_the_declared_dau_envelope_else_the_banked_frame(self):
        self.assertEqual(modern.setup_memory_cap({}), 22 * 1024**3)
        self.assertEqual(modern.setup_memory_cap({'dau_envelope': dict(server_bytes=85899345920)}),
            85899345920)
        for bad in ({'dau_envelope': dict(server_bytes='80g')},
                    {'dau_envelope': dict(server_bytes=0)},
                    {'dau_envelope': '80g'}):
            with self.subTest(bad=bad):
                self.assertEqual(modern.setup_memory_cap(bad), 22 * 1024**3)

    def test_modern_engine_requires_its_own_exact_directive_and_does_not_expand_historical_admission(self):
        value = self.approval()
        modern.admitted(value, 123)
        for change in ({'engagement_engine': 'latest'}, {'engagement_directive': 'old'}, {'budget_usd': 20},
                       {'host_self_kill_verified': False}, {'droplet_id': 124}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                modern.admitted({**value, **change}, 123)

    def test_real_captured_client_queries_adopt_root_refs_without_changing_output_contract(self):
        capture = core_feed.wire()
        migrated = queries.capture(capture, True)
        self.assertIn('post_id', capture['requests'][2]['payload']['sql'])
        comments = migrated['requests'][2]['payload']['sql']
        self.assertIn('ref_value AS post_id', comments)
        self.assertNotIn('JSONExtractString', comments)
        self.assertIn("JSONExtractString(body, 'target_id') = ''", migrated['requests'][1]['payload']['sql'])
        self.assertEqual(migrated['requests'][3], capture['requests'][3])

    def compile(self, sql):
        return build_safe_query(sql, {name: ['allowed'] for name in ('posts', 'profile', 'comments', 'reactions')},
            member_key='reader', allowed_services=frozenset(('posts', 'profile', 'comments', 'reactions')))

    def assert_scoped_links(self, sql):
        tree = sqlglot.parse_one(sql, read='clickhouse')
        links = [table for table in tree.find_all(exp.Table) if table.name == 'doc_groups']
        self.assertTrue(links)
        for link in links:
            self.assertIn('doc_id IN', link.find_ancestor(exp.Select).sql(dialect='clickhouse'))
        self.assertIn('deleted DESC', sql)

    def test_actual_main_compiler_and_treatment_composition_never_falls_back_to_cached_counters(self):
        source = queries.migrate_sql(arm_f.document_contract(core_feed.wire()['requests'][0]['payload']['sql']))
        compiled = self.compile(source)
        sql = queries.main(compiled, [dict(author_key='alice', doc_id='post', group_id='allowed')],
            [('alice', 'profile')], 'a' * 64, uniform=True, table='engagement_documents')
        self.assertNotIn('counting_numbers', sql)
        self.assertIn('engagement_documents', sql)
        self.assertIn("JSONExtractString(body, 'target_id') = ''", sql)
        self.assert_scoped_links(sql)
        self.assertIn('user_blacklist', sql)
        self.assertIn('group_hidden_docs', sql)

    def test_actual_followup_compilation_scopes_attachments_before_history_and_retains_alias(self):
        query = queries.migrate_sql("SELECT JSONExtractString(body,'post_id') AS post_id,count() AS comment_count FROM comments WHERE JSONExtractString(body,'post_id') IN ('post') GROUP BY post_id")
        result = queries.followup(self.compile(query), 'comments', uniform=True, table='engagement_documents')
        self.assert_scoped_links(result)
        self.assertIn('ref_value AS post_id', result)
        self.assertNotIn('counting_numbers', result)

    def test_old_semantics_comments_do_not_pretend_ref_points_at_the_root_before_migration(self):
        boundary = 'SELECT * FROM documents WHERE collection_name=\'comments\''
        old = queries.scoped(boundary, ['post'], 'comments', uniform=False, table='documents')
        new = queries.scoped(boundary, ['post'], 'comments', uniform=True, table='engagement_documents')
        self.assertIn("JSONExtractString(body, 'post_id')", old)
        self.assertNotIn('post_id', new)

    def test_a_cost_stop_does_not_silently_skip_independent_views_or_hot_cells(self):
        called = []
        class Actions:
            def stage(self, stage, results):
                called.append(stage)
                if stage == 'A-treated':
                    raise ValueError('native10M stop')
                return {'receipt': stage}
            def checkpoint(self, stage, result):
                pass
        with tempfile.TemporaryDirectory() as directory:
            result = programme.run(Actions(), Path(directory) / 'run')
        self.assertEqual(result['A-treated']['outcome'], 'STOP')
        for stage in ('B-diagnostic', 'B-aggregate', 'C-migration', 'D-fat'):
            self.assertIn(stage, called)
        self.assertEqual(called, list(programme.ORDER))

    def test_invalid_migration_blocks_only_dependent_reads(self):
        class Actions:
            def stage(self, stage, results):
                if stage == 'C-migration':
                    raise ValueError('parity mismatch')
                return {}
            def checkpoint(self, stage, result):
                pass
        with tempfile.TemporaryDirectory() as directory:
            result = programme.run(Actions(), Path(directory) / 'run')
        self.assertEqual(result['C-complete']['outcome'], 'BLOCKED')
        self.assertEqual(result['C-paired']['outcome'], 'BLOCKED')
        self.assertEqual(result['D-fat']['outcome'], 'PASS')

    def test_three_columns_and_mixed_component_diagnostics_do_not_invent_attribution(self):
        self.assertEqual(set(programme.table({'views': 1}, {'views': 2}, {'views': 3})['views']),
            {'history_24_8_PR1578', 'baseline_26_x', 'treated_26_x'})
        value = queries.mixed_components("SELECT p.doc_id,c.n FROM documents p LEFT JOIN (SELECT doc_id,sum(value) AS n FROM counting_numbers_p2 GROUP BY doc_id) c ON c.doc_id=p.doc_id")
        self.assertFalse(value['additive'])
        self.assertEqual(len(value['components']), 1)
        self.assertIn('counting_numbers_p2', value['components'][0])

    def test_actual_view_query_hook_routes_raw_and_aggregate_with_the_same_bound_authority(self):
        def signature(query=None, parameters=None, settings=None):
            pass
        current = {'request_id': 'a' * 32}
        calls = []
        def execute(*args, **kwargs):
            calls.append(inspect.signature(signature).bind_partial(*args, **kwargs).arguments)
            return SimpleNamespace(result_rows=[('post', 4, 3)], query_id='actual-id')
        p = SimpleNamespace(observer=SimpleNamespace(current=SimpleNamespace(get=lambda: current)),
            _signature=inspect.signature(signature), _views=SimpleNamespace(get=lambda: True))
        scope = dict(p=p, f=SimpleNamespace(original_query=execute), MODE='aggregate', copy_fence=lambda current: None,
            events=events, aggregate_views=True, uniform=False, old_checked=lambda *a, **k: self.fail('raw fallback'))
        hook = self.function('engagement_api.py', 'checked_query', scope)
        params = {'d0': 'post', 'g0': 'allowed', 'svc': 'posts'}
        hook('SELECT ignored', parameters=params)
        self.assertIn('content_events_aggregated', calls[-1]['query'])
        self.assertEqual(calls[-1]['parameters'], params)
        scope['aggregate_views'] = False
        hook('SELECT ignored', parameters=params)
        self.assertNotIn('content_events_aggregated', calls[-1]['query'])
        self.assertIn('FROM content_events ', calls[-1]['query'])
        self.assertIn('ORDER BY updated_at DESC,deleted DESC', calls[-1]['query'])
        self.assertEqual(current['fanout_view_checks'][-1]['values'], [['post', 4, 3]])

    def test_actual_uniform_query_hook_uses_driver_binding_and_migrated_canonical_table(self):
        def signature(query=None, parameters=None, settings=None):
            pass
        calls = []
        p = SimpleNamespace(observer=SimpleNamespace(current=SimpleNamespace(get=lambda: {'request_id': 'b' * 32})),
            _signature=inspect.signature(signature), _views=SimpleNamespace(get=lambda: False),
            _inventory=SimpleNamespace(get=lambda: False))
        scope = dict(p=p, MODE='uniform', uniform=True, table='engagement_documents', copy_fence=lambda current: None,
            sqlglot=sqlglot, exp=exp, old_checked=lambda *args, **kwargs: calls.append(inspect.signature(signature).bind_partial(*args, **kwargs).arguments))
        hook = self.function('engagement_api.py', 'checked_query', scope)
        hook('SELECT * FROM documents WHERE author_key=%(who)s LIMIT %(n)s', parameters={'who': "a'b", 'n': 5})
        self.assertIn('engagement_documents', calls[0]['query'])
        self.assertIn('LIMIT 5', calls[0]['query'])
        self.assertIsNone(calls[0]['parameters'])
        scope['use_uniform_copy'] = lambda: False
        hook('SELECT * FROM documents')
        self.assertEqual(calls[1]['query'], 'SELECT * FROM documents')

    def test_query_observer_keeps_native_caps_and_concurrent_identical_sql_receipts(self):
        current = {'request_id': 'c' * 32}
        observer = SimpleNamespace(current=SimpleNamespace(get=lambda: current))
        settings_seen = []
        def execute(sql, **kwargs):
            settings_seen.append(kwargs['settings'])
            return SimpleNamespace(query_id='id-' + str(len(settings_seen)))
        with tempfile.TemporaryDirectory() as directory:
            query = engagement_observe.install(execute, observer, directory)
            with ThreadPoolExecutor(max_workers=6) as pool:
                list(pool.map(lambda _: query('SELECT username FROM users WHERE username=%(u)s', parameters={'u': 'alice'},
                    settings={'max_execution_time': 999}), range(6)))
            records = [json.loads(line) for line in (Path(directory) / ('c' * 32 + '.jsonl')).read_text().splitlines()]
            self.assertEqual(len(records), 6)
            self.assertEqual(len(list(Path(directory).glob('*.sql'))), 1)
        self.assertTrue(all(row['max_execution_time'] == 10 and row['max_rows_to_read'] == 10_000_000
            and row['max_memory_usage'] == 22 * 1024**3 for row in settings_seen))

    def test_hot_composition_keeps_the_fixed_thread_and_calibrates_remaining_rows(self):
        from engagement_hot import composition
        plan = composition(1_600_000_000, 80_000_000)
        self.assertEqual(plan['comments'], 50000)
        self.assertEqual(plan['views'] + plan['comments'] + plan['reactions'], 400000)
        self.assertEqual(plan['post_reactions'] + plan['comment_reactions'], plan['reactions'])
        self.assertGreater(plan['comment_reactions'], 0)
        self.assertLessEqual(plan['post_reactions'], plan['actors'])

    def test_bundle_reuses_syntax_but_rechecks_current_tally_scope(self):
        current = {'request_id': 'c' * 32, 'engagement_mode': 'uniform', 'engagement_tally_verified': True,
                   'engagement_tally_scopes': ['allowed']}
        observer = SimpleNamespace(current=SimpleNamespace(get=lambda: current))
        statement = ("SELECT * FROM counting_numbers_tally WHERE scope_key IN ('allowed') "
                     "AND doc_id IN ('post') AND counter_name IN ('like')")
        seen = []
        def execute(sql, **kwargs):
            seen.append(sql)
            return SimpleNamespace(query_id='one')
        with (tempfile.TemporaryDirectory() as directory,
              patch.dict('os.environ', {'DAU_BUNDLE_ACTIVE': '1'}),
              patch.object(engagement_observe, 'parse_sql', wraps=engagement_observe.parse_sql) as parse):
            send = engagement_observe.install(execute, observer, directory)
            send(statement)
            current['engagement_tally_scopes'] = ['different']
            with self.assertRaisesRegex(ValueError, 'unbound tally scope'):
                send(statement)
            self.assertEqual(parse.call_count, 1)
        self.assertEqual(seen, [statement])

    def test_query_observer_accepts_driver_settings_moved_to_positional_by_binding(self):
        current = {'request_id': 'd' * 32}
        observer = SimpleNamespace(current=SimpleNamespace(get=lambda: current))
        seen = []
        def execute(query=None, parameters=None, settings=None):
            seen.append((query, parameters, settings))
            return SimpleNamespace(query_id='bound-driver')
        with tempfile.TemporaryDirectory() as directory:
            wrapped = engagement_observe.install(execute, observer, directory)
            bound = inspect.signature(execute).bind_partial('SELECT %(x)s', parameters={'x': 1},
                settings={'max_execution_time': 999, 'custom': 2})
            wrapped(*bound.args, **bound.kwargs)
        self.assertEqual(seen[0][:2], ('SELECT %(x)s', {'x': 1}))
        self.assertEqual(seen[0][2]['max_execution_time'], 10)
        self.assertEqual(seen[0][2]['custom'], 2)
        self.assertEqual(seen[0][2]['log_comment'], 'F_READ:' + 'd' * 32)

    def test_setup_transport_outlives_native_budget_without_raising_measured_deadline(self):
        session = modern.Session.__new__(modern.Session)
        session.operation, session.host_id = self.approval(), 123
        session.compose, session.env = ['docker', 'compose'], {}
        session.record = lambda value: None
        for measured, budget in ((False, 1200), (True, 10)):
            with patch.object(modern.restore, 'command', return_value=b'ok') as command:
                session.query('transport-control', 'SELECT 1', measured=measured, setup_seconds=1200)
            args = command.call_args.args
            self.assertEqual(args[args.index('--max_execution_time') + 1], str(budget))
            self.assertEqual(args[args.index('--receive_timeout') + 1], str(budget + 10))
            self.assertEqual(command.call_args.kwargs['timeout'], budget + 20)

    def test_same_lease_continuation_preserves_stops_and_never_reseeds(self):
        import engagement_continue as continuation
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'original'
            root.mkdir()
            (root / 'programme26').mkdir()
            original = json.dumps({'stages': {name: {'outcome': 'STOP'} for name in ('B-aggregate', 'D-fat')}})
            (root / 'programme26/summary.json').write_text(original)
            for name in ('ordinary', 'fixture'):
                folder = root / ('reference-' + name)
                folder.mkdir()
                (folder / 'expected.json').write_text('{}')
            (root / 'hot-fixture').mkdir()
            (root / 'hot-fixture/seeded.json').write_text('{}')
            session = SimpleNamespace(native=lambda _: {'exception_code': 0}, query=lambda *args: None)
            actions = SimpleNamespace(approval=self.approval(), expected={}, aggregate_ready=False,
                views=lambda *args: (_ for _ in ()).throw(ValueError('independent aggregate STOP')),
                migrate=lambda: (_ for _ in ()).throw(ValueError('migration STOP')))
            with patch.object(continuation.modern, 'install_sessions'), patch.object(continuation.modern, 'Session', return_value=session), \
                    patch.object(continuation.full, 'Actions', return_value=actions), \
                    patch.object(continuation.engagement_projection, 'coverage', return_value={'source_rows': 2, 'projection_rows': 2}), \
                    patch.object(continuation.engagement_hot_read, 'run', return_value=[]) as hot, \
                    patch.object(continuation.full.cells, 'stop'):
                result = continuation.run(root, Path(directory) / 'continuation')
            self.assertEqual(result['stages']['B-aggregate']['outcome'], 'STOP')
            self.assertEqual(result['stages']['D-fat']['outcome'], 'PASS')
            self.assertEqual(result['stages']['C-migration']['outcome'], 'STOP')
            self.assertFalse(result['reseeded'])
            self.assertEqual((root / 'programme26/summary.json').read_text(), original)
            self.assertEqual(hot.call_args.kwargs['name'], 'D-hot-continuation')

    def test_uniform_rewrite_composes_with_actual_f_keyword_settings_tag(self):
        def driver(query=None, parameters=None, settings=None):
            return (query, parameters, settings)
        def old_checked(sql, *args, **kwargs):
            kwargs['settings'] = {**kwargs.get('settings', {}), 'log_comment': 'F_READ:control'}
            return driver(sql, *args, **kwargs)
        p = SimpleNamespace(observer=SimpleNamespace(current=SimpleNamespace(get=lambda: {'request_id': 'e' * 32})),
            _signature=inspect.signature(driver), _views=SimpleNamespace(get=lambda: False),
            _inventory=SimpleNamespace(get=lambda: False))
        check = self.function('engagement_api.py', 'checked_query', dict(p=p, uniform=True,
            MODE='uniform', copy_fence=lambda _: None, table='engagement_documents',
            sqlglot=sqlglot, exp=exp, old_checked=old_checked))
        sql, params, settings = check('SELECT * FROM documents WHERE doc_id=%(id)s',
            parameters={'id': 'post'}, settings={'max_execution_time': 10})
        self.assertIn('engagement_documents', sql)
        self.assertIsNone(params)
        self.assertEqual(settings, {'max_execution_time': 10, 'log_comment': 'F_READ:control'})

    def test_infrastructure_failure_does_not_block_independent_diagnostic_migration_or_hot_cell(self):
        class Actions:
            def stage(self, stage, results):
                if stage == 'infrastructure':
                    raise ValueError('counter build stopped')
                return {}
            def checkpoint(self, stage, result):
                pass
        with tempfile.TemporaryDirectory() as directory:
            result = programme.run(Actions(), Path(directory) / 'run')
        self.assertEqual(result['A-baseline']['outcome'], 'BLOCKED')
        for stage in ('B-diagnostic', 'C-migration', 'D-fat'):
            self.assertEqual(result[stage]['outcome'], 'PASS')

    def test_projection_default_mode_is_probed_before_any_rebuild_override(self):
        import engagement_projection as projection
        class Session:
            def __init__(self, refuse=False):
                self.calls, self.refuse = [], refuse
            def query(self, label, sql, **kwargs):
                self.calls.append((label, sql))
                if 'default_probe' in label and self.refuse:
                    error = RuntimeError('default-mode denial')
                    error.stderr = b'code344 deduplicate_merge_projection_mode'
                    raise error
                return ('CREATE TABLE documents (doc_id String)', 'native-id')
        for refuse in (False, True):
            session = Session(refuse)
            with tempfile.TemporaryDirectory() as directory, patch.object(projection, 'coverage', return_value={'source_rows': 2, 'projection_rows': 2}):
                value = projection.install(session, 'documents', Path(directory))
                self.assertEqual((Path(directory) / 'projection-default-stop-documents.json').exists(), refuse)
            labels = [label for label, _ in session.calls]
            self.assertEqual(value['forced_rebuild_mode'], refuse)
            self.assertEqual('projection_explicit_rebuild_documents' in labels, refuse)
            if refuse:
                self.assertLess(labels.index('projection_default_probe_documents'), labels.index('projection_explicit_rebuild_documents'))

    def test_projection_coverage_requires_rows_and_every_parent_part(self):
        from engagement_projection import coverage
        class Session:
            def rows(self, label, sql):
                if label.startswith('projection_names'):
                    return [{'name': 'ref_sorted'}], 'id'
                return [self.value], 'id'
        session = Session()
        session.value = dict(source_rows=10, projection_rows=10, source_parts=2, covered_parts=2)
        self.assertEqual(coverage(session, 'documents')['projection_rows'], 10)
        for key in ('projection_rows', 'covered_parts'):
            session.value[key] -= 1
            with self.assertRaises(ValueError):
                coverage(session, 'documents')
            session.value[key] += 1

    def test_snapshot_failure_is_retained_before_clean_parquet_fallback(self):
        import engagement_restore as restored
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text(json.dumps({'restored_snapshot_id': restored.SNAPSHOT}))
            def fail_snapshot(root):
                raise ValueError('26.x snapshot boot failed')
            def parquet(*args, **kwargs):
                self.assertEqual(kwargs['engine'], modern.ENGINE)
                self.assertTrue((root / 'snapshot-restore-stop.json').exists())
            with patch.object(restored.modern, 'operation'), patch.object(restored, 'snapshot', fail_snapshot), \
                    patch.object(restored, 'download') as download, patch.object(restored.restore, 'restore', parquet), \
                    patch.object(restored.modern, 'Session', return_value=SimpleNamespace(verify_envelope=lambda: {'engine': modern.ENGINE})):
                value = restored.run(root)
            download.assert_called_once_with(root)
            self.assertEqual(value['source'], 'ARCHIVED_PARQUET')
            self.assertTrue(value['snapshot_failure_preserved'])

    def snapshot_input_layout(self, layout):
        """Exercise real snapshot() path handling; mock only external engine/validation seams."""
        import engagement_restore as restored
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            snapshot_root = base / 'snapshot/trials/rf0'
            snapshot_root.mkdir(parents=True)
            source = base / 'snapshot/input'
            source.mkdir()
            (source / 'validation.json').write_text('{}')
            (source / 'frozen-input').write_bytes(b'independent frozen fixture')
            (snapshot_root / 'input').symlink_to(source, target_is_directory=True)
            overlay = base / 'original-overlay.json'
            overlay.write_text(json.dumps({'services': {'clickhouse': {'image': 'old'}}}))
            (snapshot_root / 'restore.json').write_text(json.dumps({'overlay': str(overlay)}))
            (snapshot_root / 'fixture.json').write_text(json.dumps({'fixture': 'banked'}))
            root = base / ('snapshot' if layout == 'self-resident' else 'run')
            root.mkdir(exist_ok=True)
            (root / 'evidence').mkdir()  # Normally created by the real Session.
            run_input = root / 'input'
            if layout == 'foreign-directory':
                run_input.mkdir()
                (run_input / 'keep').write_bytes(b'never overwrite')
            elif layout == 'foreign-dangling-link':
                run_input.symlink_to(base / 'missing')
            elif layout == 'same-source-link':
                run_input.symlink_to(source, target_is_directory=True)
            foreign = layout.startswith('foreign-')
            def verified(path, validation, dataset, digest):
                self.assertEqual(path, source.resolve())
                self.assertEqual(validation, source / 'validation.json')
                self.assertEqual((dataset, digest), (restored.arm_t.DATASET, restored.arm_t.VALIDATION))
                self.assertEqual((path / 'frozen-input').read_bytes(), b'independent frozen fixture')
            def rows(label, sql):
                return ([{'documents': 88_200_363, 'events': 1_600_000_000}] if label == 'snapshot_canonical_counts'
                    else [{'n': 0}]), 'native-mock'
            session = SimpleNamespace(compose=[], env={}, rows=rows, verify_envelope=lambda: {'engine': modern.ENGINE})
            with patch.object(restored, 'SNAPSHOT_ROOT', snapshot_root), \
                    patch.object(restored, 'RESTORE_SHA', restored.sha(snapshot_root / 'restore.json')), \
                    patch.object(restored, 'FIXTURE_SHA', restored.sha(snapshot_root / 'fixture.json')), \
                    patch.object(restored, 'stop_snapshot_processes'), \
                    patch.object(restored.modern, 'Session', return_value=session), \
                    patch.object(restored.restore, 'command'), patch.object(restored.restore_dataset, 'wait_for'), \
                    patch.object(restored.restore, 'verified_input', side_effect=verified) as check:
                if foreign:
                    with self.assertRaisesRegex(FileExistsError, 'existing run input differs'):
                        restored.snapshot(root)
                    self.assertFalse((root / 'evidence/archive.json').exists())
                else:
                    value = restored.snapshot(root)
                    self.assertEqual(value['source'], 'PREPARED_PROVIDER_SNAPSHOT')
                    self.assertTrue((root / 'evidence/archive.json').is_file())
                check.assert_called_once()
            self.assertEqual((source / 'frozen-input').read_bytes(), b'independent frozen fixture')
            if layout == 'self-resident':
                self.assertTrue(run_input.is_dir())
                self.assertFalse(run_input.is_symlink())
            elif layout == 'foreign-directory':
                self.assertEqual((run_input / 'keep').read_bytes(), b'never overwrite')
                self.assertFalse(run_input.is_symlink())
            elif layout == 'foreign-dangling-link':
                self.assertEqual(run_input.readlink(), base / 'missing')
            else:
                self.assertTrue(run_input.is_symlink())
                self.assertEqual(run_input.resolve(), source.resolve())

    def test_snapshot_self_resident_verified_input_proceeds_without_self_link(self):
        self.snapshot_input_layout('self-resident')
        self.snapshot_input_layout('same-source-link')

    def test_snapshot_foreign_existing_input_refuses_without_mutation(self):
        self.snapshot_input_layout('foreign-directory')
        self.snapshot_input_layout('foreign-dangling-link')

    def test_snapshot_new_run_root_still_links_verified_input(self):
        self.snapshot_input_layout('new-root')

    def test_uniform_guard_denies_known_group_only_link_selector_before_native_dispatch(self):
        current = {'engagement_mode': 'uniform'}
        for sql in ('SELECT * FROM counting_numbers_p2',
                "/* ENGAGEMENT_DOC_COUNTS */ SELECT * FROM doc_groups WHERE group_id IN ('allowed')"):
            with self.assertRaises(ValueError):
                engagement_observe.uniform_guard(sql, current)
        with self.assertRaisesRegex(ValueError, 'deletion-winning'):
            engagement_observe.uniform_guard("/* ENGAGEMENT_DOC_COUNTS */ SELECT * FROM doc_groups WHERE doc_id IN ('post')", current)
        sql = queries.followup(self.compile("SELECT ref_value,count() FROM reactions WHERE ref_value IN ('post') GROUP BY ref_value"),
            'reactions', uniform=True, table='engagement_documents')
        self.assertTrue(engagement_observe.uniform_guard(sql, current)['deletion_wins_timestamp_ties'])

    def test_hot_reactions_compute_every_comment_target_not_only_a_page_total(self):
        from engagement_hot_read import reaction_sql, expected_reactions
        sql = reaction_sql('post')
        compiled = self.compile(sql)
        self.assertIn('GROUP BY target_id', compiled)
        self.assertIn('groupArray', compiled)
        plan = dict(post_id='post', post_reactions=5, comment_reactions=50001)
        values = expected_reactions(plan)
        self.assertEqual(values[''], 5)
        self.assertEqual(len(values), 50001)
        self.assertEqual(sum(values.values()), 50006)
        self.assertEqual(max(n for target, n in values.items() if target), 2)


if __name__ == '__main__':
    unittest.main()
