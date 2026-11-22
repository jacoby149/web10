"""Exact pre-measurement verification receipts; no timings are samples here."""
from collections import Counter
import json
from pathlib import Path

import sqlglot
from sqlglot import exp

from arm_f_native import save
import arm_f_reads as reads
import engagement_billboard_reads as billboard_reads
import engagement_billboards as ads
import engagement_composition as contract
import engagement_composition_setup as setup
import engagement_events as events
import engagement_pairs as pairs
import engagement_tally_sql as tally_sql
from engagement_tally_build import HOT


def binding():
    names = ('engagement_pairs.py', 'engagement_billboard_reads.py', 'engagement_billboards.py',
        'engagement_composition_verify.py', 'engagement_composition_api.py', 'engagement_events.py',
        'engagement_tally_sql.py', 'engagement_tally_build.py')
    return {name: setup.digest(Path(__file__).with_name(name)) for name in names}


def refs(session, root):
    result = dict(parity='INCOMPLETE', source_binding=binding(), batches=[], mismatches=0, query_ids=[])
    for batch in range(32):
        values, query_id = session.rows('pairs_exact_census_' + str(batch), pairs.census(batch=batch))
        result['query_ids'].append(query_id)
        result['mismatches'] += int(values[0]['mismatches'])
        save(root / 'pairs-census.json', result)
        if int(values[0]['mismatches']):
            raise ValueError('complete ref set differs from independent canonical union oracle')
        result['batches'].append(batch)
    fat, query_id = session.rows('pairs_exact_fat_census', pairs.census('tally_verify_documents', 'pairs_refs_fat', batches=1))
    result['query_ids'].append(query_id)
    if int(fat[0]['mismatches']):
        raise ValueError('fat engagement ref universe differs')
    # A positive multi-ref pin is necessary; full census proves its exact set.
    multi, query_id = session.rows('pairs_multi_ref_pin_coverage', "SELECT count() AS n FROM (SELECT author_key,doc_id "
        "FROM pairs_refs WHERE doc_id IN (SELECT doc_id FROM engagement_documents WHERE collection_name='placements') "
        "GROUP BY author_key,doc_id HAVING uniqExact(ref_id)>=2 AND countIf(role='root')=1 AND countIf(role='target')>=1)")
    result['query_ids'].append(query_id)
    planned = len(json.loads((root / 'billboards/setup.json').read_bytes())['pins'])
    if not planned or int(multi[0]['n']) != planned:
        raise ValueError('every billboard pin must have a complete multi-ref set')
    questions = []
    for profile_name in ('ordinary', 'fixture', 'fat'):
        profile = json.loads((root / ('profile-' + ('ordinary' if profile_name == 'fat' else profile_name) + '.json')).read_bytes())
        ids = ([HOT['post_id']] if profile_name == 'fat' else
            json.loads((root / ('reference-' + profile_name) / 'expected.json').read_bytes())['ids'])
        for service in ('comments', 'reactions', 'posts'):
            groups = (['api.localhost/groups/web10/discover'] if profile_name == 'fat' else
                profile['actual_readable_by_kind']['main'][service])
            table = 'tally_verify_documents' if profile_name == 'fat' else 'engagement_documents'
            links = 'tally_verify_links' if profile_name == 'fat' else 'doc_groups'
            satellite = 'pairs_refs_fat' if profile_name == 'fat' else pairs.TABLE
            boundary = tally_sql.boundary(service, groups, profile['reader'], table='documents', links=links)
            # Compare the SAME old root question with the new candidate lane;
            # these are setup verification reads, never a rerun baseline sample.
            tree = sqlglot.parse_one(boundary, read='clickhouse')
            for node in tree.find_all(exp.Table):
                if node.name == 'documents':
                    node.set('this', exp.to_identifier(table))
            original = tree.sql(dialect='clickhouse')
            columns = 'author_key,doc_id,ref_value,group_id'
            expected, oracle_id = session.rows('pairs_same_question_oracle_' + profile_name + '_' + service,
                'SELECT ' + columns + ' FROM (' + original + ') WHERE ref_value IN (' + pairs.canonical.targets(ids) + ')')
            actual, actual_id = session.rows('pairs_same_question_seek_' + profile_name + '_' + service,
                'SELECT ' + columns + ' FROM (' + pairs.segment(boundary, ids, table=table, satellite=satellite) + ')')
            def multiset(rows):
                return Counter(tuple(row[key] for key in ('author_key', 'doc_id', 'ref_value', 'group_id')) for row in rows)
            if multiset(actual) != multiset(expected):
                raise ValueError('same-question canonical root seek parity failed before projection retirement')
            result['query_ids'] += [oracle_id, actual_id]
            questions.append(dict(profile=profile_name, service=service, roots=sorted(set(ids)), rows=len(actual),
                oracle_query_id=oracle_id, pairs_query_id=actual_id))
            save(root / 'pairs-same-question-parity.json', questions)
    result.update(parity='PASS', multi_ref=True, pins=True, fat_universe=True, same_question_parity=True)
    return contract.gate('refs', result)


