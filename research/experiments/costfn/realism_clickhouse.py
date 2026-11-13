"""Isolated ClickHouse finished-record validation; no node or generator calls."""
import json
import os
from pathlib import Path
import subprocess
import re
import threading
import time

from realism_contract import sha

SOURCE_AT_IMPORT=sha(__file__)
VERSION='24.8.14.39'
IMAGE='clickhouse/clickhouse-server:24.8.14.39@sha256:1ffa82edee000a42c09313bd9f1293d94c570aee74babc1b3ca9983a35fa597b'
SETTINGS={
    'max_memory_usage':'2000000000','max_threads':'4','max_insert_threads':'4',
    'max_bytes_before_external_group_by':'268435456',
    'max_bytes_before_external_sort':'268435456',
    'max_temporary_data_on_disk_size_for_query':'100000000000',
    'max_execution_time':'5400','join_algorithm':'grace_hash',
    'grace_hash_join_initial_buckets':'16','join_use_nulls':'1',
    'join_default_strictness':'ALL','count_distinct_implementation':'uniqExact',
    'output_format_json_quote_64bit_integers':'0',
}
IMPORT_ORDERS={'documents':'doc_id,author_key,updated_at,deleted',
    'content_events':'doc_id,reader_key,surface,seen_at','doc_groups':'doc_id,group_id',
    'group_members':'group_id,member_key','cohorts':'cell,reader_key,target_key',
    'app_contracts':'tuple()','group_contracts':'tuple()','population':'tuple()','users':'tuple()'}


