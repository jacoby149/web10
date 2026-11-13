"""Isolated ClickHouse finished-record validation; no node or generator calls."""
import ast
import hashlib
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

# One reviewed predecessor, not a general source-drift waiver. Its original
# context/markers stay immutable; new receipts still pin the executing source.
PREVIOUS_IMPORT_SOURCE='b37cc2c2a5c18f486bf050e142c3d13087819766b6b7546118fea881fc42e7a6'
PREVIOUS_ENTRYPOINT='67d4491624fbb7be5d1e7a465747f72fea584420b297fcf673c6ef15c58cc84f'
PREVIOUS_IMPORT_SEMANTICS='65f6249a22d65f23a168e355939cb71da12bdf3eff0c994fc3b8224ac96d27fd'
COMPATIBLE_IMPORT_PAIRS=((PREVIOUS_IMPORT_SOURCE,PREVIOUS_ENTRYPOINT),
    ('568ff13b69c76f9ab8fe938520ac341132c822649acf8b0ebdd0cc479c025f58',
     '64e17e67f26c9874ed656a92ab61921a910c8f622881f90fb9b939edd5a67500'))

# Conservative worst-case per-row sparse-hash build metadata for the pinned
# engine (pointer + cell + hash value + allocation padding), on top of the
# exact projected string bytes and fixed column sizes. A host-measured
# calibration receipt (realism_calibration.py, Digital Ocean only) may lower
# it with its own margin; it can never raise it, and any refused measurement
# leaves this default in force with the disk-capable grace_hash retained.
BUILD_ROW_OVERHEAD=208
CALIBRATION_RECEIPT='build-calibration.json'
KEY_BYTES=64  # 36-char doc-like + 30-char username-like + DateTime64(6)


def calibration_overhead(receipt,profile,default=BUILD_ROW_OVERHEAD):
    """Measured per-row build metadata, or None when the receipt is stale.

    Any problem reading or comparing the receipt refuses it; the conservative
    default then stays in force.
    """
    try:
        valid=(type(receipt) is dict and receipt.get('engine')==VERSION
            and receipt.get('profile')==profile
            and receipt.get('calibration_source')==sha(Path(__file__).with_name('realism_calibration.py'))
            and type(receipt.get('rows')) is int and receipt['rows']>=10_000_000
            and type(receipt.get('overhead')) is int and 0<receipt['overhead']<default)
    except Exception:
        return None
    return receipt['overhead'] if valid else None


def join_admission(payloads,budget):
    """Exact build-payload admission; one settings dict or the empty default."""
    if any(type(p) is not int or p<0 for p in payloads) or sum(payloads)>budget:
        return {}
    return {'join_algorithm':'hash'}


def import_semantics():
    nodes=[]
    for node in ast.parse(Path(__file__).read_text()).body:
        if isinstance(node,ast.Assign) and any(isinstance(x,ast.Name) and x.id in ('VERSION','IMPORT_ORDERS') for x in node.targets):
            nodes.append(node)
        if isinstance(node,ast.FunctionDef) and node.name=='literal':
            nodes.append(node)
        if isinstance(node,ast.ClassDef) and node.name=='ClickHouse':
            nodes.extend(m for m in node.body if isinstance(m,ast.FunctionDef) and m.name in ('table','import_table'))
    return hashlib.sha256('\n'.join(ast.dump(n,include_attributes=False) for n in nodes).encode()).hexdigest()


