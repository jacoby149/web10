"""Frozen sustained-DAU workload: phases, rates, schedules, stops, receipts.

Contract: DAU-SUSTAINED-LOAD.md §3-§6. Pure and offline: no host, no engine,
no HTTP. The runner (dau_sustain_run.py) binds every executed schedule to this
module's digests before the timed windows open.
"""
import hashlib
import json
import math

READERS = 150
WRITER_ACTORS = 100
WRITER_RATE = 1.0
SATURATION_FRACTION = 0.5
SATURATION_SECONDS = 60
DRAIN_MULTIPLIER = 3

PHASES = (
    dict(name='W', duration_s=300, rate=15.0, measured=False,
         role='converts cold-first-delivery writes into dedupe-only steady refresh; engine settle'),
    dict(name='A', duration_s=600, rate=15.0, measured=True,
         role='the contract peak sustained'),
    dict(name='B', duration_s=1800, rate=2.9, measured=True,
         role='the daily-average rate sustained'),
    dict(name='D', duration_s=None, rate=0.0, measured=False,
         role='in-flight completes; retained'),
)


def phase(name):
    return next(p for p in PHASES if p['name'] == name)


def schedule_hash(schedule):
    return hashlib.sha256(json.dumps(schedule, sort_keys=True).encode()).hexdigest()


def read_schedule(phases, *, readers=READERS):
    """Deterministic staggered round-robin: the offered load is a fixed list of
    (phase, offset_seconds, reader_index). Staggering is the round-robin
    itself — consecutive reads are consecutive readers, so no reader carries
    two scheduled reads back to back and the pool is exercised evenly."""
    entries = []
    for p in phases:
        if p['rate'] <= 0:
            continue
        count = int(round(p['rate'] * p['duration_s']))
        for i in range(count):
            entries.append(dict(phase=p['name'], offset_s=i / p['rate'],
                reader_index=i % readers, slot=i))
    return entries


def write_schedule(writers, *, start_offset_s=0.0, rate=WRITER_RATE,
                   duration_s=None, slots=None):
    """Constant publication stream from the distinct fixture writer actors,
    round-robin. Active from the first timed phase until the drain ends; when
    bounded by slots it is the exact offered write count."""
    if type(writers) is not int or not 1 <= writers <= 1000:
        raise ValueError('writer actor count out of bounds')
    if type(rate) is not float or not 0 < rate <= 10:
        raise ValueError('writer rate must be a bounded float posts/second')
    if slots is None:
        if duration_s is None or not isinstance(duration_s, (int, float)) or duration_s <= 0:
            raise ValueError('bounded write horizon required')
        slots = int(round(rate * duration_s))
    return [dict(offset_s=start_offset_s + i / rate, writer_index=i % writers, slot=i)
        for i in range(slots)]


class Accounting(dict):
    """Open-loop accounting: scheduled, offered (dispatched), started
    (submitted), completed are distinct counters. The scheduler offers on
    schedule; whatever happens next is banked per completion timestamp. A slow
    closed loop must not silently reduce offered load — 'offered' is set by
    the schedule, not by capacity."""

    def __init__(self):
        super().__init__(scheduled={}, offered={}, started={}, completed={},
            failed={}, error_class={}, in_flight_peak=0, in_flight_now=0,
            completion_times_ms={}, latencies_ms={}, start_times_ms={})

    def _count(self, name):
        return self['completed'].get(name, 0) + self['failed'].get(name, 0)

    def schedule(self, names):
        for name in names:
            self['scheduled'][name] = self['scheduled'].get(name, 0) + 1

    def offer(self, name):
        self['offered'][name] = self['offered'].get(name, 0) + 1

    def start(self, name, now_ms):
        self['started'][name] = self['started'].get(name, 0) + 1
        self['in_flight_now'] += 1
        self['in_flight_peak'] = max(self['in_flight_peak'], self['in_flight_now'])
        self['start_times_ms'].setdefault(name, []).append(float(now_ms))

    def complete(self, name, now_ms, *, latency_ms=None, error=None):
        if error is not None:
            self['failed'][name] = self['failed'].get(name, 0) + 1
            self['error_class'][error] = self['error_class'].get(error, 0) + 1
        else:
            self['completed'][name] = self['completed'].get(name, 0) + 1
            self['latencies_ms'].setdefault(name, []).append(float(latency_ms))
        self['completion_times_ms'].setdefault(name, []).append(float(now_ms))
        self['in_flight_now'] -= 1
        if self['in_flight_now'] < 0:
            raise ValueError('completed more work than was started: closed-loop reduction suspected')

    def completed_since(self, name, now_ms, window_ms):
        return sum(1 for t in self['completion_times_ms'].get(name, [])
            if now_ms - window_ms < t <= now_ms)

    def reconciliation(self):
        return {
            name: dict(scheduled=self['scheduled'].get(name, 0),
                offered=self['offered'].get(name, 0),
                started=self['started'].get(name, 0),
                finished=self._count(name),
                completed=self['completed'].get(name, 0),
                failed=self['failed'].get(name, 0))
            for name in sorted(set().union(*[list(self[k]) for k in ('scheduled', 'offered',
                'started', 'completed', 'failed')]))}


