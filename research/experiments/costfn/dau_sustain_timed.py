"""Install the open-loop dispatch at the timed workload seam, not the serving seam."""

import asyncio
import math
import uuid

from arm_f_native import save
from dau_sustain_dispatch import Dispatch
from dau_sustain_reference import ordered_capture
import dau_sustain_workload as wl
from engagement_queries import capture as uniform_capture


class HTTPWorkload:
    """The real HTTP request seam; only a certified serving cell may supply it."""

    def __init__(self, http, output, *, run_id, reader_tokens, writers, writer_tokens):
        self.http, self.output = http, output
        self.run_id = uuid.UUID(run_id)
        self.reader_tokens, self.writers, self.writer_tokens = reader_tokens, writers, writer_tokens
        self.http.capture = ordered_capture(uniform_capture(self.http.capture, True))
        for name in ('responses', 'publication-acks'):
            (output / name).mkdir(mode=0o700, exist_ok=False)

    async def read(self, entry, actor):
        if entry['reader_index'] != actor['index'] or entry['phase'] not in ('CAL', 'CAL-BURST', 'W', 'A', 'B'):
            raise ValueError('request does not bind to a frozen reader and phase')
        page = await self.http.sequence(self.reader_tokens[actor['reader']], actor['groups'], phase=entry['phase'])
        if page['path_mode'] != 'F_DOCUMENT_STREAM_V1':
            raise ValueError('timed read did not exercise the declared indexed path')
        path = self.output / 'responses' / f"{entry['phase']}-{entry['slot']:06d}.json"
        # Private synthetic responses. Transfer privately and never publish
        # these records as content-free timing rows.
        await asyncio.to_thread(save, path, dict(**page, reader_index=actor['index'], slot=entry['slot']))

    async def write(self, entry):
        actor = self.writers[entry['writer_index']]
        groups = actor['groups']
        if len(set(groups)) != 2:
            raise ValueError('writer requires its own followers group and Discover')
        slot = entry['slot']
        operation = str(uuid.uuid5(self.run_id, f'publication:{slot}'))
        page, request = await self.http.post('/v3/create', dict(token=self.writer_tokens[actor['reader']],
            service='posts', body=dict(text=f'dau sustain {slot}', status='active'), groups=groups), operation=operation)
        if page['author_key'] != actor['reader'] or set(page['groups']) != set(groups):
            raise ValueError('HTTP create did not preserve the scheduled actor and exact target groups')
        path = self.output / 'publication-acks' / f'{slot:06d}.json'
        # Acknowledgments are not native commit evidence. Journal/native
        # reconciliation is a separate requirement before using them in parity.
        await asyncio.to_thread(save, path, dict(slot=slot, actor=actor['reader'], doc_id=page['doc_id'],
            acknowledged_groups=page['groups'], operation_id=operation, request_id=request['request_id']))


def assign_readers(schedule, readers):
    if not readers or len({reader['reader'] for reader in readers}) != len(readers):
        raise ValueError('distinct scheduled readers required')
    if [reader['index'] for reader in readers] != list(range(len(readers))):
        raise ValueError('scheduled reader indices must match the frozen population order')
    for entry in wl.read_schedule(schedule, readers=len(readers)):
        yield entry


async def workload(*, phases, readers, writer_count, read, write, observe, record_read, record_write,
                   classify, drain_bound, max_reads, max_writes, abort):
    """Carry in-flight work across phase boundaries and stop writes after drain.

    Actor and payload handling are injected by the caller; native evidence
    and independent semantic checks are not synthesized by the scheduler.
    """
    if not phases or not math.isfinite(drain_bound) or drain_bound <= 0 or writer_count < 1:
        raise ValueError('frozen phases, writers and positive finite drain bound required')
    if len({phase['name'] for phase in phases}) != len(phases):
        raise ValueError('phase names must be unique')
    if any(phase['duration_s'] <= 0 or phase['rate'] <= 0 for phase in phases):
        raise ValueError('offered windows need positive rates and durations')
    loop = asyncio.get_running_loop()
    writer_abort = asyncio.Event()
    reader_dispatch = Dispatch(limit=max_reads, record=record_read, abort=abort)
    writer_dispatch = Dispatch(limit=max_writes, record=record_write, abort=writer_abort)
    origin = loop.time()
    writer_end = origin + sum(phase['duration_s'] for phase in phases) + drain_bound
    writer_slots = math.ceil((writer_end - origin) * wl.WRITER_RATE)
    writer_schedule = wl.write_schedule(writer_count, slots=writer_slots)

    def writer_classify(error):
        kind, terminal = classify(error)
        if terminal:
            abort.set()
        return kind, terminal

    async def one_read(entry):
        return await read(entry, readers[entry['reader_index']])

    writer = asyncio.create_task(writer_dispatch.offer(writer_schedule,
        origin=origin, end=writer_end, operation=write, classify=writer_classify))
    phase_origin = origin
    phase_receipts = []
    try:
        for phase in phases:
            if abort.is_set():
                break
            phase_end = phase_origin + phase['duration_s']
            name = phase['name']
            sampling_stop = asyncio.Event()
            observer = asyncio.create_task(observe(name, reader_dispatch, phase_origin, sampling_stop))
            before = reader_dispatch.counts.copy()
            try:
                await reader_dispatch.offer(list(assign_readers([phase], readers)), origin=phase_origin,
                    end=phase_end, operation=one_read, classify=classify)
            finally:
                sampling_stop.set()
                await observer
            phase_receipts.append(dict(phase=name, interrupted=abort.is_set(),
                counts_in_window=dict(reader_dispatch.counts - before)))
            phase_origin = phase_end
        if abort.is_set():
            writer_abort.set()
        sampling_stop = asyncio.Event()
        observer = asyncio.create_task(observe('D', reader_dispatch, loop.time(), sampling_stop))
        try:
            drained = await reader_dispatch.drain(drain_bound)
        finally:
            sampling_stop.set()
            await observer
    finally:
        writer_abort.set()
        await writer
    # A drain failure is an observation, not permission to cancel native queries.
    return dict(phases=phase_receipts, reader_accounting=dict(reader_dispatch.counts),
        writer_accounting=dict(writer_dispatch.counts), drain_ok=drained,
        reader_dispatch=reader_dispatch, writer_dispatch=writer_dispatch)
