"""Workstream B: actual SQL over SQLite histories, not native optimizer proof."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import sqlglot
from sqlglot import exp

import engagement_billboard_reads as reads
import engagement_composition as composition
import engagement_observe as observe

spec = importlib.util.spec_from_file_location('agreement_controls', Path(__file__).with_name('engagement_pin_agreement.test.py'))
agreement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agreement)
pin, ad, Store = agreement.pin, agreement.ad, agreement.CanonicalStore
DOCS = [dict(author_key='a', doc_id='p')]
OLD = 'cf9889ddb8aa6dd88be5a74d2a3f8e8e51b1f1b1dd4ec6895d3c97179a2fb59e'


class MaterializationTests(unittest.TestCase):
    def store(self, rows):
        value = Store(rows)
        self.addCleanup(value.db.close)
        return value

    def test_selection_names_only_skinny_columns_and_never_filters_before_current_winner(self):
        sql = reads.pin_selection_sql(DOCS)
        tree = sqlglot.parse_one(sql, read='clickhouse')
        self.assertFalse(list(tree.find_all(exp.Star)))
        self.assertFalse(list(tree.find_all(exp.Limit)))
        self.assertNotIn('body', sql)
        self.assertNotIn('JSON', sql)
        self.assertEqual({c.name for c in tree.find_all(exp.Column)},
            {'author_key','doc_id','ref_value','collection_name','deleted','updated_at','rn',
             'candidate_count','ref_id','role'})
        source = next(t for t in tree.find_all(exp.Table) if t.name == 'engagement_documents')
        where = source.find_ancestor(exp.Select).args['where'].sql()
        for name in ('deleted', 'collection_name', 'ref_value'):
            self.assertNotIn(name, where)
        self.assertIn('updated_at DESC,deleted DESC', sql)

    def test_large_candidate_set_materializes_only_complete_current_pin_survivors(self):
        unrelated = [pin('reaction-' + str(i), collection_name='reactions', body={'text':'large'}) for i in range(90)]
        rows = unrelated + [pin('one'), pin('two')]
        store = self.store(rows)
        selected = reads.select_pins(DOCS, store.execute)
        self.assertEqual(selected, [dict(author_key='a',doc_id=k,ref_value='p',candidate_count=92) for k in ('one','two')])
        bodies = reads.materialize_pins(DOCS, selected, store.execute)
        self.assertEqual([p['doc_id'] for p in bodies], ['one','two'])
        self.assertNotIn('pairs_refs', store.sql[1])
        self.assertNotIn('reaction-', store.sql[1])
        self.assertNotIn('*', store.sql[1])
        self.assertNotIn('LIMIT', store.sql[1])

    def test_full_author_collisions_and_stale_roots_services_and_deletion_ties(self):
        rows = [pin('same'), pin('same',owner='b',target_author='b'),
            pin('moved'), pin('moved',ref_value='elsewhere',updated_at=2),
            pin('service'), pin('service',collection_name='notes',updated_at=2),
            pin('gone'), pin('gone',deleted=1)]
        store = self.store(rows)
        selected = reads.select_pins(DOCS, store.execute)
        self.assertEqual([(r['author_key'],r['doc_id'],r['candidate_count']) for r in selected], [('a','same',5)])
        self.assertEqual([r['doc_id'] for r in reads.materialize_pins(DOCS, selected, store.execute)], ['same'])

    def test_body_post_author_omission_waits_for_materialization_but_bad_eligible_body_refuses(self):
        wrong = pin('wrong')
        wrong['body']['post_author'] = 'other'
        store = self.store([pin(),wrong])
        selected = reads.select_pins(DOCS, store.execute)
        self.assertEqual(len(selected), 2)
        self.assertEqual([r['doc_id'] for r in reads.materialize_pins(DOCS, selected, store.execute)], ['pin'])
        # All eligible pins still reach D124 validation; body filtering is not Python omission.
        bad = pin()
        bad['body']['placement'] = 'invalid'
        store = self.store([bad])
        with self.assertRaisesRegex(ValueError, 'malformed'):
            reads.attach(DOCS, 'r', execute=store.execute, readable=lambda *_:[], compile=lambda *_:None)

    def test_materialization_rechecks_current_eligibility_after_selection(self):
        for changes in (dict(deleted=1),dict(ref_value='elsewhere'),dict(collection_name='notes'),
                dict(body={'post_author':'other'})):
            with self.subTest(changes=changes):
                store = self.store([pin()])
                selected = reads.select_pins(DOCS, store.execute)
                row = {**pin(), **changes, 'updated_at':2}
                store.db.execute('INSERT INTO engagement_documents VALUES (?,?,?,?,?,?,?)',
                    [json.dumps(row[k]) if k=='body' else row[k] for k in
                     ('author_key','doc_id','ref_value','collection_name','body','updated_at','deleted')])
                self.assertEqual(reads.materialize_pins(DOCS, selected, store.execute), [])

    def test_bad_survivor_order_duplicates_extra_payload_and_roots_refuse_before_materialization(self):
        good = dict(author_key='a',doc_id='one',ref_value='p',candidate_count=2)
        for rows in ([good,good], [dict(good,doc_id='two'),good], [dict(good,body={})],
                [dict(good,ref_value='foreign')], [dict(good,candidate_count=0)],
                [good,dict(good,doc_id='two',candidate_count=3)]):
            with self.subTest(rows=rows),self.assertRaisesRegex(ValueError, 'handoff'):
                reads.select_pins(DOCS, lambda _:rows)

    def test_unexpected_duplicate_or_reordered_materialized_identity_refuses(self):
        selected = [dict(author_key='a',doc_id=k,ref_value='p',candidate_count=2) for k in ('one','two')]
        for rows in ([pin('other')], [pin('one'),pin('one')], [pin('two'),pin('one')], [pin('one',post='foreign')]):
            with self.subTest(rows=rows),self.assertRaisesRegex(ValueError, 'handoff'):
                reads.materialize_pins(DOCS, selected, lambda _:rows)

    def test_named_cost_stages_old_digest_absence_and_unchanged_creative_sql(self):
        store = self.store([pin()])
        actual = reads.attach(DOCS, 'r', execute=store.execute, readable=lambda *_:['allowed'],
            compile=agreement.build_safe_query)
        self.assertEqual(actual[0]['ad'], ad())
        self.assertEqual([observe.classify(sql, callers, {}) for sql,callers in zip(store.sql,
            (['select_pins','_prepare_rows'],['materialize_pins','_prepare_rows'],['_prepare_rows']))],
            ['pin_selection','pin_materialization','preparation'])
        # Golden generated by the unmodified A reader for this exact post/ad/reader/scope.
        self.assertEqual(hashlib.sha256(store.sql[2].encode()).hexdigest(),
            '0adde49c43ef5d62b77da12f67a0dd08d1f13d488988ec33d95b90ded78554b4')
        with tempfile.TemporaryDirectory() as directory:
            records = []
            for i,sql in enumerate(store.sql):
                rendered = sqlglot.parse_one(sql, read='clickhouse').sql(dialect='clickhouse')
                digest = hashlib.sha256(rendered.encode()).hexdigest()
                self.assertNotEqual(digest, OLD)
                Path(directory,digest+'.sql').write_text(rendered)
                records.append(dict(query_id=str(i),sql_sha256=digest,stage=['pin_selection','pin_materialization','preparation'][i],
                    native=dict(read_rows=7,read_bytes=91,query_duration_ms=3,exception_code=0)))
            inventory = composition.statement_inventory(directory, records)
            self.assertEqual(inventory['read_bytes'], 273)
            self.assertEqual([r['previous_stage'] for r in inventory['statements']],
                ['pin_selection','pin_materialization','preparation'])


if __name__ == '__main__':
    unittest.main()
