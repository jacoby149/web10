"""No-engine controls using the original wire capture and canonical compiler."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from sqlglot import exp

import engagement_queries
import engagement_tally_queries
import engagement_observe
import hybrid_k20_projected as k20
import hybrid_k20_run_projected as runner

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / 'api'))
from app.v3.services.safe_query import build_safe_query  # noqa: E402


def main():
    capture = json.loads((HERE / 'evidence/core-feed-wire-v8.json').read_text())
    sql = engagement_queries.capture(capture, True)['requests'][0]['payload']['sql']
    groups = {name: ['scope'] for name in ('posts', 'profile', 'comments', 'reactions')}
    compiled = build_safe_query(sql, groups, member_key='reader', allowed_services=set(groups))
    pointers = [dict(author_key='author', doc_id='id', group_id='scope')]
    return engagement_tally_queries.main(compiled, pointers, [('author', 'profile')], None,
        {'reactions': 'scope-reactions', 'comments': 'scope-comments', 'posts': 'scope-posts'},
        uniform=True, table=k20.TABLE)


class ProjectedTests(unittest.TestCase):
    def test_real_tally_resolution_keeps_counts_history_links_order_and_limit_without_body(self):
        sql = main()
        fields, keys = k20.main_keys(sql)
        tree = k20.parse(keys)
        self.assertEqual(fields, [item.alias_or_name for item in k20.parse(sql).expressions])
        self.assertNotIn('body', {c.name for c in tree.find_all(exp.Column)})
        for modifier in ('where', 'order', 'limit', 'qualify'):
            self.assertEqual(tree.args.get(modifier), k20.parse(sql).args.get(modifier))
        self.assertIn('counting_numbers_tally', keys)
        engagement_observe.uniform_guard(keys, dict(engagement_mode='uniform', engagement_tally_verified=True,
            engagement_tally_scopes=['scope-reactions', 'scope-comments', 'scope-posts']))
        self.assertIn('/* projected_resolution_keys */', k20.render(tree))
        with self.assertRaisesRegex(ValueError, 'body dependency'):
            k20.main_keys(k20.render(k20.parse(sql).where("p.body != ''")))

    def test_hydration_uses_exact_versions_and_preserves_order_multiplicity_and_join_misses(self):
        fields, _ = k20.main_keys(main())
        rows = [dict.fromkeys(fields, 0) | dict(author_key=a, doc_id='same', post_version=v,
            profile_id=pid, profile_version=pv) for a, v, pid, pv in (
            ('z', 3, None, None), ('a', 2, 'profile', 9), ('z', 3, None, None), ('b', 5, '', 0))]
        cols = list(rows[0])
        execute = Mock(side_effect=[(cols, [[r[c] for c in cols] for r in rows]),
            ([*k20.KEY, 'body'], [('a', 'same', 2, 'a'), ('b', 'same', 5, 'b'), ('z', 'same', 3, 'z')]),
            ([*k20.KEY, 'body'], [('a', 'profile', 9, 'profile-body')])])
        columns, values = k20.resolution(execute, main())
        self.assertEqual(columns, fields)
        self.assertEqual([(v[fields.index('body')], v[fields.index('profile_body')]) for v in values],
            [('z', None), ('a', 'profile-body'), ('z', None), ('b', '')])
        seek = execute.call_args_list[1].args[0]
        self.assertIn('PREWHERE (author_key,doc_id)', seek)
        self.assertIn('updated_at)) IN', seek)
        self.assertIn('deleted=0', seek)

    def test_missing_and_conflicting_exact_versions_refuse(self):
        columns = [*k20.KEY, 'body']
        for native in ([], [('a', 'id', 2, 'stale')], [('b', 'id', 3, 'wrong author')],
                [('a', 'id', 3, 'one'), ('a', 'id', 3, 'another')]):
            with self.subTest(native=native), self.assertRaises(ValueError):
                k20.payload(Mock(return_value=(columns, native)), [('a', 'id', 3)], kind='resolution')

    def test_prepare_projects_real_policy_lookup_before_full_key_payload_seek(self):
        fields = k20.PREPARE_FIELDS
        sql = build_safe_query(f"SELECT DISTINCT {','.join(fields)} FROM posts WHERE doc_id IN ('id')",
            {'posts': ['scope']}, member_key='reader', allowed_services={'posts'}, max_limit=1000,
            document_ids_by_service={'posts': ['id']})
        execute = Mock(side_effect=[(('doc_id', 'author_key', 'posted_by', 'ad_mode', 'ad_target', 'version'),
            [('id', 'alice', 'uploader', 'none', '', 4), ('id', 'bob', 'bob', 'none', '', 7)]),
            ([*k20.KEY, 'body'], [('alice', 'id', 4, 'canonical')])])
        self.assertEqual(k20.preparation(execute, sql, 'alice'),
            (fields, [('id', 'alice', 'uploader', 'canonical', 'none', '')]))
        keys, seek = [call.args[0] for call in execute.call_args_list]
        self.assertNotIn('body', {c.name for c in k20.parse(keys).find_all(exp.Column)})
        for gate in ('doc_groups', 'user_blacklist', 'group_blacklist', 'user_group_sharing', 'group_hidden_docs', 'banned_users'):
            self.assertIn(gate, keys)
        self.assertNotIn('bob', seek)

    def test_projected_admission_excludes_hybrid_and_partial_native_evidence(self):
        approval = dict(hybrid_k20_projected_directive=k20.DIRECTIVE, hybrid_k20_projected_admitted=True,
            hybrid_k20_hybrid_admitted=False)
        self.assertTrue(k20.enabled(approval))
        self.assertFalse(k20.enabled({**approval, 'hybrid_k20_hybrid_admitted': True}))
        with TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'not all four'):
                runner.pruning([])
            path = Path(directory)
            (path / 'measured-views-audit.json').write_text(json.dumps(dict(before={}, after={'changed': True})))
            with self.assertRaisesRegex(ValueError, 'quiet delivery history'):
                runner.compare(path, path, {}, {})
        self.assertTrue(runner.body_logged(['web10.engagement_documents.`body`']))
        self.assertFalse(runner.body_logged(['web10.engagement_documents.doc_id']))

    def test_comparison_charges_payload_round_trips_and_keeps_complete_cost_separate(self):
        def sample(stages, wall):
            rows = [dict(stage=name, read_rows=n, read_bytes=n * 2, query_duration_ms=n, memory_usage=n)
                for name, n in stages]
            return dict(captured_statements=rows, captured_totals=runner.baseline.totals(rows),
                request_tagged_totals=runner.baseline.totals(rows + [dict(rows[-1], read_bytes=7)]),
                complete_http_wall_ms=wall)
        indexed = sample([('preparation', 10), ('counts_embedded_in_resolution', 16), ('other', 100)], 300)
        challenger = sample([('preparation', 3), *zip(k20.STAGES, (6, 2, 1, 1)), ('other', 100)], 280)
        with TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'measured-views-audit.json').write_text(json.dumps(dict(before={}, after={})))
            result = runner.compare(path, path, indexed, challenger)
        self.assertEqual(result['preparation']['projected']['logical_read_bytes'], 10)
        self.assertEqual(result['counts_embedded_in_resolution']['projected']['logical_read_bytes'], 16)
        self.assertEqual(result['captured_totals']['projected_minus_indexed']['logical_read_bytes'], -26)
        self.assertEqual(result['complete_http_wall_ms']['projected_minus_indexed'], -20)


if __name__ == '__main__':
    unittest.main()
