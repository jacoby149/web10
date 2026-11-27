"""Byte-verified transfer of the retained paired fixture, never fixture creation."""

from pathlib import Path
from uuid import uuid4

from arm_f_native import save
from arm_satellite_sql import literal as q
from costfn_seed_resume import setup_writes
from costfn_task import digest, read
from dau_sustain_native_audit import native_finish
from engagement_restore import FIXTURE_SHA, RESTORE_SHA, SNAPSHOT
import restore_realism as restore


SCHEMAS = {
    'documents': (('author_key', 'doc_id'), ('doc_id', 'author_key', 'collection_name', 'body', 'ref_value',
        'tags', 'created_at', 'updated_at', 'deleted', 'ad_mode', 'ad_target', 'posted_by')),
    'doc_groups': (('doc_id', 'group_id'), ('doc_id', 'group_id', 'created_at', 'updated_at', 'deleted')),
    'group_contracts': (('group_id',), ('group_id', 'roles', 'join_policy', 'discoverable', 'tags',
        'membership_visibility', 'created_at', 'updated_at', 'deleted')),
    'group_members': (('group_id', 'member_key'), ('group_id', 'member_key', 'role', 'joined_at', 'updated_at', 'deleted')),
    'app_contracts': (('user_key', 'allowed_origin', 'client_id'), ('user_key', 'allowed_origin', 'permissions',
        'created_at', 'updated_at', 'deleted', 'client_id')),
}
FIXTURE_ORIGIN = 'https://fanout.research.invalid'


def source_queries(fixture):
    groups = fixture['groups']
    if len(groups) != 3 or len(set(groups)) != 3 or fixture['sizes'] != [3, 3, 2000]:
        raise ValueError('retained paired fixture route shape differs')
    scope = 'group_id IN (' + ','.join(map(q, groups)) + ')'
    authors = sorted(set(fixture['collision_authors']) | {fixture['writer']})
    return {
        'documents': 'doc_id IN (SELECT DISTINCT doc_id FROM doc_groups WHERE ' + scope + ')',
        'doc_groups': scope, 'group_contracts': scope, 'group_members': scope,
        'app_contracts': 'allowed_origin=' + q(FIXTURE_ORIGIN) + ' AND user_key IN (' + ','.join(map(q, authors)) + ')',
    }


def validate_directory(directory, input_sha):
    manifest = read(directory / 'manifest.json')
    if (manifest['snapshot_id'], manifest['source_restore_sha256'], manifest['fixture_sha256'],
            manifest['input_manifest_sha256']) != (SNAPSHOT, RESTORE_SHA, FIXTURE_SHA, input_sha):
        raise ValueError('paired fixture is not bound to the admitted snapshot and frozen input')
    fixture = directory / 'fixture.json'
    if fixture.is_symlink() or digest(fixture) != FIXTURE_SHA or set(manifest['files']) != set(SCHEMAS):
        raise ValueError('paired fixture metadata or table inventory differs')
    for table, entry in manifest['files'].items():
        path = directory / (table + '.parquet')
        if (path.is_symlink() or path.stat().st_size != entry['bytes'] or digest(path) != entry['sha256']
                or entry['rows'] < 1):
            raise ValueError('paired fixture Parquet bytes or count differ: ' + table)
    if any(manifest['files'][table]['rows'] != rows for table, rows in
            (('documents', 63), ('doc_groups', 93), ('group_contracts', 3))):
        raise ValueError('retained fixture differs from the declared snapshot delta')
    return manifest


