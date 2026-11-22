"""D124 amendment controls. SQLite models pin history only; no ClickHouse/network."""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest.mock import Mock

import sqlglot

import engagement_billboard_reads as reads
import engagement_billboards as oracle
import engagement_composition as contract

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
from app.v3.services.safe_query import build_safe_query  # noqa: E402


def ad(author='a', identity='ad'):
    return dict(author_key=author, doc_id=identity, posted_by=author, body={'text':identity}, tags=['ad'])


def pin(identity='pin', post='p', *, target='ad', owner='a', target_author='a', placement='author', **changes):
    row = dict(author_key=owner, doc_id=identity, ref_value=post, collection_name='placements',
        updated_at=1, deleted=0, body=dict(post_author=owner, target_id=target,
            target_author=target_author, placement=placement))
    return {**row, **changes}


def expectation(post='p', *, owner='a', placement='author', creative=None):
    return dict(post=[owner,post], placement=placement,
        ad=ad() if creative is None and placement!='none' else creative)


class CanonicalStore:
    """Execute both real pin stages over complete histories; creative gate stays real SQL construction."""
    def __init__(self, rows, creatives=None, reverse=False):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.create_function('UNHEX', 1, lambda value:bytes.fromhex(value).decode())
        def extract(body, name):
            value = json.loads(body)
            return value.get(name,'') if isinstance(value,dict) else ''
        self.db.create_function('JSONEXTRACTSTRING', 2, extract)
        self.db.execute('CREATE TABLE engagement_documents (author_key TEXT,doc_id TEXT,ref_value TEXT,'
            'collection_name TEXT,body TEXT,updated_at INTEGER,deleted INTEGER)')
        self.db.execute('CREATE TABLE pairs_refs (author_key TEXT,doc_id TEXT,ref_id TEXT,role TEXT)')
        for row in reversed(rows) if reverse else rows:
            values = [json.dumps(row[k]) if k=='body' else row[k] for k in
                ('author_key','doc_id','ref_value','collection_name','body','updated_at','deleted')]
            self.db.execute('INSERT INTO engagement_documents VALUES (?,?,?,?,?,?,?)', values)
            self.db.execute('INSERT INTO pairs_refs VALUES (?,?,?,?)',
                (row['author_key'],row['doc_id'],row['ref_value'],'root'))
        self.sql, self.creatives, self.reverse = [], creatives if creatives is not None else [ad()], reverse

    def execute(self, statement):
        self.sql.append(statement)
        if 'pin_selection_current_winners' in statement or 'pin_materialization_current_winners' in statement:
            translated = sqlglot.transpile(statement, read='clickhouse', write='sqlite')[0]
            rows = [dict(r) for r in self.db.execute(translated)]
            return rows
        if len(self.sql)!=3:
            raise AssertionError('Workstream B permits only selection, materialization, unchanged creative fetch')
        return deepcopy(self.creatives)


