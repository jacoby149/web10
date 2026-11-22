"""Prove the uniform inventory's source facts, not an implemented optimization."""
import hashlib
import json
from pathlib import Path
import unittest

import sqlglot
from sqlglot import exp

import engagement_billboard_reads as billboards
import engagement_pairs as pairs

DIGEST = 'cf9889ddb8aa6dd88be5a74d2a3f8e8e51b1f1b1dd4ec6895d3c97179a2fb59e'


class UniformInventoryTests(unittest.TestCase):
    def test_banked_expensive_sql_is_pin_lookup_for_21_already_selected_posts(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/delivery-dedup-audit.json').read_bytes())
        sql = fixture['sql_by_sha256'][DIGEST]
        self.assertEqual(hashlib.sha256(sql.encode()).hexdigest(), DIGEST)
        self.assertEqual(len(sql.encode()), 4761)
        tree = sqlglot.parse_one(sql, read='clickhouse')
        post_keys = next(node for node in tree.find_all(exp.In) if isinstance(node.this, exp.Tuple)
            and [c.name for c in node.this.expressions] == ['author_key','ref_value'])
        docs = []
        for key in post_keys.expressions:
            author, doc = (bytes.fromhex(value.this.this).decode() for value in key.expressions)
            docs.append(dict(author_key=author, doc_id=doc))
        self.assertEqual(len(docs), 21)  # Frozen fixture observation, never a candidate bound.
        self.assertEqual(sqlglot.parse_one(billboards.pin_sql(docs), read='clickhouse').sql(dialect='clickhouse'), sql)
        self.assertEqual([c.name for c in tree.expressions], ['author_key','doc_id','ref_value','body'])
        self.assertIsNone(tree.args.get('order'))
        self.assertFalse(list(tree.find_all(exp.Limit)))

    def test_existing_pairs_do_not_encode_body_selection_and_refusal_inputs(self):
        columns = {c.name for c in sqlglot.parse_one(pairs.DDL, read='clickhouse').find_all(exp.ColumnDef)}
        self.assertEqual(columns, {'author_key','doc_id','ref_id','role'})
        docs = [dict(author_key='a', doc_id='p')]
        body = dict(post_author='a', placement='author', target_author='a', target_id='creative')
        pin = dict(author_key='a', doc_id='pin', ref_value='p', body=body)
        def attach(values):
            return billboards.attach(docs, 'reader', execute=lambda _:values,
                readable=lambda *_:[], compile=lambda *_args, **_kwargs: self.fail('no readable creative scope'))
        self.assertEqual(attach([pin]), docs)
        # Same edge fields and identities; only body input changes refusal.
        for field, value in (('placement','invalid'), ('target_author','other'), ('target_id','')):
            with self.subTest(field=field), self.assertRaises(ValueError):
                attach([{**pin,'body':{**body,field:value}}])

    def test_page_sized_limit_could_hide_duplicate_live_pin_refusal(self):
        docs = [dict(author_key='a', doc_id='p')]
        pin = dict(author_key='a', doc_id='pin', ref_value='p',
            body=dict(post_author='a',placement='author',target_author='a',target_id='creative'))
        def attach(values):
            return billboards.attach(docs, 'reader', execute=lambda _:values,
                readable=lambda *_:[], compile=lambda *_args, **_kwargs:self.fail('not needed'))
        self.assertEqual(attach([pin]), docs)
        with self.assertRaisesRegex(ValueError, 'multiple live pins'):
            attach([pin, {**pin,'doc_id':'second-pin'}])


if __name__ == '__main__':
    unittest.main()