def export(directory, session, snapshot_root, frozen_input):
    """Read only the original snapshot cell; return a portable strict manifest."""
    directory = Path(directory)
    input_sha = digest(frozen_input / 'manifest.json')
    if (directory / 'manifest.json').exists():
        return validate_directory(directory, input_sha)
    if digest(snapshot_root / 'restore.json') != RESTORE_SHA or digest(snapshot_root / 'fixture.json') != FIXTURE_SHA:
        raise ValueError('source is not the retained paired snapshot checkpoint')
    if directory.exists():
        directory.rename(directory.with_name(directory.name + '.incomplete-' + uuid4().hex))
    directory.mkdir(mode=0o755, parents=True)
    fixture_path = directory / 'fixture.json'
    fixture_path.write_bytes((snapshot_root / 'fixture.json').read_bytes())
    predicates = source_queries(read(fixture_path))
    files = {}
    for table, (keys, columns) in SCHEMAS.items():
        select = 'SELECT ' + ','.join(columns) + ' FROM ' + table + ' WHERE ' + predicates[table]
        counts, count_id = session.rows('dau_fixture_source_' + table, 'SELECT count() AS n FROM (' + select + ')')
        identity = 'fanout-f-' + uuid4().hex
        raw = restore.command(session.compose, session.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
            '--user', 'web10', '--password', 'web10', '--database', 'web10', '--query_id', identity,
            '--max_execution_time=600', '--query', select + ' ORDER BY ' + ','.join(keys) + ' FORMAT Parquet', timeout=620)
        if not raw.startswith(b'PAR1') or not raw.endswith(b'PAR1'):
            raise ValueError('retained fixture export is not complete Parquet')
        path = directory / (table + '.parquet')
        path.write_bytes(raw)
        path.chmod(0o444)
        files[table] = dict(bytes=len(raw), rows=int(counts[0]['n']), sha256=digest(path),
            export=native_finish(session, identity), count=native_finish(session, count_id))
    value = dict(snapshot_id=SNAPSHOT, source_restore_sha256=RESTORE_SHA, fixture_sha256=FIXTURE_SHA,
        input_manifest_sha256=input_sha, files=files)
    save(directory / 'manifest.json', value)
    return validate_directory(directory, input_sha)


def import_tables(root, session):
    """Append only absent fixture keys; compare all transferred columns both ways."""
    directory = root / 'retained-paired-fixture'
    manifest = validate_directory(directory, digest(root / 'input/manifest.json'))
    writer = setup_writes(session, root / 'task-setup/retained-paired-fixture', 'content_events')
    results = {}
    for table, (keys, columns) in SCHEMAS.items():
        column_list = ','.join(columns)
        key_list = ','.join(keys)
        file = f"file('retained-paired-fixture/{table}.parquet', Parquet)"
        source = f'SELECT {column_list} FROM {file}'
        target = f'SELECT {column_list} FROM {table} WHERE ({key_list}) IN (SELECT {key_list} FROM {file})'
        count, _ = session.rows('dau_fixture_import_count_' + table,
            f'SELECT (SELECT count() FROM ({source})) AS source,(SELECT count() FROM ({target})) AS target')
        n = manifest['files'][table]['rows']
        if int(count[0]['source']) != n:
            raise ValueError('native retained fixture row count differs: ' + table)
        if int(count[0]['target']) and not (writer.book.folder / ('dau_fixture_insert_' + table + '.json')).exists():
            raise ValueError('retained fixture keys overlap original restored data: ' + table)
        _, insert_id = writer.query('dau_fixture_insert_' + table, f'INSERT INTO {table} ({column_list}) ' + source)
        difference, compare_id = session.rows('dau_fixture_exact_rows_' + table,
            f'SELECT (SELECT count() FROM ({source} EXCEPT ALL {target})) AS missing, '
            f'(SELECT count() FROM ({target} EXCEPT ALL {source})) AS extra')
        if any(int(difference[0][key]) for key in ('missing', 'extra')):
            raise ValueError('retained fixture authority/content changed during import: ' + table)
        results[table] = dict(rows=n, insert=native_finish(session, insert_id), comparison=native_finish(session, compare_id))
    return dict(snapshot_id=SNAPSHOT, fixture_sha256=FIXTURE_SHA, fixture=read(directory / 'fixture.json'),
        transfer_manifest_sha256=digest(directory / 'manifest.json'), tables=results)
