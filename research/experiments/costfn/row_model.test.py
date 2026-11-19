"""Exact no-engine row-model controls, not native assembly/performance evidence."""
import copy
from dataclasses import replace
from datetime import UTC, datetime
import math
import unittest

import sqlglot
from sqlglot import exp

import row_model as model
import row_model_ingest as ingest
import row_model_sql as sql
import row_model_build as build
import row_model_cell as cell
import row_model_fence as fence
from row_model_store import Store, value_rows


class TypedDriver:
    """In-memory typed-driver double. SQL construction is separately inspected."""
    def __init__(self):
        self.tables, self.statements, self.inserts = {}, [], []

    def insert(self, table, rows, columns):
        self.inserts.append((table, copy.deepcopy(rows), list(columns)))
        self.tables.setdefault(table, []).extend(dict(zip(columns, row)) for row in rows)

    def query(self, statement):
        self.statements.append(statement)
        tree = sqlglot.parse_one(statement, read='clickhouse')
        table = tree.args['from_'].this.name
        def literal(item):
            if isinstance(item, exp.Unhex):
                return bytes.fromhex(item.this.this).decode()
            return int(item.this) if not item.is_string else item.this
        rows = self.tables.get(table, [])
        where = tree.args['where']
        if table == 'row_document_versions':
            selected = next(node for node in where.find_all(exp.In) if isinstance(node.this, exp.Column))
            owners = {literal(item) for item in selected.expressions}
            result = []
            for owner in owners:
                candidates = [r for r in rows if r['document_row_id'] == owner]
                if candidates:
                    latest = max(r['version'] for r in candidates)
                    result += [r for r in candidates if r['version'] == latest]
        elif table == 'row_pointers':
            selector = next(node for node in where.find_all(exp.In) if isinstance(node.this, exp.Tuple))
            pairs = {tuple(literal(v) for v in item.expressions) for item in selector.expressions}
            result = [r for r in rows if (r['document_row_id'], r['version']) in pairs]
            exact = [node for node in where.find_all(exp.In) if isinstance(node.this, exp.Column)]
            if exact:
                keys = {literal(item) for item in exact[0].expressions}
                prefixes = [literal(node.expression) for node in where.find_all(exp.StartsWith)]
                result = [r for r in result if r['key'] in keys or any(r['key'].startswith(v) for v in prefixes)]
        else:
            selected = next(where.find_all(exp.In))
            ids = {literal(item) for item in selected.expressions}
            result = [r for r in rows if r['value_row_id'] in ids]
        # Model the constructors' exact GROUP BY duplicate collapse, never tie
        # selection. Distinct conflicting versions/values remain observable.
        result = {tuple(r.items()): r for r in result}
        return list(result.values())


