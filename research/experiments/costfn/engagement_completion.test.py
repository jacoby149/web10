"""Four closed harness defects: real wrapper composition, no engine/cloud work."""
import ast
import contextvars
from functools import wraps
import inspect
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import uuid

import sqlglot
from sqlglot import exp

from arm_f_client import query_kwargs
import engagement_certificates as certificates
import engagement_completion as completion
import engagement_events as events
import engagement_native as native
import engagement_observe as observe
import engagement_queries as queries
import engagement_modern as modern
import arm_satellite_counts as counts


def function(file, name, namespace):
    node = next(node for node in ast.parse(Path(__file__).with_name(file).read_text()).body
        if isinstance(node, ast.FunctionDef) and node.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), file, 'exec'), namespace)
    return namespace[name]


class CompletionTests(unittest.TestCase):
    def test_cli_generation_encoding_matches_actual_f_and_p_driver_generation(self):
        parts = [dict(table='documents', name='all_1', rows=88_200_363, data_version=1)]
        session = modern.Session.__new__(modern.Session)
        session.query = lambda *args, **kwargs: (json.dumps({'data': parts}), 'metadata-id')
        expected, encoded = counts.generation(session)
        p = SimpleNamespace(run=lambda _: [dict(row) for row in parts])
        actual = function('arm_f_api.py', 'generation', dict(p=p, hashlib=hashlib, json=json))()
        self.assertEqual(expected, actual)
        parent = function('arm_satellite_api.py', 'generation', dict(run=p.run, counts={'canonical_generation': expected},
            stop=lambda reason: self.fail(reason), hashlib=hashlib, json=json))
        parent()
        self.assertEqual(encoded[0]['rows'], '88200363')
        self.assertNotEqual(expected, hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest())

    def test_baseline_stop_never_adds_projection_or_runs_any_later_cell(self):
        calls = []
        class Actions:
            def stage(self, name, results):
                calls.append(name)
                if name == 'A-baseline':
                    raise ValueError('untreated login failed')
                return {}
            def checkpoint(self, *args):
                pass
        with tempfile.TemporaryDirectory() as directory:
            result = completion.programme(Actions(), Path(directory) / 'run')
        self.assertNotIn('A-projection', calls)
        self.assertEqual(result['A-projection']['blocked_by'], ['A-baseline'])
        self.assertNotIn('B-diagnostic', calls)
        self.assertNotIn('D-fat', calls)

    def test_treated_failure_keeps_independent_migrated_cells_and_real_decomposition(self):
        calls = []
        class Actions:
            def stage(self, name, results):
                calls.append(name)
                if name == 'A-treated':
                    raise ValueError('10M actual treated gate')
                return {}
            def checkpoint(self, *args):
                pass
        with tempfile.TemporaryDirectory() as directory:
            result = completion.programme(Actions(), Path(directory) / 'run')
        self.assertEqual(result['C-complete']['outcome'], 'PASS')
        self.assertIn('A-decomposition', calls)
        self.assertLess(calls.index('A-baseline'), calls.index('A-projection'))
        self.assertLess(calls.index('A-certified'), calls.index('A-treated'))

    def test_http_settings_stay_keyword_through_real_f_engagement_p_observer_wrappers(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        import arm_satellite_serve as serve
        seen = []
        current = contextvars.ContextVar('completion-binding-test', default={'request_id': 'a' * 32, 'engagement_mode': 'uniform'})
        observer = SimpleNamespace(current=current)
        def driver(query=None, parameters=None, settings=None):
            self.assertEqual(settings['max_execution_time'], 10)
            self.assertEqual(settings['max_rows_to_read'], 10_000_000)
            self.assertEqual(settings['retained_option'], 7)
            return SimpleNamespace(query_id='native', result_rows=[('post', 1, 1)], summary={'read_rows': 1, 'read_bytes': 8})
        signature = inspect.signature(driver)
        def watched(name, target):
            @wraps(target)
            def call(*args, **kwargs):
                self.assertLess(len(args), 3, name + ' passed settings positionally')
                self.assertIn('settings', kwargs, name)
                seen.append(name)
                return target(*args, **kwargs)
            return call
        with tempfile.TemporaryDirectory() as directory:
            observed = observe.install(watched('driver', driver), observer, directory)
            views = contextvars.ContextVar('completion-views-test', default=False)
            inventory = contextvars.ContextVar('completion-inventory-test', default=False)
            p = SimpleNamespace(_signature=signature, observer=observer, _views=views, _inventory=inventory)
            parent_query = function('arm_satellite_api.py', 'query', dict(admitted=lambda *args: None,
                operation={}, host=1, observer=observer, _signature=signature, _query=watched('observer', observed),
                _views=views, _inventory=inventory, serve=serve, sqlglot=sqlglot, exp=exp))
            parent_query = watched('parent', parent_query)
            checked = function('arm_f_api.py', 'checked_query', dict(query_kwargs=query_kwargs, p=p, original_query=parent_query))
            checked = watched('F-checked', checked)
            engagement = function('engagement_api.py', 'checked_query', dict(p=p, MODE='uniform', uniform=True,
                copy_fence=lambda _: None, table='engagement_documents', sqlglot=sqlglot, exp=exp, events=events,
                aggregate_views=False, f=SimpleNamespace(original_query=parent_query), old_checked=checked))
            ingress = function('arm_f_api.py', 'query', dict(query_kwargs=query_kwargs, p=p, uuid=uuid,
                checked_query=watched('engagement', engagement)))
            app = FastAPI()
            @app.post('/query')
            def endpoint(body: dict):
                token = views.set(body.get('views', False))
                try:
                    result = ingress(body['sql'], parameters=body['parameters'],
                        settings={'max_execution_time': 999, 'retained_option': 7})
                    return {'rows': result.result_rows}
                finally:
                    views.reset(token)
            with TestClient(app) as http:
                for kind in ('main', 'reactions', 'comments'):
                    response = http.post('/query', json={'sql': 'SELECT doc_id FROM documents WHERE doc_id=%(d0)s',
                        'parameters': {'d0': kind}})
                    self.assertEqual(response.status_code, 200, response.text)
                response = http.post('/query', json={'views': True, 'sql': 'SELECT 1',
                    'parameters': {'svc': 'posts', 'd0': 'post', 'g0': 'allowed'}})
                self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(set(seen), {'driver', 'observer', 'parent', 'F-checked', 'engagement'})

    def test_native_client_timeout_is_observed_until_original_queryfinish_without_repeat(self):
        for code in (0, 159):
            with self.subTest(client_returncode=code), tempfile.TemporaryDirectory() as directory:
                process = Mock(returncode=code)
                process.poll.return_value = code
                row = dict(query_id='fanout-f-original', type='QueryFinish', exception_code=0)
                responses = [b'', b'{"data":[]}', b'', json.dumps({'data': [row]}).encode()]
                session = SimpleNamespace(root=Path(directory), compose=['docker', 'compose'], env={})
                with patch.object(native.subprocess, 'Popen', return_value=process) as spawn, \
                        patch.object(native.restore, 'command', side_effect=responses), patch.object(native.time, 'sleep'):
                    native.await_query(session, ['client'], 'fanout-f-original', 1200,
                        sql='ALTER TABLE documents MATERIALIZE PROJECTION ref_sorted', statement_kind='write')
                self.assertEqual(spawn.call_count, 1)
                receipt = json.loads((Path(directory) / 'native-operations/fanout-f-original/receipt.json').read_bytes())
                self.assertEqual(receipt['outcome'], 'NATIVE_FINISH')
                self.assertEqual(receipt['client']['returncode'], code)

    def test_native_exception_not_successful_client_exit_decides_setup_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            process = Mock(returncode=0)
            process.poll.return_value = 0
            terminal = {'data': [dict(type='ExceptionWhileProcessing', exception_code=241)]}
            session = SimpleNamespace(root=Path(directory), compose=['docker'], env={})
            with patch.object(native.subprocess, 'Popen', return_value=process) as spawn, \
                    patch.object(native.restore, 'command', side_effect=[b'', json.dumps(terminal).encode()]):
                with self.assertRaisesRegex(ValueError, 'stopped natively'):
                    native.await_query(session, ['client'], 'fanout-f-failed', 1200,
                        sql='INSERT INTO copy SELECT 1', statement_kind='write')
            self.assertEqual(spawn.call_count, 1)

    def test_projection_bytes_allow_physical_rename_but_deny_base_column_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            volume = Path(directory)
            part = volume / 'store/part'
            part.mkdir(parents=True)
            (part / 'columns.txt').write_text('body String')
            (part / 'body.bin').write_bytes(b'canonical')
            before = certificates.content_files([{'table': 'documents', 'path': '/var/lib/clickhouse/store/part'}], volume)
            (part / 'ref_sorted.proj').mkdir()
            (part / 'ref_sorted.proj/data.bin').write_bytes(b'new projection')
            (part / 'checksums.txt').write_text('changed mutation metadata')
            renamed = volume / 'store/part_mutation'
            part.rename(renamed)
            after = certificates.content_files([{'table': 'documents', 'path': '/var/lib/clickhouse/store/part_mutation'}], volume)
            self.assertEqual(before, after)
            (renamed / 'body.bin').write_bytes(b'changed authority')
            self.assertNotEqual(before, certificates.content_files(
                [{'table': 'documents', 'path': '/var/lib/clickhouse/store/part_mutation'}], volume))

    def test_rebinding_refreshes_every_receipt_hash_without_rekeying_or_counter_builds(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in certificates.receipt_paths(root).values():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(dict(canonical_generation='old', droplet_id=1, scopes=[{'scope_key': 'unchanged'}])))
            certificates.bind(root, SimpleNamespace(host_id=2), 'new', {'proof': 'identical base data'})
            paths = certificates.receipt_paths(root)
            metadata, parity = (json.loads(paths[name].read_bytes()) for name in ('metadata', 'parity'))
            self.assertEqual(metadata['count_receipt_sha256'], certificates.digest(paths['counts-ordinary']))
            self.assertEqual(parity['metadata_sha256'], certificates.digest(paths['metadata']))
            for path in paths.values():
                value = json.loads(path.read_bytes())
                self.assertEqual(value['scopes'][0]['scope_key'], 'unchanged')
                self.assertEqual(value['canonical_generation'], 'new')
            with patch.object(certificates.modern, 'Session', return_value=SimpleNamespace(host_id=2)), \
                    patch.object(certificates.counts, 'generation', return_value=('new', [])):
                certificates.verify(root)
                paths['fanout'].write_text(paths['fanout'].read_text() + ' ')
                with self.assertRaisesRegex(ValueError, 'certificate disagrees'):
                    certificates.verify(root)

    def test_mixed_decomposition_is_actual_standalone_aggregate_not_the_whole_main_query(self):
        sql = ("WITH reactions AS (SELECT ref_value,body FROM documents) SELECT p.doc_id,r.n FROM posts p LEFT JOIN "
            "(SELECT ref_value,count() AS n FROM (SELECT * FROM reactions WHERE ref_value IN ('post')) GROUP BY ref_value) r ON r.ref_value=p.doc_id")
        result = queries.mixed_components(sql)
        self.assertEqual(len(result['components']), 1)
        component = result['components'][0]
        self.assertIn('WITH reactions AS', component)
        self.assertNotIn('LEFT JOIN', component)
        self.assertFalse(result['additive'])


if __name__ == '__main__':
    unittest.main()
