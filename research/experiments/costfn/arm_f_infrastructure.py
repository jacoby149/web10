"""Scoped P infrastructure rebuilds, NOT new P baseline/full-parity trials.

Unchanged source-pinned builders; bounded declared targets checked against banked
values. New T2 fixture scopes use their own bounded canonical checks, never old
expected values. Verdict labels deliberately differ from historical full PASS.
"""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path

import arm_f_banked as banked
from arm_f_run import save
from arm_f_runtime import Session
import arm_satellite_batch as batch
import arm_satellite_batch_run as batching
import arm_satellite_counts as counts
import arm_satellite_metadata as metadata
import arm_satellite_sql as typed
import arm_t

SCOPES = ('F_GATES_ONLY', 'F_DEPLOY_REHEARSAL')
VERDICT = 'BANKED_INFRA_SPOTCHECK'


def common(session, generation):
    return dict(droplet_id=session.host_id, dataset_id=arm_t.DATASET, canonical_generation=generation,
        validation=VERDICT, banked_archive_sha256=banked.ARCHIVE_SHA256,
        full_parity_rerun=False, P_baseline_remeasured=False)


def check_values(session, scope, ids, recipes, generation, previous):
    comparisons = []
    for recipe in recipes:
        old = next(row for row in previous['comparisons'] if row['counter'] == recipe.name)
        rows, _ = session.rows('infra_spot_' + recipe.name,
            batch.read_counts(batching.FINAL, scope, ids, [recipe.name], generation))
        values = {row['doc_id']: int(row['value']) for row in rows}
        if len(values) != len(rows) or any(values.get(doc, 0) != old['canonical'].get(doc, 0) for doc in ids):
            raise ValueError('banked infrastructure spot mismatch: ' + recipe.name)
        comparisons.append(dict(counter=recipe.name, targets=ids, status='BANKED_SPOT_PASS'))
    return comparisons


def build(root):
    root = Path(root)
    files = banked.load(root)
    session = Session(root)
    if session.operation.get('scope') not in SCOPES:
        raise ValueError('explicit scoped infrastructure admission required')
    session.verify_envelope()
    profile = json.loads((root / 'profile/inventory.json').read_bytes())
    session.query('infra_settle_documents', 'OPTIMIZE TABLE documents FINAL', setup_seconds=900)
    session.query('infra_settle_links', 'OPTIMIZE TABLE doc_groups FINAL', setup_seconds=900)
    generation, _ = counts.generation(session)
    fixture = profile.get('fixture_scope') is True
    old = files['counts-batch-p2/result.json']
    ids = sorted({row['doc_id'] for row in profile['reference_page'][:2]})
    if not fixture:
        if (profile['reader'] != files['profile/inventory.json']['reader']
                or profile['actual_readable_by_kind'] != files['profile/inventory.json']['actual_readable_by_kind']):
            raise ValueError('fresh frozen infrastructure scope differs from banked comparator')
        ids += [row['ref_value'] for row in old['stratified_targets']['high_engagement'][:1]]
        ids = sorted(set(ids))
        if not set(ids) <= set(old['stratified_targets']['all_ids']):
            raise ValueError('spot targets absent from original checked stratum')
    output = root / 'counts-batch-p2'
    output.mkdir(mode=0o700)
    result = dict(**common(session, generation), kind='F_SCOPED_COUNT_INFRASTRUCTURE', outcome='BUILDING',
        T1='NOT_REPEATED', final_table=batching.FINAL, scopes=[], build_queries=[], stratified_targets={'all_ids': ids})
    save(output / 'result.json', result)
    session.query('infra_count_parts', batch.partial_ddl(batching.PARTS))
    session.query('infra_count_final', batch.count_ddl(batching.FINAL))
    for label in ('main', 'reactions', 'comments'):
        readable = profile['actual_readable_by_kind'][label]
        recipes = [recipe for recipe in counts.RECIPES if recipe.service in readable]
        mapping = {recipe.service: readable[recipe.service] for recipe in recipes}
        scope = typed.scope_key(profile['reader'], mapping, generation, recipes)
        boundaries = {service: counts.canonical_boundary(service, groups, profile['reader']) for service, groups in mapping.items()}
        info = batching.build_scope(session, output, result, label, scope, boundaries, recipes, 8)
        if fixture:
            checks = batching.compare(session, scope, ids, recipes, generation, mapping, profile['reader'])
        else:
            previous = next(row for row in old['scopes'] if row['label'] == label)
            checks = check_values(session, scope, ids, recipes, generation, previous)
        info.update(complete=True, groups_by_service=mapping, spot_checks=checks)
        save(output / 'result.json', result)
    result.update(outcome='INFRASTRUCTURE_BUILT_SPOTS_PASS', T1=VERDICT)
    save(output / 'result.json', result)
    build_metadata(root, session, profile, generation)
    build_presence(root, session, profile, generation, files, ids, fixture)
    if counts.generation(session)[0] != generation:
        raise ValueError('canonical generation changed during infrastructure setup')
    return dict(verified=True, validation=VERDICT, targets=ids, canonical_generation=generation)