class RowModelTests(unittest.TestCase):
    def install(self, store, batch):
        store.stage(batch)
        store.publish(batch.node)

    def test_all_JSON_types_nested_unicode_empty_and_lookalike_keys_roundtrip_without_JSON_storage(self):
        source = dict(author_key='a', doc_id='p', body={'': None, 'a.b': [True, 1, 1.5, {}, [], 'שלום'],
            'a': {'b': 'different'}, '0': {'value': -2**100}}, tags=['post'],
            created_at=datetime(2026, 11, 19, tzinfo=UTC))
        store = model.MemoryStore()
        batch = model.decompose(source, 1)
        self.install(store, batch)
        self.assertEqual(store.read(model.Identity('a', 'p')), source)
        self.assertTrue(all(not isinstance(value.value, (dict, list)) for value in batch.values))
        for path in (('',), ('a.b',), ('a','b'), ('0', 0), ('שלום', '🎸', 12)):
            self.assertEqual(model.decode_path(model.encode_path(path)), path)

    def test_identity_only_document_is_zero_payload_not_missing_or_deleted(self):
        source = dict(author_key='a', doc_id='empty')
        store = model.MemoryStore()
        batch = model.decompose(source, 1)
        self.assertEqual(batch.pointers, ())
        self.install(store, batch)
        self.assertEqual(store.read(batch.node.identity), source)

    def test_immutable_values_are_stored_once_and_shared_across_documents_and_keys(self):
        store = model.MemoryStore()
        a = model.decompose(dict(author_key='a', doc_id='p', first='shared', second='shared'), 1)
        b = model.decompose(dict(author_key='b', doc_id='p', another='shared'), 1)
        self.install(store, a)
        self.install(store, b)
        self.assertEqual(len(store.values), 1)
        self.assertEqual(a.pointers[0].value_row_id, b.pointers[0].value_row_id)
        changed = model.decompose(dict(author_key='a', doc_id='p', first='new', second='shared'), 2, previous=a.pointers)
        self.install(store, changed)
        self.assertEqual(len(store.values), 2)
        self.assertEqual(store.read(a.node.identity, at=1)['first'], 'shared')
        self.assertEqual(store.read(b.node.identity)['another'], 'shared')

    def test_removed_nested_keys_and_array_members_are_pointer_tombstones_not_resurrected_history(self):
        store = model.MemoryStore()
        first = model.decompose(dict(author_key='a', doc_id='p', body={'old': 1, 'keep': [1,2,3]}), 1)
        second = model.decompose(dict(author_key='a', doc_id='p', body={'keep': [9]}), 2, previous=first.pointers)
        self.install(store, first)
        self.install(store, second)
        tombstones = {model.decode_path(p.key) for p in second.pointers if p.deleted}
        self.assertEqual(tombstones, {('body','old'), ('body','keep',1), ('body','keep',2)})
        self.assertEqual(store.read(second.node.identity)['body'], {'keep': [9]})
        self.assertEqual(store.read(first.node.identity, at=1)['body']['old'], 1)

    def test_partial_staging_never_advances_the_committed_document(self):
        store = model.MemoryStore()
        first = model.decompose(dict(author_key='a', doc_id='p', text='old'), 1)
        second = model.decompose(dict(author_key='a', doc_id='p', text='new', extra=True), 2, previous=first.pointers)
        self.install(store, first)
        store.stage(second)
        self.assertEqual(store.read(first.node.identity)['text'], 'old')
        missing = replace(second, pointers=second.pointers[:-1])
        broken = model.MemoryStore()
        broken.stage(missing)
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            broken.publish(second.node)
        self.assertIsNone(broken.read(second.node.identity))

    def test_tampered_values_mixed_versions_and_same_version_conflicts_refuse(self):
        source = dict(author_key='a', doc_id='p', text='truth')
        batch = model.decompose(source, 1)
        store = model.MemoryStore()
        self.install(store, batch)
        old = batch.pointers[0]
        with self.assertRaisesRegex(ValueError, 'mixed-version'):
            model.assemble(batch.node, [replace(old, version=0)], store.values, store.identities)
        store.values[old.type, old.value_row_id] = model.Value('text', 'forged')
        with self.assertRaisesRegex(ValueError, 'immutable'):
            store.read(batch.node.identity)
        with self.assertRaisesRegex(ValueError, 'version conflict'):
            store.stage(model.decompose({**source, 'text': 'conflict'}, 1))

    def test_deletion_and_newer_restore_keep_full_author_identity_separate(self):
        store = model.MemoryStore()
        a = model.decompose(dict(author_key='a', doc_id='same', text='a'), 1)
        b = model.decompose(dict(author_key='b', doc_id='same', text='b'), 1)
        self.install(store, a)
        self.install(store, b)
        deleted = model.decompose(dict(author_key='a', doc_id='same'), 2, deleted=True, previous=a.pointers)
        self.install(store, deleted)
        self.assertIsNone(store.read(a.node.identity))
        self.assertEqual(store.read(b.node.identity)['text'], 'b')
        restored = model.decompose(dict(author_key='a', doc_id='same', text='restored'), 3)
        self.install(store, restored)
        self.assertEqual(store.read(a.node.identity)['text'], 'restored')

    def test_edges_address_document_identity_rows_without_following_or_borrowing_content(self):
        target = model.Identity('target-owner', 'root')
        batch = model.decompose(dict(author_key='a', doc_id='repost', ref_value='root'), 1,
            references={('ref_value',): target})
        self.assertEqual(batch.values, ())
        self.assertEqual(batch.pointers[0].type, 'documents')
        self.assertEqual(batch.pointers[0].value_row_id, target.row_id)
        store = model.MemoryStore()
        self.install(store, batch)
        self.assertEqual(store.read(batch.node.identity)['ref_value'], 'root')
        self.assertIsNone(store.read(target))  # No target content was read or granted.

    def test_unsupported_or_ambiguous_values_refuse_at_ingest_not_string_cast_on_read(self):
        for value in (math.inf, math.nan, 2**255, datetime(2026,1,1), {'bad': {1: 'not JSON'}}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                model.decompose(dict(author_key='a', doc_id='p', value=value), 1)
        self.assertNotEqual(model.Value('floats', 0.0).row_id, model.Value('floats', -0.0).row_id)
        self.assertNotEqual(model.Value('integers', 1).row_id, model.Value('booleans', True).row_id)

    def test_source_JSON_is_ingest_only_and_deletion_wins_timestamp_ties(self):
        source = dict(author_key='a', doc_id='p', body='{"text":"source","nested":{"n":1}}',
            updated_at='2026-11-19T00:00:00+00:00', deleted=0)
        versions = ingest.source_versions([source, {**source, 'deleted': 1}])
        self.assertTrue(versions[0][2])
        with self.assertRaisesRegex(ValueError, 'conflicting canonical'):
            ingest.source_versions([source, {**source, 'body':'{"text":"other"}'}])
        with self.assertRaisesRegex(ValueError, 'duplicate JSON'):
            ingest.parse_source({**source, 'body':'{"text":1,"text":2}'})

    def test_all_DDL_and_seeks_are_skinny_typed_and_do_not_extract_or_cast_JSON_values(self):
        batch = model.decompose(dict(author_key='a', doc_id='p', body={'text': 'payload'}), 1)
        statements = [*sql.DDL, sql.nodes([batch.node.identity]), sql.pointers([batch.node]),
            sql.pointers([batch.node], paths=[('body','text')]), sql.values('text', ['row'])]
        for statement in statements:
            tree = sqlglot.parse_one(statement, read='clickhouse')
            self.assertFalse(list(tree.find_all(exp.Cast)))
            self.assertNotIn('JSON', statement)
            self.assertNotIn('PROJECTION', statement)
            self.assertNotIn('body String', statement)
        self.assertIn('LowCardinality(String)', sql.DDL[2])
        self.assertNotIn('posts', ' '.join(sql.DDL))

    def test_real_typed_store_reads_new_rows_and_shares_values_without_JSON_runtime(self):
        driver = TypedDriver()
        store = Store(driver.query, driver.insert)
        source = dict(author_key='a', doc_id='p', body={'text':'shared', 'n':4, 'maybe':None}, tags=['post'])
        batch = model.decompose(source, 1)
        store.write(batch, setup_only=True, writers_stopped=True)
        self.assertEqual(store.read([batch.node.identity])[batch.node.identity], source)
        shared = model.decompose(dict(author_key='b', doc_id='p', text='shared'), 1)
        store.write(shared, setup_only=True, writers_stopped=True)
        stored_text = [row for row in driver.tables['row_text'] if row['value'] == 'shared']
        self.assertEqual(len(stored_text), 1)
        self.assertTrue(all('JSON' not in statement for statement in driver.statements))

    def test_displayed_key_read_requires_frozen_verification_and_does_not_fetch_other_payloads(self):
        driver = TypedDriver()
        store = Store(driver.query, driver.insert)
        source = dict(author_key='a', doc_id='p', body={'text':'shown', 'secret-unused':'not requested'}, extra=77)
        batch = model.decompose(source, 1)
        store.write(batch, setup_only=True, writers_stopped=True)
        with self.assertRaisesRegex(ValueError, 'fences'):
            store.read([batch.node.identity], paths=[('body','text')])
        class Frozen:
            def verify(self):
                return True
        before = len(driver.statements)
        projected = store.read([batch.node.identity], paths=[('body','text')], frozen=Frozen())
        self.assertEqual(projected[batch.node.identity], {('body','text'):'shown'})
        fetched = '\n'.join(driver.statements[before:])
        unused = model.Value('text', 'not requested').row_id
        self.assertNotIn(unused, fetched)
        self.assertNotIn(model.Value('integers', 77).row_id, fetched)

    def test_driver_string_numbers_are_not_silently_cast_to_make_the_row_model_pass(self):
        value = model.Value('integers', 42)
        with self.assertRaisesRegex(ValueError, 'typed integer'):
            value_rows('integers', [dict(value_row_id=value.row_id, value='42')])

    def test_batch_write_preserves_multiple_complete_versions_before_one_commit_insert(self):
        driver = TypedDriver()
        store = Store(driver.query, driver.insert)
        first = model.decompose(dict(author_key='a', doc_id='p', text='old'), 1)
        second = model.decompose(dict(author_key='a', doc_id='p', text='new'), 2, previous=first.pointers)
        store.write_many([first, second], setup_only=True, writers_stopped=True)
        self.assertEqual(store.read([first.node.identity])[first.node.identity]['text'], 'new')
        commits = [rows for table, rows, _ in driver.inserts if table == 'row_document_versions']
        self.assertEqual(len(commits), 1)
        self.assertEqual(len(commits[0]), 2)

    def test_selected_read_conflicting_tombstone_refuses_even_with_a_frozen_flag(self):
        batch = model.decompose(dict(author_key='a', doc_id='p', text='live'), 1)
        value = batch.values[0]
        pointer = batch.pointers[0]
        tombstone = replace(pointer, deleted=True, type='', value_row_id='')
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            model.assemble_selected(batch.node, [pointer, tombstone], {(value.type, value.row_id):value}, {},
                [('text',)], frozen_verified=True)

    def test_parity_is_key_and_type_exact_not_python_boolean_integer_equality(self):
        self.assertFalse(model.exact_equal({'n': True}, {'n': 1}))
        self.assertFalse(model.exact_equal({'n': -0.0}, {'n': 0.0}))
        self.assertFalse(model.exact_equal({'n': None}, {}))
        self.assertTrue(model.exact_equal({'n': [1, True, None]}, {'n': [1, True, None]}))

    def test_frozen_part_fence_denies_changed_parts_or_missing_typed_tables(self):
        parts = [dict(table='row_text', name='part', rows=2, data_version=1)]
        tables = [dict(name=name) for name in fence.TABLES]
        receipt = dict(parity='PASS', source_binding={'test':'source'}, query_ids=['native'],
            domains={name:['actual-root'] for name in fence.DOMAINS}, parts_digest=fence.fingerprint(parts))
        def query(statement):
            return tables if 'system.tables' in statement else parts
        checked = fence.Fence(query, receipt, {'test':'source'})
        self.assertTrue(checked.verify())
        parts[0]['data_version'] = 2
        with self.assertRaisesRegex(ValueError, 'changed'):
            checked.verify()
        parts[0]['data_version'] = 1
        tables.pop()
        with self.assertRaisesRegex(ValueError, 'disappeared'):
            checked.verify()

    def test_verifier_cannot_zero_default_an_unqueried_actual_domain(self):
        identity = model.Identity('a', 'p')
        domains = {name:[identity] for name in fence.DOMAINS}
        canonical = lambda ids: {i:dict(author_key=i.author_key, doc_id=i.doc_id) for i in ids}
        result = cell.verify_domains(canonical, canonical, domains)
        self.assertEqual(result['parity'], 'PASS')
        with self.assertRaisesRegex(ValueError, 'omitted'):
            cell.verify_domains(lambda ids:{}, canonical, domains)
        with self.assertRaisesRegex(ValueError, 'required'):
            cell.verify_domains(canonical, canonical, {**domains, 'paired':[]})
        with self.assertRaisesRegex(ValueError, 'parity mismatch'):
            cell.verify_domains(lambda ids:{i:None for i in ids}, canonical, domains)

    def test_assembly_economics_are_separate_axes_and_zero_or_nonfinite_control_never_passes(self):
        baseline = dict(parity='PASS', read_rows=10, read_bytes=100, elapsed_ms=2)
        ordinary = cell.assembly_comparison(baseline, {**baseline, 'read_bytes':200})
        self.assertEqual(ordinary['verdict'], 'SAME_ORDER_OF_MAGNITUDE_PAGE_SCALE_ONLY')
        expensive = cell.assembly_comparison(baseline, {**baseline, 'read_bytes':1100})
        self.assertEqual(expensive['verdict'], 'MAXIMAL_REJECTED_ORDER_OF_MAGNITUDE')
        self.assertEqual(expensive['order_of_magnitude_axes'], ['read_bytes'])
        zero = cell.assembly_comparison({**baseline, 'read_rows':0}, baseline)
        self.assertEqual(zero['verdict'], 'UNDEFINED_ZERO_CONTROL')
        with self.assertRaises(ValueError):
            cell.assembly_comparison(baseline, {**baseline, 'elapsed_ms':math.nan})
        self.assertFalse(ordinary['production_acceptance'])

    def test_stream_builder_reads_complete_identity_histories_and_commits_all_versions(self):
        driver = TypedDriver()
        store = Store(driver.query, driver.insert)
        checkpoints, queries = [], []
        row = dict(author_key='a', doc_id='p', collection_name='posts', body='{"text":"old"}',
            ref_value='', ad_target='', created_at='2026-11-18T00:00:00Z', updated_at='2026-11-18T00:00:00Z', deleted=0)
        def source(statement):
            queries.append(statement)
            if statement.startswith('SELECT DISTINCT'):
                return [] if 'WHERE (author_key,doc_id)>' in statement else [dict(author_key='a', doc_id='p')]
            return [row, {**row, 'body':'{"text":"new"}', 'updated_at':'2026-11-19T00:00:00Z'}]
        builder = build.Builder(source, store, checkpoints.append, source_tables=['engagement_documents'], quiescent_verified=True)
        result = builder.run()
        self.assertEqual((result['identities'], result['versions']), (1,2))
        self.assertEqual(store.read([model.Identity('a','p')])[model.Identity('a','p')]['body'], {'text':'new'})
        self.assertEqual(len(checkpoints), 1)
        self.assertNotIn('LIMIT', next(q for q in queries if not q.startswith('SELECT DISTINCT')))
        with self.assertRaisesRegex(ValueError, 'frozen'):
            build.Builder(source, store, checkpoints.append, source_tables=['engagement_documents'])

    def test_legacy_relationships_cannot_sneak_back_as_text_or_guessed_target_authors(self):
        for document in (dict(ref_value=False), dict(body={'target_id':None}), dict(body={'refs':[False]})):
            with self.subTest(document=document), self.assertRaises(ValueError):
                build.declared_edges(document)
        edges = build.declared_edges(dict(ref_value='root', ad_target='ad', body={'refs':['extra']}))
        self.assertEqual(edges, {('ref_value',):'root', ('ad_target',):'ad', ('body','refs',0):'extra'})
        builder = build.Builder(lambda statement:[], None, None, source_tables=['engagement_documents'], quiescent_verified=True)
        with self.assertRaisesRegex(ValueError, 'no indexed identity'):
            builder.reference_owners({'root'})

    def test_no_row_model_measurement_without_all_fixes_banking_and_native_verification(self):
        class Actions:
            def measure(self, *args):
                raise AssertionError('must not measure before the prerequisite bank')
        with self.assertRaises(ValueError):
            cell.measure(Actions(), {'stages':{}}, {})

    def test_interrupted_native_build_does_not_publish_a_partial_document_commit(self):
        driver = TypedDriver()
        def partial_insert(table, rows, columns):
            if table == 'row_pointers':
                rows = rows[:-1]
            driver.insert(table, rows, columns)
        store = Store(driver.query, partial_insert)
        batch = model.decompose(dict(author_key='a', doc_id='p', first='one', second='two'), 1)
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            store.write(batch, setup_only=True, writers_stopped=True)
        self.assertNotIn('row_document_versions', driver.tables)
        self.assertTrue(driver.tables['row_text'])  # Unreferenced values survive; GC is a separate question.


if __name__ == '__main__':
    unittest.main()
