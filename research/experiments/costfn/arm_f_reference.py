"""Independent canonical document-stream oracle, in a separate setup process.

No fanout/time-index/strings/counter inputs. Same declared P/F contract; original
P capture and historical reference stay immutable. Private bodies never enter
gate receipts or controller logs. This process is not a serving latency sample.
"""
import hashlib
import json
from pathlib import Path

import sqlglot
from sqlglot import exp

import arm_satellite_ad_parity as ads
import core_feed


LEGACY_AD_FULL_KEY_ORDER = 'author-key-doc-id-v1'


def legacy_ads(eligible, order):
    if order is None:
        return eligible
    if order != LEGACY_AD_FULL_KEY_ORDER:
        raise ValueError('unrecognized research oracle legacy ad order')
    by_key = {}
    for ad in eligible:
        key = ad['author_key'], ad['doc_id']
        if key in by_key:
            raise ValueError('duplicate legacy creative identity in oracle')
        by_key[key] = ad
    return [by_key[key] for key in sorted(by_key)]


def contract(sql):
    tree = sqlglot.parse_one(sql, read='clickhouse')
    # Independently spell the approved contract rather than calling the F builder.
    specification = sqlglot.parse_one('SELECT 1 QUALIFY row_number() OVER (PARTITION BY p.author_key,p.doc_id '
        'ORDER BY p.group_id ASC)=1 ORDER BY p.created_at DESC,p.doc_id DESC,p.author_key DESC', read='clickhouse')
    tree.set('qualify', specification.args['qualify'])
    tree.set('order', specification.args['order'])
    return tree


