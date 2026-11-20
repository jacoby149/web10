"""All-time event states, exact merges and two independent parity refusals; no engine."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import sqlglot
from sqlglot import exp

import engagement_composition as contract
import engagement_composition_verify as verify
import engagement_events as events


class AllTimeTests(unittest.TestCase):
    def test_both_materialized_views_read_raw_not_the_day_seed_so_derivation_cannot_double_count(self):
        for statement in (events.MV, events.ALL_TIME_MV):
            select = sqlglot.parse_one(statement.split(' AS ', 1)[1], read='clickhouse')
            self.assertEqual({t.name for t in select.find_all(exp.Table)}, {'content_events'})
        self.assertNotIn('day', events.ALL_TIME_STATES)
        self.assertIn('countState()', events.ALL_TIME_STATES)
        self.assertIn('uniqExactState(reader_key)', events.ALL_TIME_STATES)

    def test_all_time_build_reads_only_seeded_day_states_with_exact_merge_state_combinators(self):
        tree = sqlglot.parse_one(events.ALL_TIME_SEED, read='clickhouse')
        select = tree.find(exp.Select)
        self.assertEqual({t.name for t in select.find_all(exp.Table)}, {'content_events_aggregated'})
        self.assertIn('countMergeState(impressions)', events.ALL_TIME_SEED)
        self.assertIn('uniqExactMergeState(reach)', events.ALL_TIME_SEED)
        self.assertIn('optimize_aggregation_in_order=1', events.ALL_TIME_SEED)
        self.assertNotIn('sum(', events.ALL_TIME_SEED)
        self.assertNotIn('day', select.args['group'].sql())

    def test_feed_reads_all_time_analytics_reads_daily_and_both_merge_exact_states(self):
        feed = events.read(['p'], 'posts', ['g'])
        daily = events.read_daily(['p'], 'posts', ['g'])
        self.assertIn('FROM content_events_aggregated_all_time ', feed)
        self.assertNotIn('GROUP BY doc_id,day', feed)
        self.assertIn('FROM content_events_aggregated ', daily)
        self.assertIn('GROUP BY doc_id,day', daily)
        for sql in (feed, daily):
            self.assertIn('uniqExactMerge(reach)', sql)
            self.assertIn('countMerge(impressions)', sql)

    def test_cross_day_duplicate_readers_merge_as_states_not_summed_distinct_counts(self):
        raw = [('p','posts','delivery','d1','a'), ('p','posts','delivery','d1','a'),
            ('p','posts','delivery','d2','a'), ('p','posts','delivery','d2','b'),
            ('p','notes','open','d1','a')]
        by_day = {}
        for doc,service,event,day,reader in raw:
            item = by_day.setdefault((doc,service,event,day), [0,set()])
            item[0] += 1
            item[1].add(reader)
        coarse = {}
        for key, (count, readers) in by_day.items():
            total = coarse.setdefault(key[:3], [0,set()])
            total[0] += count
            total[1].update(readers)
        self.assertEqual(coarse['p','posts','delivery'], [4,{'a','b'}])
        self.assertEqual(coarse['p','notes','open'], [1,{'a'}])
        self.assertNotEqual(sum(len(v[1]) for k,v in by_day.items() if k[:3]==('p','posts','delivery')), 2)

    def test_either_granularity_failure_blocks_views_gate_and_is_saved_separately(self):
        for bad in (None, 'all-time', 'daily'):
            with self.subTest(bad=bad), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                class Session:
                    def rows(self, label, sql):
                        daily = 'daily' in label
                        aggregate = 'raw_oracle' not in label
                        grain = 'daily' if daily else 'all-time'
                        n = 9 if aggregate and grain == bad else 2
                        return [dict(doc_id='p', day='2026-01-01', impressions=n, reach=1)], label
                # All-time rows should have no day column; it is ignored by the verifier's projection.
                expected = {name: dict(ids=['p'], views_readable_groups=['g']) for name in ('ordinary','fixture')}
                with patch.object(verify.reads, 'visible_views', return_value={'p':dict(impressions=2,reach=1)}):
                    if bad:
                        with self.assertRaises(ValueError):
                            verify.views(Session(), root, expected)
                        packet = json.loads((root/('composition-views-'+bad+'-parity.json')).read_bytes())
                        self.assertEqual(packet['parity'], 'FAIL')
                    else:
                        result = verify.views(Session(), root, expected)
                        self.assertEqual(result['all_time_parity'], 'PASS')
                        self.assertEqual(result['daily_parity'], 'PASS')

    def test_views_gate_refuses_missing_all_time_or_daily_proof(self):
        value = dict(parity='PASS',source_binding={'source':'hash'},query_ids=['native'],
            profiles=['ordinary','fixture'],exact_impressions_and_reach=True,all_time_parity='PASS',daily_parity='PASS')
        contract.gate('views', value)
        for key in ('all_time_parity','daily_parity'):
            with self.assertRaises(ValueError):
                contract.gate('views', {**value,key:'FAIL'})


if __name__ == '__main__':
    unittest.main()
