"""Exact bounded row-multiset comparison, not a replacement for frozen SHA pins.

Parquet byte identity is required for delivery of a frozen artifact. Comparing
two generator implementations additionally needs logical parity: serialization
order/encoding alone may differ. No dropped columns, tolerances or set dedup.
"""
import argparse
import json
import os
from pathlib import Path
import platform
import re
import tempfile

import duckdb

from realism_contract import identity,sha
import realism_validate
from realism_validate import partitions

SOURCE_AT_IMPORT=sha(__file__)


def _save_checkpoint(path,result):
    data={**result,'checkpoint_id':identity(result)}
    tmp=path.with_suffix(path.suffix+'.tmp')
    with tmp.open('w') as stream:
        json.dump(data,stream,indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    tmp.replace(path)


def _difference(db,x,y,columns):
    """Group by EVERY column; signed multiplicity equals bidirectional EXCEPT ALL."""
    fields=','.join('"'+name.replace('"','""')+'"' for name in columns)
    return db.execute('WITH delta AS (SELECT '+fields+',1::BIGINT AS "__parity_balance" FROM ('+x+') '
                      'UNION ALL SELECT '+fields+',-1::BIGINT AS "__parity_balance" FROM ('+y+')), '
                      'counts AS (SELECT '+fields+',sum("__parity_balance") AS "__parity_balance" FROM delta GROUP BY '+fields+') '
                      'SELECT coalesce(sum(greatest("__parity_balance",0)),0),'
                      'coalesce(sum(greatest(-"__parity_balance",0)),0) FROM counts').fetchone()


def compare_events(left, right, scratch, checkpoint=None):
    left,right=Path(left).resolve(),Path(right).resolve()
    if sha(__file__)!=SOURCE_AT_IMPORT:
        raise ValueError('comparator source changed since import; use a fresh process')
    before={str(p):sha(p) for p in (left,right)}
    dependency_pin=sha(realism_validate.__file__)
    checkpoint=Path(checkpoint) if checkpoint is not None else None
    result={'kind':'EXACT_EVENT_ROW_MULTISET_PARITY','complete':False,'equal':False,
            'input_sha256':before,'comparator_sha256':SOURCE_AT_IMPORT,'partition_source_sha256':dependency_pin,
            'runtime':{'duckdb':duckdb.__version__,'python':platform.python_version(),'architecture':platform.machine()},
            'sampled_or_tolerated':False,'differences':{},
            'scope':'Generator parity, not node performance or frozen-copy digest verification'}
    with tempfile.TemporaryDirectory(prefix='realism-parity-',dir=scratch) as work:
        db=duckdb.connect(str(Path(work)/'compare.duckdb'))
        db.execute("SET memory_limit='2GB'; SET threads=1; SET preserve_insertion_order=false; SET enable_progress_bar=false")
        db.execute('SET temp_directory=?',[str(Path(work)/'spill')])
        def quoted(p):
            return "'"+str(p).replace("'","''")+"'"
        try:
            schemas=[db.execute(f'DESCRIBE SELECT * FROM read_parquet({quoted(p)})').fetchall() for p in (left,right)]
            if schemas[0]!=schemas[1] or any(c[0] in ('bucket','__parity_balance') for c in schemas[0]):
                raise ValueError('comparison schema mismatch or reserved scratch column')
            result['schema']=schemas[0]
            db.execute(f'CREATE VIEW content_events AS SELECT * FROM read_parquet({quoted(left)})')
            with partitions(db,'content_events',('doc_id','reader_key'),scratch) as a:
                db.execute('DROP VIEW content_events')
                db.execute(f'CREATE VIEW content_events AS SELECT * FROM read_parquet({quoted(right)})')
                with partitions(db,'content_events',('doc_id','reader_key'),scratch) as b:
                    def keyed(parts):
                        return {int(re.search(r'bucket=(\d+)',p).group(1)):p for p in parts}
                    aa,bb=keyed(a),keyed(b)
                    buckets=sorted(set(aa)|set(bb))
                    result['buckets']=buckets
                    if checkpoint is not None and checkpoint.exists():
                        saved=json.loads(checkpoint.read_bytes())
                        witness=saved.pop('checkpoint_id')
                        if witness!=identity(saved) or any(saved.get(k)!=json.loads(json.dumps(v)) for k,v in result.items()
                                                           if k not in ('differences','complete','equal')):
                            raise ValueError('checkpoint input/source/schema binding differs; preserve it, use a new path')
                        differences=saved.get('differences',{})
                        if (not set(differences)<={str(b) for b in buckets}
                                or any(set(v)!={'left_only','right_only'} or any(type(n) is not int or n<0 for n in v.values())
                                       for v in differences.values())):
                            raise ValueError('invalid checkpoint bucket witnesses')
                        result['differences']=differences
                    for bucket in buckets:
                        if str(bucket) in result['differences']:
                            print(f'[row-parity] bucket={bucket} reused verified input-bound checkpoint',flush=True)
                            continue
                        empty='SELECT * FROM content_events WHERE false'
                        x=f'SELECT * EXCLUDE(bucket) FROM {aa[bucket]}' if bucket in aa else empty
                        y=f'SELECT * EXCLUDE(bucket) FROM {bb[bucket]}' if bucket in bb else empty
                        forward,backward=_difference(db,x,y,[c[0] for c in schemas[0]])
                        result['differences'][str(bucket)]={'left_only':forward,'right_only':backward}
                        if checkpoint is not None:
                            _save_checkpoint(checkpoint,result)
                        print(f'[row-parity] bucket={bucket} left_only={forward} right_only={backward}',flush=True)
            if before!={str(p):sha(p) for p in (left,right)}:
                raise ValueError('comparison input changed during check')
            if sha(__file__)!=SOURCE_AT_IMPORT or sha(realism_validate.__file__)!=dependency_pin:
                raise ValueError('comparator source changed during check')
            result['complete']=True
            result['equal']=all(v['left_only']==v['right_only']==0 for v in result['differences'].values())
            if checkpoint is not None:
                _save_checkpoint(checkpoint,result)
        finally:
            db.close()
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('left',type=Path)
    parser.add_argument('right',type=Path)
    parser.add_argument('--scratch',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--checkpoint',type=Path,help='Durable input/source-bound bucket witnesses; repartition then skip completed buckets')
    args=parser.parse_args()
    if args.out.exists():
        raise FileExistsError('refusing to overwrite parity receipt')
    report=compare_events(args.left,args.right,args.scratch,args.checkpoint)
    with args.out.open('x') as stream:
        json.dump(report,stream,indent=2)
        stream.write('\n')
    raise SystemExit(0 if report['complete'] and report['equal'] else 1)
