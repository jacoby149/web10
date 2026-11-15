"""Tiny native population-builder rehearsal in the admitted checker container.

An independent Python fixture oracle checks global cap, all routes, full keys,
membership/history/tombstones, large-lane exclusion and deterministic reseeding.
"""
import hashlib
import json
from pathlib import Path

import arm_f as f
import arm_f_population as population
from arm_f_native import save
import arm_satellite_metadata as metadata
import arm_f_views


def run(session, root):
    root = Path(root)
    builder = population.Builder(session, root / 'population-native-fixture')
    result = dict(kind='NATIVE_FULL_POPULATION_BUILDER_REHEARSAL', outcome='RUNNING', cases=[],
        droplet_id=json.loads((root / 'admission.json').read_bytes())['droplet_id'], engine='24.8.14.39',
        builder_sha256=hashlib.sha256(Path(population.__file__).read_bytes()).hexdigest(),
        fixture_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        primitives_sha256=hashlib.sha256(Path(f.__file__).read_bytes()).hexdigest(),
        runtime_sha256=hashlib.sha256(Path(__file__).with_name('arm_f_runtime.py').read_bytes()).hexdigest())
    try:
        for table in ('doc_groups_t', 'doc_groups', 'documents'):
            builder.query('reset_' + table, 'TRUNCATE TABLE ' + table)
            builder.query('freeze_fixture_merges_' + table, 'SYSTEM STOP MERGES ' + table)
        builder.query('users_ddl', 'CREATE TABLE users (username String,updated_at DateTime64(3),deleted UInt8) '
            'ENGINE=ReplacingMergeTree(updated_at) ORDER BY username')
        builder.query('members_source_ddl', 'CREATE TABLE group_members (group_id String,member_key String,'
            'updated_at DateTime64(3),deleted UInt8) ENGINE=ReplacingMergeTree(updated_at) ORDER BY (group_id,member_key)')
        builder.query('fanout_ddl', f.DDL)
        t = "toDateTime64('2026-11-15 00:00:00',3)"
        builder.query('humans', "INSERT INTO users SELECT concat('human-',toString(number))," + t + ',0 FROM numbers(2000)')
        builder.query('named_humans', "INSERT INTO users VALUES ('alice'," + t + ",0),('bob'," + t + ",0)")
        builder.query('members_large', "INSERT INTO group_members SELECT 'large',concat('human-',toString(number)),"
            + t + ',0 FROM numbers(2000)')
        builder.query('members_small', "INSERT INTO group_members VALUES ('g1','alice'," + t + ",0),('g1','bob',"
            + t + ",0),('g2','alice'," + t + ",0),('g2','bob'," + t + ",0),('g2','bob'," + t
            + "+1,1),('g1','anyone'," + t + ',0)')
        builder.query('documents', "INSERT INTO documents SELECT leftPad(toString(number),4,'0'),'a','posts','{}','',[],"
            + t + '+number,' + t + ',0 FROM numbers(205)')
        builder.query('collision', "INSERT INTO documents SELECT '0204','b','posts','{}','',[]," + t + '+204,' + t + ',0')
        builder.query('dead_document', "INSERT INTO documents SELECT '0203','a','posts','{}','',[]," + t + '+203,' + t + ',1')
        builder.query('large_candidate', "INSERT INTO documents SELECT '9999','a','posts','{}','',[]," + t + '+9999,' + t + ',0')
        builder.query('links', "INSERT INTO doc_groups SELECT leftPad(toString(number),4,'0'),'g1'," + t + ',' + t
            + ',0 FROM numbers(205)')
        builder.query('shared_link', "INSERT INTO doc_groups VALUES ('0204','g2'," + t + ',' + t + ',0)')
        builder.query('removed_link', "INSERT INTO doc_groups VALUES ('0202','g1'," + t + ',' + t + ',1)')
        builder.query('large_link', "INSERT INTO doc_groups VALUES ('9999','large'," + t + ',' + t + ',0)')
        # Index is only an identity hint: leave stale/dead/history keys in it.
        builder.query('index', metadata.TRANSPOSE_BUILD.replace(' FINAL WHERE deleted=0', ''))
        builder.members()
        membership = builder.query('membership_snapshot', 'SELECT reader_key,group_id FROM f_seed_members ORDER BY reader_key,group_id', rows=True)
        if {(row['reader_key'], row['group_id']) for row in membership} != {('alice', 'g1'), ('alice', 'g2'), ('bob', 'g1')}:
            raise ValueError('native canonical lane/member snapshot differs')
        rows = builder.expected(['alice', 'bob'], 1, 'positive')
        # Oracle does not call window_sql, canonical SQL or the builder's ranking.
        wanted = []
        for reader in ('alice', 'bob'):
            identities = [('a', str(n).zfill(4), n) for n in range(205) if n not in (202, 203)] + [('b', '0204', 204)]
            identities.sort(key=lambda row: (row[2], row[1], row[0]), reverse=True)
            for author, doc, seconds in identities[:200]:
                wanted.append((reader, 1794700800000 + seconds * 1000, author, doc, 'g1'))
                if reader == 'alice' and doc == '0204':
                    wanted.append((reader, 1794700800000 + seconds * 1000, author, doc, 'g2'))
        if population.logical(rows) != sorted(wanted):
            raise ValueError('native population output differs from independent fixture oracle')
        result['cases'].append('cap200_shared_routes_same_id_authors_deleted_document_removed_link_removed_member')
        builder.insert(['alice', 'bob'], 1, 'initial')
        builder.reconcile(['alice', 'bob'], 2, 'retry')
        stored = builder.query('retry_stored', population.stored_sql(['alice', 'bob']), rows=True)
        if population.logical(stored) != sorted(wanted):
            raise ValueError('native reseed changed logical windows')
        result['cases'].append('deterministic_idempotent_reseed')
        independent = population.independent_windows(builder, {'alice': ['g1', 'g2'], 'bob': ['g1']})
        if independent != sorted(wanted):
            raise ValueError('native independent canonical author-range oracle differs')
        result['cases'].append('native_canonical_author_range_oracle')
        shadow = population.Builder(session, root / 'population-native-shadow', target='fanout_rebuild_7')
        shadow.query('shadow_ddl', f.DDL)
        shadow.insert(['alice', 'bob'], 7, 'shadow')
        builder.query('exchange', 'EXCHANGE TABLES fanout_rebuild_7 AND fanout')
        swapped = builder.query('swapped', population.stored_sql(['alice', 'bob']), rows=True)
        if population.logical(swapped) != sorted(wanted):
            raise ValueError('atomic rebuild exchange changed logical windows')
        result['cases'].append('shadow_build_atomic_exchange')
        large = builder.expected(['human-0'], 2, 'large')
        if large:
            raise ValueError('large-group reader received seed pointers')
        result['cases'].append('cutoff2000_zero_pointers')
        builder.query('events_ddl', 'CREATE TABLE content_events (doc_id String,reader_key String,service String,event_type String) '
            'ENGINE=MergeTree ORDER BY (doc_id,reader_key)')
        builder.query('events', "INSERT INTO content_events VALUES ('0204','alice','posts','delivery'),"
            "('0204','bob','posts','delivery'),('0204','bob','posts','delivery'),('0204','alice','posts','click')")
        sql = "SELECT e.doc_id,count() AS impressions,countDistinct(e.reader_key) AS reach FROM content_events e "
        sql += "WHERE e.service='posts' AND e.event_type='delivery' AND e.doc_id IN ('0204') AND e.doc_id IN "
        sql += "(SELECT doc_id FROM doc_groups WHERE group_id IN ('g1') AND deleted=0) GROUP BY e.doc_id"
        observed = builder.query('same_snapshot_views', arm_f_views.checked_sql(sql), rows=True)
        checked = arm_f_views.verify([[row[k] for k in ('doc_id', 'impressions', 'reach', 'f_oracle_impressions', 'f_oracle_reach')]
                                     for row in observed])
        if checked != [['0204', 3, 2]]:
            raise ValueError('native exact view snapshot oracle differs')
        result['cases'].append('native_same_snapshot_differential_views')
        builder.query('duplicate_membership', "INSERT INTO f_seed_members VALUES ('alice','g1')")
        try:
            builder.expected(['alice'], 3, 'duplicate')
        except ValueError as error:
            if str(error) != 'duplicate seed membership batch':
                raise
        else:
            raise ValueError('duplicate membership was silently admitted')
        result['cases'].append('duplicate_batch_refused')
        result.update(outcome='PASS', logical_routes=len(wanted))
    except Exception as error:
        result.update(outcome='STOP', failure_class=type(error).__name__)
        raise
    finally:
        save(builder.output / 'result.json', result)
    print('[fanout-population] tiny native builder rehearsal PASS', flush=True)
    return result
