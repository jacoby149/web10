"""Rebuild orchestration/value-census denial, without an engine or cloud action."""
import json
from pathlib import Path
import tempfile
import unittest

import engagement_event_layout as layout

SCHEMA = [dict(name=n, type=t, default_type='') for n,t in (
    ('doc_id','String'), ('service','String'), ('reader_key','String'), ('surface','String'),
    ('event_type','String'), ('payload','String'), ('seen_at','DateTime64(3)'), ('extra','Nullable(String)'))]
CENSUS = [dict(day='2026-01-01', n='3', city_sum='123', sip_sum='234', sip_xor='345'),
    dict(day='2026-01-02', n='2', city_sum='456', sip_sum='567', sip_xor='678')]


class Session:
    def __init__(self, root, bad=None):
        self.root, self.bad = Path(root), bad
        self.ledger = self.root / 'ledger.jsonl'
        self.calls, self.receipts = [], {}

    def query(self, label, sql, **kwargs):
        self.calls.append((label, sql))
        query_id = 'test-' + str(len(self.calls))
        with self.ledger.open('a') as stream:
            stream.write(json.dumps(dict(phase='start', label=label, query_id=query_id))+'\n')
        failed = self.bad == 'native' and label == 'events_layout_rebuild'
        self.receipts[query_id] = dict(type='ExceptionWhileProcessing' if failed else 'QueryFinish',
            exception_code=241 if failed else 0, read_rows=5, read_bytes=300, written_rows=5,
            written_bytes=300, memory_usage=123, query_duration_ms=17)
        if failed:
            raise ValueError('native241')
        return '', query_id

    def rows(self, label, sql):
        _, query_id = self.query(label, sql)
        if label == 'events_layout_preflight':
            values = [dict(name='content_events', engine='MergeTree')]
            if self.bad == 'existing':
                values.append(dict(name=layout.TABLE, engine='MergeTree'))
        elif label == 'events_layout_database':
            values = [dict(engine='Ordinary' if self.bad == 'database' else 'Atomic')]
        elif label.endswith('_schema'):
            values = SCHEMA[:-1] if self.bad == 'schema' and 'new' in label else SCHEMA
        else:
            values = [dict(r) for r in CENSUS]
            if label == 'events_layout_new_census' and self.bad in ('n', 'city_sum', 'sip_sum', 'sip_xor'):
                values[0][self.bad] = str(int(values[0][self.bad])+1)
        return values, query_id

    def native(self, query_id):
        return self.receipts[query_id]


class LayoutTests(unittest.TestCase):
    def test_one_sorted_insert_clones_every_live_column_and_identity_precedes_exchange_and_retirement(self):
        with tempfile.TemporaryDirectory() as root:
            session = Session(root)
            result = layout.rebuild(session, root, writers_stopped=True, expected_events=5)
            self.assertEqual(result['outcome'], 'PASS')
            inserts = [sql for _,sql in session.calls if sql.startswith('INSERT ')]
            self.assertEqual(len(inserts), 1)
            self.assertIn('FROM content_events ORDER BY toDate(seen_at),doc_id,reader_key', inserts[0])
            self.assertNotIn(' WHERE ', inserts[0])
            self.assertIn('`payload`,`seen_at`,`extra`', inserts[0])
            self.assertIn('PARTITION BY toDate(seen_at) ORDER BY (doc_id,reader_key)', layout.DDL)
            self.assertIn(' AS content_events ENGINE=MergeTree ', layout.DDL)
            labels = [label for label,_ in session.calls]
            self.assertLess(labels.index('events_layout_new_census'), labels.index('events_layout_swap'))
            self.assertLess(labels.index('events_layout_swap'), labels.index('events_layout_retire_old'))
            identity = json.loads((Path(root)/'events-layout/identity.json').read_bytes())
            self.assertNotIn('swapped', identity)
            self.assertEqual(identity['identity'], 'PASS')
            self.assertEqual(json.loads((Path(root)/'events-layout/old-census.json').read_bytes()), CENSUS)
            self.assertEqual(json.loads((Path(root)/'events-layout/new-census.json').read_bytes()), CENSUS)
            rebuild = next(s for s in result['statements'] if s['label']=='events_layout_rebuild')
            self.assertEqual(rebuild['native']['written_rows'], 5)
            self.assertEqual(rebuild['native']['memory_usage'], 123)
            with self.assertRaises(FileExistsError):
                layout.rebuild(session, root, writers_stopped=True, expected_events=5)

    def test_schema_database_existing_destination_or_any_value_census_difference_prevents_swap(self):
        for bad in ('schema', 'database', 'existing', 'n', 'city_sum', 'sip_sum', 'sip_xor'):
            with self.subTest(bad=bad), tempfile.TemporaryDirectory() as root:
                session = Session(root, bad)
                with self.assertRaises(ValueError):
                    layout.rebuild(session, root, writers_stopped=True, expected_events=5)
                self.assertFalse(any('EXCHANGE ' in sql or sql.startswith('DROP ') for _,sql in session.calls))
                self.assertEqual(json.loads((Path(root)/'events-layout/build.json').read_bytes())['outcome'], 'INCOMPLETE')

    def test_native_failure_is_preserved_with_partial_io_and_no_retry_or_swap(self):
        with tempfile.TemporaryDirectory() as root:
            session = Session(root, 'native')
            with self.assertRaisesRegex(ValueError, 'native241'):
                layout.rebuild(session, root, writers_stopped=True, expected_events=5)
            record = json.loads((Path(root)/'events-layout/build.json').read_bytes())
            self.assertEqual(record['statements'][-1]['native']['exception_code'], 241)
            self.assertEqual(record['statements'][-1]['native']['written_bytes'], 300)
            self.assertEqual(sum(sql.startswith('INSERT ') for _,sql in session.calls), 1)
            self.assertFalse(any(sql.startswith('EXCHANGE ') for _,sql in session.calls))

    def test_census_hashes_all_values_with_multiplicity_not_just_doc_reader_or_distinct(self):
        sql = layout.census('content_events', SCHEMA)
        for row in SCHEMA:
            self.assertIn('`'+row['name']+'`', sql)
        self.assertIn('count()', sql)
        self.assertIn('sumWithOverflow(cityHash64(tuple(', sql)
        self.assertIn('sumWithOverflow(sipHash64(tuple(', sql)
        self.assertIn('groupBitXor(sipHash64(tuple(', sql)
        self.assertNotIn('DISTINCT', sql)
        for rows in (CENSUS+CENSUS, [], [{**CENSUS[0], 'n': 5}]):
            with self.assertRaises(ValueError):
                layout.identity(rows, 6)

    def test_live_writers_refuse_before_queries(self):
        with tempfile.TemporaryDirectory() as root:
            session = Session(root)
            with self.assertRaises(ValueError):
                layout.rebuild(session, root, writers_stopped=False)
            self.assertEqual(session.calls, [])


if __name__ == '__main__':
    unittest.main()
