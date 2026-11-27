"""Read-only population census for the amended sustained-DAU contract."""

from arm_f_native import save
from arm_satellite_sql import literal
from costfn_task import digest, read
from dau_sustain_workload import READERS


CRITERION = 'current-follower-membership-with-ordinary-post-v1'
REFUSED = 'PREFLIGHT_DIVERSE_READER_COUNT_REFUSED'


def census_sql(origin, provider):
    prefix = literal(provider + '/groups/users/')
    return f"""
WITH
    live_accounts AS (
        SELECT username FROM (
            SELECT username,argMax(deleted,(updated_at,deleted)) AS head_deleted
            FROM users GROUP BY username
        ) WHERE head_deleted=0
    ),
    authorized_accounts AS (
        SELECT user_key FROM (
            SELECT user_key,argMax(tuple(deleted,permissions),(updated_at,deleted)) AS head
            FROM app_contracts WHERE allowed_origin={literal(origin)} AND client_id=''
            GROUP BY user_key
        ) WHERE head.1=0 AND user_key IN (SELECT username FROM live_accounts)
            AND has(JSONExtract(head.2,'posts','Array(String)'), 'readAll')
            AND has(JSONExtract(head.2,'reactions','Array(String)'), 'readAll')
            AND has(JSONExtract(head.2,'comments','Array(String)'), 'readAll')
            AND has(JSONExtract(head.2,'profile','Array(String)'), 'readAll')
    ),
    following AS (
        SELECT member_key,group_id FROM (
            SELECT member_key,group_id,argMax(deleted,(updated_at,deleted)) AS head_deleted
            FROM group_members
            WHERE member_key IN (SELECT user_key FROM authorized_accounts)
                AND startsWith(group_id,{prefix}) AND endsWith(group_id,'/followers')
            GROUP BY member_key,group_id
        ) WHERE head_deleted=0
    ),
    candidate_links AS (
        SELECT doc_id,group_id FROM (
            SELECT doc_id,group_id,argMax(deleted,(updated_at,deleted)) AS head_deleted
            FROM doc_groups
            WHERE group_id IN (SELECT group_id FROM following)
            GROUP BY doc_id,group_id
        ) WHERE head_deleted=0
    ),
    active_post_groups AS (
        SELECT DISTINCT group_id FROM candidate_links WHERE doc_id IN (
            SELECT doc_id FROM (
                SELECT doc_id,author_key,
                    argMax(tuple(deleted,collection_name,tags),(updated_at,deleted)) AS head
                FROM documents WHERE doc_id IN (SELECT doc_id FROM candidate_links)
                GROUP BY doc_id,author_key
            ) WHERE head.1=0 AND head.2='posts' AND NOT hasAny(head.3,['ad','product'])
        )
    )
SELECT member_key AS reader,arraySort(groupArray(group_id)) AS groups,
    countIf(group_id != concat({prefix},member_key,'/followers')
        AND group_id IN (SELECT group_id FROM active_post_groups)) AS nonself_with_posts
FROM following GROUP BY member_key HAVING nonself_with_posts>=1 ORDER BY reader
""".strip()


def selection(rows):
    keys = [row['reader'] for row in rows]
    if keys != sorted(set(keys)):
        raise ValueError('reader census must contain distinct principals in key order')
    for row in rows:
        if (not row['reader'] or not row['groups'] or row['groups'] != sorted(set(row['groups']))
                or not 1 <= int(row['nonself_with_posts']) <= len(row['groups'])):
            raise ValueError('invalid reader census row')
    if len(rows) < READERS:
        return []
    return [dict(index=i, **row) for i, row in enumerate(rows[:READERS])]


def freeze(root, session):
    manifest_path = root / 'input/manifest.json'
    manifest = read(manifest_path)
    query = census_sql(manifest['origin'], manifest['provider'])
    receipt = root / 'dau-diverse-reader-census.json'
    input_sha = digest(manifest_path)
    if not receipt.exists():
        rows, query_id = session.rows('dau_diverse_reader_census', query, setup_seconds=600)
        native = session.native(query_id)
        if (native['query_id'], native['type'], int(native['exception_code'])) != (query_id, 'QueryFinish', 0):
            raise ValueError('reader census requires a successful exact native finish')
        selected = selection(rows)
        save(receipt, dict(criterion=CRITERION, query_id=query_id, native=native, sql=query,
            qualifying_count=len(rows), required_count=READERS, input_manifest_sha256=input_sha, rows=rows,
            outcome='SELECTED' if selected else REFUSED))
    census = read(receipt)
    rows = census['rows']
    selected = selection(rows)
    result = dict(criterion=CRITERION, dataset_id=manifest['dataset_id'], input_manifest_sha256=input_sha,
        census_sha256=digest(receipt), readers_count=len(selected), readers=selected,
        qualifying_count=len(rows), outcome='SELECTED' if selected else REFUSED)
    if (census['criterion'], census['input_manifest_sha256'], census['sql'], census['qualifying_count'],
            census['required_count'], census['outcome']) != (
            CRITERION, input_sha, query, len(rows), READERS, result['outcome']):
        raise ValueError('frozen reader census does not match the admitted input and criterion')
    path = root / 'dau-diverse-reader-selection.json'
    if path.exists():
        if read(path) != result:
            raise ValueError('frozen reader selection was modified')
    else:
        save(path, result)
    return result
