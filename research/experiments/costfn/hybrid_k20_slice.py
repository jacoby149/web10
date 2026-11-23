"""Construct a history-closed K20 slice on the owned restored research store."""
import hashlib
import json
from pathlib import Path

from arm_satellite_sql import literal as q


DATASET = '2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd'
DIRECTIVE = 'RD4-HYBRID-K20-NATIVE baseline reproduction only'
TABLES = ('documents', 'doc_groups', 'content_events')
KEYS = 'hybrid_k20_slice_keys'
NEXT_KEYS = 'hybrid_k20_slice_next_keys'
BUCKETS = 8


def scope(profiles):
    if set(profiles) != {'ordinary', 'fixture'}:
        raise ValueError('original composition profiles required')
    groups, readers = set(), set()
    for profile in profiles.values():
        if profile['dataset_id'] != DATASET or not profile['reader'] or not profile['groups']:
            raise ValueError('frozen dataset and nonempty authenticated profile required')
        readers.add(profile['reader'])
        groups.update(profile['groups'])
        readable = profile['actual_readable_by_kind']
        if set(readable) != {'main', 'reactions', 'comments'}:
            raise ValueError('all original compiler scopes required')
        for by_service in readable.values():
            for service_groups in by_service.values():
                groups.update(service_groups)
    # Keep full group histories for the selected documents, including Discover
    # links. The separate views request does not seed every Discover document.
    return sorted(groups), sorted(readers)


def literals(values):
    return ','.join(q(value) for value in values)


def seed_sql(groups, readers):
    return (f'INSERT INTO {KEYS} SELECT DISTINCT doc_id FROM ('
        f'SELECT doc_id FROM doc_groups WHERE group_id IN ({literals(groups)}) UNION ALL '
        f'SELECT doc_id FROM documents WHERE author_key IN ({literals(readers)}) '
        "OR collection_name='profile' OR has(tags,'node_ad')) WHERE doc_id!=''")


def expand_sql():
    # Both directions matter: a comment can be reached by its historical root,
    # and a retained reply must bring a legacy parent even if the parent moved.
    # Keep doc_id at this boundary because attachments and events use bare IDs;
    # the physical document copy retains every author and version for those IDs.
    edges = ('arrayJoin([ref_value,JSONExtractString(body,\'post_id\'),'
        'JSONExtractString(body,\'parent_id\'),JSONExtractString(body,\'target_id\'),'
        'JSONExtractString(body,\'repost_of\'),JSONExtractString(body,\'ad_id\')])')
    return (f'INSERT INTO {NEXT_KEYS} SELECT DISTINCT doc_id FROM ('
        f'SELECT doc_id FROM {KEYS} UNION ALL '
        'SELECT doc_id FROM (SELECT doc_id,' + edges + ' AS related FROM documents '
        "WHERE collection_name IN ('posts','reactions','comments','placements')) "
        f'WHERE related IN (SELECT doc_id FROM {KEYS}) UNION ALL '
        'SELECT related AS doc_id FROM (SELECT ' + edges + ' AS related FROM documents '
        "WHERE collection_name IN ('posts','reactions','comments','placements') "
        f'AND doc_id IN (SELECT doc_id FROM {KEYS}))) WHERE doc_id!=\'\'')


def copy_sql(table, columns, bucket):
    if table not in TABLES or type(bucket) is not int or not 0 <= bucket < BUCKETS:
        raise ValueError('owned slice table and bucket required')
    names = ','.join('`' + name.replace('`', '``') + '`' for name in columns)
    return (f'INSERT INTO hybrid_k20_slice_{table} ({names}) SELECT {names} FROM {table} '
        f'WHERE doc_id IN (SELECT doc_id FROM {KEYS}) AND cityHash64(doc_id)%{BUCKETS}={bucket}')


def oracle_matches(before, after):
    for field in ('rows', 'lower_rows', 'ids', 'views_readable_groups'):
        if json.dumps(before[field], sort_keys=True) != json.dumps(after[field], sort_keys=True):
            raise ValueError('slice canonical oracle differs: ' + field)
    for field in ('followups', 'eligible_ads'):
        if field == 'followups':
            left = [sorted(json.dumps(row, sort_keys=True) for row in rows) for rows in before[field]]
            right = [sorted(json.dumps(row, sort_keys=True) for row in rows) for rows in after[field]]
        else:
            left = sorted(json.dumps(row, sort_keys=True) for row in before[field])
            right = sorted(json.dumps(row, sort_keys=True) for row in after[field])
        if left != right:
            raise ValueError('slice canonical oracle differs: ' + field)


