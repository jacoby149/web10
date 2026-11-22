"""Skinny app-shaped lookup compared with B over real modeled history SQL."""
import importlib.util
from pathlib import Path
import unittest

import sqlglot

import engagement_billboard_reads as reads
import engagement_observe as observe
import engagement_pin_index as index

spec = importlib.util.spec_from_file_location('agreement', Path(__file__).with_name('engagement_pin_agreement.test.py'))
agreement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agreement)
pin = agreement.pin
PAGE = [dict(author_key='a', doc_id='q'), dict(author_key='a', doc_id='p')]


class PinIndexTests(unittest.TestCase):
    def store(self, rows):
        store = agreement.CanonicalStore(rows)
        self.addCleanup(store.db.close)
        store.db.execute(f'CREATE TABLE {index.TABLE} (author_key TEXT,ref_value TEXT,doc_id TEXT)')
        store.db.execute(f'INSERT INTO {index.TABLE} ' + index.source())
        return store

    def execute(self, store, calls):
        def query(sql):
            calls.append(sql)
            if ('pin_selection_current_winners' in sql or 'pin_materialization_current_winners' in sql
                    or index.TABLE in sql):
                return [dict(row) for row in store.db.execute(sqlglot.transpile(sql, read='clickhouse', write='sqlite')[0])]
            return store.creatives
        return query

    def attach(self, store, indexed, *, docs=PAGE, allowed=True):
        calls = []
        result = reads.attach(docs, 'reader', execute=self.execute(store, calls), indexed=indexed,
            readable=lambda *_: ['allowed'] if allowed else [], compile=agreement.build_safe_query)
        return result, calls

    def test_complete_history_exact_parity_including_move_across_page_roots(self):
        old = [pin('moved'), pin('moved',post='q',updated_at=2), pin('both'), pin('tied'), pin('tied',deleted=1),
            pin('retyped'), pin('retyped',collection_name='reactions',updated_at=2),
            pin('out'), pin('out',post='elsewhere',updated_at=2), pin('moved',owner='b',target_author='b')]
        noise = [pin('reaction-' + str(i), collection_name='reactions') for i in range(90)]
        store = self.store(old + noise)
        baseline, before = self.attach(store, False)
        actual, after = self.attach(store, True)
        self.assertEqual(actual, baseline)
        self.assertEqual([row['doc_id'] for row in actual], ['q','p'])
        self.assertEqual(before[-1], after[-1])  # Creative SQL remains byte-for-byte unchanged.
        candidates = index.candidates(PAGE, self.execute(store, []))
        self.assertEqual(len(candidates), 6)
        self.assertEqual(sum(r['doc_id']=='moved' for r in candidates), 2)
        self.assertNotIn('pairs_refs', after[0] + after[1])
        self.assertNotIn('engagement_documents', after[0])
        self.assertNotIn('body', after[0])
        self.assertNotIn('LIMIT', after[0] + after[1])
        self.assertEqual(observe.classify(after[0], ['candidates'], {}), 'pin_index_lookup')
        self.assertEqual(observe.classify(after[1], ['materialize_pins'], {}), 'pin_materialization')

    def test_post_author_mismatch_omits_while_bad_body_and_conflict_still_refuse(self):
        omitted = pin('omit',target='wrong')
        omitted['body']['post_author'] = 'wrong'
        for indexed in (False,True):
            result, _ = self.attach(self.store([pin('one'),omitted]), indexed)
            self.assertNotIn('ad', result[0])
            self.assertEqual(result[1]['ad'], agreement.ad())
            bad = pin('bad')
            bad['body']['placement'] = 'bad'
            for extra, error in ((bad,'malformed'), (pin('conflict',target='wrong'),'different ads'),
                    (pin('foreign',target_author='other'),'another author')):
                with self.subTest(indexed=indexed,error=error),self.assertRaisesRegex(ValueError,error):
                    self.attach(self.store([pin('one'),extra]), indexed)

    def test_reader_denial_and_zero_candidates(self):
        actual, calls = self.attach(self.store([pin()]), True, allowed=False)
        self.assertEqual(actual, PAGE)
        self.assertEqual(len(calls), 2)
        actual, calls = self.attach(self.store([pin(collection_name='reactions')]), True)
        self.assertEqual(actual, PAGE)
        self.assertEqual(len(calls), 1)

    def test_index_census_rejects_duplicate_missing_and_extra_edges(self):
        store = self.store([pin('one'),pin('two'),pin('two',updated_at=2)])
        statement = sqlglot.transpile(index.census(), read='clickhouse', write='sqlite')[0]
        store.db.create_function('TOINT64',1,int)
        self.assertEqual(store.db.execute(statement).fetchone()[0],0)
        store.db.executemany(f'INSERT INTO {index.TABLE} VALUES (?,?,?)',[('a','p','one'),('a','p','extra')])
        store.db.execute(f"DELETE FROM {index.TABLE} WHERE doc_id='two'")
        self.assertEqual(store.db.execute(statement).fetchone()[0],3)

    def test_unexpected_edge_fails_closed(self):
        good = dict(author_key='a',ref_value='p',doc_id='one')
        for edges in ([good,good],[dict(good,ref_value='foreign')],[dict(good,author_key='wrong')],[dict(good,body={})]):
            with self.subTest(edges=edges),self.assertRaises(ValueError):
                index.candidates(PAGE,lambda _:edges)


if __name__ == '__main__':
    unittest.main()
