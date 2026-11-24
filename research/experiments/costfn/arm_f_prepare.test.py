"""Real canonical binder/compiler + SQLite history; no native/production proof."""
import ast
import importlib
from pathlib import Path
import sqlite3
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from fastapi import HTTPException
from sqlglot import exp

from arm_f_prepare import install
from hybrid_k20_projected import preparation

API = Path(__file__).resolve().parents[3] / 'api'
sys.path.insert(0, str(API))
safe_query = importlib.import_module('app.v3.services.safe_query')


def function(path, name, namespace):
    node = next(n for n in ast.parse(path.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == name)
    node.decorator_list = []
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), namespace)
    return namespace[name]


class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.history = function(API / 'tests/test_query_partition_pruning.py', 'history_db', {'sqlite3': sqlite3})()
        self.db = next(self.history)
        self.queries = []
        def execute(sql, **kwargs):
            self.queries.append(sql)
            cursor = self.db.execute(sql)
            return [c[0] for c in cursor.description], cursor.fetchall()
        self.ch = SimpleNamespace(execute_query=execute)
        namespace = dict(exp=exp, sq=safe_query, ch=self.ch, log=Mock(), HTTPException=HTTPException,
            MAX_ROWS=1000, MAX_EXECUTION_TIME_S=10, _MAX_CANONICAL_HINT_BYTES=128 * 1024,
            _serialize_row=lambda row: row)
        canonical = function(API / 'app/v3/endpoints/query.py', '_canonical_prepare_docs', namespace)
        self.endpoint = SimpleNamespace(ch=self.ch, _canonical_prepare_docs=canonical)
        self.original = install(self.endpoint)

    def tearDown(self):
        self.history.close()

    def collision(self):
        self.db.execute("INSERT INTO documents SELECT doc_id,'bob','bob','bob canonical',ref_value,tags,created_at,"
            "updated_at,ad_mode,ad_target,collection_name,deleted FROM documents WHERE doc_id='active'")

    def test_existing_ambiguity_guard_reproduces_but_full_keys_bind_distinct_canonical_bodies(self):
        self.collision()
        with self.assertRaisesRegex(HTTPException, 'ambiguous canonical'):
            self.original([dict(doc_id='active')], 'reader', {'posts': ['allowed']})
        rows = [dict(doc_id='active', author_key=a, body='FORGED', posted_by='FORGED') for a in ('bob', 'alice', 'bob')]
        bound = self.endpoint._canonical_prepare_docs(rows, 'reader', {'posts': ['allowed']})
        self.assertEqual([(r['author_key'], r['body'], r['posted_by']) for r in bound],
            [('bob', 'bob canonical', 'bob'), ('alice', 'current', 'alice'), ('bob', 'bob canonical', 'bob')])
        self.assertEqual(len(bound), len(rows))
        self.assertTrue(all('doc_groups' in sql for sql in self.queries))

    def test_full_key_never_authorizes_unreadable_deleted_removed_missing_or_fabricated_author(self):
        for author, doc in [('bob', 'foreign'), ('alice', 'deleted'), ('alice', 'removed'),
                            ('alice', 'missing'), ('mallory', 'active')]:
            with self.subTest(author=author, doc=doc), self.assertRaises(HTTPException):
                self.endpoint._canonical_prepare_docs([dict(doc_id=doc, author_key=author)], 'reader', {'posts': ['allowed']})

    def test_policy_denial_is_preserved_and_selector_context_resets_after_failure(self):
        for mutation in ("INSERT INTO user_blacklist VALUES ('alice','reader',4,0)",
                         "INSERT INTO group_blacklist VALUES ('alice','allowed','reader',4,0)",
                         "INSERT INTO group_hidden_docs VALUES ('allowed','active',4,0)",
                         "INSERT INTO banned_users VALUES ('alice',4,0)",
                         "INSERT INTO user_group_sharing VALUES ('alice','allowed',0,4,0)"):
            self.db.execute('SAVEPOINT denial')
            self.db.execute(mutation)
            with self.assertRaises(HTTPException):
                self.endpoint._canonical_prepare_docs([dict(doc_id='active', author_key='alice')], 'reader', {'posts': ['allowed']})
            self.db.execute('ROLLBACK TO denial')
            self.db.execute('RELEASE denial')
        self.collision()
        with self.assertRaises(HTTPException):
            self.endpoint._canonical_prepare_docs([dict(doc_id='active', author_key='mallory')], 'reader', {'posts': ['allowed']})
        with self.assertRaisesRegex(HTTPException, 'ambiguous canonical'):
            self.original([dict(doc_id='active')], 'reader', {'posts': ['allowed']})

    def test_missing_author_fails_closed_and_opaque_author_is_a_literal(self):
        for author in (None, '', "alice' OR 1=1 --"):
            with self.assertRaises(HTTPException):
                self.endpoint._canonical_prepare_docs([dict(doc_id='active', author_key=author)], 'reader', {'posts': ['allowed']})

    def test_projected_binder_still_checks_live_history_and_policy_before_payload(self):
        self.db.create_function('toUnixTimestamp64Milli', 1, int)
        self.db.create_function('unhex', 1, lambda text: bytes.fromhex(text).decode())
        execute = self.ch.execute_query.__wrapped__
        self.ch.execute_query = lambda sql, **kwargs: execute(
            sql.replace(' PREWHERE ', ' WHERE ').replace('engagement_documents', 'documents'), **kwargs)
        self.endpoint._canonical_prepare_docs = self.original
        install(self.endpoint, project=preparation)
        self.collision()
        rows = [dict(doc_id='active', author_key=a, body='FORGED') for a in ('bob', 'alice', 'bob')]
        bound = self.endpoint._canonical_prepare_docs(rows, 'reader', {'posts': ['allowed']})
        self.assertEqual([row['body'] for row in bound], ['bob canonical', 'current', 'bob canonical'])
        self.db.execute("INSERT INTO group_hidden_docs VALUES ('allowed','active',4,0)")
        self.queries.clear()
        with self.assertRaises(HTTPException):
            self.endpoint._canonical_prepare_docs(rows, 'reader', {'posts': ['allowed']})
        self.assertEqual(len(self.queries), 1)
        self.assertIn('projected_preparation_keys', self.queries[0])


if __name__ == '__main__':
    unittest.main()