class AgreementTests(unittest.TestCase):
    def serve(self, pins, records, *, docs=None, creatives=None, reverse=False):
        docs = docs if docs is not None else [dict(author_key='a',doc_id='p')]
        store = CanonicalStore(pins, creatives, reverse)
        self.addCleanup(store.db.close)
        actual = reads.attach(docs, 'reader', execute=store.execute,
            readable=lambda *_:['allowed'], compile=build_safe_query)
        proof = oracle.compare(actual, docs, dict(posts=records))
        self.assertEqual(proof['pin_semantics'], oracle.PIN_SEMANTICS)
        return actual, store.sql

    def test_agreeing_distinct_live_pins_serve_one_ad_and_oracle_names_amendment(self):
        rows, sql = self.serve([pin('one'),pin('two')], [expectation(),expectation()])
        self.assertEqual(rows[0]['ad'], ad())
        self.assertNotIn('node_ad', rows[0])
        self.assertEqual(len(sql), 3)

    def test_different_ads_refuse_before_creative_authority_or_fetch(self):
        for reverse in (False,True):
            with self.subTest(reverse=reverse), self.assertRaisesRegex(ValueError, 'different ads'):
                self.serve([pin('one'),pin('two',target='other')], [], reverse=reverse)
        with self.assertRaises(ValueError):
            oracle.expected_rows([dict(author_key='a',doc_id='p')], dict(posts=[expectation(),expectation(creative=ad(identity='other'))]))

    def test_same_doc_id_under_different_creative_authors_is_a_conflict(self):
        pins = [pin('one',target_author='b',placement='node'),pin('two',target_author='c',placement='node')]
        with self.assertRaisesRegex(ValueError, 'different ads'):
            self.serve(pins, [])
        with self.assertRaises(ValueError):
            oracle.expected_rows([dict(author_key='a',doc_id='p')], dict(posts=[
                expectation(placement='node',creative=ad('b')), expectation(placement='node',creative=ad('c'))]))

    def test_malformed_agreeing_pin_cannot_be_hidden_in_either_order(self):
        bad = pin('two')
        bad['body']['placement'] = 'invalid'
        for reverse in (False,True):
            with self.subTest(reverse=reverse), self.assertRaisesRegex(ValueError, 'malformed'):
                self.serve([pin('one'),bad], [], reverse=reverse)
            with self.subTest(all_validate_before_conflict=reverse), self.assertRaisesRegex(ValueError, 'malformed'):
                self.serve([pin('one'),pin('middle',target='other'),bad], [], reverse=reverse)
        with self.assertRaises(ValueError):
            oracle.expected_rows([dict(author_key='a',doc_id='p')],dict(posts=[expectation(),expectation(placement='invalid')]))

    def test_author_precedence_among_agreeing_placements_does_not_depend_on_query_order(self):
        pins = [pin('one',placement='node'),pin('two')]
        records = [expectation(placement='node'),expectation()]
        for reverse in (False,True):
            with self.subTest(reverse=reverse):
                actual, _ = self.serve(pins, list(reversed(records)) if reverse else records, reverse=reverse)
                self.assertEqual(actual[0]['ad'], ad())
                self.assertNotIn('node_ad', actual[0])
                wrong = deepcopy(actual)
                wrong[0]['node_ad'] = wrong[0].pop('ad')
                with self.assertRaises(ValueError):
                    oracle.compare(wrong, [dict(author_key='a',doc_id='p')], dict(posts=records))

    def test_one_creative_on_two_posts_serves_both_in_original_page_order(self):
        docs = [dict(author_key='a',doc_id='q'),dict(author_key='a',doc_id='p')]
        actual, _ = self.serve([pin('one'),pin('two',post='q')], [expectation(),expectation('q')],docs=docs)
        self.assertEqual([row['doc_id'] for row in actual], ['q','p'])
        self.assertEqual([row['ad'] for row in actual], [ad(),ad()])
        self.assertIsNot(actual[0]['ad'], actual[1]['ad'])

    def test_withdrawn_superseded_or_moved_pin_never_counts_as_conflicting_live_target(self):
        old = pin('two',target='other')
        for change in (dict(deleted=1),dict(collection_name='notes'),dict(ref_value='elsewhere')):
            with self.subTest(change=change):
                latest = {**old,**change,'updated_at':2}
                actual, _ = self.serve([pin('one'),old,latest], [expectation()])
                self.assertEqual(actual[0]['ad'], ad())
        # Delete wins an exact timestamp tie, before the old ad can conflict.
        actual, _ = self.serve([pin('one'),old,{**old,'deleted':1}], [expectation()])
        self.assertEqual(actual[0]['ad'], ad())

    def test_zero_live_pins_is_no_ad_not_refusal(self):
        actual, sql = self.serve([], [expectation(placement='none')])
        self.assertEqual(actual, [dict(author_key='a',doc_id='p')])
        self.assertEqual(len(sql), 1)

    def test_existing_sql_author_exclusions_remain_omissions_not_new_refusals(self):
        wrong = pin('two',target='other')
        wrong['body']['post_author'] = 'wrong'
        outsider = pin('outsider',owner='b',target='other',target_author='b')
        actual, _ = self.serve([pin('one'),wrong,outsider], [expectation()])
        self.assertEqual(actual[0]['ad'], ad())

    def test_author_entitlement_is_validated_even_when_a_node_pin_agrees(self):
        pins = [pin('one',placement='node',target_author='b'),pin('two',target_author='b')]
        with self.assertRaisesRegex(ValueError, 'author billboard'):
            self.serve(pins, [])

    def test_creative_lookup_statement_and_reader_denial_are_unchanged(self):
        _, single = self.serve([pin()], [expectation()])
        _, duplicate = self.serve([pin('one'),pin('two')], [expectation(),expectation()])
        self.assertEqual(single[0], duplicate[0])  # Same full candidate selection, no page shortcut.
        self.assertEqual(single[-1], duplicate[-1])  # Creative SQL is byte-for-byte unchanged.
        self.assertNotEqual(single[1], duplicate[1])  # Exact survivor handoff includes the second pin.
        store = CanonicalStore([pin('one'),pin('two')])
        self.addCleanup(store.db.close)
        actual = reads.attach([dict(author_key='a',doc_id='p')], 'denied', execute=store.execute,
            readable=lambda *_:[], compile=Mock(side_effect=AssertionError('must not fetch denied creative')))
        self.assertNotIn('ad', actual[0])
        self.assertEqual(len(store.sql), 2)

    def test_ads_gate_requires_named_amended_semantics_not_an_old_policy_receipt(self):
        value = dict(parity='PASS',source_binding={'source':'hash'},query_ids=['native'],
            profiles=['ordinary','fixture'],exact_creative_identity_required=True,setup_sha256='setup',
            pin_semantics=oracle.PIN_SEMANTICS)
        contract.gate('ads', value)
        for policy in (None,'ONE_LIVE_PIN_PER_POST'):
            with self.subTest(policy=policy),self.assertRaises(ValueError):
                contract.gate('ads', {**value,'pin_semantics':policy})

    def test_banked_fixture_configuration_and_expected_responses_have_no_changed_verdict(self):
        audit = json.loads((Path(__file__).parent/'fixtures/pin-amendment-bank-audit.json').read_bytes())
        self.assertTrue(audit['source_only'])
        self.assertFalse(audit['native_execution'] or audit['original_packets_modified'])
        self.assertEqual(audit['pin_semantics'], oracle.PIN_SEMANTICS)
        self.assertEqual({a['attempt'] for a in audit['attempts']}, {'attempt6','attempt7'})
        for attempt in audit['attempts']:
            self.assertEqual(attempt['setup_sha256'], 'e4f409b048a24004f7dd241c5e43da42b89dfe9cd05ba2f987da63ba75111c14')
            self.assertEqual((attempt['posts'],attempt['pins'],attempt['duplicate_pin_roots']), (42,32,0))
            self.assertEqual((attempt['fixture_documents'],attempt['fixture_links']), (338,950))
            self.assertEqual(attempt['changed_fixture_verdicts'], 0)
            self.assertEqual(len(attempt['comparisons']), 6)
            self.assertTrue(all(c['same_expected_response'] for c in attempt['comparisons']))


if __name__ == '__main__':
    unittest.main()
