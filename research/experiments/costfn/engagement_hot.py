"""One separate400k-row hot fixture; native bulk setup is not a write benchmark."""
from datetime import UTC, datetime, timedelta
import hashlib
import json
from pathlib import Path
import uuid

from arm_f_native import save
from arm_satellite_sql import literal as q
from dataset_v2 import DISCOVER
import engagement_projection


def uid(tag, number):
    value = "lower(hex(MD5(concat(" + q(tag) + ',toString(' + number + ')))))'
    return "concat(substring(" + value + ",1,8),'-',substring(" + value + ",9,4),'-',substring(" + value + ",13,4),'-',substring(" + value + ",17,4),'-',substring(" + value + ',21,12))'


def composition(events, reactions):
    if min(events, reactions) <= 0:
        raise ValueError('positive frozen event/reaction calibration required')
    reaction_rows = (350000 * reactions + (events + reactions) // 2) // (events + reactions)
    view_rows = 350000 - reaction_rows
    if min(reaction_rows, view_rows) < 2:
        raise ValueError('hot cell needs positive post/comment reactions and views')
    actors = min(100000, view_rows)
    direct = min(actors, max(1, reaction_rows // 2))
    return dict(total_engagement_rows=400000, comments=50000, reactions=reaction_rows, views=view_rows,
        actors=actors, post_reactions=direct, comment_reactions=reaction_rows - direct,
        calibration='comments fixed at50k stress stratum; remaining view/reaction ratio follows frozen totals',
        positive_comment_reactions='explicit coverage stratum absent from the frozen corpus')


def seed(session, root):
    output = Path(root) / 'hot-fixture'
    output.mkdir(mode=0o700, exist_ok=False)
    totals, _ = session.rows('hot_calibration', "SELECT countIf(collection_name='reactions') AS reactions FROM documents")
    frozen = json.loads((Path(root) / 'input/manifest.json').read_bytes())
    plan = composition(int(frozen['files']['content_events']['rows']), int(totals[0]['reactions']))
    post = str(uuid.uuid4())
    now = datetime.now(UTC) - timedelta(days=7)
    clock = 'parseDateTime64BestEffort(' + q(now.isoformat()) + ",3,'UTC')"
    plan.update(post_id=post, clock_utc=now.isoformat(), group=DISCOVER,
        setup='direct synthetic fixture bulk inserts; NOT measured/authorized API publication throughput')
    save(output / 'plan.json', plan)
    session.query('hot_documents_ddl', 'CREATE TABLE engagement_hot_documents AS documents')
    inherited, _ = session.rows('hot_inherited_projections', "SELECT name FROM system.projections WHERE database='web10' AND table='engagement_hot_documents'")
    if inherited:
        if [row['name'] for row in inherited] != ['ref_sorted']:
            raise ValueError('unapproved inherited hot projection')
        session.query('hot_remove_inherited_projection', 'ALTER TABLE engagement_hot_documents DROP PROJECTION ref_sorted')
    session.query('hot_links_ddl', 'CREATE TABLE engagement_hot_links AS doc_groups')
    session.query('hot_actors_ddl', 'CREATE TABLE engagement_hot_actors (idx UInt32,username String) ENGINE=MergeTree ORDER BY idx')
    session.query('hot_actual_actors', 'INSERT INTO engagement_hot_actors SELECT toUInt32(row_number() OVER (ORDER BY username)-1),'
        'username FROM (SELECT username FROM users FINAL WHERE deleted=0 ORDER BY username LIMIT ' + str(plan['actors']) + ')')
    actor_count, _ = session.rows('hot_actor_count', 'SELECT count() AS n FROM engagement_hot_actors')
    if int(actor_count[0]['n']) != plan['actors']:
        raise ValueError('insufficient actual synthetic humans for the hot cell')
    columns = '(doc_id,author_key,collection_name,body,ref_value,tags,created_at,updated_at,deleted,ad_mode,ad_target,posted_by)'
    session.query('hot_post', 'INSERT INTO engagement_hot_documents ' + columns + ' SELECT ' + q(post)
        + ",username,'posts','{\"text\":\"Synthetic hot post\"}','',[]," + clock + ',' + clock
        + ",0,'none','',username FROM engagement_hot_actors WHERE idx=0")
    comment_id = uid(post + ':comment:', 'number')
    parent = "if(number<32,''," + uid(post + ':comment:', 'intDiv(number-32,32)') + ')'
    created = clock + '+toIntervalDay(6)+toIntervalSecond(200)+toIntervalMillisecond(number)'
    session.query('hot_comments', 'INSERT INTO engagement_hot_documents ' + columns + ' SELECT ' + comment_id
        + ",a.username,'comments',concat('{\"text\":\"Synthetic comment\",\"parent_id\":',toJSONString(" + parent + "),'}'),"
        + q(post) + ',[],' + created + ',' + created + ",0,'none','',a.username FROM numbers(50000) n INNER JOIN "
        'engagement_hot_actors a ON a.idx=toUInt32(number%' + str(plan['actors']) + ')')
    direct = str(plan['post_reactions'])
    target = uid(post + ':comment:', '(number-' + direct + ')%50000')
    actor = 'if(number<' + direct + ',number,(intDiv(number-' + direct + ',50000)+(number-' + direct + ')%50000+1)%' + str(plan['actors']) + ')'
    created = clock + '+toIntervalDay(6)+toIntervalSecond(400)+toIntervalMillisecond(number)'
    session.query('hot_reactions', 'INSERT INTO engagement_hot_documents ' + columns + ' SELECT '
        + uid(post + ':reaction:', 'number') + ",a.username,'reactions',if(number<" + direct
        + ",'{\"type\":\"like\"}',concat('{\"type\":\"like\",\"target_id\":',toJSONString(" + target + "),'}'))," + q(post)
        + ',[],' + created + ',' + created + ",0,'none','',a.username FROM numbers(" + str(plan['reactions'])
        + ') n INNER JOIN engagement_hot_actors a ON a.idx=toUInt32(' + actor + ')')
    session.query('hot_current_links', 'INSERT INTO engagement_hot_links (doc_id,group_id,created_at,updated_at,deleted) '
        'SELECT doc_id,' + q(DISCOVER) + ',created_at,updated_at,0 FROM engagement_hot_documents')
    try:
        session.query('hot_delivery_events', 'INSERT INTO content_events SELECT ' + q(post)
            + ",'posts',a.username,'feed','delivery',''," + clock + '+toIntervalDay(2*intDiv(number,' + str(plan['actors'])
            + '))+toIntervalMillisecond(number%' + str(plan['actors']) + ') FROM numbers(' + str(plan['views'])
            + ') n INNER JOIN engagement_hot_actors a ON a.idx=toUInt32(number%' + str(plan['actors']) + ')')
        plan['views_seed_outcome'] = 'PASS'
    except Exception as error:
        from arm_f_failure import details
        plan['views_seed_outcome'] = 'STOP'
        save(output / 'views-seed-stop.json', details(error))
    for table in ('engagement_hot_documents', 'engagement_hot_links'):
        session.query('hot_settle_' + table, 'OPTIMIZE TABLE ' + table + ' FINAL', setup_seconds=900)
    plan['projection'] = engagement_projection.install(session, 'engagement_hot_documents', output)
    session.query('hot_freeze_links', 'SYSTEM STOP MERGES engagement_hot_links')
    counts, _ = session.rows('hot_seed_census', "SELECT collection_name,count() AS n,uniqExact(doc_id) AS unique_ids "
        'FROM engagement_hot_documents GROUP BY collection_name ORDER BY collection_name')
    actual = {row['collection_name']: int(row['n']) for row in counts}
    if actual != {'posts': 1, 'comments': 50000, 'reactions': plan['reactions']} or any(int(row['n']) != int(row['unique_ids']) for row in counts):
        raise ValueError('hot canonical fixture cardinality/identity mismatch')
    plan['census'] = counts
    plan['id_control'] = str(uuid.UUID(hashlib.md5((post + ':comment:0').encode()).hexdigest()))
    native_id, _ = session.rows('hot_id_control', 'SELECT ' + uid(post + ':comment:', '0') + ' AS id')
    if native_id[0]['id'] != plan['id_control']:
        raise ValueError('native fixture identity expression differs from independent Python control')
    save(output / 'seeded.json', plan)
    return plan
