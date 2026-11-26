"""Modern stdin transport, real local child only: no engine, Docker or cloud."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

import engagement_limits as limits
import engagement_modern as modern
import engagement_native as native


class TransportTests(unittest.TestCase):
    def session(self, root):
        value = modern.Session.__new__(modern.Session)
        value.root, value.host_id = Path(root), 123
        value.operation = {'measurement_limits_directive': limits.DIRECTIVE}
        value.compose, value.env, value.record = ['docker', 'compose'], {}, Mock()
        return value

    def test_real_large_and_small_modern_queries_have_identical_flag_only_argv_and_exact_stdin(self):
        prefix, suffix = "INSERT INTO copy SELECT '", "'"
        # Include non-ASCII bytes: transport identity is UTF-8 bytes, not characters.
        body = 'λ' * 1000
        large = prefix + body + 'x' * (185447 - len((prefix + body + suffix).encode())) + suffix
        self.assertEqual(len(large.encode()), 185447)
        self.assertGreater(len(large.encode()), 128 * 1024)
        shapes = []
        real_popen, real_sleep = subprocess.Popen, time.sleep
        for sql in ('SELECT 42', 'INSERT INTO copy SELECT 1', large):
            with self.subTest(bytes=len(sql.encode())), tempfile.TemporaryDirectory() as directory:
                session = self.session(directory)
                seen = {}
                def spawn(command, **kwargs):
                    self.assertNotIn('--query', command)
                    self.assertNotIn(sql, command)
                    self.assertLess(max(map(len, command)), 128 * 1024)
                    seen['command'], seen['stdin'] = command, kwargs['stdin']
                    # Exercise the actual inherited stdin/EOF, not a mocked write.
                    script = ('import hashlib,json,sys;data=sys.stdin.buffer.read();'
                        'print(json.dumps(dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())))')
                    seen['process'] = real_popen([sys.executable, '-c', script], **kwargs)
                    return seen['process']
                def observe(*args, data, **kwargs):
                    self.assertTrue(seen['stdin'].closed, 'parent stdin must close before native polling')
                    self.assertNotIn('--query', args)
                    if data == b'SYSTEM FLUSH LOGS':
                        return b''
                    self.assertIn(seen['command'][seen['command'].index('--query_id') + 1].encode(), data)
                    self.assertIn(b'memory_usage', data)
                    if seen['process'].poll() is None:
                        return b'{"data":[]}'
                    return json.dumps({'data': [dict(type='QueryFinish', exception_code=0)]}).encode()
                with patch.object(modern, 'admitted'), patch.object(modern, 'remaining', return_value=1000), \
                        patch.object(native.subprocess, 'Popen', side_effect=spawn) as submitted, \
                        patch.object(native.restore, 'command', side_effect=observe), \
                        patch.object(native.time, 'sleep', side_effect=lambda _: real_sleep(.005)):
                    raw, query_id = session.query('transport-control', sql, measured=True)
                self.assertEqual(submitted.call_count, 1)
                self.assertEqual(json.loads(raw), dict(bytes=len(sql.encode()), sha256=hashlib.sha256(sql.encode()).hexdigest()))
                receipt = json.loads((Path(directory) / 'native-operations' / query_id / 'receipt.json').read_bytes())
                self.assertEqual(receipt['outcome'], 'NATIVE_FINISH')
                self.assertEqual(receipt['statement_kind'], 'read' if sql.startswith('SELECT') else 'write')
                shape = ['QUERY_ID' if arg == query_id else arg for arg in seen['command']]
                shapes.append(shape)
        self.assertEqual(shapes[0], shapes[1])
        self.assertEqual(shapes[0], shapes[2])
        print('[transport-control] 185447-byte SQL absent from argv; exact UTF-8 stdin verified; argv=' + json.dumps(shapes[2]))

    def test_explicit_kind_preserves_nonzero_client_guard_without_peeking_at_last_flag(self):
        for kind, sql in (('read', 'SELECT 1'), ('write', 'INSERT INTO copy SELECT 1')):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                session = self.session(directory)
                process = Mock(returncode=159)
                process.poll.return_value = 159
                seen = {}
                def spawn(command, **kwargs):
                    seen['stdin'] = kwargs['stdin']
                    self.assertEqual(kwargs['stdin'].read(), sql.encode())
                    return process
                def observe(*args, data, **kwargs):
                    self.assertTrue(seen['stdin'].closed)
                    return b'' if data == b'SYSTEM FLUSH LOGS' else b'{"data":[{"type":"QueryFinish","exception_code":0}]}'
                with patch.object(native.subprocess, 'Popen', side_effect=spawn) as submitted, \
                        patch.object(native.restore, 'command', side_effect=observe):
                    # Last argument deliberately does not resemble a statement.
                    def call():
                        return native.await_query(session, ['client', '--max_rows_to_read=0'],
                            'fanout-f-kind', 600, sql=sql, statement_kind=kind)
                    if kind == 'read':
                        with self.assertRaisesRegex(ValueError, 'SELECT result transport was lost'):
                            call()
                    else:
                        self.assertEqual(call(), b'')
                self.assertEqual(submitted.call_count, 1)

    def test_settled_optimize_no_op_abort_is_banked_not_repeated(self):
        settled = dict(type='ExceptionBeforeStart', exception_code=236,
            exception="Code: 236. DB::Exception: Cancelled merging parts. (ABORTED)")
        for sql, kind, allowed in (
                ('OPTIMIZE TABLE documents FINAL', 'write', True),
                (' OPTIMIZE TABLE documents', 'write', True),
                ('UPDATE _row_exists = 0 WHERE doc_id IN (\'x\')', 'write', False),
                ('OPTIMIZE TABLE documents FINAL', 'read', False)):
            with self.subTest(sql=sql, kind=kind), tempfile.TemporaryDirectory() as directory:
                session = self.session(directory)
                process = Mock(returncode=0)
                process.poll.return_value = 0
                def spawn(command, **kwargs):
                    kwargs['stdin'].read()
                    return process
                def observe(*args, data, **kwargs):
                    if data == b'SYSTEM FLUSH LOGS':
                        return b''
                    return json.dumps({'data': [settled]}).encode()
                with patch.object(native.subprocess, 'Popen', side_effect=spawn), \
                        patch.object(native.restore, 'command', side_effect=observe):
                    if allowed:
                        raw = native.await_query(session, ['client'], 'fanout-f-settled', 600,
                            sql=sql, statement_kind=kind)
                        receipt = json.loads((Path(directory) / 'native-operations' / 'fanout-f-settled'
                            / 'receipt.json').read_bytes())
                        self.assertEqual(receipt['outcome'], 'NATIVE_FINISH')
                        self.assertIs(receipt['settled_no_op'], True)
                        self.assertEqual(raw, b'')
                    else:
                        with self.assertRaisesRegex(ValueError, 'never repeat it'):
                            native.await_query(session, ['client'], 'fanout-f-settled', 600,
                                sql=sql, statement_kind=kind)

    def test_caller_carries_the_exact_existing_prefix_classification(self):
        for sql in (' SELECT 1', ' INSERT INTO copy SELECT 1', 'ALTER TABLE copy ADD COLUMN n UInt8',
                'OPTIMIZE TABLE copy', 'CREATE TABLE copy (n UInt8)', 'INSERT\nINTO copy SELECT 1'):
            with self.subTest(sql=sql), tempfile.TemporaryDirectory() as directory:
                session = self.session(directory)
                expected = 'write' if sql.lstrip().upper().startswith(('ALTER ', 'OPTIMIZE ', 'INSERT ', 'CREATE ')) else 'read'
                with patch.object(modern, 'admitted'), patch.object(modern, 'remaining', return_value=1000), \
                        patch.object(native, 'await_query', return_value=b'') as wait:
                    session.query('kind-control', sql)
                self.assertEqual(wait.call_args.kwargs, dict(sql=sql, statement_kind=expected))
                self.assertNotIn(sql, wait.call_args.args[1])

    def test_non_waiting_modern_path_also_supplies_stdin(self):
        with tempfile.TemporaryDirectory() as directory:
            session = self.session(directory)
            session.operation = {}
            with patch.object(modern, 'admitted'), patch.object(modern, 'remaining', return_value=1000), \
                    patch.object(modern.restore, 'command', return_value=b'42') as client:
                self.assertEqual(session.query('small-control', 'SELECT 42')[0], '42')
            self.assertEqual(client.call_args.kwargs['data'], b'SELECT 42')
            self.assertNotIn('--query', client.call_args.args)
            self.assertNotIn('SELECT 42', client.call_args.args)


if __name__ == '__main__':
    unittest.main()
