"""Await the original setup query's native verdict; never resubmit timed-out work."""
import json
from pathlib import Path
import subprocess
import time

from arm_f_failure import details
from arm_f_native import save
import restore_realism as restore


def await_query(session, command, query_id, budget):
    output = Path(session.root) / 'native-operations' / query_id
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    deadline = time.monotonic() + budget + 20
    evidence = dict(query_id=query_id, submitted_once=True, outcome='AWAITING_NATIVE', client=None)
    with (output / 'stdout').open('wb') as stdout, (output / 'stderr').open('wb') as stderr:
        process = subprocess.Popen(command, env=session.env, stdout=stdout, stderr=stderr)
        try:
            while time.monotonic() < deadline:
                code = process.poll()
                if code is not None and evidence['client'] is None:
                    evidence['client'] = dict(returncode=code, transport_failure_is_not_native_verdict=code != 0)
                    save(output / 'receipt.json', evidence)
                # This separate connection only observes the original exact ID.
                # Poll after success too: client exit0 is not QueryFinish proof.
                restore.command(session.compose, session.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
                    '--user', 'web10', '--password', 'web10', '--max_execution_time=2',
                    '--query', 'SYSTEM FLUSH LOGS', timeout=5)
                sql = ("SELECT query_id,toString(type) AS type,exception_code,exception,query_duration_ms,read_rows,read_bytes "
                    "FROM system.query_log WHERE query_id='" + query_id
                    + "' AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') FORMAT JSON")
                raw = restore.command(session.compose, session.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
                    '--user', 'web10', '--password', 'web10', '--max_execution_time=2', '--query', sql, timeout=5)
                rows = json.loads(raw)['data']
                if rows:
                    if len(rows) != 1:
                        raise ValueError('ambiguous original native completion')
                    evidence['native'] = rows[0]
                    if rows[0]['type'] != 'QueryFinish' or int(rows[0]['exception_code']):
                        raise ValueError('original setup query stopped natively; never repeat it')
                    evidence['outcome'] = 'NATIVE_FINISH'
                    if process.poll() is None:
                        process.wait(timeout=10)
                    if process.returncode and not command[-1].lstrip().upper().startswith(('ALTER ', 'OPTIMIZE ', 'INSERT ', 'CREATE ')):
                        raise ValueError('native completed but SELECT result transport was lost; no automatic replay')
                    return (output / 'stdout').read_bytes()
                time.sleep(2)
            raise TimeoutError('original native operation has no terminal receipt within its unchanged budget')
        except BaseException as error:
            evidence.update(outcome='STOP', **details(error))
            raise
        finally:
            if process.poll() is None:
                process.terminate()  # End the client at the unchanged bound, never submit again.
                process.wait(timeout=10)
            save(output / 'receipt.json', evidence)
