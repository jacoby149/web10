"""Exact native setup receipts for resuming an owned, writer-fenced seed."""
import hashlib
import json
from pathlib import Path

from arm_f_native import save
from arm_satellite_sql import literal as q
from costfn_task import read
import engagement_window as window


class Seed:
    def __init__(self, session, output, expected, buckets, *, tables=('content_events',)):
        self.session = session
        self.folder = Path(output) / 'resume'
        self.folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        parts, _ = session.rows('seed_resume_raw_parts', "SELECT table,name,rows,data_version,hash_of_all_files "
            "FROM system.parts WHERE database='web10' AND active AND table IN (" + ','.join(map(q, tables))
            + ') ORDER BY table,name')
        fingerprint = dict(host=session.host_id, parts=parts, expected=expected, buckets=buckets or {})
        path = self.folder / 'raw-source.json'
        if not parts or (path.exists() and read(path) != fingerprint):
            raise ValueError('raw event generation changed; repair only the event seed')
        if not path.exists():
            save(path, fingerprint)

    def step(self, label, sql, rows, action, native):
        path = self.folder / (label + '.json')
        digest = hashlib.sha256((sql + (' FORMAT JSON' if rows else '')).encode()).hexdigest()
        if path.exists():
            prior = read(path)
            if prior['sql_sha256'] != digest:
                raise ValueError('seed SQL changed; invalidate only its affected subdivision: ' + label)
            if prior['outcome'] == 'PASS':
                return prior['value'], prior['query_id'], prior['native']
            if not rows:
                return self.recover(label, digest, prior, path, action, native)
        starts = len(self.starts(label))
        save(path, dict(outcome='SUBMITTING', sql_sha256=digest, prior_starts=starts))
        value, query_id = action()
        receipt = native(self.session, query_id)
        if int(receipt['exception_code']) or receipt.get('type') != 'QueryFinish':
            raise ValueError('seed statement not verified: ' + label)
        self.commit(path, digest, value, query_id, receipt)
        return value, query_id, receipt

    def starts(self, label):
        path = Path(self.session.ledger)
        return [row for line in path.read_text().splitlines() if (row := json.loads(line)).get('label') == label
            and row['phase'] == 'start'] if path.exists() else []

    def recover(self, label, digest, prior, path, action, native):
        after = self.starts(label)[prior['prior_starts']:]
        if not after:
            # The ledger is fsynced before the real native submission.
            value, query_id = action()
            receipt = native(self.session, query_id)
        elif len(after) == 1 and after[0]['sql_sha256'] == digest:
            query_id = after[0]['query_id']
            receipt = native(self.session, query_id)
            value = ''  # All seed write call sites ignore stdout.
            if receipt.get('type') == 'ExceptionBeforeStart':
                save(self.folder / ('refused-' + query_id + '.json'), receipt)
                prior = {**prior, 'prior_starts': prior['prior_starts'] + 1}
                save(path, prior)
                return self.recover(label, digest, prior, path, action, native)
        else:
            raise ValueError('uncertain seed write; verify exact native identity before reuse: ' + label)
        if int(receipt['exception_code']) or receipt.get('type') != 'QueryFinish':
            raise ValueError('uncertain or partial seed write; repair its affected subdivision: ' + label)
        self.commit(path, digest, value, query_id, receipt)
        return value, query_id, receipt

    @staticmethod
    def commit(path, digest, value, query_id, receipt):
        save(path, dict(outcome='PASS', sql_sha256=digest, value=value, query_id=query_id, native=receipt))


class SetupWrites:
    def __init__(self, session, output, tables):
        self.session = session
        self.book = Seed(session, output, None, None, tables=tables)

    def __getattr__(self, name):
        return getattr(self.session, name)

    def query(self, label, sql, **kwargs):
        if not sql.lstrip().upper().startswith(('CREATE ', 'INSERT ', 'ALTER ', 'OPTIMIZE ', 'TRUNCATE ')):
            return self.session.query(label, sql, **kwargs)
        value, query_id, _ = self.book.step(label, sql, False,
            lambda: self.session.query(label, sql, **kwargs), lambda session, identity: session.native(identity))
        return value, query_id


def setup_writes(session, output, *tables):
    return SetupWrites(session, output, tables) if window.task(getattr(session, 'operation', {})) else session
