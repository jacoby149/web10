"""Host-measured join-build calibration for the approved validation envelope.

One-shot, explicit, Digital Ocean only: build the worst-shape synthetic table
at the target engagement size, measure the cgroup (native) or container
(Docker) memory peak of a base run and of an in-memory hash-join build, and
write a receipt whose per-row overhead the validator's join admission may use
to lower its conservative default. The measurement carries its own 1.5x
margin; an out-of-range or stale result writes no receipt, and the validator
then keeps the conservative default with the disk-capable grace_hash. This
tool never touches a dataset file, an import marker, a checkpoint or a
validation work directory.
"""
import argparse
import json
import os
import subprocess
import time
from pathlib import Path

from realism_clickhouse import ClickHouse, VERSION, KEY_BYTES, atomic_json
from realism_contract import sha

MARGIN=1.5
MIN_ROWS=10_000_000
# Worst-shape keys: 36-char doc-like and 30-char username-like strings.
BASE_SELECT='SELECT 1'


def native_peak():
    """Cumulative memory peak of this process's cgroup, or None."""
    try:
        line=Path('/proc/self/cgroup').read_text().splitlines()[0]
        rel=line.split(',',1)[-1].strip()
        candidates=(Path('/sys/fs/cgroup')+rel/'memory.peak' if rel
            else Path('/sys/fs/cgroup/memory.peak'),
            Path('/sys/fs/cgroup'+rel+'/memory.max_usage_in_bytes'))
        for path in candidates:
            if path.is_file():
                value=path.read_text().strip()
                if value.isdigit():
                    return int(value)
    except OSError:
        pass
    return None


def peak(db):
    if db.container:
        out=subprocess_peak(db)
    else:
        out=native_peak()
    if out is None:
        raise ValueError('memory peak unreadable; no calibration receipt written')
    return out


def subprocess_peak(db):
    out=db.docker+['exec',db.container,'cat','/sys/fs/cgroup/memory.peak']
    result=subprocess.run(out,capture_output=True,text=True,timeout=10)
    if result.returncode!=0 or not result.stdout.strip().isdigit():
        return None
    return int(result.stdout)


def build(rows,probe,root):
    scratch=root/'calibration'
    if scratch.exists():
        raise ValueError('calibration scratch must be a fresh directory')
    scratch.mkdir(parents=True)
    db=ClickHouse(scratch,scratch)
    try:
        db.query(BASE_SELECT)
        base_peak=peak(db)
        db.query('CREATE TABLE calib (k1 String,k2 String,t DateTime64(6)) '
            'ENGINE=MergeTree ORDER BY (k1,k2)')
        db.query(f'INSERT INTO calib SELECT lpad(toString(number%1000000000000),36,"x"), '
            f'lpad(toString(number%100000000),30,"y"), toDateTime64(number%31536000000000,6) '
            f'FROM numbers({rows})')
        if db.scalar('SELECT count() FROM calib')!=rows:
            raise ValueError('calibration build lost or duplicated rows')
        db.query('CREATE TABLE probe (k1 String,k2 String) ENGINE=MergeTree ORDER BY (k1,k2)')
        db.query(f'INSERT INTO probe SELECT lpad(toString(number),36,"p"), '
            f'lpad(toString(number%100000000),30,"q") FROM numbers({probe})')
        db.query('SELECT count() FROM probe p INNER JOIN calib c ON p.k1=c.k1 AND p.k2=c.k2',
            settings_override={'join_algorithm':'hash'})
        join_peak=peak(db)
    finally:
        db.close()
    return base_peak,join_peak


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rows',type=int,default=83_200_000,
        help='calibration build rows; the full-scale engagement size')
    parser.add_argument('--probe',type=int,default=1_000_000,
        help='streamed probe rows; kept far below the build side')
    parser.add_argument('--root',type=Path,required=True,
        help='volume root holding the scratch directory (not a dataset)')
    parser.add_argument('--out',type=Path,required=True,
        help='receipt destination, e.g. the validation work directory')
    args=parser.parse_args()
    if os.environ.get('REALISM_CLICKHOUSE_PROFILE')!='performance':
        raise ValueError('calibration is only meaningful under the approved performance profile')
    if args.rows<MIN_ROWS or args.probe>args.rows//100:
        raise ValueError('rows must bound the probe; no small-scale receipt is admitted')
    started=time.monotonic()
    try:
        base_peak,join_peak=build(args.rows,args.probe,args.root.resolve())
    except (ValueError,RuntimeError) as error:
        # A refused measurement (unreadable peak, out-of-envelope build) writes
        # no receipt; the validator keeps the conservative default.
        print(json.dumps({'complete':False,'reason':str(error)[:400],'receipt':None},indent=2),flush=True)
        raise SystemExit(1)
    delta=join_peak-base_peak
    metadata=delta/args.rows-KEY_BYTES
    overhead=int(metadata*MARGIN)+1
    receipt={'engine':VERSION,'profile':'performance','calibration_source':sha(__file__),
        'rows':args.rows,'probe_rows':args.probe,'key_bytes':KEY_BYTES,
        'base_peak_bytes':base_peak,'join_peak_bytes':join_peak,
        'margin':MARGIN,'metadata_bytes_per_row':int(metadata),'overhead':overhead,
        'elapsed_seconds':round(time.monotonic()-started,3),
        'peaks_source':'docker-cgroup' if os.environ.get('REALISM_CLICKHOUSE_DOCKER')=='1' else 'native-cgroup'}
    from realism_clickhouse import BUILD_ROW_OVERHEAD
    if (delta<=0 or metadata<=0 or overhead>=BUILD_ROW_OVERHEAD):
        print(json.dumps({'complete':False,'reason':'out-of-range measurement; conservative '
            'default retained','receipt':receipt},indent=2),flush=True)
        raise SystemExit(1)
    atomic_json(args.out.resolve(),receipt)
    print(json.dumps({'complete':True,'receipt':str(args.out.resolve()),**receipt},indent=2),flush=True)


if __name__=='__main__':
    main()
