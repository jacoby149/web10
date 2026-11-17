"""No-engine F adapter seam controls. Mocked dependencies, NOT native auth proof."""
import contextvars
import asyncio
from datetime import UTC, datetime, timedelta
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException
import sqlglot

import arm_f as f
import arm_f_hooks
import arm_t

# Load lazy dialect registration outside sys.modules patching; otherwise the
# test's module-cache restoration can remove half a lazily imported dialect.
sqlglot.parse_one('SELECT 1', read='clickhouse')


class AdapterTests(unittest.TestCase):
    def load(self, directory):
        root = Path(directory)
        start = datetime.now(UTC) - timedelta(seconds=30)
        admission = dict(configuration='F', approved_by='Jacob', droplet_id=123, budget_usd=2,
            dataset_id=arm_t.DATASET, approved_utc=start.isoformat(), deadline_utc=(start + timedelta(hours=4)).isoformat(),
            watchdog_verified=True, cutoff=2000, T7_admitted=False, sort_order_arm_admitted=False)
        (root / 'admission.json').write_text(json.dumps(admission))
        (root / 'build.json').write_text(json.dumps(dict(DDL_sha256=hashlib.sha256(f.DDL.encode()).hexdigest(),
            droplet_id=123, P_Step0_T2='PASS', group_members={'allowed': 2})))
        def original_create(request, data, author, client_id, **kwargs):
            return dict(doc_id=kwargs['doc_id'], author_key=author, groups=['allowed'],
                        created_at=kwargs['version_time'].isoformat(), body=data.body)
        docs = SimpleNamespace(create_as=Mock(side_effect=original_create), _check_app_permission=Mock())
        groups = SimpleNamespace(_principal=Mock(return_value='alice'))
        endpoint_package = ModuleType('app.v3.endpoints')
        endpoint_package.documents, endpoint_package.groups = docs, groups
        app_package, v3_package = ModuleType('app'), ModuleType('app.v3')
        app_package.v3, v3_package.endpoints = v3_package, endpoint_package
        routes = [SimpleNamespace(path=path, methods={'POST'},
            dependant=SimpleNamespace(call=Mock(return_value={'role': 'member'})))
            for path in arm_f_hooks.MEMBERSHIP_PATHS | set(arm_f_hooks.DOCUMENT_PATHS)]
        observer = SimpleNamespace(app=SimpleNamespace(routes=routes),
            current=contextvars.ContextVar('f-seam-observer', default={'request_id': 'a' * 32}),
            safe_query=SimpleNamespace(UnsafeQueryError=type('Unsafe', (Exception,), {})), application=Mock())
        client = SimpleNamespace(query=Mock(), command=Mock(), insert=Mock())
        ch = SimpleNamespace(client=client, execute_query=Mock(), can_write_group=Mock(return_value=True))
        endpoint_package.query = SimpleNamespace(ch=ch,
            _canonical_prepare_docs=Mock(side_effect=lambda rows, reader, readable: rows))
        native = SimpleNamespace(query=client.query, command=client.command, insert=client.insert)
        ch._get_client = lambda: native
        parent = ModuleType('arm_satellite_api')
        parent.host, parent.observer, parent.ch = 123, observer, ch
        parent.counts, parent.profile = {'canonical_generation': 'g'}, {'reader': 'alice'}
        parent._compile = Mock(return_value='SELECT doc_id FROM posts LIMIT 1')
        parent.compile_query, parent.stop = Mock(return_value='treated'), Mock()
        spec = importlib.util.spec_from_file_location('isolated_f_adapter', Path(__file__).with_name('arm_f_api.py'))
        module = importlib.util.module_from_spec(spec)
        replacements = {'arm_satellite_api': parent, 'app': app_package, 'app.v3': v3_package,
                        'app.v3.endpoints': endpoint_package}
        with patch.dict(sys.modules, replacements), patch.dict(os.environ, FANOUT_CONFIG_F='1', FANOUT_STATE=str(root)), patch.object(threading.Thread, 'start'):
            spec.loader.exec_module(module)
        module.context.set({'operation_id': '11111111-1111-4111-8111-111111111111'})
        module.original_command, module.original_insert = native.command, native.insert
        return module, parent, docs

    def data(self):
        value = SimpleNamespace(service='posts', groups=['allowed'], author_as=None, body={'text': 'synthetic'})
        value.model_dump = lambda **kwargs: {'service': 'posts', 'groups': ['allowed'], 'body': value.body}
        return value

    def test_caught_lifespan_warning_does_not_poison_http_but_poststartup_failures_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            module, parent, _ = self.load(directory)
            module.original_command.side_effect = RuntimeError('Received ClickHouse exception, code: 16, synthetic schema warning')
            async def lifespan(scope, receive, send):
                with self.assertRaises(RuntimeError):
                    module.command('CREATE TABLE IF NOT EXISTS synthetic_schema (x UInt8)')
                self.assertFalse(module.fatal.is_set())
                await send({'type': 'lifespan.startup.complete'})
                self.assertFalse(module.startup_phase.get())
            parent.application = lifespan
            try:
                asyncio.run(module.application({'type': 'lifespan'}, AsyncMock(), AsyncMock()))
                self.assertFalse(module.fatal.is_set())
                self.assertFalse(module.startup_phase.get())
                with self.assertRaises(RuntimeError):
                    module.command('INSERT INTO synthetic_workload VALUES (1)')
                self.assertTrue(module.fatal.is_set())
                self.assertTrue((Path(directory) / 'F.stop').exists())
            finally:
                module.journal.close()

    def test_startup_memory_timeout_and_unknown_failures_still_stop_the_arm(self):
        for code in (241, 159, 158, 497):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                module, _, _ = self.load(directory)
                module.original_command.side_effect = RuntimeError(f'Received ClickHouse exception, code: {code}, synthetic failure')
                token = module.startup_phase.set(True)
                try:
                    with self.assertRaises(RuntimeError):
                        module.command('CREATE TABLE IF NOT EXISTS synthetic_schema (x UInt8)')
                    self.assertTrue(module.fatal.is_set())
                finally:
                    module.startup_phase.reset(token)
                    module.journal.close()

    def test_http_cannot_inherit_or_request_startup_exception_handling(self):
        with tempfile.TemporaryDirectory() as directory:
            module, parent, _ = self.load(directory)
            module.original_command.side_effect = RuntimeError('synthetic measured failure')
            async def http(scope, receive, send):
                self.assertFalse(module.startup_phase.get())
                module.command('INSERT INTO synthetic_workload VALUES (1)')
            parent.application = http
            token = module.startup_phase.set(True)  # Even a parent context cannot exempt HTTP.
            try:
                with self.assertRaises(RuntimeError):
                    asyncio.run(module.application({'type': 'http', 'headers': [(b'x-startup', b'1')]}, AsyncMock(), AsyncMock()))
                self.assertTrue(module.fatal.is_set())
            finally:
                module.startup_phase.reset(token)
                module.journal.close()

    def test_async_background_child_cannot_inherit_lifespan_warning_exception(self):
        with tempfile.TemporaryDirectory() as directory:
            module, parent, _ = self.load(directory)
            module.original_command.side_effect = RuntimeError('Received ClickHouse exception, code: 16, synthetic failure')
            async def background():
                module.command('CREATE TABLE IF NOT EXISTS synthetic_schema (x UInt8)')
            async def lifespan(scope, receive, send):
                with self.assertRaises(RuntimeError):
                    await asyncio.create_task(background())
                self.assertTrue(module.fatal.is_set())
            parent.application = lifespan
            try:
                asyncio.run(module.application({'type': 'lifespan'}, AsyncMock(), AsyncMock()))
            finally:
                module.journal.close()

    def test_authority_denial_never_calls_original_write_or_pointer_insert(self):
        with tempfile.TemporaryDirectory() as directory:
            module, _, docs = self.load(directory)
            docs._check_app_permission.side_effect = HTTPException(403, 'denied')
            try:
                with self.assertRaises(HTTPException):
                    module.create(SimpleNamespace(), self.data(), 'alice', None)
                module.original_create.assert_not_called()
                self.assertFalse(module.journal.pending())
            finally:
                module.journal.close()

    def test_original_authorized_create_once_then_current_auth_on_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            module, _, docs = self.load(directory)
            holder = {}
            original = module.original_create.side_effect
            def create(*args, **kwargs):
                holder.update(original(*args, **kwargs))
                return dict(holder)
            module.original_create.side_effect = create
            module.store.rows = Mock(side_effect=lambda *a, **k: [{**holder, 'deleted': 0}])
            module.store.maintain_index = Mock()
            module.store.publish = Mock(return_value={'members': 2, 'recipient_pointers': 2, 'lane': 'fanout'})
            try:
                one = module.create(SimpleNamespace(), self.data(), 'alice', None)
                two = module.create(SimpleNamespace(), self.data(), 'alice', None)
                self.assertEqual(one, two)
                self.assertEqual(module.original_create.call_count, 1)
                self.assertEqual(module.store.publish.call_count, 1)
                docs._check_app_permission.side_effect = HTTPException(403, 'revoked')
                with self.assertRaises(HTTPException):
                    module.create(SimpleNamespace(), self.data(), 'alice', None)
                self.assertEqual(module.original_create.call_count, 1)
            finally:
                module.journal.close()

    def test_uncertified_scope_uses_no_old_counter_or_candidate_result(self):
        with tempfile.TemporaryDirectory() as directory:
            module, parent, _ = self.load(directory)
            module.generation = Mock(return_value='changed')
            try:
                self.assertEqual(module.compile_query('sql', {'posts': ['allowed']}, member_key='alice'),
                                 'SELECT doc_id FROM posts LIMIT 1')
                parent.compile_query.assert_not_called()
                self.assertEqual(parent.observer.current.get()['fanout']['path'], 'canonical_fallback')
            finally:
                module.journal.close()

    def test_stop_marker_survives_worker_restart_and_results_are_single_use(self):
        with tempfile.TemporaryDirectory() as directory:
            module, parent, _ = self.load(directory)
            try:
                module.pending.set(('a' * 32, ['body'], [('private-body',)]))
                self.assertEqual(module.execute_query(module.MARKER), (['body'], [('private-body',)]))
                self.assertNotIn('private-body', str(parent.observer.current.get()))
                with self.assertRaises(ValueError):
                    module.execute_query(module.MARKER)
                (Path(directory) / 'F.stop').write_text('native stop')
                with self.assertRaises(HTTPException):
                    module.active()
            finally:
                module.journal.close()


if __name__ == '__main__':
    unittest.main()
