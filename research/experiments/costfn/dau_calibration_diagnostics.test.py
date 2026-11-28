"""No-engine controls for utilization observations and banked oracle transfer."""

import asyncio
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import dau_calibration_diagnostics as diag
from dau_calibration_oracle_reuse import selection_domain
import dau_serving_bundle as bundle
import engagement_limits


class Diagnostics(unittest.TestCase):
    def test_bundle_has_one_publication_owner_and_deliberate_native_thread_budget(self):
        roles = bundle.worker_layout()
        self.assertEqual([port for port, role, _ in roles if role == 'write'], [80])
        self.assertEqual(len([port for port, role, _ in roles if role == 'read']), len(bundle.READ_PORTS))
        self.assertEqual(sum(tokens for _, _, tokens in roles) * bundle.ENGINE_THREADS + bundle.MERGE_POOL, 32)
        self.assertIn('<max_concurrent_queries>40</max_concurrent_queries>', bundle.engine_xml())
        with patch.dict(os.environ, {'DAU_BUNDLE_ACTIVE': '1'}):
            settings = engagement_limits.settings({'max_threads': 32})
            self.assertEqual(settings['max_threads'], 1)
            self.assertEqual(settings['max_memory_usage'], 22 * 1024**3)
        self.assertNotIn('max_threads', engagement_limits.settings())

    def test_cpu_rows_keep_each_core_and_exclude_double_accounted_guest_ticks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'stat').write_text('cpu 7 0 2 12 1 0 0 0 3 0\ncpu0 4 0 1 6 1 0 0 0 2 0\n'
                'cpu1 3 0 1 6 0 0 0 0 1 0\nintr 0\n')
            rows = diag.cpu_ticks(root)
            self.assertEqual(set(rows), {'cpu', 'cpu0', 'cpu1'})
            self.assertEqual(rows['cpu0'], [4, 0, 1, 6, 1, 0, 0, 0])

    def test_workers_partition_the_http_entrypoints_and_require_all_five_real_pids(self):
        self.assertTrue(bundle.worker_route('write', 'POST', '/v3/create'))
        self.assertTrue(bundle.worker_route('write', 'POST', '/v3/login'))
        for path in ('/v3/create', '/v3/login', '/v3/addGroupMember'):
            self.assertFalse(bundle.worker_route('read', 'POST', path))
        for path in bundle.READ_PATHS:
            self.assertFalse(bundle.worker_route('write', 'POST', path))
            self.assertTrue(bundle.worker_route('read', 'POST', path))
        with tempfile.TemporaryDirectory() as directory:
            proc = Path(directory)
            expected = {}
            for port, _, _ in bundle.worker_layout():
                pid = port + 100
                (proc / str(pid)).mkdir()
                (proc / str(pid) / 'cmdline').write_bytes(f'python\0-m\0uvicorn\0dau_sustain_cell:application\0--port\0{port}\0'.encode())
                expected[port] = pid
            rows = [{'pid': pid} for pid in expected.values()]
            self.assertEqual(bundle.worker_pids(rows, proc=proc), expected)
            with self.assertRaisesRegex(ValueError, 'worker layout'):
                bundle.worker_pids(rows[:-1], proc=proc)

    def test_process_ticks_are_bound_to_pid_start_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '17').mkdir()
            (root / '17/stat').write_text('17 (process ) with spaces) S ' + ' '.join(map(str, range(1, 24))))
            self.assertEqual(diag.process_ticks(17, root), {'user': 11, 'system': 12, 'start_ticks': 19})

    def test_queue_observer_reads_the_pinned_driver_pool_manager(self):
        import anyio.to_thread
        from clickhouse_connect.driver.httpclient import HttpClient
        from clickhouse_connect.driver.httputil import get_pool_manager

        client = HttpClient.__new__(HttpClient)
        manager = get_pool_manager(maxsize=16, block=False)
        manager.connection_from_host('localhost', 8123)
        client._backend = SimpleNamespace(http=manager)
        client.query = lambda sql: SimpleNamespace(named_results=lambda: iter([dict(name='max_threads', value='1')]))

        async def sample(root):
            limiter = anyio.to_thread.current_default_thread_limiter()
            previous = limiter.total_tokens
            try:
                limiter.total_tokens = bundle.READ_TOKENS
                diag.api_observer(root, lambda: client, port=81)()
            finally:
                limiter.total_tokens = previous

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            asyncio.run(sample(root))
            receipt = json.loads((root / 'utilization-queues.jsonl').read_bytes())
        self.assertEqual(receipt['worker_port'], 81)
        self.assertEqual(receipt['client_pool']['maxsize'], 16)
        self.assertIs(receipt['client_pool']['block'], False)
        self.assertEqual(receipt['engine_pool_counters'], [dict(idle_connections=0, connections_created=0, requests_sent=0)])

    def test_only_native_census_receipt_identity_may_differ_on_rebind(self):
        first = dict(dataset_id='dataset', readers=[{'reader': 'one', 'groups': ['own']}], census_sha256='old')
        self.assertEqual(selection_domain(first), selection_domain(dict(first, census_sha256='new')))
        self.assertNotEqual(selection_domain(first), selection_domain(dict(first, readers=[])))


if __name__ == '__main__':
    unittest.main()
