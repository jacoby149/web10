"""Durable, private task receipts; an attempt is not an admission."""
from contextlib import contextmanager
from datetime import UTC, datetime
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess

from arm_f_failure import details
from arm_f_native import save
import engagement_window as window


class ParityDivergence(ValueError):
    pass


def exact(check, *args):
    try:
        return check(*args)
    except ValueError as error:
        raise ParityDivergence(str(error)) from error


def read(path):
    return json.loads(path.read_bytes())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def utc():
    return datetime.now(UTC).isoformat()


class Task:
    def __init__(self, root, approval, source):
        self.root = Path(root)
        self.path = self.root / 'costfn-task.json'
        if not window.task(approval):
            raise ValueError('named costfn task required')
        self.identity = dict(task_id=approval['costfn_task_id'], host=approval['droplet_id'],
            admission_sha256=digest(self.root / 'admission.json'),
            source_start=approval['hybrid_k20_source_commit'], host_backstop_utc=approval['deadline_utc'])
        self.source = source
        self.initial_source = self.identity['source_start']

    def next_phase(self, name, parent_report):
        if not name.isascii() or not name.isalnum() or read(self.path)['status'] != 'COMPLETE':
            raise ValueError('completed same-task predecessor required')
        parent = read(parent_report)
        if any(parent.get(key) != value for key, value in self.identity.items()):
            raise ValueError('predecessor report does not belong to this task')
        self.path = self.root / ('costfn-task-' + name + '.json')
        self.identity['predecessor_sha256'] = digest(parent_report)
        self.initial_source = self.source

    @contextmanager
    def attempt(self, note=None):
        # One active controller, not a daemon/guardian. The lock is released on
        # process death; no other attempt can race non-idempotent preparation.
        with (self.root / 'costfn-task.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.state = read(self.path) if self.path.exists() else dict(
                identity=self.identity, attempts=[], steps={}, status='CONTINUE')
            if self.state['identity'] != self.identity:
                raise ValueError('task admission or owned host changed')
            if self.state['status'] in ('PARITY_DIVERGENCE', 'COMPLETE'):
                raise ValueError('task already has a terminal verdict')
            previous = self.state['attempts'][-1] if self.state['attempts'] else None
            if previous and (previous['status'] == 'RUNNING' or previous['source'] != self.source) and not note:
                raise ValueError('record the interrupted attempt or source repair before resuming')
            if previous and previous['status'] == 'RUNNING':
                previous.update(status='INTERRUPTED', ended_utc=utc())
            if not previous and self.source != self.initial_source:
                raise ValueError('first execution must use the admitted starting source')
            attempt = dict(number=len(self.state['attempts']) + 1, source=self.source, repair_note=note,
                status='RUNNING', started_utc=utc(), reused=[])
            self.state['attempts'].append(attempt)
            self.state.update(source_end=self.source, status='RUNNING')
            self.save()
            try:
                yield attempt
            except BaseException as error:
                verdict = 'PARITY_DIVERGENCE' if isinstance(error, ParityDivergence) else 'NEEDS_REPAIR'
                attempt.update(status=verdict, failure=details(error))
                self.state['status'] = verdict
                raise
            else:
                attempt['status'] = self.state['status'] = 'COMPLETE'
            finally:
                attempt['ended_utc'] = utc()
                self.save()

    def save(self):
        save(self.path, self.state)

    def step(self, name, action, validate=None):
        attempt = self.state['attempts'][-1]
        stored = self.state['steps'].get(name)
        if stored is not None:
            if validate is not None:
                validate(stored['evidence'])
            attempt['reused'].append(name)
            self.save()
            return stored['evidence']
        attempt['active_step'] = name
        self.save()
        evidence = action()
        self.state['steps'][name] = dict(source=self.source, attempt=attempt['number'], evidence=evidence)
        self.save()
        return evidence

    def restart(self, names):
        history = self.state.setdefault('superseded', [])
        for name in names:
            if name in self.state['steps']:
                history.append(dict(step=name, **self.state['steps'].pop(name)))
        self.save()


def source(repo, start):
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    subprocess.run(['git', 'merge-base', '--is-ancestor', start, actual], cwd=repo, check=True)
    subprocess.run(['git', 'diff', '--quiet', 'HEAD'], cwd=repo, check=True)
    return actual
