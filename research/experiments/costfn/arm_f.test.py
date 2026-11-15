"""No network, no API import and no ClickHouse: Config F write/recovery controls."""
from pathlib import Path
import tempfile
import unittest

import sqlglot
from sqlglot import exp

import arm_f as f
from arm_f_journal import Journal
import arm_f_cloud as cloud


class FanoutTests(unittest.TestCase):
    def test_one_canonical_pass_and_no_reader_rerank(self):
        for count in (0, 10, 500, 999, 1999, 2000, 2001):
            calls, writes = [], []
            def query(sql, **kwargs):
                calls.append((sql, kwargs))
                return type('Rows', (), {'result_rows': [(str(i),) for i in range(count)]})()
            result = f.append_publication(query, lambda *a, **kw: writes.append((a, kw)),
                {'doc_id': 'doc', 'author_key': 'author', 'created_at': '2026-01-01'}, 'group', 1)
            self.assertEqual(len(calls), 1)
            self.assertEqual(result['members'], count)
            self.assertEqual(result['recipient_pointers'], count if count < 2000 else 0)
            self.assertEqual(len(writes), int(0 < count < 2000))
            tree = sqlglot.parse_one(calls[0][0], read='clickhouse')
            self.assertEqual({t.name for t in tree.find_all(exp.Table)}, {'group_members'})
            self.assertFalse(list(tree.find_all(exp.Limit)))
            self.assertFalse(list(tree.find_all(exp.AggFunc)))

    def test_no_membership_recipe_and_no_silent_duplicates(self):
        with self.assertRaises(ValueError):
            f.recipients(lambda *a, **k: type('R', (), {'result_rows': [('same',), ('same',)]})(), 'g')
        for bad in (0, -1, 2**63, True):
            with self.assertRaises(ValueError):
                f.append_publication(None, None, {}, 'g', bad)

    def test_ddl_matches_approved_artifact(self):
        text = Path(__file__).with_name('ARM-F-DESIGN-CLOSURE.md').read_text()
        self.assertIn(f.DDL + ';', text)
        sqlglot.parse_one(f.DDL, read='clickhouse')
        for version in (1, 100, 2**63 - 1):
            self.assertLess(version * 2, version * 2 + 1)
            self.assertLessEqual(version * 2 + 1, 2**64 - 1)

    def test_cap_precedes_group_filter(self):
        sql = f.cache_sql('reader', ['group'])
        self.assertLess(sql.index('dense_rank()'), sql.index('AND group_id IN'))
        self.assertIn('position<=200', sql)
        self.assertIn('version DESC,deleted DESC', sql)
        sqlglot.parse_one(sql, read='clickhouse')

    def test_new_contract_does_not_change_original(self):
        sql = 'SELECT p.doc_id,p.author_key,p.group_id FROM posts p ORDER BY p.created_at DESC LIMIT 21'
        treated = f.document_contract(sql)
        self.assertNotIn('QUALIFY', sql)
        self.assertIn('QUALIFY', treated)
        tree = sqlglot.parse_one(treated, read='clickhouse')
        self.assertEqual(len(tree.args['order'].expressions), 3)
        for bad in ('SELECT * FROM posts ORDER BY score DESC LIMIT 21',
                    'SELECT DISTINCT p.doc_id FROM posts p ORDER BY p.created_at DESC LIMIT 21'):
            with self.assertRaises(ValueError):
                f.document_contract(bad)

    def test_merge_preserves_full_keys_alternate_routes_and_refill(self):
        def row(author, doc, group, ts):
            return {'author_key': author, 'doc_id': doc, 'group_id': group, 'created_ms': ts}
        sources = {'a': [row('a', 'dead', 'a', 9), row('a', 'same', 'a', 8), row('b', 'same', 'a', 7)],
                   'b': [row('a', 'same', 'b', 8)]}
        def fetch(source, cursor, size):
            return [r for r in sources[source] if cursor is None or f.key(r) > f.key(cursor)][:size]
        def resolve(rows):
            return [r for r in rows if r['doc_id'] != 'dead'
                    and (r['author_key'] != 'a' or r['group_id'] == 'b')]
        result = f.merge_page(list(sources), 2, fetch, resolve)
        self.assertEqual([(r['author_key'], r['group_id']) for r in result], [('a', 'b'), ('b', 'a')])

    def test_resolution_cannot_invent_identity(self):
        row = {'author_key': 'a', 'doc_id': 'd', 'group_id': 'g', 'created_ms': 1}
        with self.assertRaises(ValueError):
            f.merge_page(['s'], 1, lambda s, c, n: [row] if c is None else [],
                         lambda r: [{**r[0], 'author_key': 'other'}])