def resource_settings():
    profile=os.environ.get('REALISM_CLICKHOUSE_PROFILE','bounded')
    if profile not in ('bounded','performance'):
        raise ValueError('unknown ClickHouse validation resource profile')
    settings=dict(SETTINGS)
    if profile=='performance':
        settings.update(max_memory_usage=str(22*1024**3),max_execution_time='14400')
    return profile,settings


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
        self.profile,self.settings=resource_settings()
        self.container=None
        self.prefix=[os.environ.get('REALISM_CLICKHOUSE_BINARY','clickhouse'),'local']
        self.path=str(self.work/'clickhouse')
        self.input=self.dataset
        if os.environ.get('REALISM_CLICKHOUSE_DOCKER')=='1':
            self.docker=['docker']
            if os.environ.get('REALISM_DOCKER_CONTEXT'):
                self.docker+=['--context',os.environ['REALISM_DOCKER_CONTEXT']]
            command=self.docker+['run','--detach','--network','none','--memory',
                '28g' if self.profile=='performance' else '3g','--cpus','4',
                '--user',f'{os.getuid()}:{os.getgid()}','--workdir','/work','--env','HOME=/work',
                '--mount',f'type=bind,source={self.work},target=/work',
                '--mount',f'type=bind,source={self.dataset},target=/input,readonly',
                '--entrypoint','sleep',IMAGE,'infinity']
            self.container=subprocess.check_output(command,text=True,timeout=90).strip()
            self.prefix=self.docker+['exec',self.container,'clickhouse','local']
            self.path='/work/clickhouse'
            self.input=Path('/input')
        if self.profile=='performance':
            # clickhouse-local's aggregate tracker is separate from its query
            # setting. Native process RSS is independently bounded by systemd.
            config=self.work/'performance-config.xml'
            if config.is_symlink():
                self.close()
                raise ValueError('resource config must not be a symlink')
            config.write_text('<clickhouse><max_server_memory_usage>'+str(22*1024**3)+
                '</max_server_memory_usage><logger><level>information</level>'+
                '<console>true</console></logger></clickhouse>')
            self.prefix+=['--config-file',str(config) if not self.container else '/work/'+config.name]
        try:
            actual=self.query('SELECT version()',initialize=True)[0][0]
            if actual!=VERSION:
                raise ValueError(f'ClickHouse {VERSION} required, found {actual}')
            self.query('CREATE DATABASE IF NOT EXISTS validation',initialize=True)
        except BaseException:
            self.close()
            raise

    def query(self,sql,*,initialize=False,settings_override=None):
        command=self.prefix+['--path',self.path,'--multiquery','--format','JSONCompact',
                             '--progress','err','--query',('' if initialize else 'USE validation; ')+sql]
        settings=dict(self.settings)
        if settings_override:
            settings.update(settings_override)
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
                    last_internal=0
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
                                message=f'[clickhouse-validator] read operation={label} elapsed_seconds={time.monotonic()-start:.1f} '+clean
                                print(message,flush=True)
                                log.write(message+'\n')
                                log.flush()
                                last=time.monotonic()
                        else:
                            errors.append(clean)
                            del errors[:-32]
                            log.write(clean+'\n')
                            log.flush()
                            if ('GraceHashJoin:' in clean or 'Aggregat' in clean) and time.monotonic()-last_internal>=15:
                                print(f'[clickhouse-validator] internal elapsed_seconds={time.monotonic()-start:.1f} '+clean,flush=True)
                                last_internal=time.monotonic()
                    if line.strip():
                        errors.append(line[-4096:])
                        log.write(line[-4096:]+'\n')
                        log.flush()
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

    def scalar(self,sql,*,settings_override=None):
        return self.query(sql,settings_override=settings_override)[0][0]

    def report_query(self,sql,settings=None):
        if getattr(self,'checkpoints',None) is not None:
            return self.checkpoints.read(sql,settings)
        return self.query(sql,settings_override=settings)

    def derived(self,name,query,order):
        return self.checkpoints.derived(name,query,order)

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
            recorded=json.loads(path.read_text())
            compatible=[{**expected,'source':source,'entrypoint':entrypoint}
                for source,entrypoint in COMPATIBLE_IMPORT_PAIRS]
            allowed=(self.profile=='performance' and os.environ.get('REALISM_CLICKHOUSE_REUSE_WORK')
                and recorded in compatible and import_semantics()==PREVIOUS_IMPORT_SEMANTICS)
            if recorded!=expected and not allowed:
                raise ValueError('stale input/source/engine import context; refuse reuse')
            if allowed:
                print('[clickhouse-validator] compatible predecessor imports; original lineage retained',flush=True)
            expected=recorded
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
    row=db.report_query('WITH ordered AS (SELECT v,row_number() OVER(ORDER BY v) AS r,'
        'count() OVER() AS n FROM ('+query+')) '
        'SELECT count(),sum(v),avg(v),'
        'avgIf(v,r=floor((n+1)/2) OR r=ceil((n+1)/2)),'
        'maxIf(v,r=ceil(n*.99)),max(v),'
        'sumIf(v,r>n-ceil(n*.01))/nullIf(sum(v),0) FROM ordered')[0]
    names=('total','mean','median','p99','max','top_1pct_share')
    return dict(zip(names,row[1:] if row[0] else [None]*6))


