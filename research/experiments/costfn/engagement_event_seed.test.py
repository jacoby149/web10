"""No-engine day/group-key coverage, exact STATES shape and receipt controls."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import sqlglot
from sqlglot import exp

import engagement_event_seed as seed
import engagement_events as events
import engagement_all_time_seed as all_time


class Session:
    def __init__(self, root, fail=False):
        self.root, self.fail = Path(root), fail
        self.ledger = self.root / 'ledger.jsonl'
        self.calls, self.receipts = [], {}

    def query(self, label, sql):
        self.calls.append((label, sql))
        query_id = 'fanout-f-test' + str(len(self.calls))
        with self.ledger.open('a') as log:
            log.write(json.dumps(dict(phase='start', label=label, query_id=query_id)) + '\n')
        failed = self.fail and label == 'composition_aggregate_seed_slice_0'
        self.receipts[query_id] = dict(query_id=query_id, type='ExceptionWhileProcessing' if failed else 'QueryFinish',
            exception_code=241 if failed else 0, read_rows=1000, read_bytes=8000, memory_usage=12345)
        if failed:
            raise ValueError('native241')
        return b'', query_id

    def rows(self, label, sql):
        _, query_id = self.query(label, sql)
        if label.startswith('composition_aggregate_all_time_keys_'):
            return [dict(doc_id='a'), dict(doc_id='b')], query_id
        if label == 'composition_aggregate_all_time_census':
            return [dict(row_count=3, events=5)], query_id
        return [dict(day='2026-01-01', n=2), dict(day='2026-01-02', n=3)], query_id

    def native(self, query_id):
        return self.receipts[query_id]


class SeedTests(unittest.TestCase):
    def test_real_install_batches_all_time_by_complete_doc_keys_instead_of_one_global_merge(self):
        with tempfile.TemporaryDirectory() as directory:
            class ManyKeys(Session):
                def rows(self, label, sql):
                    if label.startswith('composition_aggregate_all_time_keys_'):
                        _, identity = self.query(label, sql)
                        keys = range(4097) if label.endswith('_0') else [4096]
                        return [dict(doc_id=f'd{k:05d}') for k in keys], identity
                    return super().rows(label, sql)
            session = ManyKeys(directory)
            result = seed.install(session, directory, writers_stopped=True, expected_events=5)
            batches = result['all_time']['batches']
            self.assertEqual([b['distinct_documents'] for b in batches], [4096, 1])
            self.assertEqual(batches[0]['upper_exclusive'], batches[1]['lower_inclusive'])
            self.assertIsNone(batches[0]['lower_inclusive'])
            self.assertIsNone(batches[-1]['upper_exclusive'])
            self.assertEqual(result['all_time']['outcome'], 'PASS')
            labels = [label for label, _ in session.calls]
            self.assertNotIn('composition_aggregate_all_time_derive', labels)
            self.assertLess(labels.index('composition_aggregate_seed_reconcile'), labels.index('composition_aggregate_all_time_keys_0'))
            self.assertLess(labels.index('composition_aggregate_all_time_batch_1'), labels.index('composition_aggregate_all_time_census'))
            for value in [*batches, *result['all_time']['inventory']]:
                self.assertIn('query_id', value)
                self.assertEqual(value['native']['memory_usage'], 12345)
            self.assertEqual(result['all_time']['native_read_rows'], 2000)

    def test_all_time_pages_are_bounded_keyset_seeks_not_offsets_or_a_full_key_catalogue(self):
        self.assertIn('LIMIT 4097', all_time.inventory(None))
        lower = "a'\\\x00é"
        sql = all_time.inventory(lower, 2)
        self.assertIn("doc_id>=unhex('" + lower.encode().hex() + "')", sql)
        self.assertIn('SELECT DISTINCT doc_id FROM content_events_aggregated', sql)
        self.assertIn('ORDER BY doc_id LIMIT 3', sql)
        self.assertNotIn('OFFSET', sql)
        for limit in (0, -1, True, 4097):
            with self.assertRaises(ValueError):
                all_time.inventory(None, limit)

    def test_all_time_range_predicate_is_the_only_change_to_exact_state_merge(self):
        baseline = sqlglot.parse_one(events.ALL_TIME_SEED, read='clickhouse')
        for lower, upper in ((None, 'a'), ('a', 'b'), ('b', None), (None, None)):
            value = dict(lower_inclusive=lower, upper_exclusive=upper, distinct_documents=1)
            tree = sqlglot.parse_one(all_time.statement(value), read='clickhouse')
            select = tree.find(exp.Select)
            select.set('where', None)
            self.assertEqual(tree, baseline)
        for lower, upper in (('b', 'a'), ('a', 'a')):
            with self.assertRaises(ValueError):
                all_time.statement(dict(lower_inclusive=lower, upper_exclusive=upper, distinct_documents=1))

    def test_all_time_complete_key_ranges_cover_empty_unicode_and_boundary_ids_exactly_once(self):
        keys = ['', 'a', 'a\x00', 'b', 'é', '雪']
        ranges, lower = [], None
        while True:
            page = [dict(doc_id=key) for key in keys if lower is None or key >= lower][:3]
            current = all_time.batch(page, lower, 2)
            ranges.append(current)
            lower = current['upper_exclusive']
            if lower is None:
                break
        for key in keys:
            owners = [r for r in ranges if (r['lower_inclusive'] is None or key >= r['lower_inclusive'])
                and (r['upper_exclusive'] is None or key < r['upper_exclusive'])]
            self.assertEqual(len(owners), 1, key)
        self.assertEqual(sum(r['distinct_documents'] for r in ranges), len(keys))

    def test_malformed_or_nonadvancing_all_time_page_refuses_instead_of_skipping_keys(self):
        for keys, lower in (([], None), (['b', 'a'], None), (['a', 'a'], None),
                (['a', 'b', 'c', 'd'], None), (['b'], 'a'), ([None], None)):
            with self.subTest(keys=keys, lower=lower), self.assertRaises(ValueError):
                all_time.batch([dict(doc_id=k) for k in keys], lower, 2)

    def test_batched_merge_preserves_cross_day_and_cross_insert_exact_reach_and_all_services(self):
        states = [('a','posts','delivery',2,{'r1'}), ('a','posts','delivery',2,{'r1','r2'}),
            ('a','music','open',1,{'r1'}), ('b','posts','delivery',1,{'r3'}),
            ('b','posts','delivery',1,{'r3'}), ('c','posts','delivery',1,{'r4'})]
        def merge(values):
            result = defaultdict(lambda: [0,set()])
            for doc, service, event, count, readers in values:
                result[doc,service,event][0] += count
                result[doc,service,event][1].update(readers)
            return dict(result)
        actual, lower = {}, None
        while True:
            keys = sorted({s[0] for s in states if lower is None or s[0] >= lower})[:3]
            current = all_time.batch([dict(doc_id=k) for k in keys], lower, 2)
            upper = current['upper_exclusive']
            owned = [s for s in states if (lower is None or s[0] >= lower) and (upper is None or s[0] < upper)]
            merged = merge(owned)
            self.assertFalse(actual.keys() & merged.keys())
            actual.update(merged)
            lower = upper
            if lower is None:
                break
        self.assertEqual(actual, merge(states))
        self.assertEqual(actual['a','posts','delivery'], [4, {'r1','r2'}])

    def test_failed_all_time_batch_preserves_day_proof_and_native_failure_without_retry_or_census(self):
        with tempfile.TemporaryDirectory() as directory:
            class FailedAllTime(Session):
                def query(self, label, sql):
                    value, query_id = super().query(label, sql)
                    if label == 'composition_aggregate_all_time_batch_0':
                        self.receipts[query_id].update(type='ExceptionWhileProcessing', exception_code=241,
                            written_rows=7, written_bytes=70)
                        raise ValueError('native241')
                    return value, query_id
            session = FailedAllTime(directory)
            with self.assertRaisesRegex(ValueError, 'native241'):
                seed.install(session, directory, writers_stopped=True, expected_events=5)
            record = json.loads((Path(directory)/'aggregate-seed/build.json').read_bytes())
            self.assertEqual(record['day_matched_events'], 5)
            self.assertEqual(record['all_time']['outcome'], 'INCOMPLETE')
            failed = record['all_time']['batches'][0]
            self.assertEqual(failed['outcome'], 'INCOMPLETE')
            self.assertEqual(failed['native']['exception_code'], 241)
            self.assertEqual(failed['native']['written_rows'], 7)
            labels = [label for label, _ in session.calls]
            self.assertEqual(labels.count('composition_aggregate_all_time_batch_0'), 1)
            self.assertNotIn('composition_aggregate_all_time_census', labels)
            original = (Path(directory)/'aggregate-seed/build.json').read_bytes()
            with self.assertRaises(FileExistsError):
                seed.install(session, directory, writers_stopped=True, expected_events=5)
            self.assertEqual((Path(directory)/'aggregate-seed/build.json').read_bytes(), original)

    def test_day_is_a_group_key_every_group_has_exactly_one_slice_and_never_straddles(self):
        slices = seed.plan('2026-01-01', '2026-01-06')
        self.assertEqual(Counter(s['day_start'] for s in slices), {f'2026-01-0{n}': 1 for n in range(1, 6)})
        for day in range(1, 6):
            for doc in ('doc-a', 'doc-b'):
                owners = [s for s in slices if s['day_start'] <= f'2026-01-0{day}' < s['day_end']]
                self.assertEqual(len(owners), 1, (doc, day))

    def test_optional_doc_hash_bucket_is_also_a_group_key_disjoint_and_exhaustive(self):
        slices = seed.plan('2026-01-01', '2026-01-04', {'2026-01-02': 4})
        for day in range(1, 4):
            for doc_hash in range(256):
                owners = [s for s in slices if s['day_start'] <= f'2026-01-0{day}' < s['day_end']
                    and doc_hash % s['buckets'] == s['bucket']]
                self.assertEqual(len(owners), 1)
        sql = seed.statement(slices[2])
        self.assertIn('cityHash64(doc_id)%4=1', sql)
        self.assertNotIn('cityHash64(reader_key)', sql)

    def test_each_slice_is_banked_states_select_plus_only_group_key_predicate_and_matches_view(self):
        self.assertEqual(events.MV, 'CREATE MATERIALIZED VIEW content_events_aggregated_insert TO content_events_aggregated AS ' + events.STATES)
        baseline = sqlglot.parse_one(events.SEED, read='clickhouse')
        for slice in seed.plan('2026-01-01', '2026-01-04', {'2026-01-02': 4}):
            tree = sqlglot.parse_one(seed.statement(slice), read='clickhouse')
            selected = tree.find(exp.Select)
            predicate = selected.args['where'].sql(dialect='clickhouse')
            self.assertIn('seen_at', predicate)
            selected.set('where', None)
            self.assertEqual(tree, baseline)

    def test_duplicates_and_cross_day_reader_reach_are_exact_not_summed_distinct_counts(self):
        rows = [('a','posts','delivery','2026-01-01','r1')]*2 + [
            ('a','posts','delivery','2026-01-02','r1'), ('a','posts','delivery','2026-01-02','r2'),
            ('b','music','open','2026-01-01','r3')]
        def states(values):
            result = defaultdict(lambda: [0, set()])
            for doc, service, kind, day, reader in values:
                result[doc,service,kind,day][0] += 1
                result[doc,service,kind,day][1].add(reader)
            return dict(result)
        expected, actual = states(rows), {}
        for slice in seed.plan('2026-01-01', '2026-01-03', {'2026-01-02': 3}):
            owned = [r for r in rows if slice['day_start'] <= r[3] < slice['day_end']
                and int(hashlib.sha256(r[0].encode()).hexdigest(),16) % slice['buckets'] == slice['bucket']]
            current = states(owned)
            self.assertFalse(set(actual) & set(current), 'a group must never be split across seed statements')
            actual.update(current)
        self.assertEqual(actual, expected)
        self.assertEqual(sum(v[0] for k,v in actual.items() if k[0]=='a'), 4)
        self.assertEqual(len(set().union(*(v[1] for k,v in actual.items() if k[0]=='a'))), 2)

    def test_install_order_receipts_memory_and_exact_matched_counts_are_separate_from_scan_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(directory)
            result = seed.install(session, directory, writers_stopped=True, expected_events=5)
            self.assertEqual(session.calls[0][1], events.DDL)
            self.assertEqual(session.calls[1][1], events.ALL_TIME_DDL)
            self.assertEqual(session.calls[2][1], events.MV)
            self.assertEqual(session.calls[3][1], events.ALL_TIME_MV)
            self.assertEqual(result['outcome'], 'PASS')
            self.assertEqual(result['matched_events'], 5)
            self.assertEqual(result['native_seed_read_rows'], 2000)
            self.assertTrue(all(s['native']['memory_usage']==12345 for s in result['slices']))
            self.assertEqual(len([s for s in session.calls if s[0].startswith('composition_aggregate_seed_slice_')]), 2)
            original = (Path(directory)/'aggregate-seed/build.json').read_bytes()
            with self.assertRaises(FileExistsError):
                seed.install(session, directory, writers_stopped=True, expected_events=5)
            self.assertEqual((Path(directory)/'aggregate-seed/build.json').read_bytes(), original)

    def test_failed_slice_preserves_native_memory_and_partial_actuals_and_never_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(directory, fail=True)
            with self.assertRaisesRegex(ValueError, 'native241'):
                seed.install(session, directory, writers_stopped=True, expected_events=5)
            record = json.loads((Path(directory)/'aggregate-seed/build.json').read_bytes())
            self.assertEqual(record['outcome'], 'INCOMPLETE')
            self.assertEqual(record['slices'][0]['native']['exception_code'], 241)
            self.assertEqual(record['slices'][0]['native']['memory_usage'], 12345)
            self.assertEqual(record['slices'][1]['outcome'], 'PLANNED')
            self.assertEqual(sum(label=='composition_aggregate_seed_slice_0' for label,_ in session.calls), 1)

    def test_native_completion_receipt_supplies_memory_without_extra_native_queries(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(directory)
            path = Path(directory)/'native-operations/fanout-f-original/receipt.json'
            path.parent.mkdir(parents=True)
            value = dict(memory_usage=123, read_rows=9, read_bytes=99, exception_code=0)
            path.write_text(json.dumps({'native': value}))
            self.assertEqual(seed.native(session, 'fanout-f-original'), value)
            self.assertEqual(session.calls, [])

    def test_wrong_population_or_unstopped_writer_refuses_before_any_seed_statement(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(directory)
            with self.assertRaises(ValueError):
                seed.install(session, directory, writers_stopped=False)
            self.assertEqual(session.calls, [])
            with self.assertRaisesRegex(ValueError, 'event population'):
                seed.install(session, directory, writers_stopped=True, expected_events=6)
            self.assertFalse(any(label.startswith('composition_aggregate_seed_slice_') for label,_ in session.calls))

    def test_wrong_final_impression_state_count_cannot_bank_a_completed_seed(self):
        with tempfile.TemporaryDirectory() as directory:
            class WrongCount(Session):
                def rows(self, label, sql):
                    values, query_id = super().rows(label, sql)
                    if label == 'composition_aggregate_seed_reconcile':
                        values[1]['n'] = 4
                    return values, query_id
            with self.assertRaisesRegex(ValueError, 'impression states differ'):
                seed.install(WrongCount(directory), directory, writers_stopped=True, expected_events=5)
            record = json.loads((Path(directory)/'aggregate-seed/build.json').read_bytes())
            self.assertEqual(record['outcome'], 'INCOMPLETE')
            self.assertNotIn('matched_events', record)

    def test_native_memory_is_mandatory_not_an_invented_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(directory)
            session.receipts['missing'] = dict(read_rows=1, read_bytes=8, exception_code=0)
            with self.assertRaisesRegex(ValueError, 'memory and I/O actuals required'):
                seed.native(session, 'missing')

    def test_bad_all_time_population_preserves_day_proof_but_blocks_build(self):
        with tempfile.TemporaryDirectory() as directory:
            class WrongAllTime(Session):
                def rows(self, label, sql):
                    values, query_id = super().rows(label, sql)
                    if label == 'composition_aggregate_all_time_census':
                        values[0]['events'] = 6
                    return values, query_id
            with self.assertRaisesRegex(ValueError, 'all-time merged states'):
                seed.install(WrongAllTime(directory), directory, writers_stopped=True, expected_events=5)
            record = json.loads((Path(directory)/'aggregate-seed/build.json').read_bytes())
            self.assertEqual(record['outcome'], 'INCOMPLETE')
            self.assertEqual(record['day_matched_events'], 5)
            self.assertTrue(record['day_counts_exact'])


if __name__ == '__main__':
    unittest.main()
