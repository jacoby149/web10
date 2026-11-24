"""Native setup actions for the one admitted composition; never run on import."""
import hashlib
import json
from pathlib import Path
import uuid

from arm_f_native import save
from arm_satellite_sql import literal as q
from costfn_seed_resume import setup_writes
import engagement_billboards as ads
import engagement_pairs as pairs
import engagement_pin_index as pin_index
import engagement_ref as migration

COLUMNS = 'doc_id,author_key,collection_name,body,ref_value,tags,created_at,updated_at,deleted,ad_mode,ad_target,posted_by'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def parts(session, table):
    rows, query_id = session.rows('composition_parts_' + table,
        "SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts "
        "WHERE database='web10' AND active AND table=" + q(table) + ' ORDER BY name')
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest(), query_id


def migrate(session, root):
    # Cite the unchanged banked semantics constructor, but do NOT inherit its
    # obsolete projection furniture. No source projection is ever installed.
    checks, statements = migration.migration()
    session = setup_writes(session, root / 'task-setup/migration', 'documents')
    receipts = {}
    for name, sql in checks.items():
        rows, query_id = session.rows('composition_migration_' + name, sql)
        receipts[name] = dict(query_id=query_id, n=int(rows[0]['n']))
        save(root / 'composition-migration-checks.json', receipts)
        if int(rows[0]['n']):
            raise ValueError('banked migration prerequisite failed: ' + name)
    for index, sql in enumerate(statements):
        if 'PROJECTION' in sql or 'deduplicate_merge_projection_mode' in sql:
            continue
        session.query('composition_migrate_' + str(index), sql)
    counts, query_id = session.rows('composition_copy_count', 'SELECT (SELECT count() FROM documents) AS source,'
        '(SELECT count() FROM engagement_documents) AS copy')
    if int(counts[0]['source']) != int(counts[0]['copy']):
        raise ValueError('migrated copy cardinality changed')
    return dict(checks=receipts, counts=counts, query_id=query_id, inverse_proof='BANKED_9_CHECKS_32_BATCHES_NOT_REPEATED',
        projection_installed=False, constructor_sha256=digest(Path(migration.__file__)))


def fixtures(session, root, expected, *, node_ratio, seed):
    posts = {}
    groups = {}
    for reference in expected.values():
        for row in reference['rows']:
            identity = ads.key(row)
            posts[identity] = row
            groups.setdefault(identity, set()).add(row['group_id'])
    def creative(owner, label, node=False):
        return dict(author_key=owner, doc_id=str(uuid.uuid5(uuid.NAMESPACE_URL, 'billboard-creative:' + owner + ':' + label)),
            posted_by=owner, body=dict(text='Synthetic static billboard ' + label, status='active'),
            tags=['ad', 'node_ad'] if node else ['ad'])
    authors = {owner: [creative(owner, 'author-' + str(i)) for i in range(2)] for owner, _ in posts}
    nodes = [creative('billboard-node-fixture', 'node-' + str(i), True) for i in range(300)]
    subset = sorted(posts)[::4]
    plan = ads.plan(list(posts.values()), authors, nodes, author_posts=subset, node_ratio=node_ratio, seed=seed)
    directory = root / 'billboards'
    session = setup_writes(session, root / 'task-setup/billboards', 'documents')
    from engagement_window import task
    directory.mkdir(mode=0o700, exist_ok=task(getattr(session, 'operation', {})))
    save(directory / 'setup.json', plan)
    # No API write path, reader targeting or live selection is introduced.
    # Canonical synthetic creatives and pins are setup data on the copied lake.
    documents = [dict(value, collection_name='posts', ref_value='') for collection in [nodes, *authors.values()] for value in collection]
    documents += plan['pins']
    clock = "parseDateTime64BestEffort('2026-11-19T00:00:00Z',3,'UTC')"
    values = []
    links = set()
    all_groups = set().union(*groups.values())
    for doc in documents:
        row = [q(doc['doc_id']), q(doc['author_key']), q(doc['collection_name']), q(json.dumps(doc['body'], sort_keys=True)),
            q(doc['ref_value']), '[' + ','.join(q(v) for v in doc.get('tags', [])) + ']', clock, clock,
            '0', "'none'", "''", q(doc.get('posted_by', doc['author_key']))]
        values.append('(' + ','.join(row) + ')')
        # Pin visibility is inherited exclusively from the canonical root; pins
        # do not gain an independent read grant through these bookkeeping links.
        selected = groups[doc['author_key'], doc['ref_value']] if doc['collection_name'] == 'placements' else all_groups
        links.update((doc['doc_id'], group) for group in selected)
    _, docs_id = session.query('billboard_fixture_documents', 'INSERT INTO engagement_documents (' + COLUMNS + ') VALUES ' + ','.join(values))
    _, links_id = session.query('billboard_fixture_links', 'INSERT INTO doc_groups (doc_id,group_id,created_at,updated_at,deleted) VALUES '
        + ','.join('(' + q(doc) + ',' + q(group) + ',' + clock + ',' + clock + ',0)' for doc, group in sorted(links)))
    for name, reference in expected.items():
        reference['billboard_setup'] = plan
        reference['rows'] = ads.expected_rows(reference['rows'], plan)
        reference['eligible_ads'] = nodes
        save(root / ('reference-' + name) / 'expected-billboards.json', reference)
    receipt = dict(setup_sha256=digest(directory / 'setup.json'), rows=len(documents), links=len(links),
        query_ids=[docs_id, links_id], setup_only=True, node_ratio=plan['node_ratio'], static_node_creatives=len(nodes))
    save(directory / 'build.json', receipt)
    return receipt


