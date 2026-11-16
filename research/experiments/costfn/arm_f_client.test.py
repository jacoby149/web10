"""Real core proxy/getter AST, synthetic connections; NOT native reproduction."""
import ast
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import threading
from types import SimpleNamespace
import unittest

from arm_f_client import dispatch
from arm_f_trim_native import foreground_probe_sql, FOREGROUND_SQL


class DispatchTests(unittest.TestCase):
    def test_overlap_probe_accepts_driver_appended_wire_format(self):
        import sqlglot
        from sqlglot import exp
        sql = foreground_probe_sql()
        tree = sqlglot.parse_one(sql, read='clickhouse')
        predicate = tree.find(exp.StartsWith)
        self.assertIsNotNone(predicate)
        needle = bytes.fromhex(predicate.expression.find(exp.Literal).this).decode()
        self.assertEqual(needle, FOREGROUND_SQL)
        self.assertTrue((FOREGROUND_SQL + '\n FORMAT Native').startswith(needle))

    def test_old_capture_crosses_thread_owner_new_dispatch_overlaps_and_retires(self):
        source = Path(__file__).resolve().parents[3] / 'api/app/v3/services/clickhouse.py'
        tree = ast.parse(source.read_text())
        nodes = [node for node in tree.body if getattr(node, 'name', None) in ('_get_client', '_LazyClickHouse')]
        made, barrier = [], threading.Barrier(2)
        class Connection:
            def __init__(self):
                self.owner = threading.current_thread()
                made.append(self)
            def query(self, overlap=False):
                if self.owner is not threading.current_thread():
                    raise RuntimeError('synthetic shared session: captured connection crossed owner thread')
                if overlap:
                    barrier.wait(timeout=5)
                return id(self)
            command = insert = query
        settings = SimpleNamespace(**{key: None for key in ('CLICKHOUSE_HOST', 'CLICKHOUSE_PORT',
            'CLICKHOUSE_DATABASE', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD', 'CLICKHOUSE_SECURE')})
        namespace = dict(_thread_local=threading.local(), settings=settings,
            clickhouse_connect=SimpleNamespace(get_client=lambda **kwargs: Connection()))
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), namespace)
        proxy = namespace['_LazyClickHouse']()
        old = proxy.query
        with ThreadPoolExecutor(max_workers=1) as executor:
            with self.assertRaisesRegex(RuntimeError, 'crossed owner thread'):
                executor.submit(old).result()
        for name in ('query', 'command', 'insert'):
            call = dispatch(namespace['_get_client'], name, getattr(proxy, name))
            setattr(proxy, name, call)  # Same overlay pattern as P/F, no recursive lookup.
            with ThreadPoolExecutor(max_workers=2) as executor:
                first, second = executor.submit(call, True), executor.submit(call, True)
                self.assertNotEqual(first.result(), second.result())
            with ThreadPoolExecutor(max_workers=1) as executor:
                new = executor.submit(call).result()
                self.assertNotIn(new, (first.result(), second.result()))
        self.assertEqual(len(made), 10)  # Startup + three fresh worker sets.


if __name__ == '__main__':
    unittest.main()
