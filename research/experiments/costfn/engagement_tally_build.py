"""Canonical setup builds, exact independent checks, then a frozen tally receipt."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import time
from datetime import UTC, datetime
from uuid import uuid4

import arm_satellite_batch as batching
import arm_satellite_counts as counts
from arm_f_native import save
from arm_satellite_sql import literal as q
from costfn_seed_resume import setup_writes
import engagement_certificates as certificates
import engagement_hot as hot
import engagement_hot_read as hot_reference
import engagement_modern as modern
import engagement_tally_sql as sql
import engagement_window as window

HOT = dict(post_id='06d10881-9274-4d65-acbd-282e069ac036', clock_utc='2026-11-11T03:36:42.827922+00:00',
    actors=100000, comments=50000, post_reactions=6731, comment_reactions=6731,
    banked_archive_sha256='9447ed4e4810d17ac943d3396f4e6b9d3ece1dd1ecbb4fc4124a1a8de23316ba')


def hot_fixture(session):
    """Restore banked canonical fixture only. Never call Stage D or seed events."""
    session.query('tally_verify_docs_ddl', 'CREATE TABLE tally_verify_documents AS engagement_documents')
    session.query('tally_verify_links_ddl', 'CREATE TABLE tally_verify_links AS doc_groups')
    session.query('tally_verify_actors', 'CREATE TABLE tally_verify_actors ENGINE=MergeTree ORDER BY idx AS SELECT '
        'toUInt32(row_number() OVER (ORDER BY username)-1) AS idx,username FROM '
        '(SELECT username FROM users FINAL WHERE deleted=0 ORDER BY username LIMIT 100000)')
    columns = '(doc_id,author_key,collection_name,body,ref_value,tags,created_at,updated_at,deleted,ad_mode,ad_target,posted_by)'
    clock = 'parseDateTime64BestEffort(' + q(HOT['clock_utc']) + ",3,'UTC')"
    def insert(label, selected):
        session.query('tally_fixture_' + label, 'INSERT INTO tally_verify_documents ' + columns + ' SELECT ' + selected)
    insert('root', q(HOT['post_id']) + ",username,'posts','{\"text\":\"Synthetic hot post\"}','',[]," + clock + ',' + clock + ",0,'none','',username FROM tally_verify_actors WHERE idx=0")
    comment = hot.uid(HOT['post_id'] + ':comment:', 'number')
    parent = "if(number<32,''," + hot.uid(HOT['post_id'] + ':comment:', 'intDiv(number-32,32)') + ')'
    created = clock + '+toIntervalDay(6)+toIntervalSecond(200)+toIntervalMillisecond(number)'
    insert('comments', comment + ",username,'comments',concat('{\"text\":\"Synthetic comment\",\"parent_id\":',toJSONString(" + parent + "),'}'),"
        + q(HOT['post_id']) + ',[],' + created + ',' + created + ",0,'none','',username FROM numbers(50000) n INNER JOIN tally_verify_actors a ON a.idx=number%100000")
    finer = hot.uid(HOT['post_id'] + ':comment:', '(number-6731)%50000')
    actor = 'if(number<6731,number,(intDiv(number-6731,50000)+(number-6731)%50000+1)%100000)'
    created = clock + '+toIntervalDay(6)+toIntervalSecond(400)+toIntervalMillisecond(number)'
    insert('reactions', hot.uid(HOT['post_id'] + ':reaction:', 'number') + ",username,'reactions',if(number<6731,'{\"type\":\"like\"}',"
        + "concat('{\"type\":\"like\",\"target_id\":',toJSONString(" + finer + "),'}'))," + q(HOT['post_id']) + ',[],'
        + created + ',' + created + ",0,'none','',username FROM numbers(13462) n INNER JOIN tally_verify_actors a ON a.idx=toUInt32(" + actor + ')')
    session.query('tally_fixture_links', 'INSERT INTO tally_verify_links (doc_id,group_id,created_at,updated_at,deleted) '
        "SELECT doc_id,'api.localhost/groups/web10/discover',created_at,updated_at,0 FROM tally_verify_documents")


def stored(session, key, ids=None):
    rows, query_id = session.rows('tally_stored_verification', 'SELECT doc_id,counter_name,value FROM ' + sql.TABLE
        + ' WHERE scope_key=' + q(key) + (' AND doc_id IN (' + ','.join(q(v) for v in ids) + ')' if ids else ''))
    result = {(row['doc_id'], row['counter_name']): int(row['value']) for row in rows}
    if len(result) != len(rows):
        raise ValueError('duplicate tally key')
    return result, query_id


def verification_targets(expected, sample_ids, legacy_ids=()):
    # The canonical document-stream oracle, not the legacy inventory page,
    # defines the actual roots whose counts will be displayed.
    return sorted(set(sample_ids) | set(legacy_ids) | set(expected['ids'])
        | {row['doc_id'] for row in expected['rows']})


def page_parity(root, profile, label, service, actual, *, verified_ids):
    expected = json.loads((Path(root) / ('reference-' + profile) / 'expected.json').read_bytes())
    required = set(expected['ids']) | {row['doc_id'] for row in expected['rows']}
    if not required <= set(verified_ids):
        raise ValueError('independent verification omitted actual page roots; zero defaults are not evidence')
    if label == 'main':
        fields = {'reactions': (('likes','reactions:like:direct'),('dislikes','reactions:dislike:direct')),
            'comments': (('comments','comments'),), 'posts': (('reposts','reposts'),)}[service]
        for row in expected['rows']:
            for field,kind in fields:
                if actual.get((row['doc_id'],kind),0) != int(row[field]):
                    raise ValueError('tally differs from independent prepared page oracle')
        return
    response = []
    for target in sorted(set(expected['ids'])):
        if service == 'reactions' and actual.get((target,'reactions:present:direct'),0):
            response.append(dict(ref_value=target,like_count=actual.get((target,'reactions:like:direct'),0),
                dislike_count=actual.get((target,'reactions:dislike:direct'),0)))
        elif service == 'comments' and actual.get((target,'comments'),0):
            response.append(dict(post_id=target,comment_count=actual[target,'comments']))
    wanted = expected['followups'][0 if service == 'reactions' else 1]
    def rows(values):
        return sorted(json.dumps(v,sort_keys=True) for v in values)
    if rows(response) != rows(wanted):
        raise ValueError('tally differs from independent follow-up oracle including zero-group presence')


def build_scope(session, output, record, reader, service, groups, generation, copy_hash, *, table='engagement_documents', links='doc_groups', batches=8):
    key = sql.scope(reader, service, groups, generation, copy_hash)
    if key in record['scopes']:
        return key
    info = dict(reader=reader, service=service, groups=sorted(groups), key=key, complete=False, verified=False, queries=[])
    record['scopes'][key] = info
    canonical = sql.boundary(service, groups, reader, table=table, links=links)
    print('[tally] build scope', key[:12], service, batches, flush=True)
    for index in range(batches):
        print('[tally] batch', key[:12], index, 'start', flush=True)
        statement = sql.insert(canonical, service, key, index, batches, table=table, links=links)
        _, query_id = session.query('tally_build_' + key[:12] + '_' + str(index), statement)
        info['queries'].append(dict(query_id=query_id, native=session.native(query_id)))
        save(output / 'build.json', record)
        print('[tally] batch', key[:12], index, 'complete', flush=True)
    _, query_id = session.query('tally_consolidate_' + key[:12], batching.final_sql(key, sql.PARTS, sql.TABLE))
    info.update(complete=True, consolidation=dict(query_id=query_id, native=session.native(query_id)))
    save(output / 'build.json', record)
    return key


def verify_hot(session, output, record, reader, generation, copy_hash):
    hot_fixture(session)
    census, census_id = session.rows('tally_fat_canonical_census', 'SELECT collection_name,count() AS n,uniqExact(doc_id) AS identities '
        'FROM tally_verify_documents FINAL GROUP BY collection_name')
    if {r['collection_name']:int(r['n']) for r in census} != dict(posts=1,comments=50000,reactions=13462) or any(int(r['n']) != int(r['identities']) for r in census):
        raise ValueError('restored fat canonical identity/cardinality mismatch')
    root = HOT['post_id']
    parents = hot_reference.expected_parents(root)
    expected_comments = Counter({(root, 'comments'): 50000})
    expected_comments.update((parent, 'comments') for parent in parents.values() if parent)
    expected_reactions = Counter({(root, 'reactions:like'): 13462, (root, 'reactions:present'): 13462,
        (root, 'reactions:like:direct'): 6731, (root, 'reactions:present:direct'): 6731})
    for target, value in hot_reference.expected_reactions(HOT).items():
        if target:
            expected_reactions[target, 'reactions:like'] = value
            expected_reactions[target, 'reactions:present'] = value
    for service, expected in (('comments', expected_comments), ('reactions', expected_reactions)):
        key = build_scope(session, output, record, reader, service, ['api.localhost/groups/web10/discover'], generation,
            copy_hash + ':banked-fat', table='tally_verify_documents', links='tally_verify_links', batches=1)
        actual, query_id = stored(session, key)
        save(output / ('fat-' + service + '.json'), dict(expected=[[a,b,v] for (a,b),v in sorted(expected.items())],
            actual=[[a,b,v] for (a,b),v in sorted(actual.items())], query_id=query_id, parity='PASS' if actual == expected else 'FAIL'))
        if actual != expected:
            raise ValueError('tally fat canonical fixture differs from exact banked target map')
        record['scopes'][key]['verified'] = True
    record['fat_verification'] = dict(plan=HOT, parity='PASS', stage_D_remeasured=False, events_seeded=False,
        census=census, census_query_id=census_id)


def run(root):
    root = Path(root)
    session = modern.Session(root)
    if session.operation.get('tally_wiring_admitted') is not True:
        raise ValueError('separate tally admission required')
    output = root / 'tallies'
    resumable = window.task(session.operation)
    certificate = root / 'certification-tally'
    if resumable and (certificate / 'certificate.json').exists():
        certificates.verify(root)
        receipt = json.loads((output / 'build.json').read_bytes())
        parts, _ = session.rows('tally_current_parts', "SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts "
            "WHERE database='web10' AND table='" + sql.TABLE + "' AND active ORDER BY name")
        if not receipt['verified'] or hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest() != receipt['parts_sha256']:
            raise ValueError('retained tally differs from its verified parts')
        return receipt
    output.mkdir(mode=0o700, exist_ok=resumable)
    session = setup_writes(session, root / 'task-setup/tallies', 'engagement_documents', 'doc_groups')
    started = time.perf_counter()
    generation, _ = counts.generation(session)
    copy_hash = json.loads((root / 'copy-proof.json').read_bytes())['parts_sha256']
    record = dict(kind='CANONICAL_GENERIC_TALLY_SETUP', scopes={}, routing={}, canonical_generation=generation,
        copy_parts_sha256=copy_hash, table=sql.TABLE, verified=False, source_store='engagement_documents', legacy_counts_used=False,
        started_utc=datetime.now(UTC).isoformat(), engine=modern.ENGINE, dataset_id=session.operation['dataset_id'])
    session.query('tally_parts_ddl', batching.partial_ddl(sql.PARTS))
    session.query('tally_final_ddl', batching.count_ddl(sql.TABLE))
    ordinary = json.loads((root / 'profile-ordinary.json').read_bytes())
    verify_hot(session, output, record, ordinary['reader'], generation, copy_hash)
    sample, _ = session.rows('tally_deterministic_store_sample', "SELECT ref_value AS id FROM engagement_documents FINAL "
        "WHERE collection_name IN ('reactions','comments') AND ref_value!='' GROUP BY ref_value ORDER BY cityHash64(ref_value),ref_value LIMIT 32")
    sample += session.rows('tally_deterministic_post_sample', "SELECT doc_id AS id FROM engagement_documents FINAL WHERE collection_name='posts' "
        'AND deleted=0 ORDER BY cityHash64(doc_id),doc_id LIMIT 32')[0]
    sample_ids = sorted({row['id'] for row in sample})
    for profile_name in ('ordinary', 'fixture'):
        profile = json.loads((root / ('profile-' + profile_name + '.json')).read_bytes())
        record['routing'][profile_name] = {}
        page = json.loads((root / ('reference-' + profile_name) / 'expected.json').read_bytes())
        ids = verification_targets(page,sample_ids,[row['doc_id'] for row in profile['reference_page']])
        for label in ('main', 'reactions', 'comments'):
            record['routing'][profile_name][label] = {}
            for service in ('reactions', 'comments', 'posts') if label == 'main' else (label,):
                groups = profile['actual_readable_by_kind'][label][service]
                key = build_scope(session, output, record, profile['reader'], service, groups, generation, copy_hash)
                record['routing'][profile_name][label][service] = key
                expected, query_id = session.rows('tally_independent_canonical_' + key[:12], sql.oracle(service, groups, profile['reader'], ids))
                expected = {(row['doc_id'], row['counter_name']): int(row['value']) for row in expected}
                actual, stored_id = stored(session, key, ids)
                save(output / ('verification-' + profile_name + '-' + label + '-' + service + '.json'), dict(ids=ids, sample_ids=sample_ids,
                    canonical=[[a,b,v] for (a,b),v in sorted(expected.items())], stored=[[a,b,v] for (a,b),v in sorted(actual.items())],
                    oracle_query_id=query_id, stored_query_id=stored_id, parity='PASS' if expected == actual else 'FAIL'))
                if expected != actual:
                    raise ValueError('tally differs from independent canonical counts; do not measure')
                page_parity(root, profile_name, label, service, actual, verified_ids=ids)
                record['scopes'][key]['verified'] = True
    session.query('tally_settle', 'OPTIMIZE TABLE ' + sql.TABLE + ' FINAL')
    parts, _ = session.rows('tally_current_parts', "SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts "
        "WHERE database='web10' AND table='" + sql.TABLE + "' AND active ORDER BY name")
    if counts.generation(session)[0] != generation or not all(s['verified'] for s in record['scopes'].values()):
        raise ValueError('tally source changed or verification incomplete')
    record.update(verified=True, parts_sha256=hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest(),
        source_parts=parts, deterministic_sample=sample_ids, setup_seconds=time.perf_counter()-started,
        completed_utc=datetime.now(UTC).isoformat(), independent_page_and_sample_parity='PASS')
    save(output / 'build.json', record)
    for profile in ('ordinary', 'fixture'):
        path = root / ('counts-' + profile + '.json')
        receipt = json.loads(path.read_bytes())
        receipt['tally'] = {**record, 'routing': record['routing'][profile]}
        save(path, receipt)
    before = json.loads((root / 'before-projection-fingerprint.json').read_bytes())
    if resumable and certificate.exists():
        certificate.rename(certificate.with_name(certificate.name + '-incomplete-' + uuid4().hex))
    certificates.refresh(root, before, 'tally')
    return record
