"""Derived pointer I/O for the isolated adapter; no authentication substitution.

Callers enter through the real authorized endpoints/coordinator. Every read
candidate is canonically rebound; no bodies, grants or signing URLs are cached.
"""
import json
from datetime import UTC, datetime
import uuid

import arm_f as f
from arm_satellite_sql import literal as q


def pairs_sql(pointers, group):
    pairs = sorted({(r['author_key'], r['doc_id']) for r in pointers})
    keys = ','.join('(' + q(author) + ',' + q(doc) + ')' for author, doc in pairs) or "('','')"
    ids = ','.join(q(doc) for _, doc in pairs) or "''"
    return ("SELECT d.author_key,d.doc_id,d.created_at,g.group_id FROM (SELECT author_key,doc_id,created_at,deleted,"
        "row_number() OVER (PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn "
        "FROM documents WHERE (author_key,doc_id) IN (" + keys + ")) AS d INNER JOIN ("
        "SELECT doc_id,group_id,deleted,row_number() OVER (PARTITION BY doc_id,group_id ORDER BY updated_at DESC,"
        "deleted DESC) AS rn FROM doc_groups WHERE group_id=" + q(group) + ' AND doc_id IN (' + ids + ')) AS g '
        'ON d.doc_id=g.doc_id WHERE d.rn=1 AND g.rn=1 AND d.deleted=0 AND g.deleted=0')


class Store:
    def __init__(self, client, journal):
        self.client, self.journal = client, journal

    def rows(self, sql, parameters=None):
        result = self.client.query(sql, parameters=parameters)
        return [dict(zip(result.column_names, row)) for row in result.result_rows]

    def members(self, group):
        return f.recipients(self.client.query, group)

    def publish(self, document, group, sequence):
        document = {**document, 'created_at': f.publication_time(document['created_at'])}
        result = f.append_publication(self.client.query, self.client.insert, document, group, sequence, self.journal.dirty)
        # Mark dirties without selecting or ranking any recipient's list.
        # Use the exact canonical result from append_publication, not a second pass.
        return result

    def maintain_index(self, document, group):
        """Append exact canonical route metadata; never copy document bodies."""
        sql = ("INSERT INTO doc_groups_t SELECT " + q(group) + ",d.created_at,d.doc_id,d.author_key,"
            "g.created_at,g.updated_at,g.deleted,d.collection_name,d.tags,d.ref_value,"
            "JSONExtractString(d.body,'post_id'),JSONExtractString(d.body,'repost_of') FROM "
            "(SELECT *,row_number() OVER (PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn "
            "FROM documents WHERE author_key=" + q(document['author_key']) + ' AND doc_id=' + q(document['doc_id'])
            + ") AS d INNER JOIN (SELECT *,row_number() OVER (PARTITION BY doc_id,group_id ORDER BY updated_at DESC,"
            "deleted DESC) AS rn FROM doc_groups WHERE doc_id=" + q(document['doc_id']) + ' AND group_id=' + q(group)
            + ') AS g ON d.doc_id=g.doc_id WHERE d.rn=1 AND g.rn=1 AND d.deleted=0 AND g.deleted=0')
        self.client.query(sql)

    def backfill(self, group, member, sequence):
        keys = self.members(group)
        if member not in keys:
            raise ValueError('backfill requires actual current explicit membership')
        if len(keys) >= f.CUTOFF:
            return {'members': len(keys), 'backfill_pointers': 0, 'lane': 'seek'}
        after, accepted, seen = None, [], set()
        while len(accepted) < f.CAP:
            cursor = ''
            if after:
                cursor = ' AND (created_at,doc_id,author_key)<(fromUnixTimestamp64Milli(' + str(after['created_ms']) + '),'
                cursor += q(after['doc_id']) + ',' + q(after['author_key']) + ')'
            pointers = self.rows('SELECT DISTINCT author_key,doc_id,toUnixTimestamp64Milli(created_at) AS created_ms '
                'FROM doc_groups_t WHERE group_id=' + q(group) + cursor
                + ' ORDER BY created_ms DESC,doc_id DESC,author_key DESC LIMIT ' + str(f.CAP + 1))
            if not pointers:
                break
            current = self.rows(pairs_sql(pointers, group))
            current.sort(key=lambda r: (r['created_at'], r['doc_id'], r['author_key']), reverse=True)
            for row in current:
                identity = row['author_key'], row['doc_id']
                if identity not in seen and len(accepted) < f.CAP:
                    seen.add(identity)
                    accepted.append([member, row['created_at'], *identity, group, sequence, 0])
            after = pointers[-1]
            if len(pointers) < f.CAP + 1:
                break
        if accepted:
            self.client.insert('fanout', accepted, column_names=f.COLUMNS)
            self.journal.dirty([member], sequence)
        return {'members': len(keys), 'backfill_pointers': len(accepted), 'lane': 'fanout'}

    def remove_route(self, group, member, sequence):
        # Unfollow concerns this reader/route only, never another valid route.
        rows = self.rows(f.cache_sql(member, [group]))
        if rows:
            values = [[member, datetime.fromtimestamp(int(row['created_ms']) / 1000, UTC),
                       row['author_key'], row['doc_id'], group, sequence, 1] for row in rows]
            self.client.insert('fanout', values, column_names=f.COLUMNS)
        return len(rows)

    def trim(self, reader):
        sql = f.cache_sql(reader, []).replace("position<=200 AND group_id IN ('')", 'position>200') + ' LIMIT 1000'
        rows = self.rows(sql)
        if not rows:
            return True
        def apply(sequence, payload):
            values = [[reader, datetime.fromtimestamp(int(row['created_ms']) / 1000, UTC),
                       row['author_key'], row['doc_id'], row['group_id'], sequence, 1] for row in rows]
            self.client.insert('fanout', values, column_names=f.COLUMNS)
            return {'trimmed_route_rows': len(values)}
        self.journal.run('trim-' + uuid.uuid4().hex, '__derived_trim__', 'trim', {'reader': reader},
                         lambda: None, apply, lambda *args: None)
        return len(rows) < 1000

    def dirty_publication(self, readers, sequence):
        self.journal.dirty(readers, sequence)

    def describe(self):
        return json.dumps({'cutoff': f.CUTOFF, 'logical_window': f.CAP,
                           'publication': 'canonical enumeration + append only; no rerank'})
