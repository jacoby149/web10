"""Tally semantics/scoping and actual compiler composition; no native engine."""
import ast
import contextvars
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import sqlglot
from sqlglot import exp

import arm_f
import core_feed
import engagement_queries as original
import engagement_tally_queries as queries
import engagement_tally_sql as tally
import engagement_observe as observe
import engagement_hot_read as hot
import engagement_tally_build as build
import engagement_tally as programme

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
from app.v3.services.safe_query import build_safe_query  # noqa: E402


class TallyTests(unittest.TestCase):
    def test_native_verification_disagreement_blocks_every_measurement(self):
        calls=[]
        class Actions:
            approval={}
            def __init__(self,root):self.root=root
            def stage(self,name,results):
                calls.append(name)
                if name=='tallies':
                    raise ValueError('canonical mismatch')
                return {}
            def checkpoint(self,*args):pass
        with tempfile.TemporaryDirectory() as directory, patch.object(programme,'Actions',Actions), \
                patch.object(programme.modern,'install_sessions'), patch.object(programme.modern,'remaining',return_value=2000):
            result=programme.run(Path(directory))
        self.assertNotIn('uniform',calls)
        self.assertNotIn('projection-colour',calls)
        self.assertEqual(result['uniform']['outcome'],'BLOCKED_PRE_MEASUREMENT_VERIFICATION')

    def test_page_oracle_gate_retains_zero_group_presence_and_denies_wrong_number(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'reference-ordinary').mkdir()
            expected=dict(rows=[dict(doc_id='root',likes=1,dislikes=0,comments=0,reposts=0)],ids=['root'],
                followups=[[dict(ref_value='root',like_count=0,dislike_count=0)],[]])
            (root/'reference-ordinary/expected.json').write_text(json.dumps(expected))
            with self.assertRaises(ValueError):
                build.page_parity(root,'ordinary','main','reactions',{('root','reactions:like:direct'):2})
            build.page_parity(root,'ordinary','reactions','reactions',{('root','reactions:present:direct'):1})
            with self.assertRaises(ValueError):
                build.page_parity(root,'ordinary','reactions','reactions',{})

    def test_actual_tally_fence_denies_changed_parts_before_original_driver(self):
        node=next(n for n in ast.parse(Path(__file__).with_name('engagement_tally_api.py').read_text()).body
            if isinstance(n,ast.FunctionDef) and n.name=='checked_query')
        current=contextvars.ContextVar('tally-test-fence',default={})
        getter=Mock(return_value=SimpleNamespace(column_names=['name','rows','data_version'],result_rows=[('part','1','1')]))
        old=Mock()
        namespace=dict(e=SimpleNamespace(p=SimpleNamespace(observer=SimpleNamespace(current=current)),
            f=SimpleNamespace(original_query=getter)),receipt={'parts_sha256':'wrong','copy_parts_sha256':'wrong','routing':{}},
            hashlib=hashlib,json=json,old_checked=old)
        exec(compile(ast.Module(body=[node],type_ignores=[]),'tally-fence','exec'),namespace)
        current.set({'request_id':'id'})
        with self.assertRaises(ValueError):
            namespace['checked_query']('SELECT 1')
        old.assert_not_called()

    def compile(self, source, groups=None):
        return build_safe_query(source, groups or {kind: ['allowed'] for kind in ('posts','profile','reactions','comments')},
            member_key='reader', allowed_services=frozenset(('posts','profile','reactions','comments')))

    def test_main_real_compiler_replaces_every_count_but_keeps_canonical_heads(self):
        captured = original.capture(core_feed.wire(), True)
        compiled = self.compile(arm_f.document_contract(captured['requests'][0]['payload']['sql']))
        result = queries.main(compiled, [dict(author_key='author',doc_id='root',group_id='allowed')], [('author','profile')],
            'old-scope', {kind:'a'*64 for kind in ('posts','reactions','comments')}, uniform=True, table='engagement_documents')
        tree = sqlglot.parse_one(result, read='clickhouse')
        unchanged = sqlglot.parse_one(original.main(compiled,[dict(author_key='author',doc_id='root',group_id='allowed')],
            [('author','profile')],'old-scope',uniform=True,table='engagement_documents'),read='clickhouse')
        for key in ('with_','where','qualify','order','limit'):
            self.assertEqual(tree.args.get(key),unchanged.args.get(key))
        self.assertEqual(tree.expressions,unchanged.expressions)
        self.assertEqual(tree.args['joins'][-1],unchanged.args['joins'][-1])
        self.assertEqual(sum(t.name == tally.TABLE for t in tree.find_all(exp.Table)), 3)
        for join in tree.args['joins'][:3]:
            self.assertEqual({t.name for t in join.find_all(exp.Table)}, {tally.TABLE})
        self.assertIn('engagement_documents', result)
        self.assertIn('deleted DESC', result)
        self.assertIn('group_hidden_docs', result)
        queries.guard(tree, ['a'*64])
        with self.assertRaises(ValueError):
            observe.uniform_guard(result, {'engagement_mode':'uniform'})
        proof = observe.uniform_guard(result, {'engagement_mode':'uniform', 'engagement_tally_verified':True,
            'engagement_tally_scopes':['a'*64]})
        self.assertTrue(proof['deletion_wins_timestamp_ties'])

    def test_actual_followups_keep_output_aliases_and_use_only_scalar_table(self):
        captured = original.capture(core_feed.wire(), True)
        root = '00000000-0000-4000-8000-000000000001'
        for request,service in zip(captured['requests'][1:3], ('reactions','comments')):
            payload = core_feed.payload(request['payload'], 'not-a-credential', ['allowed'], [root])
            tree = sqlglot.parse_one(self.compile(payload['sql']), read='clickhouse')
            result = queries.stored(tree, service, 'b'*64, [root])
            rendered = sqlglot.parse_one(result, read='clickhouse')
            self.assertEqual({t.name for t in rendered.find_all(exp.Table)}, {tally.TABLE})
            self.assertEqual([x.alias_or_name for x in rendered.expressions], [x.alias_or_name for x in tree.expressions])
            queries.guard(rendered, ['b'*64])

    def test_unbuilt_scope_or_OR_cannot_authorize_stored_numbers(self):
        safe = "SELECT value FROM counting_numbers_tally WHERE scope_key IN ('owned') AND doc_id IN ('p') AND counter_name IN ('k')"
        queries.guard(sqlglot.parse_one(safe, read='clickhouse'), ['owned'])
        for sql in (safe.replace("'owned'", "'other-reader'"), safe.replace(" AND doc_id", " OR doc_id"),
                safe.replace("doc_id IN ('p')", '1=1'), safe.replace(tally.TABLE,'counting_numbers_p2')):
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                queries.guard(sqlglot.parse_one(sql, read='clickhouse'), ['owned'])

    def test_root_wide_or_extra_predicate_is_not_silently_mapped_to_direct_feed_count(self):
        base = "SELECT ref_value,countIf(JSONExtractString(body,'type')='like') AS likes FROM reactions WHERE ref_value IN ('root') GROUP BY ref_value"
        for sql in (base, base.replace(" GROUP BY", " AND JSONExtractString(body,'target_id')='' AND author_key='stranger' GROUP BY")):
            with self.assertRaises(ValueError):
                queries.stored(sqlglot.parse_one(sql,read='clickhouse'),'reactions','a'*64,['root'])

    def test_scope_binds_reader_groups_recipes_and_both_source_generations(self):
        key = tally.scope('r','reactions',['a'],'generation','copy')
        for args in (('s','reactions',['a'],'generation','copy'), ('r','reactions',['b'],'generation','copy'),
                ('r','reactions',['a'],'changed','copy'), ('r','reactions',['a'],'generation','other-copy')):
            self.assertNotEqual(key, tally.scope(*args))

    def test_build_partitions_complete_histories_and_expands_root_and_distinct_fine_targets(self):
        boundary = tally.boundary('reactions',['allowed'],'reader')
        sql = tally.insert(boundary,'reactions','a'*64,0,8)
        tree = sqlglot.parse_one(sql,read='clickhouse')
        self.assertIn('arrayDistinct',sql)
        self.assertIn('target_id',sql)
        for t in tree.find_all(exp.Table):
            if t.name in ('engagement_documents','doc_groups'):
                self.assertIn('cityHash64(doc_id)',t.find_ancestor(exp.Select).sql(dialect='clickhouse'))
        self.assertIn('deleted DESC',sql)
        for service in ('reactions','comments','posts'):
            sqlglot.parse_one(tally.oracle(service,['allowed'],'reader',['root']),read='clickhouse')

    def test_live_reader_and_group_change_denied_before_tally_lookup(self):
        node = next(n for n in ast.parse(Path(__file__).with_name('engagement_tally_api.py').read_text()).body
            if isinstance(n,ast.FunctionDef) and n.name=='scopes')
        key=tally.scope('owner','reactions',['allowed'],'generation','copy')
        context = dict(e=SimpleNamespace(p=SimpleNamespace(scope_for=Mock())), receipt=dict(routing={'main':{'reactions':key}},
            canonical_generation='generation',copy_parts_sha256='copy',
            scopes={key:dict(complete=True,verified=True,reader='owner',groups=['allowed'])}))
        exec(compile(ast.Module(body=[node],type_ignores=[]),'tally-scope','exec'),context)
        self.assertEqual(context['scopes']('main','owner',{'reactions':['allowed']}),{'reactions':key})
        for reader,groups in (('stranger',['allowed']),('owner',['foreign'])):
            with self.assertRaises(ValueError):
                context['scopes']('main',reader,{'reactions':groups})

    def test_fat_control_has_exact_root_direct_and_finer_identity_maps_without_Stage_D(self):
        plan=build.HOT
        targets=hot.expected_reactions(plan)
        self.assertEqual(targets[''],6731)
        self.assertEqual(sum(v for k,v in targets.items() if k),6731)
        self.assertEqual(sum(targets.values()),13462)
        self.assertEqual(len(hot.expected_parents(plan['post_id'])),50000)
        source=Path(build.__file__).read_text()
        self.assertNotIn('hot.seed(',source)
        self.assertNotIn('INSERT INTO content_events',source)


if __name__=='__main__':
    unittest.main()
