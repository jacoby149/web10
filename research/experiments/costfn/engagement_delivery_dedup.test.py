"""Exact-shape admission and complete attempt6 replay, without an engine/network."""
import csv
import hashlib
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import engagement_composition as audit

HERE = Path(__file__).parent
FIXTURE = HERE / 'fixtures/delivery-dedup-audit.json'
BANKED = HERE / 'evidence/all-fixes-batched-20261120'
STAGE = 'delivery_dedup_raw_read'
DIGESTS = ('522806ca9abf1ca1da36fc2481e0e884ad32526ba83d8b021b2263f58e51f02a',
    '8ea0e3427a6da7f1c1bd1d045ad68ec3727a88ce90d47c2977a0f9d3d7f22561')
BASE = ("SELECT doc_id,max(seen_at) FROM content_events WHERE service='posts' "
    "AND reader_key='reader' AND surface='feed' AND event_type='delivery' "
    "AND doc_id IN ('a','b') GROUP BY doc_id")


def record(root, sql, identity='q', *, native=None):
    digest = hashlib.sha256(sql.encode()).hexdigest()
    (root / (digest + '.sql')).write_text(sql)
    return dict(query_id=identity, sql_sha256=digest, stage='views',
        native=native or dict(read_rows=7, read_bytes=91, query_duration_ms=3, exception_code=0))


class DeliveryDedupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(FIXTURE.read_bytes())

    def inventory(self, sql):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            return audit.statement_inventory(root, [record(root, sql)])

    def denied(self, sql):
        with self.assertRaises(ValueError):
            self.inventory(sql)

    def test_two_exact_banked_sql_digests_admit_named_stage_with_measured_costs_unchanged(self):
        rows = list(csv.DictReader(io.StringIO((BANKED / 'native-query-costs.csv').read_text())))
        for digest in DIGESTS:
            sql = self.fixture['sql_by_sha256'][digest]
            self.assertEqual(hashlib.sha256(sql.encode()).hexdigest(), digest)
            for row in (r for r in rows if r['sql_sha256']==digest and r['phase']=='measured'):
                with self.subTest(cell=row['cell']), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    native = {key: int(row[key]) for key in ('read_rows','read_bytes','query_duration_ms','exception_code')}
                    value = audit.statement_inventory(root, [record(root, sql, row['query_id'], native=native)])
                    item = value['statements'][0]
                    self.assertEqual(item['stage'], STAGE)
                    self.assertEqual(item['identity'], STAGE + ':' + digest)
                    self.assertEqual(item['previous_stage'], 'views')
                    self.assertEqual(item['native'], native)
                    self.assertEqual(value['read_bytes'], native['read_bytes'])
                    self.assertEqual(value['read_rows'], native['read_rows'])
                    self.assertEqual(value['native_ms_sum_not_wall'], native['query_duration_ms'])

    def test_all_410_banked_captured_statements_replay_with_identical_additive_totals(self):
        csv_rows = {r['query_id']: r for r in csv.DictReader(io.StringIO((BANKED / 'native-query-costs.csv').read_text()))
            if r['scope']=='captured'}
        self.assertEqual(len(csv_rows), 410)
        count = 0
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for digest, sql in self.fixture['sql_by_sha256'].items():
                self.assertEqual(hashlib.sha256(sql.encode()).hexdigest(), digest)
                (root / (digest + '.sql')).write_text(sql)
            for sample in self.fixture['samples']:
                records = sample['records']
                original = json.dumps(records, sort_keys=True)
                value = audit.statement_inventory(root, records)
                self.assertEqual(json.dumps(records, sort_keys=True), original)
                self.assertEqual(len(value['statements']), len(records))
                self.assertEqual(value['read_rows'], sample['read_rows'])
                self.assertEqual(value['read_bytes'], sample['read_bytes'])
                self.assertEqual(sum(s['native']['query_duration_ms'] for s in value['statements']),
                    sum(r['native']['query_duration_ms'] for r in records))
                self.assertEqual(value['native_ms_sum_not_wall'],
                    sum(r['native']['query_duration_ms'] for r in records))
                self.assertEqual(sum(s.get('stage')==STAGE for s in value['statements']), 1)
                for item in value['statements']:
                    expected = csv_rows[item['query_id']]
                    self.assertEqual(item['sql_sha256'], expected['sql_sha256'])
                    for key in ('read_rows', 'read_bytes', 'query_duration_ms', 'exception_code'):
                        self.assertEqual(item['native'][key], int(expected[key]))
                    self.assertEqual(item['previous_stage'], expected['captured_stage'])
                count += len(records)
        self.assertEqual(count, 410)

    def test_replay_is_future_policy_not_a_rewrite_of_attempt6_outcomes(self):
        old = json.loads((BANKED / 'results.json').read_bytes())
        provenance = self.fixture['provenance']
        self.assertEqual(provenance['source_archive_sha256'], old['custody']['checkpoint']['sha256'])
        self.assertEqual(provenance['source_csv_sha256'], old['csv']['sha256'])
        self.assertEqual(hashlib.sha256((BANKED / 'native-query-costs.csv').read_bytes()).hexdigest(),
            provenance['source_csv_sha256'])
        self.assertEqual(provenance['original_decomposition'], 'INCOMPLETE')
        self.assertEqual(old['original_stage_outcomes']['decomposition'], 'INCOMPLETE')
        self.assertEqual(old['row_model'], 'NOT_RUN')

    def test_changed_literals_and_reordered_parenthesized_conjunction_are_shape_not_digest_identity(self):
        variants = [BASE, BASE.replace("'posts'", "'notes'").replace("'reader'", "'another-reader'")
            .replace("'feed'", "'library'").replace("'a','b'", "'different-doc'"),
            BASE.replace('doc_id', '`doc_id`').replace('seen_at', '`seen_at`').replace('content_events', '`content_events`'),
            ("SELECT doc_id,max(seen_at) FROM content_events WHERE (doc_id IN ('x')) "
             "AND ((event_type='delivery' AND surface='elsewhere') AND reader_key='another') "
             "AND service='music' GROUP BY doc_id")]
        for sql in variants:
            with self.subTest(sql=sql):
                self.assertNotIn(hashlib.sha256(sql.encode()).hexdigest(), DIGESTS)
                self.assertEqual(self.inventory(sql)['statements'][0]['stage'], STAGE)

    def test_raw_count_star_is_denied(self):
        self.denied('SELECT count(*) FROM content_events')

    def test_raw_distinct_reader_reach_is_denied(self):
        self.denied('SELECT doc_id,uniqExact(reader_key) FROM content_events GROUP BY doc_id')

    def test_raw_per_day_grouped_series_is_denied(self):
        self.denied('SELECT toDate(seen_at),count() FROM content_events GROUP BY toDate(seen_at)')

    def test_delivery_read_without_candidate_list_is_denied(self):
        self.denied(BASE.replace("AND doc_id IN ('a','b') ", ''))

    def test_delivery_read_with_added_count_is_denied(self):
        self.denied(BASE.replace('max(seen_at)', 'max(seen_at),count(*)'))

    def test_delivery_read_with_extra_selected_column_is_denied(self):
        self.denied(BASE.replace('SELECT doc_id,', 'SELECT service,doc_id,'))

    def test_delivery_read_with_different_event_type_is_denied(self):
        self.denied(BASE.replace("event_type='delivery'", "event_type='viewport'"))

    def test_delivery_read_joined_to_second_table_is_denied(self):
        self.denied(BASE.replace('FROM content_events', 'FROM content_events JOIN other USING(doc_id)'))

    def test_missing_or_duplicate_scope_predicate_and_nonliteral_candidates_are_denied(self):
        for predicate in ("service='posts' AND ", "reader_key='reader' AND ",
                "surface='feed' AND ", "event_type='delivery' AND "):
            with self.subTest(predicate=predicate):
                self.denied(BASE.replace(predicate, ''))
        for replacement in ('()', '(SELECT doc_id FROM other)', '(doc_id)', '(1)', "('a',reader_key)"):
            with self.subTest(candidates=replacement):
                self.denied(BASE.replace("('a','b')", replacement))
        self.denied(BASE.replace('GROUP BY', "AND reader_key='another' GROUP BY"))
        self.denied(BASE.replace("reader_key='reader'", 'reader_key=reader_key'))
        self.denied(BASE.replace("reader_key='reader'", 'reader_key=1'))

    def test_extra_raw_aggregation_subqueries_boolean_expansion_and_clauses_are_denied(self):
        for sql in (BASE.replace('max(seen_at)', 'sum(seen_at)'),
                BASE.replace('max(seen_at)', 'max(DISTINCT seen_at)'),
                BASE.replace('max(seen_at)', 'max(seen_at) OVER ()'),
                BASE.replace('FROM content_events', 'FROM (SELECT * FROM content_events)'),
                'WITH e AS (SELECT * FROM content_events) ' + BASE.replace('FROM content_events', 'FROM e'),
                BASE.replace("AND doc_id IN", "OR doc_id IN"),
                BASE + ' HAVING max(seen_at)>0', BASE + ' ORDER BY doc_id', BASE + ' LIMIT 1',
                BASE + ' SETTINGS max_threads=1',
                BASE.replace('GROUP BY doc_id', 'GROUP BY doc_id,surface'),
                BASE.replace('SELECT doc_id,', 'SELECT doc_id AS alias,'),
                BASE.replace('GROUP BY', 'AND 1=1 GROUP BY'),
                BASE.replace('SELECT doc_id,', 'SELECT DISTINCT doc_id,'),
                BASE + '; SELECT count(*) FROM content_events'):
            with self.subTest(sql=sql):
                self.denied(sql)

    def test_duplicate_identity_and_digest_mismatch_checks_remain(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            value = record(root, 'SELECT doc_id FROM pairs_refs')
            with self.assertRaisesRegex(ValueError, 'duplicate native query identity'):
                audit.statement_inventory(root, [value, value])
            (root / (value['sql_sha256'] + '.sql')).write_text('SELECT 2')
            with self.assertRaisesRegex(ValueError, 'SQL digest differs'):
                audit.statement_inventory(root, [value])

    def test_retired_projection_and_node_ad_inventory_search_checks_remain(self):
        self.denied(BASE + ' /* ref_sorted */')
        self.denied("SELECT * FROM engagement_documents WHERE has(tags,'node_ad')")

    def test_retired_inventory_digest_check_remains_separate_from_raw_shape(self):
        retired = '4bc916c85c420f45a56d98424274efe1f83483092363c8c9fdae1194c24765f6'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / (retired + '.sql')).write_text('SELECT 1')
            value = dict(query_id='retired', sql_sha256=retired, native={})
            # Isolate the fixed digest branch, not a claim to recreate its preimage.
            with patch.object(audit.hashlib, 'sha256', return_value=SimpleNamespace(hexdigest=lambda: retired)):
                with self.assertRaisesRegex(ValueError, 'retired node-ad inventory statement'):
                    audit.statement_inventory(root, [value])


if __name__ == '__main__':
    unittest.main()