class JournalTests(unittest.TestCase):
    def test_crash_reopen_and_idempotent_ack(self):
        with tempfile.TemporaryDirectory() as directory:
            j = Journal(directory)
            calls = []
            def apply(seq, payload):
                calls.append(seq)
                return {'doc_id': 'stable'}
            def crash(*args):
                raise RuntimeError('crash after canonical apply')
            with self.assertRaises(RuntimeError):
                j.run('op', 'actor', 'publish', {'doc_id': 'stable'}, lambda: None, apply, crash)
            self.assertEqual(len(j.pending()), 1)
            j.close()
            j = Journal(directory)
            result = j.run('op', 'actor', 'publish', {'doc_id': 'stable'}, lambda: None, apply, lambda *a: None)
            self.assertEqual(result, {'doc_id': 'stable'})
            self.assertEqual(calls, [1, 1])
            j.run('op', 'actor', 'publish', {'doc_id': 'stable'}, lambda: None, apply, lambda *a: None)
            self.assertEqual(calls, [1, 1])
            self.assertFalse(j.pending())
            j.close()

    def test_current_authority_required_even_for_completed_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            j = Journal(directory)
            j.run('op', 'actor', 'publish', {}, lambda: None, lambda *a: {}, lambda *a: None)
            def denied():
                raise PermissionError('revoked')
            with self.assertRaises(PermissionError):
                j.run('op', 'actor', 'publish', {}, denied, lambda *a: {}, lambda *a: None)
            with self.assertRaises(ValueError):
                j.run('op', 'other', 'publish', {}, lambda: None, lambda *a: {}, lambda *a: None)
            j.close()

    def test_fence_credentials_and_bounded_background_trim(self):
        with tempfile.TemporaryDirectory() as directory:
            j = Journal(directory)
            with self.assertRaises(BlockingIOError):
                Journal(directory)
            for bad in ({'nested': {'token': 'secret'}}, {'body': 'x?X-Amz-Signature=secret'}):
                with self.assertRaises(ValueError):
                    j.run('bad', 'actor', 'publish', bad, lambda: None, lambda *a: {}, lambda *a: None)
            j.dirty([str(i) for i in range(100)], 1)
            trimmed = []
            self.assertEqual(j.trim_batch(trimmed.append), 64)
            self.assertEqual(j.trim_batch(trimmed.append), 36)
            self.assertEqual(j.trim_batch(trimmed.append), 0)
            self.assertEqual(len(set(trimmed)), 100)
            j.close()


class CloudAdmissionTests(unittest.TestCase):
    def test_verified_input_readability_never_changes_private_parent(self):
        import json
        import os
        from arm_f_run import readonly_input
        publication = json.loads(Path(__file__).with_name('evidence').joinpath(
            'realism-1m-minio-publication-20261113.json').read_bytes())
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            os.chmod(parent, 0o700)
            inputs = parent / 'input'
            inputs.mkdir(mode=0o700)
            secret = parent / 'archive-urls.json'
            secret.write_text('private capabilities stay private')
            os.chmod(secret, 0o600)
            for item in publication['objects']:
                (inputs / item['key'].rsplit('/', 1)[1]).touch(mode=0o600)
            try:
                readonly_input(inputs)
                self.assertEqual(inputs.stat().st_mode & 0o777, 0o555)
                self.assertTrue(all((p.stat().st_mode & 0o777) == 0o444 for p in inputs.iterdir()))
                self.assertEqual(parent.stat().st_mode & 0o777, 0o700)
                self.assertEqual(secret.stat().st_mode & 0o777, 0o600)
            finally:
                os.chmod(inputs, 0o700)

    def test_firewall_refuses_silent_port_zero(self):
        import copy
        lease = {'name': 'owned', 'tag': 'owned'}
        row = {'name': 'owned', 'tags': ['owned'], 'inbound_rules': [
            {'protocol': 'tcp', 'ports': '22', 'sources': {'addresses': ['192.0.2.1/32']}}],
            'outbound_rules': [{'protocol': protocol, 'ports': '1-65535',
                'destinations': {'addresses': ['0.0.0.0/0']}} for protocol in ('tcp', 'udp')]}
        cloud.firewall_verified(row, lease)
        broken = copy.deepcopy(row)
        broken['outbound_rules'][0]['ports'] = '0'
        with self.assertRaises(ValueError):
            cloud.firewall_verified(broken, lease)

    def test_exact_bounded_admission_only(self):
        lease = dict(name='web10-fanout-f-123456abcdef', tag='web10-fanout-f-123456abcdef',
            configuration='F', region='nyc3', size='s-8vcpu-32gb-amd', max_usd=2,
            hourly_usd=.25, created_epoch=100, deadline=14500, account_uuid='account')
        cloud.validate(lease)
        for key, value in [('deadline', 14501), ('max_usd', 3), ('configuration', 'P'),
                           ('size', 'bigger'), ('tag', 'other'), ('region', 'other')]:
            with self.assertRaises(ValueError):
                cloud.validate({**lease, key: value})

    def test_cleanup_ownership_is_exact(self):
        lease = dict(name='web10-fanout-f-123456abcdef', tag='web10-fanout-f-123456abcdef',
                     size='s-8vcpu-32gb-amd', region='nyc3', droplet_id=123)
        row = dict(id=123, name=lease['name'], tags=[lease['tag']],
                   size_slug=lease['size'], region={'slug': 'nyc3'})
        self.assertTrue(cloud.owned(row, lease))
        for key, value in [('id', 124), ('tags', []), ('name', 'other'), ('size_slug', 'bigger')]:
            self.assertFalse(cloud.owned({**row, key: value}, lease))


if __name__ == '__main__':
    unittest.main()