def build_pairs(session, root):
    session = setup_writes(session, root / 'task-setup/pairs', 'engagement_documents', 'tally_verify_documents')
    for table in ('engagement_documents', 'tally_verify_documents'):
        rows, query_id = session.rows('pairs_validate_' + table, pairs.validate_source(table))
        save(root / ('pairs-source-validation-' + table + '.json'), dict(query_id=query_id, rows=rows))
        if int(rows[0]['invalid']):
            raise ValueError('declared refs must have exact string/array types; never silently omit malformed targets')
    statements = [pairs.DDL, pairs.build(), pairs.DDL.replace(pairs.TABLE, 'pairs_refs_fat'),
        pairs.build('tally_verify_documents', 'pairs_refs_fat')]
    receipts = []
    for index, sql in enumerate(statements):
        _, query_id = session.query('pairs_build_' + str(index), sql)
        receipts.append(dict(query_id=query_id, native=session.native(query_id)))
        save(root / 'pairs-build.json', receipts)
    for table in (pairs.TABLE, 'pairs_refs_fat'):
        session.query('pairs_freeze_' + table, 'SYSTEM STOP MERGES ' + table)
    census, query_id = session.rows('pairs_build_census', 'SELECT count() AS n FROM ' + pairs.TABLE)
    return dict(statements=receipts, rows=int(census[0]['n']), census_query_id=query_id)


def build_pin_index(session, root):
    session = setup_writes(session, root / 'task-setup/pins', 'engagement_documents')
    receipt = dict(parity='INCOMPLETE', statements=[])
    path = root / 'billboards/pin-index-build.json'
    for label, sql in (('ddl', pin_index.DDL), ('insert', f'INSERT INTO {pin_index.TABLE} ' + pin_index.source()),
            ('freeze', f'SYSTEM STOP MERGES {pin_index.TABLE}')):
        _, query_id = session.query('pin_index_' + label, sql)
        receipt['statements'].append(dict(stage=label, query_id=query_id, native=session.native(query_id)))
        save(path, receipt)
    rows, query_id = session.rows('pin_index_exact_census', pin_index.census())
    receipt.update(census_query_id=query_id, mismatches=int(rows[0]['mismatches']), census_native=session.native(query_id))
    save(path, receipt)
    if receipt['mismatches']:
        raise ValueError('billboard pin index differs from complete canonical placement history')
    rows, query_id = session.rows('pin_index_size', f'SELECT count() AS n FROM {pin_index.TABLE}')
    receipt.update(parity='PASS', rows=int(rows[0]['n']), size_query_id=query_id)
    save(path, receipt)
    return receipt