def build(session, root, profiles, *, writers_stopped):
    """Replace only the three owned physical lanes, retaining originals for custody."""
    if (writers_stopped is not True or session.operation.get('hybrid_k20_directive') != DIRECTIVE
            or session.operation.get('restored_snapshot_id') != '255003176'):
        raise ValueError('explicit baseline-only snapshot binding and stopped API required')
    from arm_f_native import save
    from engagement_event_seed import native

    root = Path(root)
    path = root / 'hybrid-k20-slice.json'
    if path.exists():
        raise FileExistsError(path)
    groups, readers = scope(profiles)
    manifest = dict(status='BUILDING', dataset_id=DATASET, host=session.host_id,
        groups=groups, readers=readers, buckets=BUCKETS, statements=[], tables={},
        source_commit=session.operation['hybrid_k20_source_commit'],
        policy_tables='untouched', selection='authenticated scopes and dependency closure, not page winners')

    def execute(label, sql, *, rows=False):
        entry = dict(label=label, sql_sha256=hashlib.sha256(sql.encode()).hexdigest(), status='STARTED')
        manifest['statements'].append(entry)
        save(path, manifest)
        action = session.rows if rows else session.query
        value, query_id = action('hybrid_k20_' + label, sql)
        receipt = native(session, query_id)
        entry.update(query_id=query_id, native=receipt)
        if receipt.get('type') != 'QueryFinish' or int(receipt['exception_code']):
            raise ValueError('slice setup statement lacks successful native receipt')
        entry['status'] = 'PASS'
        save(path, manifest)
        return value

    def count(table, label):
        return int(execute(label, f'SELECT count() AS n FROM {table}', rows=True)[0]['n'])

    try:
        for table in TABLES:
            execute('freeze_source_' + table, f'SYSTEM STOP MERGES {table}')
        for key_table in (KEYS, NEXT_KEYS):
            execute('create_' + key_table, f'CREATE TABLE {key_table} (doc_id String) ENGINE=MergeTree ORDER BY doc_id')
        execute('seed', seed_sql(groups, readers))
        counts = [count(KEYS, 'seed_count')]
        manifest['closure_counts'] = counts
        if not counts[0]:
            raise ValueError('empty authenticated scope slice')
        while True:
            execute('expand', expand_sql())
            current = count(NEXT_KEYS, 'closure_count')
            if current < counts[-1]:
                raise ValueError('slice dependency closure is not monotonic')
            if current == counts[-1]:
                break
            counts.append(current)
            execute('exchange_keys', f'EXCHANGE TABLES {KEYS} AND {NEXT_KEYS}')
            execute('reset_next_keys', f'TRUNCATE TABLE {NEXT_KEYS}')

        for table in TABLES:
            shadow = 'hybrid_k20_slice_' + table
            columns = execute('columns_' + table, 'SELECT name FROM system.columns WHERE database=currentDatabase() '
                'AND table=' + q(table) + " AND default_kind NOT IN ('ALIAS','MATERIALIZED','EPHEMERAL') ORDER BY position", rows=True)
            columns = [row['name'] for row in columns]
            if 'doc_id' not in columns:
                raise ValueError('slice source key column absent')
            execute('clone_' + table, f'CREATE TABLE {shadow} AS {table}')
            execute('freeze_' + table, f'SYSTEM STOP MERGES {shadow}')
            for bucket in range(BUCKETS):
                execute(f'copy_{table}_{bucket}', copy_sql(table, columns, bucket))
            names = ','.join('`' + name.replace('`', '``') + '`' for name in columns)
            census = f'SELECT count() AS n,sumWithOverflow(cityHash64(tuple({names}))) AS digest FROM '
            expected = execute('source_census_' + table, census + table + f' WHERE doc_id IN (SELECT doc_id FROM {KEYS})', rows=True)
            actual = execute('slice_census_' + table, census + shadow, rows=True)
            parts = execute('parts_' + table, 'SELECT name,rows,marks FROM system.parts WHERE active '
                'AND database=currentDatabase() AND table=' + q(shadow) + ' ORDER BY name', rows=True)
            if (expected != actual or not int(actual[0]['n']) or sum(int(part['rows']) for part in parts) != int(actual[0]['n'])
                    or len(parts) < 2 or sum(int(part['marks']) for part in parts) < 2):
                raise ValueError('slice must retain source rows and span multiple physical parts: ' + table)
            if table == 'documents' and max(int(part['marks']) for part in parts) < 3:
                raise ValueError('document slice has no part with multiple data granules')
            if int(actual[0]['n']) >= count(table, 'unsliced_count_' + table):
                raise ValueError('slice failed to reduce the source lane: ' + table)
            manifest['tables'][table] = dict(columns=columns, census=actual[0], parts=parts,
                retained_original=shadow)
            save(path, manifest)

        # API stays stopped until all three exchanges finish. Any partial switch
        # aborts the run; the old tables remain intact under the shadow names.
        for table in TABLES:
            execute('activate_' + table, f'EXCHANGE TABLES {table} AND hybrid_k20_slice_{table}')
        manifest['status'] = 'COPIED_PENDING_ORACLE'
        return manifest
    except BaseException:
        manifest['status'] = 'STOP'
        raise
    finally:
        save(path, manifest)


def prepare(actions):
    """Use the original authenticated profiles and independent oracle twice."""
    from arm_f_native import save
    import arm_f_reads as reads
    import engagement_cells as cells
    import engagement_modern as modern

    root = Path(actions.root)
    if actions.approval.get('hybrid_k20_directive') != DIRECTIVE:
        raise ValueError('baseline-only hybrid scope required')
    path = root / 'hybrid-k20-slice.json'
    if path.exists():
        raise FileExistsError(path)
    actions.read_setup()
    profiles = {name: json.loads((root / f'profile-{name}.json').read_bytes()) for name in ('ordinary', 'fixture')}
    cells.stop(root)
    manifest = build(modern.Session(root), root, profiles, writers_stopped=True)
    manifest['oracle'] = {}
    try:
        for name, profile in profiles.items():
            after = reads.reference(root, profile=profile, name=f'slice-reference-{name}')
            oracle_matches(actions.expected[name], after)
            manifest['oracle'][name] = dict(parity='PASS', kept_original_expected=True,
                source_response_sha256=hashlib.sha256((root / f'reference-{name}/expected.json').read_bytes()).hexdigest(),
                slice_response_sha256=hashlib.sha256((root / f'slice-reference-{name}/expected.json').read_bytes()).hexdigest())
        manifest['status'] = 'SOURCE_ORACLE_PARITY'
        return manifest
    except BaseException:
        manifest['status'] = 'STOP'
        raise
    finally:
        save(path, manifest)
