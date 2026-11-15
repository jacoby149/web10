"""Single-worker fenced rebuild, requested by a private operator command file.

Accepted concurrent mutations finish first. New mutations wait behind the fence
with their real credentials in the current caller, not in a saved grant/outbox.
Reads keep their canonical gate/fallback. Build an owned shadow from canonical
memberships and current canonical document/link winners, then atomic EXCHANGE.
No public endpoint, multiworker claim, pause in the R+W cell, or canonical drop.
"""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import threading
import time
import uuid

import arm_f as f
from arm_f_native import save
from arm_f_population import Builder, READER_BATCH, stored_sql, logical, window
from arm_f_runtime import admitted
from arm_satellite_counts import generation
from arm_satellite_sql import literal as q


def run(root, p, journal, fence, approval, active):
    root = Path(root)
    path = root / 'rebuild-command.json'
    if not path.is_file():
        return
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError('private operator rebuild command required')
    command = json.loads(path.read_bytes())
    operation = str(uuid.UUID(command['operation_id']))
    if command.get('source_sha256') != hashlib.sha256(Path(__file__).read_bytes()).hexdigest():
        raise ValueError('rebuild command source mismatch')
    output = root / ('rebuild-' + operation)
    if (output / 'result.json').is_file() and json.loads((output / 'result.json').read_bytes()).get('outcome') == 'PASS':
        return
    output.mkdir(mode=0o700, exist_ok=True)
    state = dict(outcome='RUNNING', operation_id=operation, source_sha256=command['source_sha256'],
        started_utc=datetime.now(UTC).isoformat(), readers=0)
    save(output / 'result.json', state)
    class Native:
        def query(self, label, sql, *, setup_seconds=120, settings=None):
            active()
            deadline = admitted(approval, p.host)
            left = int((deadline - datetime.now(UTC)).total_seconds()) - 180
            if left < 30:
                raise TimeoutError('rebuild exhausted original cleanup margin')
            from arm_f_population import LIMITS
            settings = dict(settings or LIMITS)
            settings.update(max_execution_time=min(left, setup_seconds), max_threads=4,
                read_overflow_mode='throw', result_overflow_mode='throw',
                max_temporary_data_on_disk_size_for_query=100 * 1024**3, join_algorithm='full_sorting_merge')
            sql = sql.removesuffix(' FORMAT JSON')
            result = p._query(sql, settings=settings)
            if not result.query_id:
                raise ValueError('rebuild native identity missing')
            # Normalize raw result to the controller session's JSON transport.
            return json.dumps({'data': [dict(zip(result.column_names, row)) for row in result.result_rows]}, default=str), result.query_id
        def rows(self, label, sql, **kwargs):
            raw, query_id = self.query(label, sql, **kwargs)
            return json.loads(raw)['data'], query_id
        def native(self, query_id):
            self.query('flush', 'SYSTEM FLUSH LOGS')
            rows, _ = self.rows('native', 'SELECT query_id,read_rows,read_bytes,written_rows,written_bytes,memory_usage,exception_code '
                'FROM system.query_log WHERE query_id=' + q(query_id) + " AND type='QueryFinish'")
            if len(rows) != 1:
                raise ValueError('rebuild native evidence absent')
            row = rows[0]
            if int(row['exception_code']):
                raise ValueError('native rebuild stop')
            return row
    native = Native()
    token = p.observer.current.set({'request_id': uuid.uuid4().hex, 'path_kind': 'derived-fenced-rebuild'})
    begin = time.monotonic()
    try:
        with fence.rebuild():
            state['phase'] = 'FENCED'
            save(output / 'result.json', state)
            before, _ = generation(native)
            def apply(sequence, payload):
                target = 'fanout_rebuild_' + str(sequence)
                # Replay may clear only its own noncanonical shadow. The live
                # table survives any pre-EXCHANGE failure.
                native.query('shadow_reset', 'DROP TABLE IF EXISTS ' + target)
                builder = Builder(native, output / ('attempt-' + uuid.uuid4().hex), target=target)
                builder.query('shadow_ddl', f.DDL)
                builder.members()
                cursor, index, digest = '', 0, hashlib.sha256()
                while True:
                    humans = builder.query('humans_' + str(index), 'SELECT username FROM users FINAL WHERE deleted=0 '
                        'AND username>' + q(cursor) + ' ORDER BY username LIMIT ' + str(READER_BATCH), rows=True)
                    if not humans:
                        break
                    keys = [row['username'] for row in humans]
                    if keys != sorted(set(keys)) or keys[0] <= cursor:
                        raise ValueError('invalid rebuild reader range')
                    expected = builder.expected(keys, sequence, 'batch_' + str(index))
                    builder.insert(keys, sequence, 'batch_' + str(index))
                    stored = builder.query('stored_' + str(index), stored_sql(keys), rows=True)
                    if logical(expected) != logical(stored):
                        raise ValueError('shadow rebuild exact parity mismatch')
                    digest.update(json.dumps(window(stored), separators=(',', ':')).encode())
                    state['readers'] += len(keys)
                    state['logical_windows_sha256'] = digest.hexdigest()
                    save(output / 'result.json', state)
                    cursor, index = keys[-1], index + 1
                after, _ = generation(native)
                if before != after:
                    raise ValueError('unmanaged canonical writer during rebuild fence')
                native.query('exchange', 'EXCHANGE TABLES fanout AND ' + target)
                native.query('old_derived_cleanup', 'DROP TABLE ' + target)
                return dict(readers=state['readers'], canonical_generation=after, revision=sequence)
            result = journal.run('rebuild-' + operation, '__derived_rebuild__', 'rebuild',
                {'canonical_generation': before, 'source_sha256': command['source_sha256']}, lambda: None, apply, lambda *a: None)
            state.update(outcome='PASS', result=result, readers=result['readers'])
    except BaseException as error:
        state.update(outcome='STOP', failure_class=type(error).__name__)
        (root / 'F.stop').write_text('fenced_rebuild_' + type(error).__name__ + '\n')
        raise
    finally:
        state['elapsed_seconds'] = time.monotonic() - begin
        state['ended_utc'] = datetime.now(UTC).isoformat()
        save(output / 'result.json', state)
        p.observer.current.reset(token)


def start(root, p, journal, fence, approval, active, fail):
    stop = threading.Event()
    def loop():
        while not stop.wait(.25):
            try:
                run(root, p, journal, fence, approval, active)
            except BaseException as error:
                fail('fenced_rebuild_' + type(error).__name__)
                break
    threading.Thread(target=loop, daemon=True).start()
    return stop
