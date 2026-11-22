"""Real pinned HTTP request plans plus a server keyed by wire identity; no I/O."""
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from sqlglot.errors import ParseError

from clickhouse_connect.driver.httpclient import HttpClient
from clickhouse_connect.driver.query import QueryContext
from clickhouse_connect.driver.summary import QuerySummary
from clickhouse_connect.driver._backend.httpcommon import (
    QueryRuntime, plan_command_request, plan_data_insert_request, plan_query_request,
)
from clickhouse_connect.driver._backend.orchestration import insert_context_sequence, run_sync

from row_model_native import Driver


class WireClient:
    """No fake recognition of query_id headers: only real plan.params sets identity."""
    valid_transport_settings = HttpClient.valid_transport_settings
    optional_transport_settings = HttpClient.optional_transport_settings
    _validate_settings = HttpClient._validate_settings
    _validate_setting = HttpClient._validate_setting

    def __init__(self):
        self.server_settings, self.plans, self.terminals = {}, [], {}
        self.wrong_response = False
        self.suppress = False

    def get_client_setting(self, key):
        return None

    def runtime(self, settings):
        for key in settings:
            self.server_settings[key] = SimpleNamespace(value='server-default', readonly=False)
        return QueryRuntime(database='web10', settings=self._validate_settings(settings))

    def terminal(self, identity, params):
        return dict(query_id=identity, type='QueryFinish', exception_code=0, exception='', read_rows=17,
            read_bytes=340, query_duration_ms=4, written_rows=0, written_bytes=0, memory_usage=100,
            native_max_execution_time=str(params.get('max_execution_time','')),
            native_max_rows_to_read=str(params.get('max_rows_to_read','')),
            native_max_bytes_to_read=str(params.get('max_bytes_to_read','')),
            native_max_memory_usage=str(params.get('max_memory_usage','')))

    def sent(self, kind, statement, params, headers):
        identity = params.get('query_id', 'server-generated-' + str(len(self.plans)))
        if self.wrong_response:
            identity = 'server-returned-different-id'
        self.plans.append(dict(kind=kind, statement=statement, params=dict(params), headers=dict(headers), actual=identity))
        if not self.suppress:
            self.terminals[identity] = self.terminal(identity, params)
        return identity

    @staticmethod
    def result(identity, rows):
        columns = list(rows[0]) if rows else list(WireClient().terminal('', {}))
        return SimpleNamespace(query_id=identity, column_names=columns,
            result_rows=[tuple(row[c] for c in columns) for row in rows], named_results=lambda:iter(rows))

    def query(self, statement, *, settings, transport_settings=None, **kwargs):
        context = QueryContext(statement, settings=settings, transport_settings=transport_settings)
        plan = plan_query_request(context, self.runtime(settings), form_encode_query_params=False,
            compression=None, send_comp_setting=False, read_format='Native', prepped_query=context.final_query)
        headers = {**plan.headers, **(context.transport_settings or {})}  # Actual HTTP backend merge.
        identity = self.sent('query', statement, plan.params, headers)
        if 'FROM system.query_log' in statement:
            wanted = [bytes.fromhex(value).decode() for value in re.findall(r"unhex\('([0-9a-f]+)'\)", statement)]
            return self.result(identity, [self.terminals[key] for key in wanted if key in self.terminals])
        if statement.startswith('DESCRIBE TABLE'):
            return self.result(identity, [dict(name='value', type='String', default_type='',
                default_expression='', comment='', codec_expression='', ttl_expression='')])
        return self.result(identity, [dict(value='typed')])

    def command(self, statement, *, settings, transport_settings=None):
        plan = plan_command_request(statement, {}, None, None, self.runtime(settings), transport_settings)
        identity = self.sent('command', statement, plan.params, plan.headers)
        return QuerySummary({'query_id':identity})

    def create_insert_context(self, table, *, column_names, settings):
        # Exercise the pinned generator: it really emits DESCRIBE with these settings.
        return run_sync(insert_context_sequence(table, column_names=column_names, settings=settings),
            lambda op:self.query(op.text, settings=dict(op.settings)))

    def insert(self, table=None, rows=None, *, context=None, column_names=None, settings=None, transport_settings=None):
        if context is None:
            context = self.create_insert_context(table, column_names=column_names, settings=settings)
            context.transport_settings = transport_settings
        context.data = rows
        plan = plan_data_insert_request(context, self.runtime(context.settings))
        identity = self.sent('insert', 'INSERT', plan.params, plan.headers)
        return QuerySummary({'query_id':identity})


