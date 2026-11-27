"""Native indexed-scope preparation, with every reader tied to its oracle."""

import hashlib
import json

from arm_f_native import save
from arm_satellite_batch import final_sql
from arm_satellite_counts import generation
from arm_satellite_sql import literal as q
from costfn_task import ParityDivergence, digest, read
import dau_sustain_workload as wl
import engagement_composition as composition
import engagement_composition_setup as composition_setup
import engagement_pairs as pairs
from engagement_ref import bounded_boundary, targets
import engagement_tally_build as tally
import engagement_tally_sql as sql
from dau_sustain_native_audit import native_finish


ROUTES = {'main': ('posts', 'comments', 'reactions'), 'reactions': ('reactions',), 'comments': ('comments',)}


def tally_parts(session):
    parts, query = session.rows('dau_tally_current_parts', "SELECT name,toString(rows) AS rows,"
        "toString(data_version) AS data_version FROM system.parts WHERE database='web10' AND table='"
        + sql.TABLE + "' AND active ORDER BY name")
    if not parts:
        raise ValueError('indexed reader scope table has no active parts')
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest(), query


def expected_scopes(profile):
    by_kind = profile['actual_readable_by_kind']
    for label, services in ROUTES.items():
        for service in services:
            yield label, service, by_kind[label][service]


def checked_route(proof, reader, label, readable, ids):
    """Select exact frozen tally keys only after the caller's live query gate."""
    entry = proof['routes'].get(reader)
    if not entry or label not in ROUTES:
        raise ValueError('unbuilt indexed reader route')
    expected = entry['readable_by_kind'][label]
    if {service: sorted(groups) for service, groups in expected.items()} != {
            service: sorted(groups) for service, groups in readable.items()}:
        raise ValueError('live reader scope does not match indexed certificate')
    handles = entry['routes'][label]
    if set(handles) != set(ROUTES[label]):
        raise ValueError('certified indexed route omitted a service')
    result = {}
    for service, record in handles.items():
        actual_key = sql.scope(reader, service, expected[service],
            proof['binding']['canonical_generation'], proof['binding']['copy_hash'])
        if (actual_key != record['key'] or sorted(record['groups']) != sorted(expected[service])
                or not ids or not set(ids) <= set(record['verified_ids'])):
            raise ValueError('indexed route keys or complete-page coverage differ from certificate')
        result[service] = actual_key
    return result


def exact_page_insert(reader, service, groups, key, ids):
    """Bound only candidate identities and emitted counters, not policy/history."""
    requested = targets(ids)
    fine = {'comments': 'parent_id', 'reactions': 'target_id'}.get(service)
    predicate = 'ref_value IN (' + requested + ')'
    if fine:
        predicate += ' OR JSONExtractString(body,' + q(fine) + ') IN (' + requested + ')'
    original = sql.boundary(service, groups, reader, table='documents')
    historical_keys = pairs.seek(ids)  # Both root and fine edges; over-selection is safe.
    bounded = bounded_boundary(original, historical_keys, predicate, table='engagement_documents')
    return sql.insert(bounded, service, key, 0, 1) + ' HAVING doc_id IN (' + requested + ')'


def build_page_scope(writer, record, reader, service, groups, source_generation, copy_hash, ids):
    key = sql.scope(reader, service, groups, source_generation, copy_hash)
    prior = record['scopes'].get(key)
    if prior:
        if prior.get('verified_ids') not in (None, ids):
            raise ValueError('cannot reuse a page tally for another target set')
        return key
    query = exact_page_insert(reader, service, groups, key, ids)
    _, partial = writer.query('dau_page_tally_' + key[:16], query)
    _, final = writer.query('dau_page_tally_finalize_' + key[:16], final_sql(key, sql.PARTS, sql.TABLE))
    record['scopes'][key] = dict(verified_ids=ids, partial=native_finish(writer, partial),
        consolidation=native_finish(writer, final))
    return key


def prepare(root, session, oracle_index):
    """Extend the already-certified tally table on the quiescent working copy."""
    source = root / 'dau-reader-oracles'
    entries = oracle_index['readers']
    if len(entries) != wl.READERS or len({entry['reader'] for entry in entries}) != wl.READERS:
        raise ValueError('every distinct frozen reader needs an independent oracle')
    banked = read(root / 'tallies/build.json')
    copy_hash = read(root / 'copy-proof.json')['parts_sha256']
    source_generation, _ = generation(session)
    if (not banked['verified'] or banked['copy_parts_sha256'] != copy_hash
            or banked['canonical_generation'] != source_generation):
        raise ValueError('reader preparation requires certified current indexed furniture')
    composed = read(root / 'composition-proof.json')
    composition.gate('refs', composed['gates']['refs'])
    if (composed['copy_parts_sha256'] != copy_hash
            or composed['immutable_parts'][pairs.TABLE] != composition_setup.parts(session, pairs.TABLE)[0]):
        raise ValueError('bounded tally candidates require the certified immutable full-history pairs index')
    directory = root / 'dau-scopes'
    directory.mkdir(mode=0o700, exist_ok=True)
    index_file = source / 'oracle-index.json'
    packet_binding = dict(oracle_index_sha256=digest(index_file), canonical_generation=source_generation,
        copy_hash=copy_hash)
    proof = directory / 'proof.json'
    if proof.exists():
        value = read(proof)
        if value['binding'] != packet_binding or value['parts_sha256'] != tally_parts(session)[0]:
            raise ValueError('retained reader certificate no longer matches its index and physical parts')
        return value
    from costfn_seed_resume import setup_writes
    writer = setup_writes(session, root / 'task-setup/dau-scopes', 'engagement_documents', 'doc_groups')
    record = dict(scopes=dict(banked['scopes']))
    routes = {}
    for entry in entries:
        path = source / f"reader-{entry['index']:03d}" / 'oracle.json'
        if digest(path) != entry['sha256']:
            raise ValueError('reader oracle packet hash mismatch')
        packet = read(path)
        profile = packet['profile']
        reader = entry['reader']
        if (profile['reader'], profile['index']) != (reader, entry['index']):
            raise ValueError('reader preparation cannot reuse a different reader oracle')
        ids = sorted(set(packet['ids']) | {row['doc_id'] for row in packet['rows']})
        if not ids:
            raise ValueError('non-empty frozen Following page required')
        route = routes[reader] = dict(index=profile['index'], groups=profile['groups'],
            readable_by_kind=profile['actual_readable_by_kind'], routes={})
        for label, service, groups in expected_scopes(profile):
            key = build_page_scope(writer, record, reader, service, groups, source_generation, copy_hash, ids)
            found, native_id = session.rows('dau_independent_' + key[:12], sql.oracle(service, groups, reader, ids))
            expected = {(row['doc_id'], row['counter_name']): int(row['value']) for row in found}
            observed, stored_id = tally.stored(session, key, ids)
            if len(found) != len(expected) or observed != expected:
                raise ParityDivergence('indexed scope differs from independent canonical tally')
            item = dict(key=key, groups=groups, verified_ids=ids, native=native_finish(session, native_id),
                stored_native=native_finish(session, stored_id))
            route['routes'].setdefault(label, {})[service] = item
    writer.query('dau_tally_settle', 'OPTIMIZE TABLE ' + sql.TABLE + ' FINAL')
    parts_hash, query_id = tally_parts(session)
    if generation(session)[0] != source_generation:
        raise ValueError('canonical source changed while building reader furniture')
    value = dict(binding=packet_binding, routes=routes, parts_sha256=parts_hash, parts_native=native_finish(session, query_id))
    save(proof, value)
    return value
