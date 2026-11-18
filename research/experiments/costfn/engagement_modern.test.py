"""Modern programme/read composition controls. No engine, cloud or API import."""
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
import sys
import tempfile
import unittest

import sqlglot
from sqlglot import exp

import engagement_modern as modern
import engagement_programme as programme
import engagement_queries as queries
import core_feed
import arm_f

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
from app.v3.services.safe_query import build_safe_query  # noqa: E402


class ModernTests(unittest.TestCase):
    def approval(self):
        now = datetime.now(UTC)
        return dict(configuration='F', approved_by='Jacob', dataset_id=modern.arm_t.DATASET,
            droplet_id=123, budget_usd=2, cleanup_model='agent-supervised-self-kill', host_self_kill_verified=True,
            cutoff=2000, T7_admitted=False, sort_order_arm_admitted=False, approved_utc=now.isoformat(),
            deadline_utc=(now + timedelta(hours=4)).isoformat(), engagement_engine=modern.ENGINE,
            engagement_directive=modern.DIRECTIVE, purpose='ENGAGEMENT_FULL_STORE_A_D', engagement_ref_admitted=True)

    def test_modern_engine_requires_its_own_exact_directive_and_does_not_expand_historical_admission(self):
        value = self.approval()
        modern.admitted(value, 123)
        for change in ({'engagement_engine': 'latest'}, {'engagement_directive': 'old'}, {'budget_usd': 20},
                       {'host_self_kill_verified': False}, {'droplet_id': 124}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                modern.admitted({**value, **change}, 123)

    def test_real_captured_client_queries_adopt_root_refs_without_changing_output_contract(self):
        capture = core_feed.wire()
        migrated = queries.capture(capture, True)
        self.assertIn('post_id', capture['requests'][2]['payload']['sql'])
        comments = migrated['requests'][2]['payload']['sql']
        self.assertIn('ref_value AS post_id', comments)
        self.assertNotIn('JSONExtractString', comments)
        self.assertIn("JSONExtractString(body, 'target_id') = ''", migrated['requests'][1]['payload']['sql'])
        self.assertEqual(migrated['requests'][3], capture['requests'][3])

    def compile(self, sql):
        return build_safe_query(sql, {name: ['allowed'] for name in ('posts', 'profile', 'comments', 'reactions')},
            member_key='reader', allowed_services=frozenset(('posts', 'profile', 'comments', 'reactions')))

    def assert_scoped_links(self, sql):
        tree = sqlglot.parse_one(sql, read='clickhouse')
        links = [table for table in tree.find_all(exp.Table) if table.name == 'doc_groups']
        self.assertTrue(links)
        for link in links:
            self.assertIn('doc_id IN', link.find_ancestor(exp.Select).sql(dialect='clickhouse'))
        self.assertIn('deleted DESC', sql)

    def test_actual_main_compiler_and_treatment_composition_never_falls_back_to_cached_counters(self):
        source = queries.migrate_sql(arm_f.document_contract(core_feed.wire()['requests'][0]['payload']['sql']))
        compiled = self.compile(source)
        sql = queries.main(compiled, [dict(author_key='alice', doc_id='post', group_id='allowed')],
            [('alice', 'profile')], 'a' * 64, uniform=True, table='engagement_documents')
        self.assertNotIn('counting_numbers', sql)
        self.assertIn('engagement_documents', sql)
        self.assertIn("JSONExtractString(body, 'target_id') = ''", sql)
        self.assert_scoped_links(sql)
        self.assertIn('user_blacklist', sql)
        self.assertIn('group_hidden_docs', sql)

    def test_actual_followup_compilation_scopes_attachments_before_history_and_retains_alias(self):
        query = queries.migrate_sql("SELECT JSONExtractString(body,'post_id') AS post_id,count() AS comment_count FROM comments WHERE JSONExtractString(body,'post_id') IN ('post') GROUP BY post_id")
        result = queries.followup(self.compile(query), 'comments', uniform=True, table='engagement_documents')
        self.assert_scoped_links(result)
        self.assertIn('ref_value AS post_id', result)
        self.assertNotIn('counting_numbers', result)

    def test_old_semantics_comments_do_not_pretend_ref_points_at_the_root_before_migration(self):
        boundary = 'SELECT * FROM documents WHERE collection_name=\'comments\''
        old = queries.scoped(boundary, ['post'], 'comments', uniform=False, table='documents')
        new = queries.scoped(boundary, ['post'], 'comments', uniform=True, table='engagement_documents')
        self.assertIn("JSONExtractString(body, 'post_id')", old)
        self.assertNotIn('post_id', new)

    def test_a_cost_stop_does_not_silently_skip_independent_views_or_hot_cells(self):
        called = []
        class Actions:
            def stage(self, stage, results):
                called.append(stage)
                if stage == 'A-treated':
                    raise ValueError('native10M stop')
                return {'receipt': stage}
            def checkpoint(self, stage, result):
                pass
        with tempfile.TemporaryDirectory() as directory:
            result = programme.run(Actions(), Path(directory) / 'run')
        self.assertEqual(result['A-treated']['outcome'], 'STOP')
        for stage in ('B-diagnostic', 'B-aggregate', 'C-migration', 'D-fat'):
            self.assertIn(stage, called)
        self.assertEqual(called, list(programme.ORDER))

    def test_invalid_migration_blocks_only_dependent_reads(self):
        class Actions:
            def stage(self, stage, results):
                if stage == 'C-migration':
                    raise ValueError('parity mismatch')
                return {}
            def checkpoint(self, stage, result):
                pass
        with tempfile.TemporaryDirectory() as directory:
            result = programme.run(Actions(), Path(directory) / 'run')
        self.assertEqual(result['C-complete']['outcome'], 'BLOCKED')
        self.assertEqual(result['C-paired']['outcome'], 'BLOCKED')
        self.assertEqual(result['D-fat']['outcome'], 'PASS')

    def test_three_columns_and_mixed_component_diagnostics_do_not_invent_attribution(self):
        self.assertEqual(set(programme.table({'views': 1}, {'views': 2}, {'views': 3})['views']),
            {'history_24_8_PR1578', 'baseline_26_x', 'treated_26_x'})
        value = queries.mixed_components("SELECT p.doc_id,c.n FROM documents p LEFT JOIN (SELECT doc_id,sum(value) AS n FROM counting_numbers_p2 GROUP BY doc_id) c ON c.doc_id=p.doc_id")
        self.assertFalse(value['additive'])
        self.assertEqual(len(value['components']), 1)
        self.assertIn('counting_numbers_p2', value['components'][0])


if __name__ == '__main__':
    unittest.main()
