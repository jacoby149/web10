"""New admission/order and real wrapper limits; no engine/cloud execution."""
import ast
import contextvars
from datetime import UTC, datetime, timedelta
import inspect
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import engagement_finish as finish
import engagement_limits as limits
import engagement_modern as modern
import engagement_observe as observe
import engagement_native as native
import arm_f_http


def function(file, name, namespace):
    node = next(node for node in ast.parse(Path(__file__).with_name(file).read_text()).body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), file, 'exec'), namespace)
    return namespace[name]


class FinishTests(unittest.TestCase):
    def test_banked_baseline_and_constructor_are_bound_without_engine(self):
        value = finish.banked()
        self.assertEqual(value['baseline']['samples'][1]['read_bytes'], 222387685)
        self.assertEqual(value['baseline']['samples'][1]['parity'], 'PASS')

    def test_admission_requires_new_run_and_limits_together(self):
        now = datetime.now(UTC)
        value = dict(configuration='F', approved_by='Jacob', dataset_id=modern.arm_t.DATASET,
            droplet_id=123, budget_usd=2, cleanup_model='agent-supervised-self-kill', host_self_kill_verified=True,
            cutoff=2000, T7_admitted=False, sort_order_arm_admitted=False, approved_utc=now.isoformat(),
            deadline_utc=(now + timedelta(hours=4)).isoformat(), engagement_engine=modern.ENGINE,
            engagement_directive=modern.DIRECTIVE, purpose='ENGAGEMENT_COMPLETION_ONLY', engagement_ref_admitted=True,
            engagement_completion_admitted=True, initial_k20_count_build_admitted=True, stages_b_d_admitted=False,
            run_directive=limits.RUN, measurement_limits_directive=limits.DIRECTIVE)
        modern.admitted(value, 123)
        with self.assertRaises(ValueError):
            modern.admitted({**value, 'measurement_limits_directive': 'missing'}, 123)

    def test_timeout_cell_preserved_and_independent_cells_continue_without_baseline_B_D(self):
        calls = []
        class Actions:
            def stage(self, name, results):
                calls.append(name)
                if name == 'A-treated':
                    raise TimeoutError('600s measured timeout with partial native actuals')
                return {}
            def checkpoint(self, *args):
                pass
        with tempfile.TemporaryDirectory() as directory:
            actions = Actions()
            actions.root = Path(directory)
            result = finish.programme(actions, Path(directory) / 'run')
        self.assertEqual(result['A-treated']['outcome'], 'INCOMPLETE')
        for name in ('A-decomposition', 'C-migration', 'C-complete', 'C-paired'):
            self.assertIn(name, calls)
        self.assertNotIn('A-baseline', calls)
        self.assertFalse(any(name.startswith(('B-', 'D-')) for name in calls))

    def test_actual_parent_and_observer_wrappers_admit_large_actuals_with_600s_and_no_rows(self):
        import arm_satellite_serve as serve
        import sqlglot
        from sqlglot import exp
        current = contextvars.ContextVar('new-limits', default={'request_id': 'b' * 32, 'engagement_mode': 'uniform'})
        observer = SimpleNamespace(current=current)
        seen = []
        def driver(query=None, parameters=None, settings=None):
            seen.append(settings)
            self.assertEqual(settings['max_execution_time'], 600)
            self.assertEqual(settings['max_rows_to_read'], 0)
            self.assertEqual(settings['max_rows_to_read_leaf'], 0)
            return SimpleNamespace(query_id='native', summary={'read_rows': 90_000_000, 'read_bytes': 9_000_000_000})
        operation = {'measurement_limits_directive': limits.DIRECTIVE}
        with tempfile.TemporaryDirectory() as directory:
            observed = observe.install(driver, observer, directory, operation=operation)
            parent = function('arm_satellite_api.py', 'query', dict(admitted=lambda *a: None,
                operation=operation, host=123, observer=observer, _signature=inspect.signature(driver), _query=observed,
                _views=contextvars.ContextVar('views', default=False), _inventory=contextvars.ContextVar('inventory', default=False),
                serve=serve, sqlglot=sqlglot, exp=exp, stop=lambda reason: self.fail(reason)))
            parent('SELECT 1', settings={'max_execution_time': 10, 'max_rows_to_read': 10_000_000})
        self.assertEqual(len(seen), 1)
        self.assertEqual(current.get()['arm_p_native'][0]['read_rows'], 90_000_000)

    def test_native_large_actuals_do_not_stop_modern_session(self):
        session = modern.Session.__new__(modern.Session)
        session.operation = {'measurement_limits_directive': limits.DIRECTIVE}
        with patch.object(modern.arm_f_runtime.Session, 'native', return_value={'read_rows': 100_000_000}):
            self.assertEqual(session.native('id', measured=True)['read_rows'], 100_000_000)

    def test_modern_cli_measured_query_uses_native_waiter_600s_and_no_row_cap(self):
        session = modern.Session.__new__(modern.Session)
        session.operation = {'measurement_limits_directive': limits.DIRECTIVE}
        session.host_id, session.compose, session.env = 123, ['docker'], {}
        session.record = Mock()
        with patch.object(modern, 'admitted'), patch.object(modern, 'remaining', return_value=1000), \
                patch.object(native, 'await_query', return_value=b'42') as wait:
            value, query_id = session.query('measurement', 'SELECT 42', measured=True)
        self.assertEqual(value, '42')
        command = wait.call_args.args[1]
        self.assertIn('--max_rows_to_read=0', command)
        self.assertEqual(command[command.index('--max_execution_time') + 1], '600')
        self.assertEqual(wait.call_args.args[2], query_id)

    def test_http_native_receipts_allow_large_rows_but_never_exceptions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'F-stages').mkdir()
            (root / 'F-stages/r.jsonl').write_text(json.dumps(dict(request_id='r', query_id='q', success=True, stage='preparation')) + '\n')
            session = SimpleNamespace(operation={'measurement_limits_directive': limits.DIRECTIVE}, query=Mock(),
                rows=Mock(return_value=([dict(query_id='q', read_rows=90_000_000, exception_code=0)], 'metadata')))
            http = arm_f_http.HTTP.__new__(arm_f_http.HTTP)
            http.root, http.output, http.session = root, root, session
            self.assertEqual(http.native(['r'], 'measured')[0]['read_rows'], 90_000_000)
            session.rows.return_value = ([dict(query_id='q', read_rows=1, exception_code=159)], 'metadata')
            with self.assertRaises(ValueError):
                http.native(['r'], 'failed')


if __name__ == '__main__':
    unittest.main()