def offered_achieved():
    return Accounting()


def saturation_stop(accounting, name, now_ms, *, window_s=SATURATION_SECONDS,
                    fraction=SATURATION_FRACTION, offered_rate=None):
    """Stop criterion 3, pre-declared: achieved < 50% of offered for 60 s
    consecutive. 'consecutive' is the completion stream over the last
    `window_s`: a collapsing achieved rate is the clog's signature."""
    p = phase(name)
    offered_rate = offered_rate if offered_rate is not None else p['rate']
    if offered_rate <= 0:
        return False
    recent = accounting.completed_since(name, now_ms, window_s * 1000)
    expected = offered_rate * window_s * fraction
    return recent < expected


def percentiles(values, *, p50=50, p95=95, p99=99):
    if not values:
        return dict(p50_ms=None, p95_ms=None, p99_ms=None, n=0)
    ordered = sorted(values)
    def at(q):
        rank = q / 100 * (len(ordered) - 1)
        low, high = math.floor(rank), math.ceil(rank)
        if low == high:
            return ordered[low]
        return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)
    return dict(p50_ms=at(p50), p95_ms=at(p95), p99_ms=at(p99), n=len(ordered))


DEBT_QUANTITIES = (
    # The quantities that can turn into debt; everything else is reported, not
    # trended. 'engine' probes are ClickHouse system tables, 'host' probes are
    # OS counters, 'scheduler' is the open-loop state itself.
    ('parts:documents', 'engine'), ('parts:engagement_documents', 'engine'),
    ('parts:content_events', 'engine'), ('parts:doc_groups', 'engine'),
    ('merge_queue:bytes', 'engine'), ('mutations:pending', 'engine'),
    ('engine_memory:bytes', 'engine'), ('host_rss:kb', 'host'),
    ('disk_free:bytes', 'host'), ('in_flight:reads', 'scheduler'),
)


def debt_sample(sample_index, phase_name, values, *, in_flight=None):
    for name, _ in DEBT_QUANTITIES:
        if name not in values:
            raise ValueError('debt sample missing declared quantity: ' + name)
    return dict(i=sample_index, phase=phase_name, values={name: float(v) for name, v in values.items()},
        in_flight=in_flight)


def slope(window_samples):
    """Least-squares slope over a window's samples; the gate is on the slope
    of the debt, not its level."""
    if len(window_samples) < 2:
        raise ValueError('debt slope needs at least two samples')
    xs = [s['i'] for s in window_samples]
    n = len(xs)
    mean_x = sum(xs) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        raise ValueError('debt slope needs distinct sample indexes')
    result = {}
    for name in window_samples[0]['values']:
        ys = [s['values'][name] for s in window_samples]
        mean_y = sum(ys) / n
        result[name] = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    return result


def sustained_positive(window_samples):
    """Pre-declared 'sustained': positive slope in both halves of the window."""
    if len(window_samples) < 4:
        raise ValueError('sustained verdict needs at least four samples')
    half = len(window_samples) // 2
    a, b = slope(window_samples[:half]), slope(window_samples[half:])
    return {name: bool(a[name] > 0 and b[name] > 0) for name in a}


def time_to_bind(name, window_samples, cap=None):
    """Named-debt qualification: remaining headroom divided by the positive
    slope, banked without waiting for the bind."""
    s = slope(window_samples)[name]
    if s <= 0 or cap is None:
        return None
    return max(cap - window_samples[-1]['values'][name], 0) / s


def receipt_window(phase_name, accounting, debt_by_phase, *, median_single_read_ms):
    p = phase(phase_name)
    recon = accounting.reconciliation()
    entry = recon.get(phase_name, dict(scheduled=0, offered=0, started=0, finished=0,
        completed=0, failed=0))
    samples = debt_by_phase.get(phase_name, [])
    return dict(phase=phase_name, measured=p['measured'], role=p['role'],
        duration_s=p['duration_s'], offered_rate=p['rate'],
        reconciliation=entry,
        percentiles=percentiles(accounting['latencies_ms'].get(phase_name, [])),
        debt=dict(samples=len(samples),
            start_end={name: [samples[0]['values'][name], samples[-1]['values'][name]]
                for name in sorted(samples[0]['values'])} if samples else {},
            slope=slope(samples) if samples else {},
            sustained_positive=sustained_positive(samples) if len(samples) >= 4 else {}),
        drain_bound_s=None if p['name'] != 'D' else
            DRAIN_MULTIPLIER * median_single_read_ms / 1000)


def content_free(record):
    """Per-request receipt records carry latency, phase, reader id, outcome
    and error class only — never bodies, tokens, signed URLs or production
    records."""
    forbidden = ('token', 'password', 'Authorization', 'X-Amz-Signature',
        'signed_url', 'media_url')
    offenders = [key for key in forbidden if key in record]
    if offenders:
        raise ValueError('receipt record is not content-free: ' + ','.join(offenders))
    return True
