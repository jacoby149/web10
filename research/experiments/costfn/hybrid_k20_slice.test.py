"""No-engine controls for the fixed-slice selectors and oracle fence."""
from copy import deepcopy
import json
import sqlite3
import unittest

import sqlglot

from arm_satellite_sql import literal as q
import hybrid_k20_slice as slice


class SliceTest(unittest.TestCase):
    def test_admitted_scopes_not_oracle_winners_seed_the_slice(self):
        profile = dict(dataset_id=slice.DATASET, reader='reader', groups=['requested'],
            reference_page=[{'doc_id': 'must-not-be-used'}],
            actual_readable_by_kind={'main': {'posts': ['post'], 'comments': ['not-a-post-group']},
                'reactions': {'reactions': ['react', 'discover']},
                'comments': {'comments': ['comment', 'discover']}})
        groups, readers, followups = slice.scope({'ordinary': profile, 'fixture': {**profile, 'reader': 'paired'}})
        self.assertEqual(groups, ['post'])
        self.assertEqual(followups, ['comment', 'discover', 'react'])
        self.assertEqual(readers, ['paired', 'reader'])
        sql = slice.seed_sql(groups, readers)
        sqlglot.parse_one(sql, read='clickhouse')
        for excluded in ('must-not-be-used', 'discover', 'requested', 'react', 'comment', 'not-a-post-group'):
            self.assertNotIn(q(excluded), sql)
        self.assertNotIn(' FINAL', sql)
        self.assertNotIn('deleted', sql)

    def test_inbound_deps_use_fixed_roots_and_never_reseed_from_their_groups(self):
        comments, support, profiles = slice.comment_sql(), slice.support_sql(), slice.profile_sql(['reader'])
        for sql in (comments, support, profiles):
            sqlglot.parse_one(sql, read='clickhouse')
            self.assertNotIn('doc_groups', sql)
            self.assertNotIn(' FINAL', sql)
            self.assertNotIn('deleted', sql)
        self.assertIn(f"JSONExtractString(body,'post_id') IN (SELECT doc_id FROM {slice.ROOTS})", comments)
        self.assertIn(f'ref_value IN (SELECT doc_id FROM {slice.COMMENTS})', support)
        self.assertIn(f"JSONExtractString(body,'repost_of') IN (SELECT doc_id FROM {slice.ROOTS})", support)
        self.assertIn(f'SELECT posted_by FROM documents WHERE doc_id IN (SELECT doc_id FROM {slice.KEYS})', profiles)

    def test_seed_and_support_keep_targeted_discover_history_not_discover_inventory(self):
        # The selection statements use SQL shared by SQLite and ClickHouse;
        # model only the source types and the two ClickHouse-specific functions.
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.create_function('unhex', 1, lambda value: bytes.fromhex(value).decode())
        db.create_function('JSONExtractString', 2, lambda body, key: json.loads(body).get(key, ''))
        db.create_function('has', 2, lambda tags, tag: tag in json.loads(tags))
        db.executescript('CREATE TABLE documents (doc_id, author_key, collection_name, body, ref_value, tags, posted_by, deleted);'
            'CREATE TABLE doc_groups (doc_id, group_id, deleted);')
        for table in (slice.ROOTS, slice.COMMENTS, slice.KEYS, slice.NEXT_KEYS):
            db.execute(f'CREATE TABLE {table} (doc_id)')
        db.executemany('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?)', (
            ('root','author','posts','{}','','[]','author',1),
            ('root','collision','posts','{}','','[]','collision',0),
            ('other','outsider','posts','{}','','[]','outsider',0),
            ('reply','commenter','comments','{"post_id":"root"}','root','[]','commenter',1),
            ('reply','commenter','comments','{"post_id":"other"}','other','[]','commenter',0),
            ('reaction','reactor','reactions','{}','reply','[]','reactor',0),
            ('unrelated','reactor','reactions','{}','other','[]','reactor',0),
            ('repost','author','posts','{"repost_of":"root"}','','[]','author',0),
            ('pin','author','placements','{"target_id":"ad"}','root','[]','author',0),
            ('ad','owner','posts','{}','','["node_ad"]','owner',0),
            ('profile','collision','profile','{}','','[]','collision',0),
            ('outside-profile','outsider','profile','{}','','[]','outsider',0),
        ))
        db.executemany('INSERT INTO doc_groups VALUES (?,?,?)', (
            ('root','following',1), ('other','discover',0), ('reply','discover',0),
            ('reaction','discover',0), ('unrelated','discover',0)))
        for statement in (slice.seed_sql(['following'], ['reader']), slice.comment_sql(),
                slice.support_sql(), slice.profile_sql(['reader'])):
            db.execute(statement)
        self.assertEqual(db.execute(f'SELECT doc_id FROM {slice.ROOTS}').fetchall(), [('root',)])
        self.assertEqual({item[0] for item in db.execute(f'SELECT doc_id FROM {slice.NEXT_KEYS}')},
            {'root', 'reply', 'reaction', 'repost', 'pin', 'ad', 'profile'})

    def test_all_history_and_physical_buckets(self):
        closure = slice.expand_sql()
        sqlglot.parse_one(closure, read='clickhouse')
        for key in ('post_id', 'parent_id', 'target_id', 'repost_of', 'ad_id', 'ref_value'):
            self.assertIn(key, closure)
        self.assertIn(f'AND doc_id IN (SELECT doc_id FROM {slice.KEYS})', closure)
        self.assertNotIn('WHERE related IN', closure)
        self.assertNotIn(' FINAL', closure)
        self.assertNotIn('deleted', closure)
        for table in slice.TABLES:
            statements = [slice.copy_sql(table, ['doc_id', 'deleted'], i) for i in range(slice.BUCKETS)]
            self.assertEqual(len(set(statements)), slice.BUCKETS)
            for sql in statements:
                sqlglot.parse_one(sql, read='clickhouse')
                self.assertIn('`deleted`', sql)
                self.assertNotIn(' FINAL', sql)
        with self.assertRaises(ValueError):
            slice.copy_sql('users', ['doc_id'], 0)

    def test_exact_oracle_does_not_accept_reordered_rows_or_changed_types(self):
        expected = dict(rows=[{'value': 1}, {'value': 2}], lower_rows=[], ids=['a','b'],
            views_readable_groups=['g'], followups=[[{'count': 1}, {'count': 2}], []], eligible_ads=[])
        actual = deepcopy(expected)
        actual['followups'][0].reverse()
        slice.oracle_matches(expected, actual)
        actual['rows'].reverse()
        with self.assertRaisesRegex(ValueError, 'differs: rows'):
            slice.oracle_matches(expected, actual)
        actual = deepcopy(expected)
        actual['rows'][0]['value'] = True
        with self.assertRaisesRegex(ValueError, 'differs: rows'):
            slice.oracle_matches(expected, actual)


if __name__ == '__main__':
    unittest.main()