def build_metadata(root, session, profile, generation):
    output = root / 'metadata'
    output.mkdir(mode=0o700)
    result = dict(**common(session, generation), kind='F_SCOPED_METADATA_INFRASTRUCTURE', outcome='BUILDING',
        count_table=batching.FINAL, count_receipt_sha256=hashlib.sha256((root / 'counts-batch-p2/result.json').read_bytes()).hexdigest(),
        steps=[], view_acceptance_eligible=False)
    queries = {'transpose_ddl': arm_t.DDL + ' SETTINGS index_granularity=64',
        'strings_ddl': metadata.STRINGS_DDL, 'timestamps_ddl': metadata.TIMESTAMPS_DDL,
        'transpose': metadata.TRANSPOSE_BUILD, **metadata.identity_builds(discover='api.localhost/groups/web10/discover')}
    for label, sql in queries.items():
        (output / (label + '.sql')).write_text(sql + '\n')
        _, query_id = session.query('infra_' + label, sql, setup_seconds=900)
        result['steps'].append(dict(label=label, native=session.native(query_id)))
        save(output / 'result.json', result)
    checks = []
    for row in profile['reference_page'][:3]:
        # Canonical full-key point read, not source-wide multiset parity.
        q = typed.literal
        docs, _ = session.rows('infra_identity_canonical', 'SELECT author_key,doc_id,collection_name FROM documents FINAL WHERE '
            'author_key=' + q(row['author_key']) + ' AND doc_id=' + q(row['doc_id']) + ' AND deleted=0 LIMIT 2')
        actual, _ = session.rows('infra_identity_stored', 'SELECT author_key,doc_id FROM strings WHERE owner_key='
            + q(row['doc_id']) + " AND field_name='document:posts' AND author_key=" + q(row['author_key'])
            + ' ORDER BY author_key,doc_id LIMIT 3')
        wanted = [{'author_key': item['author_key'], 'doc_id': item['doc_id']} for item in docs if item['collection_name'] == 'posts']
        if not wanted or actual != wanted:
            raise ValueError('bounded full-key identity spot mismatch')
        checks.append(dict(author_key=row['author_key'], doc_id=row['doc_id'], status='SPOT_PASS'))
        condition = 'author_key=' + q(row['author_key']) + ' AND doc_id=' + q(row['doc_id'])
        expected, _ = session.rows('infra_transpose_canonical', 'SELECT g.group_id,d.author_key,d.doc_id,d.created_at,'
            'g.created_at AS link_created_at,g.updated_at,g.deleted,d.collection_name,d.tags,d.ref_value,'
            "JSONExtractString(d.body,'post_id') AS comment_post_id,JSONExtractString(d.body,'repost_of') AS repost_of "
            'FROM (SELECT * FROM documents FINAL WHERE ' + condition + ' AND deleted=0) d INNER JOIN '
            '(SELECT * FROM doc_groups FINAL WHERE doc_id=' + q(row['doc_id']) + ' AND deleted=0) g ON d.doc_id=g.doc_id '
            'ORDER BY g.group_id LIMIT 65')
        stored, _ = session.rows('infra_transpose_stored', 'SELECT group_id,author_key,doc_id,created_at,link_created_at,'
            'updated_at,deleted,collection_name,tags,ref_value,comment_post_id,repost_of FROM doc_groups_t WHERE '
            + condition + ' ORDER BY group_id LIMIT 65')
        if len(expected) >= 65 or stored != expected:
            raise ValueError('bounded canonical transpose spot mismatch')
        expected_time, _ = session.rows('infra_time_canonical', 'SELECT created_at AS value,author_key,doc_id,updated_at AS version '
            'FROM documents FINAL WHERE ' + condition + ' AND deleted=0 ORDER BY value,doc_id LIMIT 3')
        stored_time, _ = session.rows('infra_time_stored', 'SELECT value,author_key,doc_id,version FROM timestamps '
            "WHERE field_name='posts' AND " + condition + ' ORDER BY value,doc_id LIMIT 3')
        if stored_time != expected_time:
            raise ValueError('bounded canonical timestamp spot mismatch')
    result.update(outcome='INFRASTRUCTURE_BUILT_SPOTS_PASS', completed_utc=datetime.now(UTC).isoformat())
    save(output / 'result.json', result)
    directory = root / 'metadata-parity'
    directory.mkdir(mode=0o700)
    save(directory / 'result.json', dict(**common(session, generation), outcome='BOUNDED_SPOT_PASS',
        metadata_sha256=hashlib.sha256((output / 'result.json').read_bytes()).hexdigest(), checks=checks))


