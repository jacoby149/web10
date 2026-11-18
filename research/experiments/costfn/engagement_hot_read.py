"""Full authorized hot computation: HTTP counts/segment/views plus in-memory tree."""
import asyncio
import hashlib
import json
from pathlib import Path
import time
import uuid

from arm_f_http import HTTP
from arm_f_native import save
from arm_satellite_sql import literal as q
import engagement_cells as cells
import engagement_modern as modern
import engagement_ref as refs
from arm_f_failure import details


def expected_parents(post):
    def identifier(index):
        return str(uuid.UUID(hashlib.md5((post + ':comment:' + str(index)).encode()).hexdigest()))
    return {identifier(index): '' if index < 32 else identifier((index - 32) // 32) for index in range(50000)}


async def compute(parent, cell, plan, *, aggregate):
    session = modern.Session(parent)
    http = HTTP(cell, session, Path(cell) / 'http')
    manifest = http.manifest
    expected = expected_parents(plan['post_id'])
    samples = []
    target = q(plan['post_id'])
    async def query(sql):
        return await http.post('/v3/query', dict(token=token, groups=[plan['group']], sql=sql), origin=manifest['origin'])
    try:
        token = await http.login(manifest['readers'][1])
        for phase in ('warmup', 'measured'):
            started = time.perf_counter()
            page_payload = dict(token=token, groups=[plan['group']],
                sql='SELECT doc_id,author_key,body,ref_value FROM posts WHERE doc_id=' + target)
            if aggregate:
                page_payload.update(surface='posts', content_service='posts')
            post, post_record = await http.post('/v3/query', page_payload, origin=manifest['origin'])
            work = [query('SELECT count() AS comment_count,groupArray(tuple(doc_id,author_key,body,ref_value)) AS thread '
                'FROM comments WHERE ref_value=' + target), query("SELECT count() AS reaction_rows,countIf(JSONExtractString(body,'target_id')='') AS post_likes,"
                "countIf(JSONExtractString(body,'target_id')!='') AS comment_likes FROM reactions WHERE ref_value=" + target)]
            if aggregate:
                work.append(http.post('/v3/contentViews', dict(token=token, groups=[plan['group']], service='posts', doc_ids=[plan['post_id']]),
                    origin=manifest['origin']))
            results = await asyncio.gather(*work, return_exceptions=True)
            labels = ['comments_and_thread', 'post_and_comment_reactions'] + (['aggregate_views'] if aggregate else [])
            parts = {}
            for label, result in zip(labels, results, strict=True):
                if isinstance(result, BaseException):
                    parts[label] = dict(outcome='STOP', **details(result))
                else:
                    parts[label] = dict(outcome='RETURNED_REQUIRES_PARITY', request_id=result[1]['request_id'])
            save(Path(cell) / (phase + '-components.json'), parts)
            if any(isinstance(result, BaseException) for result in results):
                raise ValueError('hot component stopped; independent sibling request receipts preserved')
            comments, reactions = results[0][0]['rows'][0], results[1][0]['rows'][0]
            records = [dict(doc_id=row[0], author_key=row[1], body=row[2], ref_value=row[3], collection_name='comments')
                for row in comments['thread']]
            tree_started = time.perf_counter()
            forest = refs.threads(records)
            tree_ms = (time.perf_counter() - tree_started) * 1000
            elapsed = (time.perf_counter() - started) * 1000
            if len(post['rows']) != 1 or post['rows'][0]['doc_id'] != plan['post_id']:
                raise ValueError('hot post page authority/payload mismatch')
            if (int(comments['comment_count']) != 50000 or len(records) != 50000 or len({r['doc_id'] for r in records}) != 50000
                    or any(r['ref_value'] != plan['post_id'] or json.loads(r['body'])['parent_id'] != expected[r['doc_id']] for r in records)):
                raise ValueError('hot thread differs from independent complete parent map')
            if {key: int(reactions[key]) for key in ('reaction_rows', 'post_likes', 'comment_likes')} != dict(
                    reaction_rows=plan['reactions'], post_likes=plan['post_reactions'], comment_likes=plan['comment_reactions']):
                raise ValueError('hot post/comment reaction count mismatch')
            if aggregate:
                raw, _ = session.rows(phase + '_hot_raw_oracle', "SELECT count() AS impressions,uniqExact(reader_key) AS reach FROM content_events "
                    "WHERE service='posts' AND event_type='delivery' AND doc_id=" + target)
                truth = {key: int(value) for key, value in raw[0].items()}
                if truth['impressions'] < plan['views'] or truth['reach'] < plan['actors']:
                    raise ValueError('hot raw events lost seeded impressions/readers')
                if results[2][0] != {plan['post_id']: truth}:
                    raise ValueError('hot aggregate differs from independent raw canonical events including live delivery')
            pending = [(node, 1) for node in forest]
            visited, depth = 0, 0
            while pending:
                node, level = pending.pop()
                visited, depth = visited + 1, max(depth, level)
                pending.extend((child, level + 1) for child in node['replies'])
            if visited != 50000 or depth > 8:
                raise ValueError('hot in-memory tree lost rows or exceeded bounded depth')
            requests = [post_record['request_id'], *[result[1]['request_id'] for result in results]]
            native = http.native(requests, phase)
            sample = dict(phase=phase, elapsed_ms=elapsed, thread_assembly_ms=tree_ms, thread_rows=visited, maximum_depth=depth,
                parity='PASS', aggregate_views=aggregate, full_engagement_complete=aggregate, native=native,
                request_ids=requests, native_read_rows=sum(int(row['read_rows']) for row in native),
                native_read_bytes=sum(int(row['read_bytes']) for row in native),
                components={'post': requests[0], 'comments_and_thread': requests[1], 'post_and_comment_reactions': requests[2],
                    'aggregate_views': requests[3] if aggregate else 'BLOCKED_AGGREGATE_UNAVAILABLE'})
            save(Path(cell) / (phase + '-thread-segment.json'), records)
            save(Path(cell) / (phase + '.json'), sample)
            samples.append(sample)
        return samples
    finally:
        try:
            cells.harvest(parent, cell, http)
        except Exception as error:
            save(Path(cell) / 'native-collection-failure.json', details(error))
        await http.close()
        cells.stop(parent)


def run(parent, plan, *, aggregate):
    cell = cells.boot_views(parent, 'D-hot', 'aggregate', module='engagement_hot_api',
        extra={'ENGAGEMENT_HOT_POST': plan['post_id']})
    return asyncio.run(compute(parent, cell, plan, aggregate=aggregate))