def atomic_json(path,value):
    temp=path.with_suffix('.tmp')
    if temp.is_symlink():
        raise ValueError('checkpoint temporary file must not be a symlink')
    if temp.exists():
        temp.rename(temp.with_name(temp.name+f'.interrupted-{time.time_ns()}'))
    with temp.open('x') as stream:
        json.dump(value,stream,sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    temp.replace(path)
    fd=os.open(path.parent,os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
CANONICAL_DOCUMENTS_SQL=('SELECT * EXCEPT rn FROM (SELECT *,row_number() OVER '
    '(PARTITION BY doc_id,author_key ORDER BY updated_at DESC,deleted DESC) AS rn '
    'FROM documents) WHERE rn=1 AND deleted=0')
DELIVERY_WINDOW_SQL=("SELECT count()=0 FROM (SELECT seen_at,lagInFrame(toNullable(seen_at),1,NULL) "
    "OVER (PARTITION BY doc_id,reader_key,surface ORDER BY seen_at ROWS BETWEEN UNBOUNDED PRECEDING "
    "AND CURRENT ROW) AS previous FROM content_events) WHERE isNotNull(previous) "
    "AND seen_at<previous+INTERVAL 24 HOUR")


def literal(value):
    return "'"+str(value).replace('\\','\\\\').replace("'","\\'")+"'"


class ClickHouse:
    """One owned scratch database; native local binary or networkless Docker.

    Explicit databases survive clickhouse-local invocations; its implicit
    _local database does not. No ports, shared server, credentials or fallback.
    """
    def __init__(self,work,dataset):
        self.work=Path(work).resolve()
        self.dataset=Path(dataset).resolve()
        self.container=None
        self.prefix=[os.environ.get('REALISM_CLICKHOUSE_BINARY','clickhouse'),'local']
        self.path=str(self.work/'clickhouse')
        self.input=self.dataset
        if os.environ.get('REALISM_CLICKHOUSE_DOCKER')=='1':
            self.docker=['docker']
            if os.environ.get('REALISM_DOCKER_CONTEXT'):
                self.docker+=['--context',os.environ['REALISM_DOCKER_CONTEXT']]
            command=self.docker+['run','--detach','--network','none','--memory','3g','--cpus','4',
                '--user',f'{os.getuid()}:{os.getgid()}','--workdir','/work','--env','HOME=/work',
                '--mount',f'type=bind,source={self.work},target=/work',
                '--mount',f'type=bind,source={self.dataset},target=/input,readonly',
                '--entrypoint','sleep',IMAGE,'infinity']
            self.container=subprocess.check_output(command,text=True,timeout=90).strip()
            self.prefix=self.docker+['exec',self.container,'clickhouse','local']
            self.path='/work/clickhouse'
            self.input=Path('/input')
        try:
            actual=self.query('SELECT version()',initialize=True)[0][0]
            if actual!=VERSION:
                raise ValueError(f'ClickHouse {VERSION} required, found {actual}')
            self.query('CREATE DATABASE IF NOT EXISTS validation',initialize=True)
        except BaseException:
            self.close()
            raise

    def query(self,sql,*,initialize=False):
        command=self.prefix+['--path',self.path,'--multiquery','--format','JSONCompact',
                             '--progress','err','--query',('' if initialize else 'USE validation; ')+sql]
        settings=dict(SETTINGS)
        if os.environ.get('REALISM_PREP_DEADLINE'):
            available=int(float(os.environ['REALISM_PREP_DEADLINE'])-time.time())-60
            if available<1:
                raise RuntimeError('approved preparation deadline has no query time remaining')
            settings['max_execution_time']=str(min(int(settings['max_execution_time']),available))
        for name,value in settings.items():
            command+=['--'+name,value]
        start=time.monotonic()
        # Append errors and query statistics, not row content or dataset credentials.
        with (self.work/'clickhouse.log').open('a') as log:
            log.write(f'[clickhouse-validator] query start operation={sql.split()[0]}\n')
            log.flush()
            # Drain progress immediately, not only after subprocess.run returns.
            # Temporary stdout contains small query results, never streamed logs.
            import tempfile
            with tempfile.TemporaryFile(mode='w+',dir=self.work) as output:
                process=subprocess.Popen(command,stdout=output,stderr=subprocess.PIPE,text=True)
                errors=[]
                def drain():
                    line=''
                    last=0
                    while char:=process.stderr.read(1):
                        if char not in '\r\n':
                            line=(line+char)[-4096:]
                            continue
                        clean=re.sub(r'\x1b\[[0-9;]*[A-Za-z]','',line).strip()
                        line=''
                        if not clean:
                            continue
                        if 'Progress:' in clean:
                            if time.monotonic()-last>=15:
                                label=sql.split()[2] if sql.startswith('CREATE TABLE ') else sql.split()[0]
                                message=f'[clickhouse-validator] read operation={label} '+clean
                                print(message,flush=True)
                                log.write(message+'\n')
                                log.flush()
                                last=time.monotonic()
                        else:
                            errors.append(clean)
                            del errors[:-32]
                            log.write(clean+'\n')
                            log.flush()
                    if line.strip():
                        errors.append(line[-4096:])
                reader=threading.Thread(target=drain,daemon=True)
                reader.start()
                try:
                    process.wait(timeout=int(settings['max_execution_time'])+15)
                except BaseException:
                    process.kill()
                    process.wait(timeout=10)
                    raise
                finally:
                    reader.join(timeout=10)
                    if reader.is_alive():
                        raise RuntimeError('ClickHouse stderr did not drain after process exit')
                    process.stderr.close()
                if process.returncode:
                    raise RuntimeError(f'ClickHouse exit {process.returncode}: '+('\n'.join(errors))[-1200:])
                output.seek(0)
                text=output.read()
            payload=json.loads(text) if text.strip() else {}
            log.write(json.dumps({'seconds':round(time.monotonic()-start,3),
                                  'statistics':payload.get('statistics',{})})+'\n')
        return payload.get('data',[])

    def scalar(self,sql):
        return self.query(sql)[0][0]

    def table(self,name,query,order):
        self.query(f'CREATE TABLE {name} ENGINE=MergeTree ORDER BY ({order}) '
                   f'SETTINGS allow_nullable_key=1 AS {query}')

    def bind_imports(self,manifest):
        expected={'dataset_id':manifest['dataset_id'],'files':manifest['files'],
            'engine':VERSION,'source':SOURCE_AT_IMPORT,
            'entrypoint':sha(Path(__file__).with_name('realism_validate.py'))}
        path=self.work/'import-context.json'
        if path.is_symlink():
            raise ValueError('import context must not be a symlink')
        if path.exists():
            if json.loads(path.read_text())!=expected:
                raise ValueError('stale input/source/engine import context; refuse reuse')
        else:
            if self.scalar("SELECT count() FROM system.tables WHERE database='validation'"):
                raise ValueError('unbound existing tables; preserve, do not adopt')
            atomic_json(path,expected)
        self.context=expected
        imports=self.work/'imports'
        if imports.is_symlink():
            raise ValueError('import marker directory must not be a symlink')
        imports.mkdir(exist_ok=True)

    def import_table(self,name,info):
        if name not in IMPORT_ORDERS or info!=self.context['files'].get(name):
            raise ValueError('undeclared import')
        marker=self.work/'imports'/f'{name}.json'
        if marker.is_symlink():
            raise ValueError('import marker must not be a symlink')
        uuid_sql=f"SELECT toString(uuid) FROM system.tables WHERE database='validation' AND name={literal(name)}"
        if marker.exists():
            proof=json.loads(marker.read_text())
            uuids=self.query(uuid_sql)
            if (proof.get('file')!=info or not uuids or proof.get('uuid')!=uuids[0][0]
                    or self.scalar(f'SELECT count() FROM {name}')!=info['rows']):
                raise ValueError('completed import no longer matches its marker: '+name)
            print(f'[clickhouse-validator] reuse import={name} rows={info["rows"]}',flush=True)
            return
        if self.query(uuid_sql):
            # An unmarked result might be partial even if its row count looks
            # plausible. Preserve it and retry the whole table, never OFFSET.
            interrupted=f'interrupted_{name}_{time.time_ns()}'
            self.query(f'RENAME TABLE {name} TO {interrupted}')
            print(f'[clickhouse-validator] preserved unmarked import={name} as={interrupted}',flush=True)
        self.table(name,f'SELECT * FROM file({literal(self.input/info["name"])},Parquet)',IMPORT_ORDERS[name])
        actual=self.scalar(f'SELECT count() FROM {name}')
        if actual!=info['rows']:
            raise ValueError('ClickHouse import row count mismatch: '+name)
        atomic_json(marker,{'file':info,'uuid':self.query(uuid_sql)[0][0]})
        print(f'[clickhouse-validator] import complete table={name} rows={actual}',flush=True)

    def close(self):
        if self.container:
            peak=subprocess.run(self.docker+['exec',self.container,'cat','/sys/fs/cgroup/memory.peak'],
                                capture_output=True,text=True,timeout=10)
            if peak.returncode==0 and peak.stdout.strip().isdigit() and self.work.is_dir():
                with (self.work/'clickhouse.log').open('a') as log:
                    log.write(json.dumps({'container_peak_memory_bytes':int(peak.stdout)})+'\n')
            subprocess.run(self.docker+['rm','--force',self.container],check=True,
                           capture_output=True,text=True,timeout=30)
            self.container=None


def summary(db,query):
    # DuckDB median averages the middle pair; quantile_disc(.99) selects
    # ceil(.99*n). ClickHouse quantileExact(.99) has different rank semantics.
    row=db.query('WITH ordered AS (SELECT v,row_number() OVER(ORDER BY v) AS r,'
        'count() OVER() AS n FROM ('+query+')) '
        'SELECT count(),sum(v),avg(v),'
        'avgIf(v,r=floor((n+1)/2) OR r=ceil((n+1)/2)),'
        'maxIf(v,r=ceil(n*.99)),max(v),'
        'sumIf(v,r>n-ceil(n*.01))/nullIf(sum(v),0) FROM ordered')[0]
    names=('total','mean','median','p99','max','top_1pct_share')
    return dict(zip(names,row[1:] if row[0] else [None]*6))


def inspect(db,manifest,progress):
    spec=manifest['contract']
    n,targets=spec['recipe']['accounts'],spec['targets']
    checks={}

    def stage(name):
        progress['stage']=name
        print('[clickhouse-validator] stage='+name,flush=True)

    def check(name,sql):
        stage(name)
        checks[name]=bool(db.scalar(sql))

    db.bind_imports(manifest)
    for table,info in manifest['files'].items():
        stage('import_'+table)
        db.import_table(table,info)
    for derived in ('current_docs','originals','exposures','post_metrics','graph','account_metrics','candidate_metrics'):
        db.query(f'DROP TABLE IF EXISTS {derived}')
    stage('canonical_documents')
    db.table('current_docs',CANONICAL_DOCUMENTS_SQL,'doc_id,author_key')
    db.table('originals',"SELECT * FROM current_docs WHERE collection_name='posts' "
             "AND ad_mode='none' AND NOT has(tags,'ad')",'doc_id')

    check('registered_population',f'SELECT count()={n} AND uniqExact(username)={n} FROM users')
    check('latent_population',f'SELECT count()={n} AND uniqExact(p.username)={n} '
          'AND countIf(isNull(u.username))=0 FROM population p LEFT JOIN users u ON p.username=u.username')
    check('document_identity','SELECT count()=uniqExact(doc_id) FROM documents')
    check('document_actors_exist','SELECT count()=0 FROM documents d LEFT ANTI JOIN users u ON d.author_key=u.username')
    check('document_times',"SELECT count()=0 FROM documents d INNER JOIN users u ON d.author_key=u.username "
          "WHERE d.created_at<u.created_at OR d.updated_at<d.created_at OR d.updated_at>toDateTime64('2026-11-10 12:00:00',6,'UTC')")
    check('links_resolve','SELECT count()=0 FROM doc_groups g LEFT ANTI JOIN documents d ON g.doc_id=d.doc_id')
    check('link_times','SELECT count()=0 FROM doc_groups g INNER JOIN documents d ON g.doc_id=d.doc_id '
          'WHERE g.created_at<d.created_at OR g.updated_at<g.created_at')
    check('link_groups_resolve',"SELECT count()=0 FROM doc_groups g LEFT ANTI JOIN group_contracts c "
          "ON g.group_id=c.group_id WHERE g.group_id!='api.localhost/groups/web10/discover'")
    check('public_original_links',"SELECT count()=0 FROM originals p LEFT JOIN "
          "(SELECT DISTINCT doc_id FROM doc_groups WHERE group_id='api.localhost/groups/web10/discover') g ON p.doc_id=g.doc_id "
          "LEFT JOIN (SELECT DISTINCT doc_id,group_id FROM doc_groups) h ON p.doc_id=h.doc_id "
          "AND h.group_id=concat('api.localhost/groups/users/',p.author_key,'/followers') "
          'WHERE isNull(g.doc_id) OR isNull(h.doc_id)')
    check('engagement_targets',"SELECT count()=0 FROM current_docs d LEFT JOIN originals p ON d.ref_value=p.doc_id "
          "WHERE d.collection_name IN ('reactions','comments') AND (isNull(p.doc_id) OR d.created_at<p.created_at "
          "OR (d.collection_name='comments' AND JSONExtractString(d.body,'post_id')!=p.doc_id))")
    check('deliveries_resolve',"SELECT count()=0 FROM content_events e LEFT JOIN originals p ON e.doc_id=p.doc_id "
          "LEFT JOIN users u ON e.reader_key=u.username WHERE isNull(p.doc_id) OR isNull(u.username) "
          "OR e.service!='posts' OR e.event_type!='delivery' OR e.seen_at<p.created_at "
          "OR e.seen_at>toDateTime64('2026-11-10 12:00:00',6,'UTC')")
    check('delivery_window',DELIVERY_WINDOW_SQL)
    stage('distinct_exposures')
    db.table('exposures','SELECT doc_id,reader_key,min(seen_at) AS first_seen '
             'FROM content_events GROUP BY doc_id,reader_key','doc_id,reader_key')
    check('engagement_exposure_causality',"SELECT count()=0 FROM current_docs d LEFT JOIN exposures e "
          "ON d.ref_value=e.doc_id AND d.author_key=e.reader_key WHERE d.collection_name IN ('reactions','comments') "
          'AND (isNull(e.doc_id) OR d.created_at<e.first_seen)')
    check('unique_likes',"SELECT count()=uniqExact(tuple(author_key,ref_value)) FROM current_docs WHERE collection_name='reactions'")
    check('comment_like_causality',"SELECT count()=0 FROM current_docs c LEFT JOIN "
          "(SELECT * FROM current_docs WHERE collection_name='reactions') l "
          "ON c.author_key=l.author_key AND c.ref_value=l.ref_value WHERE c.collection_name='comments' "
          'AND (isNull(l.doc_id) OR c.created_at<l.created_at)')
    stage('post_metrics')
    db.table('post_metrics',"WITH l AS (SELECT ref_value,count() AS likes FROM current_docs WHERE collection_name='reactions' GROUP BY ref_value), "
        "c AS (SELECT ref_value,count() AS comments FROM current_docs WHERE collection_name='comments' GROUP BY ref_value), "
        'v AS (SELECT doc_id,count() AS impressions FROM content_events GROUP BY doc_id), '
        'r AS (SELECT doc_id,count() AS reach FROM exposures GROUP BY doc_id) '
        'SELECT p.doc_id AS doc_id,p.author_key AS author_key,coalesce(l.likes,0) AS likes,coalesce(c.comments,0) AS comments,'
        'coalesce(v.impressions,0) AS impressions,coalesce(r.reach,0) AS reach FROM originals p '
        'LEFT JOIN l ON l.ref_value=p.doc_id LEFT JOIN c ON c.ref_value=p.doc_id '
        'LEFT JOIN v ON v.doc_id=p.doc_id LEFT JOIN r ON r.doc_id=p.doc_id','doc_id')
    stage('closed_graph')
    db.table('graph',"SELECT member_key AS reader_key,extract(group_id,'/users/([^/]+)/followers$') AS target_key "
             "FROM group_members WHERE role='member' AND group_id LIKE '%/followers'",'reader_key,target_key')
    check('closed_simple_graph','SELECT count()=uniqExact(tuple(reader_key,target_key)) '
          'AND countIf(isNull(a.username) OR isNull(b.username) OR reader_key=target_key)=0 '
          'FROM graph LEFT JOIN users a ON a.username=reader_key LEFT JOIN users b ON b.username=target_key')
    stage('account_metrics')
    db.table('account_metrics',"SELECT p.*,coalesce(o.posts,0) AS posts,coalesce(i.followers,0) AS followers, "
        'coalesce(f.following,0) AS following,coalesce(v.impressions,0) AS impressions,coalesce(l.given,0) AS likes_given '
        'FROM population p LEFT JOIN (SELECT author_key,count() AS posts FROM originals GROUP BY author_key) o ON o.author_key=p.username '
        'LEFT JOIN (SELECT target_key,count() AS followers FROM graph GROUP BY target_key) i ON i.target_key=p.username '
        'LEFT JOIN (SELECT reader_key,count() AS following FROM graph GROUP BY reader_key) f ON f.reader_key=p.username '
        'LEFT JOIN (SELECT author_key,sum(impressions) AS impressions FROM post_metrics GROUP BY author_key) v ON v.author_key=p.username '
        "LEFT JOIN (SELECT author_key,count() AS given FROM current_docs WHERE collection_name='reactions' GROUP BY author_key) l ON l.author_key=p.username",'username')
    stage('statistical_summaries')
    nonposting=db.scalar('SELECT countIf(posts=0)/count() FROM account_metrics')
    shares=db.query('SELECT sumIf(posts,r<='+str(n//100)+')/sum(posts),'
        f'sumIf(posts,r>{n//100} AND r<={n//10})/sum(posts),sumIf(posts,r>{n//10})/sum(posts) '
        'FROM (SELECT posts,row_number() OVER(ORDER BY posts DESC) AS r FROM account_metrics)')[0]
    checks['authorship_nonposting']=abs(nonposting-.85)<=spec['tolerances']['nonposting_absolute']
    checks['authorship_shares']=all(abs(a-b)<=.05 for a,b in zip(shares,[.747,.240,.013]))
    metrics={key:summary(db,f'SELECT {key} AS v FROM account_metrics') for key in ('posts','followers','following','impressions','likes_given')}
    per_post={key:summary(db,f'SELECT {key} AS v FROM post_metrics') for key in ('likes','comments','impressions','reach')}
    totals={table:info['rows'] for table,info in manifest['files'].items()}
    checks['post_total']=metrics['posts']['total']==targets['posts']
    checks['like_conservation']=per_post['likes']['total']==metrics['likes_given']['total']==targets['likes']
    checks['comment_conservation']=per_post['comments']['total']==targets['comments']==db.scalar("SELECT count() FROM current_docs WHERE collection_name='comments'")
    checks['impression_conservation']=per_post['impressions']['total']==targets['impressions']==totals['content_events']
    checks['graph_conservation']=metrics['followers']['total']==metrics['following']['total']==db.scalar('SELECT count() FROM graph')
    checks['following_mean']=abs(metrics['following']['mean']-150)<=150*.15
    checks['following_median']=70<=metrics['following']['median']<=80
    checks['followers_median']=10<=metrics['followers']['median']<=100
    checks['like_marginals']=per_post['likes']['median']==0 and abs(per_post['likes']['mean']-16)<.01
    check('like_zero_fraction','SELECT abs(countIf(likes=0)/count()-.8871)<=.001 FROM post_metrics')
    checks['comment_ratio']=abs(per_post['comments']['total']/per_post['likes']['total']-.3)<.001
    checks['impression_median']=per_post['impressions']['median']==50
    checks['viral_head']=per_post['impressions']['max']==1000000
    checks['eligible_reach']=db.scalar(f'SELECT count() FROM post_metrics WHERE reach>impressions OR reach>{n-1} OR likes>reach')==0
    concentration={}
    for key,fraction,target in [('impressions',.037,.93),('likes',.0016,.5)]:
        share=db.scalar(f'SELECT sumIf(v,r<=ceil(n*{fraction}))/sum(v) FROM '
            f'(SELECT {key} AS v,row_number() OVER(ORDER BY {key} DESC) AS r,count() OVER() AS n FROM post_metrics)')
        concentration[key]=share
        checks[key+'_concentration']=abs(share-target)<=.05
    correlations=dict(zip(('activity_posts','popularity_followers','followers_impressions','activity_likes_given'),
        db.query('SELECT corr(activity,posts),corr(popularity,followers),corr(followers,impressions),corr(activity,likes_given) FROM account_metrics')[0]))
    checks['joint_correlations']=all(v is not None and v>0 for v in correlations.values())
    checks['no_dormant_viral_author']=db.scalar('SELECT count() FROM account_metrics WHERE posts=0 AND impressions>0')==0
    checks['prolific_time_span']=db.scalar('SELECT count() FROM (SELECT author_key FROM originals GROUP BY author_key '
        'HAVING count()>=100 AND max(created_at)<min(created_at)+INTERVAL 30 DAY)')==0
    checks['node_ads']=db.scalar("SELECT count() FROM current_docs d LEFT SEMI JOIN doc_groups g ON d.doc_id=g.doc_id "
        "AND g.group_id='api.localhost/groups/web10/discover' WHERE has(d.tags,'ad') AND has(d.tags,'node_ad') "
        "AND JSONExtractString(d.body,'status')='active'")==300
    checks['profiles_not_originals']=db.scalar("SELECT count() FROM current_docs WHERE collection_name='profile'")==n
    check('cohort_references','SELECT count()=0 FROM cohorts c LEFT JOIN users a ON c.reader_key=a.username '
          'LEFT JOIN users b ON c.target_key=b.username WHERE isNull(a.username) OR isNull(b.username) OR c.reader_key=c.target_key')
    stage('cohort_metrics')
    # Preserve duplicate cohort multiplicities but do not expand every reader
    # to every post. One exact per-author count is sufficient for this reduction.
    db.table('candidate_metrics','SELECT c.cell AS cell,c.reader_key AS reader_key,uniqExact(c.target_key) AS k,'
        'uniqExactIf(c.target_key,coalesce(p.posts,0)>0) AS active_authors,sum(coalesce(p.posts,0)) AS candidate_posts '
        'FROM cohorts c LEFT JOIN (SELECT author_key,count() AS posts FROM originals GROUP BY author_key) p '
        'ON p.author_key=c.target_key GROUP BY c.cell,c.reader_key','cell,reader_key')
    cells={}
    for k in (10,20,100,1000):
        for locality in ('hot','dispersed'):
            cell=f'{k}-{locality}'
            rows=db.query(f'SELECT k,active_authors,candidate_posts FROM candidate_metrics WHERE cell={literal(cell)}')
            checks['cohort_'+cell]=len(rows)==spec['recipe']['readers'] and all(r[0]==k and r[2]>0 for r in rows)
            ordinary=db.query(f'SELECT active_authors,candidate_posts FROM candidate_metrics WHERE cell={literal(cell)} '
                              f'AND reader_key!={literal(manifest["readers"][0])}')
            cells[cell]={'readers':len(rows),'nonempty_readers':sum(r[2]>0 for r in rows),
                'active_authors':summary(db,f'SELECT active_authors AS v FROM candidate_metrics WHERE cell={literal(cell)}'),
                'candidate_posts':summary(db,f'SELECT candidate_posts AS v FROM candidate_metrics WHERE cell={literal(cell)}'),
                'ordinary_readers':{'count':len(manifest['readers'][1:]),'nonempty':sum(v[1]>0 for v in ordinary),
                    'active_authors_min':min(v[0] for v in ordinary),'candidate_posts_min':min(v[1] for v in ordinary)},
                'viral_probe_reader':manifest['readers'][0]}
    selected=f'{spec["recipe"]["follow"]}-{spec["recipe"]["locality"]}'
    check('selected_cohort_matches_graph',"SELECT count()=0 FROM ("
        "(SELECT reader_key,target_key FROM graph WHERE reader_key IN (SELECT reader_key FROM cohorts) "
        f"EXCEPT DISTINCT SELECT reader_key,target_key FROM cohorts WHERE cell={literal(selected)}) UNION ALL "
        f"(SELECT reader_key,target_key FROM cohorts WHERE cell={literal(selected)} EXCEPT DISTINCT SELECT reader_key,target_key FROM graph))")
    check('viral_probe_in_selected_feed','SELECT count()>0 FROM cohorts c INNER JOIN originals p ON c.target_key=p.author_key '
          f'INNER JOIN post_metrics m ON m.doc_id=p.doc_id WHERE c.cell={literal(selected)} AND m.impressions=1000000')
    return {'checks':checks,'complete':all(checks.values()),'accounts':n,'tables':totals,
        'authorship':{'nonposting':nonposting,'shares_top1_next9_bottom90':shares,'top10_derived':sum(shares[:2])},
        'per_account':metrics,'per_post':per_post,'concentration':concentration,'correlations':correlations,
        'cells':cells,'arithmetic':spec['arithmetic'],
        'scope':'Finished synthetic records, not node/browser performance or private/lifecycle acceptance'}
