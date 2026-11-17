"""Tiny real-SQL rehearsal; injected native Session, no provisioning on import."""
import json
from pathlib import Path

from arm_f_native import save
from arm_satellite_sql import literal as q
import engagement_events as events
import engagement_ref as refs


def run(session, root):
    output = Path(root) / 'engagement-fixture'
    output.mkdir(mode=0o700, exist_ok=False)
    result = dict(outcome='RUNNING', scope='TINY_NATIVE_FIXTURE_NOT_FULL_STORE_OR_FEED_PERFORMANCE', cases=[])
    def query(label, sql, **kwargs):
        return session.query('engagement_' + label, sql, **kwargs)
    try:
        query('documents', "CREATE TABLE documents (doc_id String,author_key String,collection_name String,body String,"
            "ref_value String,tags Array(String),created_at DateTime64(3),updated_at DateTime64(3),deleted UInt8,"
            "ad_mode String,ad_target String,posted_by String) ENGINE=ReplacingMergeTree(updated_at) ORDER BY (author_key,doc_id) SETTINGS index_granularity=64")
        def doc(doc, service, ref='', body=None, *, version=1, deleted=0):
            return dict(doc_id=doc, author_key='alice', collection_name=service, body=json.dumps(body or {}),
                ref_value=ref, tags=[], created_at='2026-11-16 00:00:00.000',
                updated_at='2026-11-16 00:00:0' + str(version) + '.000', deleted=deleted,
                ad_mode='none', ad_target='', posted_by='alice')
        source = [doc('post', 'posts'), doc('top', 'comments', 'post', {'post_id': 'post', 'text': 'hi'}),
            doc('reply', 'comments', 'top', {'post_id': 'post'}),
            doc('like', 'reactions', 'reply', {'type': 'like'}),
            doc('repost', 'posts', body={'repost_of': 'post', 'text': 'quote'}),
            doc('dead', 'comments', 'post', {'post_id': 'post'}),
            doc('dead', 'comments', 'post', {'post_id': 'post'}, version=2, deleted=1)]
        def value(value):
            return '[]' if isinstance(value, list) else str(value) if isinstance(value, int) else q(value)
        query('insert_documents', 'INSERT INTO documents VALUES ' + ','.join(
            '(' + ','.join(value(v) for v in row.values()) + ')' for row in source))
        # A seven-row/single-granule fixture cannot establish seek routing:24.8
        # legitimately prefers the base part (117 under force-name assertion).
        # Add non-target posts across granules; no changed measured-store layout.
        query('projection_padding', "INSERT INTO documents SELECT concat('padding-',toString(number)),'alice','posts','{}','',[],"
            "toDateTime64('2026-11-16',3),toDateTime64('2026-11-16',3),0,'none','','alice' FROM numbers(4096)")
        for index, sql in enumerate(refs.projection()):
            query('projection_' + str(index), sql)
        # STOP MERGES also suspends projection materialization mutations in24.8.
        # Materialize first, then freeze history for exact comparisons.
        query('freeze_history', 'SYSTEM STOP MERGES documents')
        source_snapshot, _ = session.rows('stable_source', "SELECT * FROM documents WHERE NOT startsWith(doc_id,'padding-') ORDER BY doc_id,updated_at")
        if not any(row['doc_id'] == 'dead' and row['deleted'] == 1 for row in source_snapshot):
            raise ValueError('required canonical tombstone missing')
        result['stable_source_physical_versions'] = len(source_snapshot)
        # Forcing the named optimizer projection is verification, not a new
        # layout or a claim the ordinary query optimizer chose it unprompted.
        plan, _ = query('projection_plan', 'EXPLAIN indexes=1 ' + refs.seek(['post'])
            + " SETTINGS force_optimize_projection_name='ref_sorted'")
        if 'ref_sorted' not in plan:
            raise ValueError('native plan did not confirm ref_sorted')
        result['projection_plan'] = plan
        result['projection_only_views'] = 'UNAFFECTED'
        checks, statements = refs.migration()
        for label, sql in checks.items():
            rows, _ = session.rows(label, sql)
            if len(rows) != 1 or int(rows[0]['n']):
                raise ValueError('invalid migration source: ' + label)
        for index, sql in enumerate(statements):
            query('migration_' + str(index), sql)
        query('freeze_migrated_history', 'SYSTEM STOP MERGES engagement_documents')
        actual, _ = session.rows('transformed_documents', "SELECT * FROM engagement_documents WHERE NOT startsWith(doc_id,'padding-') ORDER BY doc_id,updated_at")
        expected = sorted(refs.restructure(source_snapshot), key=lambda row: (row['doc_id'], row['updated_at']))
        for row in actual:
            row['body'] = json.dumps(json.loads(row['body']), sort_keys=True, separators=(',', ':'))
        if actual != expected:
            save(output / 'migration-mismatch.json', dict(expected=expected, actual=actual))
            raise ValueError('SQL migration differs from independent recursive semantic transformer')
        for batch in range(2):
            rows, _ = session.rows('roundtrip_' + str(batch), refs.roundtrip_check(batch, 2))
            if int(rows[0]['mismatches']):
                raise ValueError('independent inverse multiset parity mismatch')
        result['cases'].append('SQL_MIGRATION_EXACT_ALL_VERSIONS_BODY_AND_KEYS')
        boundary = ("SELECT * FROM (SELECT *,row_number() OVER (PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn "
            "FROM documents) WHERE rn=1 AND deleted=0")
        segment, _ = session.rows('root_segment', refs.segment(boundary, ['post'], table='engagement_documents'))
        if {row['doc_id'] for row in segment} != {'top', 'reply', 'like', 'repost'}:
            raise ValueError('root segment lost nested engagement or resurrected tombstone')
        result['cases'].append('ROOT_SEGMENT_NESTED_REPLY_REACTION_REPOST_AND_TOMBSTONE')
        query('links', "CREATE TABLE doc_groups (doc_id String,group_id String,updated_at DateTime64(3),deleted UInt8) "
            'ENGINE=ReplacingMergeTree(updated_at) ORDER BY (doc_id,group_id)')
        query('freeze_links', 'SYSTEM STOP MERGES doc_groups')
        query('insert_links', "INSERT INTO doc_groups VALUES ('post','g','2026-11-16',0),('post','second','2026-11-16',0),"
            "('private','other','2026-11-16',0),('removed','g','2026-11-16',0),('removed','g','2026-11-17',1)")
        query('events', 'CREATE TABLE content_events (doc_id String,service String,reader_key String,surface String,'
            'event_type String,payload String,seen_at DateTime64(3)) ENGINE=MergeTree ORDER BY (doc_id,reader_key,surface,event_type,seen_at)')
        query('insert_events', "INSERT INTO content_events VALUES ('post','posts','a','feed','delivery','','2026-11-15'),"
            "('post','posts','b','feed','delivery','','2026-11-15'),('post','posts','b','feed','delivery','','2026-11-16'),"
            "('post','posts','c','feed','delivery','','2026-11-16'),('post','music','d','feed','delivery','','2026-11-16'),"
            "('post','posts','d','feed','click','','2026-11-16'),('private','posts','a','feed','delivery','','2026-11-16'),"
            "('removed','posts','a','feed','delivery','','2026-11-16')")
        ids, groups = ['post', 'private', 'removed'], ['g', 'second']
        sql = events.read(ids, 'posts', groups, aggregate=False)
        raw, query_id = session.rows('raw_views', sql)
        raw = events.integer_counts(raw)
        native = session.native(query_id)
        native = {k: int(v) if k in ('read_rows', 'read_bytes', 'exception_code') else v for k, v in native.items()}
        if raw != [dict(doc_id='post', impressions=4, reach=3)]:
            raise ValueError('raw authorized event fixture parity')
        diagnosis = events.diagnostic(sql, native, 4, 4)
        save(output / 'views-diagnostic.json', diagnosis)  # Before choosing/building treatment.
        for index, statement in enumerate(events.build(diagnosis, writers_stopped=True)):
            query('aggregate_' + str(index), statement)
        aggregate, aggregate_id = session.rows('aggregate_read', events.read(ids, 'posts', groups))
        aggregate = events.integer_counts(aggregate)
        if aggregate != raw:
            raise ValueError('aggregate parity before new insert')
        query('new_event', "INSERT INTO content_events VALUES ('post','posts','a','feed','delivery','','2026-11-17')")
        after, _ = session.rows('aggregate_after_insert', events.read(ids, 'posts', groups))
        raw_after, _ = session.rows('raw_after_insert', events.read(ids, 'posts', groups, aggregate=False))
        after, raw_after = events.integer_counts(after), events.integer_counts(raw_after)
        if after != raw_after or after != [dict(doc_id='post', impressions=5, reach=3)]:
            raise ValueError('materialized insert or distinct-state merge parity')
        # The inverse oracle must reject physical multiplicity corruption, not
        # just agree on an intact copy. This is an intentional tiny bad fixture.
        query('duplicate_copy_row', "INSERT INTO engagement_documents SELECT * FROM engagement_documents WHERE doc_id='reply'")
        mismatches = 0
        for batch in range(2):
            rows, _ = session.rows('reject_duplicate_' + str(batch), refs.roundtrip_check(batch, 2))
            mismatches += int(rows[0]['mismatches'])
        if mismatches != 1:
            raise ValueError('independent multiset oracle failed to reject duplicate')
        result['cases'].append('INVERSE_MULTISET_ORACLE_DENIES_DUPLICATE')
        result.update(outcome='PASS', raw_native=native, aggregate_native=session.native(aggregate_id),
            TTL_reconciliation='NOT_PROVEN_INSERT_AGGREGATES_DO_NOT_SUBTRACT_RAW_EXPIRY',
            full_store='UNREACHED', complete_response='NOT_MEASURED')
        result['cases'].append('EXACT_DISTINCT_CROSS_DAY_INSERT_BLOCK_AND_LIVE_ATTACHMENT_SCOPE')
        return result
    except BaseException as error:
        result.update(outcome='STOP', **__import__('arm_f_failure').details(error))
        raise
    finally:
        save(output / 'result.json', result)