def build_presence(root, session, profile, generation, files, ids, fixture):
    output = root / 'presence'
    output.mkdir(mode=0o700)
    result = dict(**common(session, generation), outcome='BUILDING', T1='NOT_REPEATED', scopes=[], build_queries=[])
    recipe = typed.Counter('reactions:present', 'reactions')
    mapping = {'reactions': profile['actual_readable_by_kind']['reactions']['reactions']}
    scope = typed.scope_key(profile['reader'], mapping, generation, [recipe])
    info = batching.build_scope(session, output, result, 'reaction_presence', scope,
        {'reactions': counts.canonical_boundary('reactions', mapping['reactions'], profile['reader'])}, [recipe], 8)
    if fixture:
        checks = batching.compare(session, scope, ids, [recipe], generation, mapping, profile['reader'])
    else:
        previous = next(row for row in files['presence/result.json']['scopes'] if row['label'] == 'reaction_presence')
        checks = check_values(session, scope, ids, [recipe], generation, previous)
    info.update(complete=True, groups_by_service=mapping, spot_checks=checks)
    result.update(outcome='INFRASTRUCTURE_BUILT_SPOTS_PASS', T1=VERDICT, serving_scope_key=scope)
    save(output / 'result.json', result)


def serving_valid(operation, *receipts):
    return (operation.get('scope') in SCOPES and operation.get('banked_P_sha256') == banked.ARCHIVE_SHA256
        and all(item.get('validation') == VERDICT and item.get('banked_archive_sha256') == banked.ARCHIVE_SHA256
                and item.get('full_parity_rerun') is False for item in receipts)
        and receipts[0].get('outcome') == 'INFRASTRUCTURE_BUILT_SPOTS_PASS'
        and receipts[1].get('outcome') == 'INFRASTRUCTURE_BUILT_SPOTS_PASS'
        and receipts[2].get('outcome') == 'BOUNDED_SPOT_PASS'
        and receipts[3].get('outcome') == 'INFRASTRUCTURE_BUILT_SPOTS_PASS')