def inspect(db,manifest,progress,*,resume=False):
    from realism_checkpoints import Checkpoints
    spec=manifest['contract']
    n,targets=spec['recipe']['accounts'],spec['targets']
    started=time.monotonic()

    def stage(name):
        progress['stage']=name
        print(f'[clickhouse-validator] stage={name} elapsed_seconds={time.monotonic()-started:.3f}',flush=True)

    # Exact join-build admission, uniform across checks (the approved policy,
    # generalized): measure the projected build payload against the real rows
    # and admit an in-memory hash build only while it fits the check's budget
    # fraction of the approved query memory; everything else retains the
    # disk-capable grace_hash. The decision binds into the verdict definition,
    # so a resume can never silently change algorithm.
    ADMISSIONS={
        'latent_population':(['SELECT sum(length(username))+count()*{x} FROM users'],3,4),
        'document_actors_exist':(['SELECT sum(length(username))+count()*{x} FROM users'],3,4),
        'document_times':(['SELECT sum(length(username))+count()*(8+{x}) FROM users'],3,4),
        'link_times':(['SELECT sum(length(doc_id))+count()*(8+{x}) FROM documents'],3,4),
        'links_resolve':(['SELECT sum(length(doc_id))+count()*{x} FROM documents'],3,4),
        'engagement_targets':(['SELECT sum(length(doc_id))+count()*(8+{x}) FROM originals'],3,4),
        'deliveries_resolve':(['SELECT sum(length(doc_id))+count()*(8+{x}) FROM originals',
            'SELECT sum(length(username))+count()*{x} FROM users'],3,4),
        'engagement_exposure_causality':(['SELECT sum(length(ref_value)+length(author_key))+count()*(8+{x}) '
            "FROM current_docs WHERE collection_name IN ('reactions','comments')"],3,4),
        'comment_like_causality':(['SELECT sum(length(author_key)+length(ref_value)+length(doc_id))+count()*(8+{x}) '
            "FROM current_docs WHERE collection_name='reactions'"],3,4),
        'closed_simple_graph':(['SELECT sum(length(username))+count()*{x} FROM users']*2,1,2),
        'cohort_references':(['SELECT sum(length(username))+count()*{x} FROM users']*2,3,4),
        'selected_cohort_matches_graph':(['SELECT max(length(reader_key))*uniqExact(reader_key)'
            '+uniqExact(reader_key)*{x} FROM cohorts'],3,4),
        'viral_probe_in_selected_feed':(['SELECT sum(length(author_key)+length(doc_id))+count()*{x} FROM originals',
            'SELECT sum(length(doc_id))+count()*(8+{x}) FROM post_metrics'],3,4),
    }
    overhead=BUILD_ROW_OVERHEAD
    calibration=db.work/CALIBRATION_RECEIPT
    if calibration.exists() and not calibration.is_symlink():
        try:
            measured=calibration_overhead(json.loads(calibration.read_text()),db.profile)
            if measured:
                overhead=measured
        except json.JSONDecodeError as error:
            print(f'[clickhouse-validator] calibration refused: {error}',flush=True)
        print(f'[clickhouse-validator] admission overhead_bytes={overhead}',flush=True)

    def admit(name):
        entry=ADMISSIONS.get(name)
        if entry is None:
            return {}
        if name in cp.denied:
            print(f'[clickhouse-validator] admission check={name} algorithm=grace_hash reason=memory-denied',flush=True)
            return {}
        templates,num,den=entry
        budget=int(db.settings['max_memory_usage'])*num//den
        payloads=[read(f'SELECT {template.format(x=overhead)}')[0][0] for template in templates]
        decision=join_admission(payloads,budget)
        print(f'[clickhouse-validator] admission check={name} payloads={payloads} budget={budget} '
            f'algorithm={decision.get("join_algorithm","grace_hash")}',flush=True)
        return decision

    def check(name,sql):
        stage(name)
        override=admit(name)
        return cp.evaluate(name,lambda:db.scalar(sql,settings_override=override),{'sql':sql,'settings':override})

    def record(name,producer,definition=None):
        stage(name)
        return cp.evaluate(name,producer,definition)

    read=db.report_query
    def scalar(sql):
        return read(sql)[0][0]

    db.bind_imports(manifest)
    for table,info in manifest['files'].items():
        stage('import_'+table)
        db.import_table(table,info)
    cp=db.checkpoints=Checkpoints(db,manifest,resume=resume)
    checks=cp.checks
    stage('canonical_documents')
    db.derived('current_docs',CANONICAL_DOCUMENTS_SQL,'doc_id,author_key')
    db.derived('originals',"SELECT * FROM current_docs WHERE collection_name='posts' "
             "AND ad_mode='none' AND NOT has(tags,'ad')",'doc_id')

    check('registered_population',f'SELECT count()={n} AND uniqExact(username)={n} FROM users')
    check('latent_population',f'SELECT count()={n} AND uniqExact(p.username)={n} '
          'AND countIf(isNull(u.username))=0 FROM population p LEFT JOIN (SELECT username FROM users) u '
          'ON p.username=u.username')
    check('document_identity','SELECT count()=uniqExact(doc_id) FROM documents')
    check('document_actors_exist','SELECT count()=0 FROM documents d LEFT ANTI JOIN (SELECT username FROM users) u '
          'ON d.author_key=u.username')
    check('document_times',"SELECT count()=0 FROM documents d INNER JOIN (SELECT username,created_at FROM users) u "
          "ON d.author_key=u.username WHERE d.created_at<u.created_at OR d.updated_at<d.created_at "
          "OR d.updated_at>toDateTime64('2026-11-10 12:00:00',6,'UTC')")
    check('links_resolve','SELECT count()=0 FROM doc_groups g LEFT ANTI JOIN (SELECT doc_id FROM documents) d '
          'ON g.doc_id=d.doc_id')
    check('link_times','SELECT count()=0 FROM doc_groups g INNER JOIN (SELECT doc_id,created_at FROM documents) d '
          'ON g.doc_id=d.doc_id WHERE g.created_at<d.created_at OR g.updated_at<g.created_at')
    check('link_groups_resolve',"SELECT count()=0 FROM doc_groups g LEFT ANTI JOIN group_contracts c "
          "ON g.group_id=c.group_id WHERE g.group_id!='api.localhost/groups/web10/discover'")
    check('public_original_links',"SELECT count()=0 FROM originals p LEFT JOIN "
          "(SELECT DISTINCT doc_id FROM doc_groups WHERE group_id='api.localhost/groups/web10/discover') g ON p.doc_id=g.doc_id "
          "LEFT JOIN (SELECT DISTINCT doc_id,group_id FROM doc_groups) h ON p.doc_id=h.doc_id "
          "AND h.group_id=concat('api.localhost/groups/users/',p.author_key,'/followers') "
          'WHERE isNull(g.doc_id) OR isNull(h.doc_id)')
    check('engagement_targets',"SELECT count()=0 FROM current_docs d LEFT JOIN (SELECT doc_id,created_at FROM originals) p "
          "ON d.ref_value=p.doc_id WHERE d.collection_name IN ('reactions','comments') AND (isNull(p.doc_id) "
          "OR d.created_at<p.created_at OR (d.collection_name='comments' AND JSONExtractString(d.body,'post_id')!=p.doc_id))")
    check('deliveries_resolve',"SELECT count()=0 FROM content_events e LEFT JOIN (SELECT doc_id,created_at FROM originals) p ON e.doc_id=p.doc_id "
          "LEFT JOIN (SELECT username FROM users) u ON e.reader_key=u.username WHERE isNull(p.doc_id) OR isNull(u.username) "
          "OR e.service!='posts' OR e.event_type!='delivery' OR e.seen_at<p.created_at "
          "OR e.seen_at>toDateTime64('2026-11-10 12:00:00',6,'UTC')")
    check('delivery_window',DELIVERY_WINDOW_SQL)
    stage('distinct_exposures')
    # One 1.6B pass serves both grains: the (doc,reader) first exposure and
    # the per-reader impression multiplicity that post_metrics used to rescan.
    db.derived('exposures','SELECT doc_id,reader_key,min(seen_at) AS first_seen,count() AS impressions '
             'FROM content_events GROUP BY doc_id,reader_key','doc_id,reader_key')
    ENGAGED="current_docs WHERE collection_name IN ('reactions','comments')"
    total_sql=f'SELECT count() FROM {ENGAGED}'
    good_sql=('SELECT count() FROM (SELECT doc_id,reader_key,first_seen FROM exposures) e '
        f'INNER JOIN (SELECT ref_value,author_key,created_at FROM {ENGAGED}) g '
        'ON e.doc_id=g.ref_value AND e.reader_key=g.author_key WHERE g.created_at>=e.first_seen')
    flip_override=admit('engagement_exposure_causality')
    def exposure_causality():
        # exposures is unique per (doc_id,reader_key), so each engagement row
        # matches at most one exposure row; the original verdict counts rows
        # with no match OR created before first_seen, exactly total-good.
        # This builds the small engagement side instead of the exposure side.
        total=read(total_sql)[0][0]
        good=read(good_sql,flip_override or None)[0][0]
        return total-good==0
    record('engagement_exposure_causality',exposure_causality,
        {'total':total_sql,'good':good_sql,'settings':flip_override})
    check('unique_likes',"SELECT count()=uniqExact(tuple(author_key,ref_value)) FROM current_docs WHERE collection_name='reactions'")
    check('comment_like_causality',"SELECT count()=0 FROM current_docs c LEFT JOIN "
          "(SELECT doc_id,author_key,ref_value,created_at FROM current_docs WHERE collection_name='reactions') l "
          "ON c.author_key=l.author_key AND c.ref_value=l.ref_value WHERE c.collection_name='comments' "
          'AND (isNull(l.doc_id) OR c.created_at<l.created_at)')
    stage('post_metrics')
    db.derived('post_metrics',"WITH l AS (SELECT ref_value,count() AS likes FROM current_docs WHERE collection_name='reactions' GROUP BY ref_value), "
        "c AS (SELECT ref_value,count() AS comments FROM current_docs WHERE collection_name='comments' GROUP BY ref_value), "
        'v AS (SELECT doc_id,sum(impressions) AS impressions FROM exposures GROUP BY doc_id), '
        'r AS (SELECT doc_id,count() AS reach FROM exposures GROUP BY doc_id) '
        'SELECT p.doc_id AS doc_id,p.author_key AS author_key,coalesce(l.likes,0) AS likes,coalesce(c.comments,0) AS comments,'
        'coalesce(v.impressions,0) AS impressions,coalesce(r.reach,0) AS reach FROM originals p '
        'LEFT JOIN l ON l.ref_value=p.doc_id LEFT JOIN c ON c.ref_value=p.doc_id '
        'LEFT JOIN v ON v.doc_id=p.doc_id LEFT JOIN r ON r.doc_id=p.doc_id','doc_id')
    stage('closed_graph')
    db.derived('graph',"SELECT member_key AS reader_key,extract(group_id,'/users/([^/]+)/followers$') AS target_key "
             "FROM group_members WHERE role='member' AND group_id LIKE '%/followers'",'reader_key,target_key')
    check('closed_simple_graph','SELECT count()=uniqExact(tuple(reader_key,target_key)) '
          'AND countIf(isNull(a.username) OR isNull(b.username) OR reader_key=target_key)=0 '
          'FROM graph LEFT JOIN (SELECT username FROM users) a ON a.username=reader_key '
          'LEFT JOIN (SELECT username FROM users) b ON b.username=target_key')
    stage('account_metrics')
    db.derived('account_metrics',"SELECT p.*,coalesce(o.posts,0) AS posts,coalesce(i.followers,0) AS followers, "
        'coalesce(f.following,0) AS following,coalesce(v.impressions,0) AS impressions,coalesce(l.given,0) AS likes_given '
        'FROM population p LEFT JOIN (SELECT author_key,count() AS posts FROM originals GROUP BY author_key) o ON o.author_key=p.username '
        'LEFT JOIN (SELECT target_key,count() AS followers FROM graph GROUP BY target_key) i ON i.target_key=p.username '
        'LEFT JOIN (SELECT reader_key,count() AS following FROM graph GROUP BY reader_key) f ON f.reader_key=p.username '
        'LEFT JOIN (SELECT author_key,sum(impressions) AS impressions FROM post_metrics GROUP BY author_key) v ON v.author_key=p.username '
        "LEFT JOIN (SELECT author_key,count() AS given FROM current_docs WHERE collection_name='reactions' GROUP BY author_key) l ON l.author_key=p.username",'username')
    stage('statistical_summaries')
    nonposting=scalar('SELECT countIf(posts=0)/count() FROM account_metrics')
    shares=read('SELECT sumIf(posts,r<='+str(n//100)+')/sum(posts),'
        f'sumIf(posts,r>{n//100} AND r<={n//10})/sum(posts),sumIf(posts,r>{n//10})/sum(posts) '
        'FROM (SELECT posts,row_number() OVER(ORDER BY posts DESC) AS r FROM account_metrics)')[0]
    record('authorship_nonposting',lambda:abs(nonposting-.85)<=spec['tolerances']['nonposting_absolute'])
    record('authorship_shares',lambda:all(abs(a-b)<=.05 for a,b in zip(shares,[.747,.240,.013])))
    metrics={key:summary(db,f'SELECT {key} AS v FROM account_metrics') for key in ('posts','followers','following','impressions','likes_given')}
    per_post={key:summary(db,f'SELECT {key} AS v FROM post_metrics') for key in ('likes','comments','impressions','reach')}
    totals={table:info['rows'] for table,info in manifest['files'].items()}
    record('post_total',lambda:metrics['posts']['total']==targets['posts'])
    record('like_conservation',lambda:per_post['likes']['total']==metrics['likes_given']['total']==targets['likes'])
    record('comment_conservation',lambda:per_post['comments']['total']==targets['comments']==scalar("SELECT count() FROM current_docs WHERE collection_name='comments'"))
    record('impression_conservation',lambda:per_post['impressions']['total']==targets['impressions']==totals['content_events'])
    record('graph_conservation',lambda:metrics['followers']['total']==metrics['following']['total']==scalar('SELECT count() FROM graph'))
    record('following_mean',lambda:abs(metrics['following']['mean']-150)<=150*.15)
    record('following_median',lambda:70<=metrics['following']['median']<=80)
    record('followers_median',lambda:10<=metrics['followers']['median']<=100)
    record('like_marginals',lambda:per_post['likes']['median']==0 and abs(per_post['likes']['mean']-16)<.01)
    check('like_zero_fraction','SELECT abs(countIf(likes=0)/count()-.8871)<=.001 FROM post_metrics')
    record('comment_ratio',lambda:abs(per_post['comments']['total']/per_post['likes']['total']-.3)<.001)
    record('impression_median',lambda:per_post['impressions']['median']==50)
    record('viral_head',lambda:per_post['impressions']['max']==1000000)
    record('eligible_reach',lambda:scalar(f'SELECT count() FROM post_metrics WHERE reach>impressions OR reach>{n-1} OR likes>reach')==0)
    concentration={}
    for key,fraction,target in [('impressions',.037,.93),('likes',.0016,.5)]:
        share=scalar(f'SELECT sumIf(v,r<=ceil(n*{fraction}))/sum(v) FROM '
            f'(SELECT {key} AS v,row_number() OVER(ORDER BY {key} DESC) AS r,count() OVER() AS n FROM post_metrics)')
        concentration[key]=share
        record(key+'_concentration',lambda:abs(share-target)<=.05)
    correlations=dict(zip(('activity_posts','popularity_followers','followers_impressions','activity_likes_given'),
        read('SELECT corr(activity,posts),corr(popularity,followers),corr(followers,impressions),corr(activity,likes_given) FROM account_metrics')[0]))
    record('joint_correlations',lambda:all(v is not None and v>0 for v in correlations.values()))
    record('no_dormant_viral_author',lambda:scalar('SELECT count() FROM account_metrics WHERE posts=0 AND impressions>0')==0)
    record('prolific_time_span',lambda:scalar('SELECT count() FROM (SELECT author_key FROM originals GROUP BY author_key '
        'HAVING count()>=100 AND max(created_at)<min(created_at)+INTERVAL 30 DAY)')==0)
    record('node_ads',lambda:scalar("SELECT count() FROM current_docs d LEFT SEMI JOIN doc_groups g ON d.doc_id=g.doc_id "
        "AND g.group_id='api.localhost/groups/web10/discover' WHERE has(d.tags,'ad') AND has(d.tags,'node_ad') "
        "AND JSONExtractString(d.body,'status')='active'")==300)
    record('profiles_not_originals',lambda:scalar("SELECT count() FROM current_docs WHERE collection_name='profile'")==n)
    check('cohort_references','SELECT count()=0 FROM cohorts c '
          'LEFT JOIN (SELECT username FROM users) a ON c.reader_key=a.username '
          'LEFT JOIN (SELECT username FROM users) b ON c.target_key=b.username '
          'WHERE isNull(a.username) OR isNull(b.username) OR c.reader_key=c.target_key')
    stage('cohort_metrics')
    # Preserve duplicate cohort multiplicities but do not expand every reader
    # to every post. One exact per-author count is sufficient for this reduction.
    db.derived('candidate_metrics','SELECT c.cell AS cell,c.reader_key AS reader_key,uniqExact(c.target_key) AS k,'
        'uniqExactIf(c.target_key,coalesce(p.posts,0)>0) AS active_authors,sum(coalesce(p.posts,0)) AS candidate_posts '
        'FROM cohorts c LEFT JOIN (SELECT author_key,count() AS posts FROM originals GROUP BY author_key) p '
        'ON p.author_key=c.target_key GROUP BY c.cell,c.reader_key','cell,reader_key')
    cells={}
    for k in (10,20,100,1000):
        for locality in ('hot','dispersed'):
            cell=f'{k}-{locality}'
            rows=read(f'SELECT k,active_authors,candidate_posts FROM candidate_metrics WHERE cell={literal(cell)}')
            record('cohort_'+cell,lambda:len(rows)==spec['recipe']['readers'] and all(r[0]==k and r[2]>0 for r in rows))
            ordinary=read(f'SELECT active_authors,candidate_posts FROM candidate_metrics WHERE cell={literal(cell)} '
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
    check('viral_probe_in_selected_feed','SELECT count()>0 FROM cohorts c '
          'INNER JOIN (SELECT author_key,doc_id FROM originals) p ON c.target_key=p.author_key '
          'INNER JOIN (SELECT doc_id,impressions FROM post_metrics) m ON m.doc_id=p.doc_id '
          f'WHERE c.cell={literal(selected)} AND m.impressions=1000000')
    checks=cp.completed()
    return {'checks':checks,'complete':all(checks.values()),'accounts':n,'tables':totals,
        'authorship':{'nonposting':nonposting,'shares_top1_next9_bottom90':shares,'top10_derived':sum(shares[:2])},
        'per_account':metrics,'per_post':per_post,'concentration':concentration,'correlations':correlations,
        'cells':cells,'arithmetic':spec['arithmetic'],
        'scope':'Finished synthetic records, not node/browser performance or private/lifecycle acceptance'}
