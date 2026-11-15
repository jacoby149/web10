"""Private single-process research intent journal; no token/grant persistence.

The adapter must provide live authorized apply/reconcile callbacks. This module
cannot mint credentials, insert canonical documents or bypass an API gate.
"""
from contextlib import contextmanager, ExitStack
import fcntl
import hashlib
import json
import logging
import os
from pathlib import Path
import sqlite3
import threading

log = logging.getLogger('arm-f')
FORBIDDEN = {'token', 'password', 'authorization', 'cookie', 'access_key', 'secret_key', 'signed_url'}


def encoding(value):
    if isinstance(value, dict):
        if any(str(key).lower() in FORBIDDEN for key in value):
            raise ValueError('credentials must not enter the intent journal')
        for item in value.values():
            encoding(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            encoding(item)
    if isinstance(value, str) and any(marker in value.lower() for marker in ('x-amz-signature=', 'bearer ')):
        raise ValueError('credential-bearing text refused')
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


class Journal:
    def __init__(self, directory):
        root = Path(directory)
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if root.is_symlink() or any((root / name).is_symlink() for name in ('coordinator.lock', 'intents.sqlite')):
            raise ValueError('journal paths must not be symlinks')
        os.chmod(root, 0o700)
        self.guard = (root / 'coordinator.lock').open('a')
        try:
            fcntl.flock(self.guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            self.guard.close()
            raise
        self.lock = threading.RLock()
        self.scope_guard = threading.Lock()
        self.scope_locks = {}
        self.db = sqlite3.connect(root / 'intents.sqlite', isolation_level=None, check_same_thread=False)
        os.chmod(root / 'intents.sqlite', 0o600)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute("CREATE TABLE IF NOT EXISTS intents (sequence INTEGER PRIMARY KEY AUTOINCREMENT, "
            "operation_id TEXT NOT NULL UNIQUE,request_sha256 TEXT NOT NULL,actor_key TEXT NOT NULL,"
            "operation TEXT NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL "
            "CHECK(state IN ('pending','reconciling','complete','denied')),result_json TEXT,"
            "created_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00','now')))")
        self.db.execute("CREATE TABLE IF NOT EXISTS dirty_readers (reader_key TEXT PRIMARY KEY,"
                        "generation INTEGER NOT NULL,trimmed_generation INTEGER NOT NULL DEFAULT 0)")
        fd = os.open(root, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    @contextmanager
    def transaction(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def run(self, operation_id, actor, operation, payload, authorize, apply, reconcile, *, scope_keys=None):
        if not all(isinstance(value, str) and value for value in (operation_id, actor, operation)):
            raise ValueError('stable operation, actor and kind required')
        raw = encoding(payload)
        digest = hashlib.sha256(encoding([actor, operation, payload]).encode()).hexdigest()
        keys = list(scope_keys or ['__single_default_scope__'])
        if any(not isinstance(key, str) or not key for key in keys):
            raise ValueError('explicit coordinator scope keys required')
        keys = sorted(set([*keys, 'operation:' + operation_id]))
        with self.scope_guard:
            locks = [self.scope_locks.setdefault(key, threading.RLock()) for key in keys]
        with ExitStack() as stack:
            for lock in locks:
                stack.enter_context(lock)
            # Even completed retries require current authority. The journal is no grant.
            log.info('[arm-f] authorization start kind=%s', operation)
            authorize()
            log.info('[arm-f] authorization complete kind=%s', operation)
            with self.lock, self.transaction():
                row = self.db.execute('SELECT sequence,request_sha256,state,result_json FROM intents WHERE operation_id=?',
                                      (operation_id,)).fetchone()
                if row and row[1] != digest:
                    raise ValueError('operation id reused with different principal/payload')
                if row and row[2] == 'complete':
                    return json.loads(row[3])
                if row is None:
                    cursor = self.db.execute("INSERT INTO intents(operation_id,request_sha256,actor_key,operation,payload_json,state) "
                        "VALUES(?,?,?,?,?,'pending')", (operation_id, digest, actor, operation, raw))
                    sequence = cursor.lastrowid
                else:
                    sequence = row[0]
            log.info('[arm-f] durable intent committed sequence=%d kind=%s', sequence, operation)
            # No transaction held across canonical writes; crashes stay visibly pending.
            with self.lock:
                self.db.execute("UPDATE intents SET state='reconciling' WHERE sequence=?", (sequence,))
            result = apply(sequence, json.loads(raw))
            log.info('[arm-f] canonical apply complete sequence=%d', sequence)
            reconcile(sequence, json.loads(raw), result)
            log.info('[arm-f] reconciliation complete sequence=%d', sequence)
            result_raw = encoding(result)
            with self.lock:
                self.db.execute("UPDATE intents SET state='complete',result_json=? WHERE sequence=?", (result_raw, sequence))
            return result

    def dirty(self, readers, sequence):
        with self.lock, self.transaction():
            self.db.executemany('INSERT INTO dirty_readers(reader_key,generation) VALUES(?,?) '
                'ON CONFLICT(reader_key) DO UPDATE SET generation=max(generation,excluded.generation)',
                [(reader, sequence) for reader in set(readers)])

    def trim_batch(self, trim, limit=64):
        """Amortized timer callback only; never called by foreground publication."""
        if type(limit) is not int or not 1 <= limit <= 64:
            raise ValueError('bounded background reader batch required')
        with self.lock:
            rows = self.db.execute('SELECT reader_key,generation FROM dirty_readers '
                'WHERE generation>trimmed_generation ORDER BY generation,reader_key LIMIT ?', (limit,)).fetchall()
        for reader, generation in rows:
            if trim(reader) is False:
                continue
            with self.lock:
                self.db.execute('UPDATE dirty_readers SET trimmed_generation=? WHERE reader_key=? AND generation=?',
                                (generation, reader, generation))
        return len(rows)

    def pending(self):
        with self.lock:
            return self.db.execute("SELECT sequence,operation_id,actor_key,operation FROM intents WHERE state!='complete' ORDER BY sequence").fetchall()

    def timestamp(self, sequence):
        with self.lock:
            row = self.db.execute('SELECT created_utc FROM intents WHERE sequence=?', (sequence,)).fetchone()
            if row is None:
                raise ValueError('uncommitted intent has no canonical timestamp')
            return row[0]

    def close(self):
        self.db.close()
        self.guard.close()
