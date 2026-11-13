"""Local synthetic partition probe, not 1M validation or cloud capacity proof."""
import argparse
from contextlib import redirect_stdout
import importlib.util
import json
from pathlib import Path
import platform
import resource
import time

import duckdb

from realism_contract import sha
import realism_validate


def run(output, rows=2000000, max_rows=4096, baseline=None, baseline_sha=None, memory='2GB'):
    if type(rows) is not int or not 0<rows<=10000000:
        raise ValueError('probe rows must be in 1..10M; not a full input generator')
    module=realism_validate
    if baseline:
        baseline=Path(baseline).resolve()
        if not baseline_sha or sha(baseline)!=baseline_sha:
            raise ValueError('explicit trusted baseline source digest required')
        spec=importlib.util.spec_from_file_location('partition_baseline',baseline)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    output=Path(output).resolve()
    output.mkdir(exist_ok=False)
    db=duckdb.connect(str(output/'probe.duckdb'))
    db.execute('SET memory_limit=?',[memory])
    db.execute('SET threads=1; SET preserve_insertion_order=false')
    db.execute('SET temp_directory=?',[str(output/'spill')])
    db.execute("CREATE TABLE content_events AS SELECT md5((i//100)::VARCHAR) doc_id,"
               "'rd42-u'||lpad((i%1000000)::VARCHAR,7,'0') reader_key,'posts' service,"
               "'feed' surface,'delivery' event_type,'{}' payload,"
               "TIMESTAMP '2026-01-01'+i*INTERVAL '1 millisecond' seen_at FROM range(?) r(i)",[rows])
    started=time.monotonic()
    try:
        with (output/'work.log').open('w') as log,redirect_stdout(log):
            with module.partitions(db,'content_events',('doc_id','reader_key'),output,max_rows=max_rows) as parts:
                counts=[db.execute('SELECT count(*) FROM '+part).fetchone()[0] for part in parts]
                files=list(output.glob('realism-partitions-*/**/*.parquet'))
                result={'scope':'Local synthetic preparation only; no 1M/DO/validation acceptance',
                        'validator_sha256':sha(module.__file__),'probe_sha256':sha(__file__),
                        'duckdb':duckdb.__version__,'architecture':platform.machine(),'threads':1,
                        'engine_memory_limit':memory,'input_rows':rows,'output_rows':sum(counts),
                        'parts':len(parts),'largest_rows':max(counts,default=0),
                        'parquet_files':len(files),'parquet_bytes':sum(p.stat().st_size for p in files),
                        'elapsed_seconds':time.monotonic()-started,
                        'process_maxrss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if platform.system()=='Darwin' else 1024)}
                if result['output_rows']!=rows or result['largest_rows']>max_rows:
                    raise ValueError('partition probe lost rows or exceeded cap')
    finally:
        db.close()
    (output/'receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2),flush=True)
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    parser.add_argument('--rows',type=int,default=2000000)
    parser.add_argument('--max-rows',type=int,default=4096)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--baseline-sha')
    parser.add_argument('--memory',default='2GB')
    args=parser.parse_args()
    run(args.output,args.rows,args.max_rows,args.baseline,args.baseline_sha,args.memory)