class IdentityTests(unittest.TestCase):
    def test_real_pinned_summary_method_is_compared_as_an_identity_not_a_bound_method(self):
        Driver.check_response_identity(QuerySummary({'query_id':'expected'}), {'query_id':'expected'})
        Driver.check_response_identity(SimpleNamespace(query_id='expected'), {'query_id':'expected'})
        with self.assertRaisesRegex(ValueError, 'returned wrong'):
            Driver.check_response_identity(QuerySummary({'query_id':'wrong'}), {'query_id':'expected'})

    def test_missing_summary_identity_still_requires_the_original_exact_native_receipt(self):
        Driver.check_response_identity(QuerySummary(), {'query_id':'expected'})
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            original = client.command
            def no_response_identity(*args, **kwargs):
                original(*args, **kwargs)
                return QuerySummary()
            client.command = no_response_identity
            driver.command('SYSTEM STOP MERGES row_text')
            with self.assertRaises(ValueError):
                driver.require_native(driver.records)
            driver.collect_pending()
            driver.require_native(driver.records)

    def driver(self, root):
        client = WireClient()
        return Driver(client, Path(root)/'native', lambda:None), client

    def assert_wire(self, driver, client, kind):
        record = driver.records[-1]
        request = next(p for p in reversed(client.plans) if p['kind']==kind)
        self.assertEqual(request['params'].get('query_id'), record['query_id'])
        self.assertEqual(request['actual'], record['query_id'])
        self.assertNotIn('query_id', request['headers'])
        self.assertEqual(request['params']['log_comment'], 'ROW_MODEL:' + record['query_id'])
        self.assertEqual(request['params']['max_execution_time'], 600)
        self.assertEqual(request['params']['max_memory_usage'], 22*1024**3)

    def test_query_request_uses_true_parameter_not_transport_header(self):
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            self.assertEqual(driver.query('SELECT value FROM row_text'), [dict(value='typed')])
            self.assert_wire(driver, client, 'query')

    def test_command_request_uses_true_parameter_not_transport_header(self):
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            driver.command('CREATE TABLE example (value String) ENGINE=Memory')
            self.assert_wire(driver, client, 'command')

    def test_insert_and_real_pinned_metadata_generator_have_distinct_true_identities(self):
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            driver.insert('row_text', [('typed',)], ['value'])
            self.assert_wire(driver, client, 'insert')
            self.assertEqual(len(driver.records), 1)
            metadata = next(p for p in client.plans if p['statement'].startswith('DESCRIBE TABLE'))
            self.assertNotEqual(metadata['params'].get('query_id'), driver.records[0]['query_id'])
            self.assertEqual(metadata['actual'], metadata['params'].get('query_id'))
            self.assertTrue(metadata['params']['log_comment'].startswith('ROW_MODEL_AUX:'))
            self.assertEqual(metadata['params']['max_execution_time'], 600)
            self.assertNotIn('query_id', metadata['headers'])

    def test_old_transport_routing_fails_to_establish_identity_on_all_three_request_plans(self):
        for kind in ('query','command','insert'):
            with self.subTest(kind=kind):
                client = WireClient()
                args = dict(settings={'max_execution_time':600}, transport_settings={'query_id':'old-wanted'})
                if kind == 'query':
                    client.query('SELECT value FROM row_text', **args)
                elif kind == 'command':
                    client.command('SYSTEM FLUSH LOGS', **args)
                else:
                    client.insert('row_text', [('typed',)], column_names=['value'], **args)
                request = client.plans[-1]
                self.assertNotEqual(request['params'].get('query_id'), 'old-wanted')
                self.assertEqual(request['headers']['query_id'], 'old-wanted')
                self.assertNotEqual(request['actual'], 'old-wanted')

    def test_submit_then_observe_matches_fake_server_true_identity_without_resubmission(self):
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            driver.query('SELECT value FROM row_text')
            with patch('row_model_native.time.sleep', side_effect=AssertionError('nonexistent receipt ID')):
                driver.collect(driver.records[0])
            driver.require_native(driver.records)
            self.assertEqual(driver.records[0]['outcome'], 'NATIVE_COMPLETE')
            self.assertEqual(sum(p['statement']=='SELECT value FROM row_text' for p in client.plans), 1)

    def test_collect_pending_matches_query_command_insert_and_excludes_explicit_auxiliary_work(self):
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            driver.query('SELECT value FROM row_text')
            driver.command('SYSTEM STOP MERGES row_text')
            driver.insert('row_text', [('typed',)], ['value'])
            with patch('row_model_native.time.sleep', side_effect=AssertionError('nonexistent receipt ID')):
                driver.collect_pending()
            driver.require_native(driver.records)
            self.assertEqual(len(driver.records), 3)
            self.assertFalse(driver.pending)

    def test_flush_and_query_observations_each_carry_unique_true_auxiliary_identity(self):
        for batch in (False, True):
            with self.subTest(batch=batch), tempfile.TemporaryDirectory() as root:
                driver, client = self.driver(root)
                driver.query('SELECT value FROM row_text')
                with patch('row_model_native.time.sleep', side_effect=AssertionError('nonexistent receipt ID')):
                    driver.collect_pending() if batch else driver.collect(driver.records[0])
                auxiliary = [p for p in client.plans if p['params'].get('log_comment','').startswith('ROW_MODEL_AUX:')]
                self.assertEqual(len(auxiliary), 2)
                self.assertEqual(len({p['params'].get('query_id') for p in auxiliary}), 2)
                for request in auxiliary:
                    self.assertEqual(request['params']['query_id'], request['actual'])
                    self.assertNotIn('query_id', request['headers'])
                    self.assertEqual(request['params']['max_execution_time'], 2)

    def test_original_native_completion_waits_without_data_resubmission(self):
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            client.suppress = True
            driver.query('SELECT value FROM row_text')
            client.suppress = False
            request = client.plans[0]
            calls = []
            def complete_after_poll(_):
                calls.append('poll')
                client.terminals[request['actual']] = client.terminal(request['actual'], request['params'])
                if len(calls)>1:
                    raise AssertionError('receipt lookup lost true wire identity')
            with patch('row_model_native.time.sleep', side_effect=complete_after_poll):
                driver.collect(driver.records[0])
            self.assertEqual(calls, ['poll'])
            driver.require_native(driver.records)
            self.assertEqual(sum(p['statement']=='SELECT value FROM row_text' for p in client.plans), 1)

    def test_proven_returned_id_mismatch_stops_without_polling_the_wrong_id(self):
        for kind in ('query','command','insert'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as root:
                driver, client = self.driver(root)
                # Insert metadata succeeds first; change only the actual data response.
                original = client.sent
                def wrong_data(operation, statement, params, headers):
                    client.wrong_response = not statement.startswith('DESCRIBE TABLE')
                    return original(operation, statement, params, headers)
                client.sent = wrong_data
                with patch('row_model_native.time.sleep', side_effect=AssertionError('must not poll known-wrong ID')):
                    with self.assertRaisesRegex(ValueError, 'identity'):
                        if kind == 'query':
                            driver.query('SELECT value FROM row_text')
                        elif kind == 'command':
                            driver.command('SYSTEM STOP MERGES row_text')
                        else:
                            driver.insert('row_text', [('typed',)], ['value'])
                    driver.collect_pending()
                    driver.collect(driver.records[-1])
                self.assertEqual(driver.records[-1]['outcome'], 'INCOMPLETE')
                self.assertTrue(driver.records[-1]['identity_mismatch'])
                self.assertFalse(driver.pending)

    def test_typed_read_insert_refuses_before_any_metadata_request(self):
        with tempfile.TemporaryDirectory() as root:
            driver, client = self.driver(root)
            driver.variant = 'rows'
            with self.assertRaises((ValueError, ParseError)):
                driver.insert('row_text', [('typed',)], ['value'])
            self.assertFalse(client.plans)
            self.assertFalse(driver.records)

    def test_foreign_native_receipt_is_never_accepted_by_either_collection_path(self):
        for batch in (False, True):
            with self.subTest(batch=batch), tempfile.TemporaryDirectory() as root:
                driver, client = self.driver(root)
                driver.query('SELECT value FROM row_text')
                original = client.query
                def wrong_receipt(statement, **kwargs):
                    result = original(statement, **kwargs)
                    if 'FROM system.query_log' in statement:
                        row = client.terminal('foreign-native-id', client.plans[0]['params'])
                        return client.result(result.query_id, [row])
                    return result
                client.query = wrong_receipt
                if batch:
                    with self.assertRaisesRegex(ValueError, 'unexpected native identity'):
                        driver.collect_pending()
                else:
                    driver.collect(driver.records[0])
                    self.assertIn('collection_failure', driver.records[0])
                with self.assertRaises(ValueError):
                    driver.require_native(driver.records)
                self.assertNotEqual(driver.records[0]['outcome'], 'NATIVE_COMPLETE')


if __name__ == '__main__':
    unittest.main()