def build(directory):
    # Import production implementations only in the explicitly launched isolated
    # API-container oracle process, not during no-engine tests or CLI discovery.
    from app.v3.endpoints import query as endpoint
    from app.v3.models import PrepareSpec
    from app.v3.services import clickhouse as ch, safe_query
    from arm_f_prepare import install
    install(endpoint)
    directory = Path(directory)
    spec = json.loads((directory / 'input.json').read_bytes())
    reader, scopes = spec['reader'], spec['actual_readable_by_kind']
    capture = core_feed.wire()
    native, original = [], ch.client.query
    def query(sql=None, *args, **kwargs):
        if sql is None:
            sql = kwargs.pop('query')
        settings = dict(kwargs.get('settings') or {})
        settings.update(max_execution_time=900, max_memory_usage=22 * 1024**3, max_threads=4,
            max_bytes_before_external_sort=2 * 1024**3, max_bytes_before_external_group_by=2 * 1024**3,
            max_temporary_data_on_disk_size_for_query=100 * 1024**3, join_algorithm='full_sorting_merge')
        kwargs['settings'] = settings
        result = original(sql, *args, **kwargs)
        native.append(dict(query_id=result.query_id, sql_sha256=hashlib.sha256(sql.encode()).hexdigest()))
        return result
    ch.client.query = query
    endpoint.MAX_EXECUTION_TIME_S = 900
    def compile(sql, kind):
        return safe_query.build_safe_query(sql, scopes[kind], member_key=reader,
            allowed_services=frozenset(scopes[kind]), max_limit=1000)
    tree = contract(compile(capture['requests'][0]['payload']['sql'], 'main'))
    if spec.get('verify_actual_pairs'):
        # Identity eligibility is independently established by the lower page;
        # these supplied keys are ONLY a canonical payload/authority check.
        baseline = exp.Literal.string(spec['lower_before_utc']).sql(dialect='clickhouse')
        cutoff = exp.Literal.string(spec['lower_read_utc']).sql(dialect='clickhouse')
        tree.where(sqlglot.parse_one('SELECT 1 WHERE p.created_at<parseDateTime64BestEffort(' + baseline
            + ",6,'UTC') OR (p.author_key,p.doc_id) IN (SELECT author_key,doc_id FROM f_oracle_commits "
            'WHERE completed_at<parseDateTime64BestEffort(' + cutoff + ",6,'UTC'))", read='clickhouse').args['where'].this, copy=False)
    boundary = next(cte.this for cte in tree.args['with_'].expressions if cte.alias == 'posts')
    page = sqlglot.parse_one('SELECT p.doc_id,p.author_key,p.created_at FROM (' + boundary.sql(dialect='clickhouse') + ') AS p', read='clickhouse')
    for key in ('where', 'order', 'limit', 'qualify'):
        if tree.args.get(key):
            page.set(key, tree.args[key].copy())
    columns, values = ch.execute_query(page.sql(dialect='clickhouse'), settings={'max_execution_time': 900})
    page_rows = [dict(zip(columns, row)) for row in values]
    if not page_rows:
        raise ValueError('canonical document-stream page empty')
    def literals(values):
        return ','.join(exp.Literal.string(value).sql(dialect='clickhouse') for value in sorted(set(values)))
    lower_rows = [endpoint._serialize_row(row) for row in page_rows]
    pairs = spec.get('verify_actual_pairs')
    if pairs:
        tree = contract(compile(capture['requests'][0]['payload']['sql'], 'main'))
        encoded = ','.join('(' + literals([author]) + ',' + literals([doc]) + ')' for author, doc in pairs)
        tree.where(sqlglot.parse_one('SELECT 1 WHERE (p.author_key,p.doc_id) IN (' + encoded + ')', read='clickhouse').args['where'].this,
                   copy=False)
        ids, author_keys = [doc for _, doc in pairs], [author for author, _ in pairs]
    else:
        ids, author_keys = [row['doc_id'] for row in page_rows], [row['author_key'] for row in page_rows]
    selected, authors = literals(ids), literals(author_keys)
    selectors = {'posts': 'doc_id IN (' + selected + ") OR JSONExtractString(body,'repost_of') IN (" + selected + ')',
        'reactions': 'ref_value IN (' + selected + ')', 'comments': "JSONExtractString(body,'post_id') IN (" + selected + ')',
        'profile': 'author_key IN (' + authors + ')'}
    def bounded(compiled):
        for cte in compiled.args['with_'].expressions:
            identity = "SELECT author_key,doc_id FROM documents FINAL WHERE deleted=0 AND collection_name='" + cte.alias + "' AND (" + selectors[cte.alias] + ')'
            for table in list(cte.this.find_all(exp.Table)):
                if table.name not in ('documents', 'doc_groups'):
                    continue
                text = '(author_key,doc_id) IN (' + identity + ')' if table.name == 'documents' else 'doc_id IN (SELECT doc_id FROM (' + identity + '))'
                predicate = sqlglot.parse_one('SELECT 1 WHERE ' + text, read='clickhouse').args['where'].this
                table.find_ancestor(exp.Select).where(predicate, copy=False)
        return compiled.sql(dialect='clickhouse')
    columns, values = ch.execute_query(bounded(tree), settings={'max_execution_time': 900})
    rows = [endpoint._serialize_row(dict(zip(columns, row))) for row in values]
    candidates = [row[0] for row in ch.client.query(ads.candidate_sql()).result_rows]
    heads = ch.client.query(ads.eligible_heads_sql(candidates)).result_rows
    payloads = ch.client.query(ads.payload_sql([(row[1], row[0]) for row in heads]))
    eligible = [dict(zip(payloads.column_names, row)) for row in payloads.result_rows]
    for ad in eligible:
        ad['body'] = ch._parse_json(ad['body'])
    eligible = [row for row in eligible if row['body'].get('status') == 'active']
    if not eligible:
        raise ValueError('independent eligible ad inventory missing')
    ad_order = spec.get('legacy_node_ad_order')
    eligible = legacy_ads(eligible, ad_order)
    ch.get_active_node_ads = lambda: list(eligible[:20])
    prepared = endpoint._prepare_rows(rows, reader, PrepareSpec(**capture['requests'][0]['payload']['prepare']), scopes['main'], True)
    engagements = []
    for item, kind in zip(capture['requests'][1:3], ('reactions', 'comments')):
        payload = core_feed.payload(item['payload'], '__oracle_not_a_credential__', spec['groups'], ids)
        compiled = sqlglot.parse_one(compile(payload['sql'], kind), read='clickhouse')
        columns, values = ch.execute_query(bounded(compiled), settings={'max_execution_time': 900})
        engagements.append([endpoint._serialize_row(dict(zip(columns, row))) for row in values])
    views_payload = core_feed.payload(capture['requests'][3]['payload'], '__oracle_not_a_credential__', spec['groups'], ids)
    views_groups = ch.readable_groups(reader, views_payload['service'], True, views_payload['groups'])
    result = dict(rows=prepared, lower_rows=lower_rows, eligible_ads=eligible, followups=engagements, ids=ids,
        views_readable_groups=views_groups)
    (directory / 'expected.json').write_text(json.dumps(result, sort_keys=True))
    (directory / 'summary.json').write_text(json.dumps(dict(kind='CANONICAL_DOCUMENT_STREAM_REFERENCE',
        native=native, contract='DOCUMENT_STREAM_V1', rows=len(prepared), input_sha256=hashlib.sha256((directory / 'input.json').read_bytes()).hexdigest(),
        source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), serving_measurement=False,
        **({'legacy_node_ad_order': ad_order} if ad_order else {}))))


if __name__ == '__main__':
    import sys
    build(Path(sys.argv[1]))
