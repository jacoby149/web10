"""Research-only late payload reads over the frozen K20 canonical copy."""
import sqlglot
from sqlglot import exp

from arm_satellite_sql import literal as q


DIRECTIVE = 'RD4-HYBRID-K20 projected canonical comparison only'
TABLE = 'engagement_documents'
COLUMNS = ('doc_id', 'author_key', 'posted_by', 'ref_value', 'tags', 'created_at',
    'updated_at', 'ad_mode', 'ad_target', 'collection_name', 'deleted')
KEY = ('author_key', 'doc_id', 'version')
PREPARE_FIELDS = ('doc_id', 'author_key', 'posted_by', 'body', 'ad_mode', 'ad_target')
MAIN_MARKER = '/* ENGAGEMENT_DOC_COUNTS TALLY */ '
STAGES = ('projected_resolution_keys', 'projected_resolution_payload',
    'projected_preparation_keys', 'projected_preparation_payload')


def enabled(approval):
    return (approval.get('hybrid_k20_projected_directive') == DIRECTIVE
        and approval.get('hybrid_k20_projected_admitted') is True
        and approval.get('hybrid_k20_hybrid_admitted') is False)


def parse(sql):
    return sqlglot.parse_one(sql, read='clickhouse')


def render(tree):
    return tree.sql(dialect='clickhouse')


def stage(name, sql):
    if name not in STAGES:
        raise ValueError('unknown K20 projection stage')
    prefix = MAIN_MARKER if name == 'projected_resolution_keys' else ''
    return prefix + '/* ' + name + ' */ ' + sql


def without_body(tree):
    # Only callers below can remove a response body. Every remaining reference
    # must be a pass-through of a canonical column, never a policy/rank input.
    for column in list(tree.find_all(exp.Column)):
        if column.name != 'body':
            continue
        select = column.parent
        if (not isinstance(select, exp.Select) or column not in select.expressions
                or select is tree or select.args.get('distinct')):
            raise ValueError('K20 projection cannot remove a body dependency')
        select.set('expressions', [item for item in select.expressions if item is not column])
    physical_reads = 0
    for table in tree.find_all(exp.Table):
        if table.name not in ('documents', TABLE):
            continue
        physical_reads += 1
        select = table.find_ancestor(exp.Select)
        if select.is_star:
            if select.expressions != [exp.Star()]:
                raise ValueError('unexpected canonical star projection')
            select.set('expressions', [exp.column(name) for name in COLUMNS])
    if not physical_reads:
        raise ValueError('K20 projection requires canonical history reads')


def version(alias=None):
    return exp.func('toUnixTimestamp64Milli', exp.column('updated_at', table=alias))


def main_keys(sql):
    tree = parse(sql)
    fields = [item.alias_or_name for item in tree.expressions]
    for output, expected in (('body', exp.column('body', 'p')), ('profile_body', exp.column('body', 'pr'))):
        items = [item for item in tree.expressions if item.alias_or_name == output]
        if len(items) != 1 or not isinstance(items[0], exp.Alias) or items[0].this != expected:
            raise ValueError('unexpected K20 payload projection')
        items[0].pop()
    profile = next((join.this.this for join in tree.args['joins'] if join.this.alias == 'pr'), None)
    if (not isinstance(profile, exp.Select) or profile.args['from_'].this.name != 'profile'
            or profile.args.get('qualify') is None or profile.args.get('distinct')):
        raise ValueError('expected ranked K20 profile lookup')
    profile.select('doc_id', version().as_('profile_version'), append=True, copy=False)
    tree.select(version('p').as_('post_version'), 'pr.doc_id AS profile_id',
        'pr.profile_version AS profile_version', append=True, copy=False)
    without_body(tree)
    return fields, stage('projected_resolution_keys', render(tree))


def records(execute, sql):
    columns, rows = execute(sql)
    return [dict(zip(columns, row, strict=True)) for row in rows]


def payload(execute, keys, *, service=None, kind):
    keys = set(keys)
    if not keys:
        return {}
    if any(not a or not d or type(v) is not int for a, d, v in keys):
        raise ValueError('incomplete K20 materialization identity')
    values = ','.join(f'({q(a)},{q(d)},{v})' for a, d, v in sorted(keys))
    fields = 'author_key,doc_id,toUnixTimestamp64Milli(updated_at) AS version,body'
    identities = ','.join(f'({q(a)},{q(d)})' for a, d in sorted({(a, d) for a, d, _ in keys}))
    sql = (f'SELECT DISTINCT {fields} FROM {TABLE} PREWHERE (author_key,doc_id) IN ({identities}) '
        f'AND deleted=0 AND (author_key,doc_id,toUnixTimestamp64Milli(updated_at)) IN ({values})')
    if service is not None:
        sql += ' AND collection_name=' + q(service)
    result = {}
    for row in records(execute, stage('projected_' + kind + '_payload', sql)):
        key = tuple(row[field] for field in KEY)
        if key not in keys or key in result:
            raise ValueError('unexpected or conflicting K20 payload version')
        result[key] = row['body']
    if result.keys() != keys:
        raise ValueError('missing exact K20 payload version')
    return result


def resolution(execute, sql):
    fields, keys_sql = main_keys(sql)
    rows = records(execute, keys_sql)
    def post(row):
        return row['author_key'], row['doc_id'], row['post_version']
    def profile(row):
        return row['author_key'], row['profile_id'], row['profile_version']
    posts = payload(execute, map(post, rows), service='posts', kind='resolution')
    profiles = payload(execute, (profile(row) for row in rows if row['profile_id']),
        service='profile', kind='resolution')
    # Preserve both SQL LEFT JOIN defaults (String '' vs Nullable NULL) and
    # the original ordered/multiple rows; the payload seek never reranks.
    for row in rows:
        row['body'] = posts[post(row)]
        row['profile_body'] = profiles[profile(row)] if row['profile_id'] else row['profile_id']
    return fields, [tuple(row[field] for field in fields) for row in rows]


def preparation(execute, sql, author):
    tree = parse(sql)
    if tuple(item.alias_or_name for item in tree.expressions) != PREPARE_FIELDS or not tree.args.get('distinct'):
        raise ValueError('expected server-written canonical prepare lookup')
    source = tree.args['from_'].this.name
    tree.set('expressions', [item for item in tree.expressions if item.name != 'body'])
    tree.select(version().as_('version'), append=True, copy=False)
    without_body(tree)
    # Keep the original DISTINCT/limit before the existing full-key selector.
    # An unordered saturated lookup cannot prove equivalent selection.
    limit = int(tree.args['limit'].expression.this)
    rows = records(execute, stage('projected_preparation_keys', render(tree)))
    if len(rows) >= limit:
        raise ValueError('K20 prepare reached canonical lookup limit')
    rows = [row for row in rows if row['author_key'] == author]
    keys = [tuple(row[field] for field in KEY) for row in rows]
    bodies = payload(execute, keys, service=source, kind='preparation')
    for row, key in zip(rows, keys, strict=True):
        row['body'] = bodies[key]
    return PREPARE_FIELDS, [tuple(row[field] for field in PREPARE_FIELDS) for row in rows]