def tallies(root, expected):
    build = json.loads((root / 'tallies/build.json').read_bytes())
    if (not build['verified'] or build['fat_verification']['parity'] != 'PASS'
            or build['independent_page_and_sample_parity'] != 'PASS' or not build['deterministic_sample']):
        raise ValueError('existing D114 ordinary/fat/sample checks incomplete')
    domains, query_ids = {}, []
    for label, service in (('main', 'reactions'), ('main', 'comments'), ('main', 'posts'),
            ('reactions', 'reactions'), ('comments', 'comments')):
        value = json.loads((root / ('tallies/verification-fixture-' + label + '-' + service + '.json')).read_bytes())
        if value['parity'] != 'PASS':
            raise ValueError('paired tally exact values failed')
        domains[label + ':' + service] = value['ids']
        query_ids += [value['oracle_query_id'], value['stored_query_id']]
    result = dict(parity='PASS', source_binding=binding(), query_ids=query_ids, queried_domains=domains,
        actual_oracle_roots=sorted(set(expected['fixture']['ids']) | {r['doc_id'] for r in expected['fixture']['rows']}),
        ordinary=True, fat=True, store_sample=True, values_exact=True)
    return contract.gate('paired-tallies', result)


def views(session, root, expected):
    query_ids = []
    statuses = {grain: dict(parity='BUILDING', profiles=[], query_ids=[], source_binding=binding())
        for grain in ('all-time', 'daily')}
    def checkpoint():
        for grain, value in statuses.items():
            save(root / ('composition-views-' + grain + '-parity.json'), value)
    for name, page in expected.items():
        sql = events.read(page['ids'], 'posts', page['views_readable_groups'], aggregate=True)
        aggregate, query_id = session.rows('composition_verify_views_' + name, sql)
        query_ids.append(query_id)
        statuses['all-time']['query_ids'].append(query_id)
        raw = reads.visible_views(session, page['ids'], page['views_readable_groups'], 'composition_raw_oracle_' + name)
        actual = {row['doc_id']: {k: int(row[k]) for k in ('impressions', 'reach')} for row in aggregate}
        save(root / ('composition-view-parity-' + name + '.json'), dict(actual=actual, expected=raw, query_id=query_id))
        if len(actual) != len(aggregate) or actual != raw:
            statuses['all-time'].update(parity='FAIL', failed_profile=name)
            checkpoint()
            raise ValueError('aggregate impressions/reach differ from independent raw canonical oracle')
        statuses['all-time']['profiles'].append(name)
        if len(statuses['all-time']['profiles']) == len(expected):
            statuses['all-time']['parity'] = 'PASS'
        checkpoint()
        daily, daily_id = session.rows('composition_verify_daily_views_' + name,
            events.read_daily(page['ids'], 'posts', page['views_readable_groups']))
        oracle, oracle_id = session.rows('composition_verify_daily_raw_oracle_' + name,
            events.read_daily(page['ids'], 'posts', page['views_readable_groups'], aggregate=False))
        query_ids += [daily_id, oracle_id]
        statuses['daily']['query_ids'] += [daily_id, oracle_id]
        def values(rows):
            result = {(r['doc_id'], r['day']): (int(r['impressions']), int(r['reach'])) for r in rows}
            if len(result) != len(rows):
                raise ValueError('duplicate daily view key')
            return result
        daily_ok = values(daily) == values(oracle)
        save(root / ('composition-daily-view-parity-' + name + '.json'),
            dict(parity='PASS' if daily_ok else 'FAIL', actual=daily, expected=oracle,
                query_ids=[daily_id, oracle_id]))
        if not daily_ok:
            statuses['daily'].update(parity='FAIL', failed_profile=name)
            checkpoint()
            raise ValueError('daily impressions/reach differ from independent raw canonical oracle')
        statuses['daily']['profiles'].append(name)
        if len(statuses['daily']['profiles']) == len(expected):
            statuses['daily']['parity'] = 'PASS'
        checkpoint()
    for value in statuses.values():
        value['parity'] = 'PASS'
    checkpoint()
    return contract.gate('views', dict(parity='PASS', source_binding=binding(), query_ids=query_ids,
        profiles=list(expected), exact_impressions_and_reach=True, all_time_parity='PASS', daily_parity='PASS'))


def billboards(session, root, expected):
    # Compile through the original production gate, never a satellite policy.
    import sys
    api = str(Path(__file__).resolve().parents[3] / 'api')
    if api not in sys.path:
        sys.path.insert(0, api)
    from app.v3.services.safe_query import build_safe_query
    query_ids, receipts = [], {}
    def execute(sql):
        rows, query_id = session.rows('composition_ad_canonical_verification', sql)
        query_ids.append(query_id)
        return rows
    for name, page in expected.items():
        profile = json.loads((root / ('profile-' + name + '.json')).read_bytes())
        groups = profile['actual_readable_by_kind']['main']['posts']
        actual = billboard_reads.attach(page['rows'], profile['reader'], execute=execute,
            readable=lambda reader, service, groups=groups: groups, compile=build_safe_query)
        receipts[name] = ads.compare(actual, page['rows'], page['billboard_setup'])
    save(root / 'composition-ad-parity.json', receipts)
    return contract.gate('ads', dict(parity='PASS', source_binding=binding(), query_ids=query_ids,
        profiles=list(expected), exact_creative_identity_required=True, pin_semantics=ads.PIN_SEMANTICS,
        setup_sha256=setup.digest(root / 'billboards/setup.json')))
