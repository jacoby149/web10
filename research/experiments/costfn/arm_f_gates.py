"""Executable programme contract and evidence checks. No engine/network at import.

A gate result is derived from actual observations, never from the existence of a
file named PASS. Completed cells bind input, host, executing sources and parents.
"""
from datetime import UTC, datetime
import hashlib
import math
from pathlib import Path

import arm_t
from arm_f_native import save

ORDER = ('Step0', 'Build', 'T4', 'T2-F', 'T6-F', 'T3-F', 'Population',
         'T6-F-populated', 'T5-F', 'T8-F', 'Boundaries', 'R+W')
MODES = ('P_DOCUMENT_STREAM_V1', 'F_DOCUMENT_STREAM_V1')
TRIALS, SAMPLES, LOAD_SECONDS = 3, 100, 600


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def p95(values):
    if not values or any(type(v) not in (int, float) or not math.isfinite(v) or v < 0 for v in values):
        raise ValueError('nonempty finite latency observations required')
    return sorted(values)[math.ceil(.95 * len(values)) - 1]


def read_trial(trial):
    rows = trial.get('samples', [])
    warm = [row for row in rows if row.get('phase') == 'warmup']
    measured = [row for row in rows if row.get('phase') == 'measured']
    if len(warm) != 1 or len(measured) != SAMPLES or not trial.get('fresh_restore_sha256'):
        raise ValueError('one warmup plus100 measured complete sequences on a fresh restore required')
    ids = [request for row in rows for request in row.get('request_ids', [])]
    query_ids = [q['query_id'] for row in rows for q in row.get('native', [])]
    if len(ids) != 4 * len(rows) or len(set(ids)) != len(ids) or len(set(query_ids)) != len(query_ids):
        raise ValueError('missing/reused HTTP or native sequence identities')
    for row in rows:
        if row.get('parity') != 'PASS' or not row.get('native') or row.get('stop'):
            raise ValueError('incomplete/parity-invalid/native-stopped read trial')
        for query in row['native']:
            if int(query['exception_code']) or int(query['read_rows']) > 10_000_000:
                raise ValueError('native failure/over10M read; stop the arm')
    latency = p95([row['elapsed_ms'] for row in measured])
    if latency >= 500 or any(sum(int(q['read_bytes']) for q in row['native']) >= 25_000_000 for row in measured):
        raise ValueError('complete-response500ms/25MB budget missed')
    return {'p95_ms': latency, 'measured_sequences': len(measured)}


def read_trials(trials):
    if len(trials) != TRIALS or len({row.get('fresh_restore_sha256') for row in trials}) != TRIALS:
        raise ValueError('three distinct fresh full-store restores required, never three serial observations')
    return [read_trial(row) for row in trials]


def load_verdict(result):
    if result.get('duration_seconds', 0) < LOAD_SECONDS or result.get('population_fraction') != 1:
        raise ValueError('ten-minute full-population concurrent cell required')
    if result.get('lost_deliveries') != 0 or result.get('duplicate_deliveries') != 0:
        raise ValueError('delivery reconciliation missing/failed')
    for name, rate in (('reads', 1400 / 60), ('publishes', 100), ('follows', 10)):
        stream = result.get(name, {})
        offered, completed, errors = (stream.get(key, 0) for key in ('offered', 'completed', 'errors'))
        if (offered < math.floor(rate * LOAD_SECONDS) or completed < math.floor(rate * LOAD_SECONDS)
                or errors / max(offered, 1) >= .01 or stream.get('pending', 0)
                or stream.get('during_window_completed') != completed):
            raise ValueError('load rate/errors/backlog not sustained for ' + name)
    reads = result['reads']
    if p95(reads.get('latencies_ms', [])) >= 500 or reads.get('max_sequence_bytes', math.inf) >= 25_000_000:
        raise ValueError('under-load complete-read budget missed')
    if result.get('recipient_pointers') != result.get('expected_recipient_pointers'):
        raise ValueError('actual canonical recipients differ from published pointers')
    return True


class Programme:
    def __init__(self, root, host, *, clock=None):
        self.root, self.host = Path(root), host
        self.clock = clock or (lambda: datetime.now(UTC))
        self.directory = self.root / 'F-gates'
        self.directory.mkdir(mode=0o700, exist_ok=True)
        self.results = {}
        self.sources = {p.name: digest(p) for p in sorted(Path(__file__).parent.glob('arm_f*.py'))}

    def run(self, gate, action):
        index = ORDER.index(gate)
        if tuple(self.results) != ORDER[:index] or any(row['outcome'] != 'PASS' for row in self.results.values()):
            raise ValueError('cannot skip/reorder an incomplete F gate')
        output = self.directory / gate
        output.mkdir(mode=0o700, exist_ok=False)
        value = dict(gate=gate, outcome='RUNNING', dataset_id=arm_t.DATASET, droplet_id=self.host,
            started_utc=self.clock().isoformat(), sources=self.sources,
            predecessors={name: digest(self.directory / name / 'result.json') for name in self.results})
        save(output / 'result.json', value)
        print('[F-programme] start', gate, flush=True)
        try:
            evidence = action(output)
            if not isinstance(evidence, dict) or evidence.get('verified') is not True:
                raise ValueError('gate action did not establish its actual evidence')
            value.update(evidence=evidence, outcome='PASS')
        except BaseException as error:
            value.update(outcome='STOP', failure_class=type(error).__name__)
            self.results[gate] = value
            (self.root / 'F.stop').write_text('gate_' + gate + '_' + type(error).__name__ + '\n')
            raise
        finally:
            value['ended_utc'] = self.clock().isoformat()
            save(output / 'result.json', value)
            self.results[gate] = value
            save(self.directory / 'programme.json', dict(outcome='PASS' if gate == ORDER[-1] and value['outcome'] == 'PASS'
                else 'INCOMPLETE', gates=self.results, unreached=[g for g in ORDER if g not in self.results]))
        print('[F-programme] PASS', gate, flush=True)
        return value
