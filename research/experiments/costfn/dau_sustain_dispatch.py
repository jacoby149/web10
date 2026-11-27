"""Open-loop admission and accounting, independent of HTTP and ClickHouse."""

import asyncio
from collections import Counter


class Dispatch:
    def __init__(self, *, limit, record, abort=None):
        if type(limit) is not int or limit < 1:
            raise ValueError('positive in-flight limit required')
        self.limit = limit
        self.record = record
        self.abort = abort or asyncio.Event()
        self.pending = set()
        self.counts = Counter()
        self.peak = 0

    async def execute(self, entry, origin, offered, operation, classify):
        clock = asyncio.get_running_loop().time
        self.counts['started'] += 1
        started = clock()
        error = None
        try:
            await operation(entry)
        except asyncio.CancelledError:
            error = 'cancelled'
            raise
        except Exception as failure:
            error = 'controller_error'
            error, terminal = classify(failure)
            if terminal:
                self.abort.set()
        finally:
            self.counts['finished'] += 1
            self.counts['failed' if error else 'completed'] += 1
            if error:
                self.counts['error:' + error] += 1
            self.record(dict(**entry, offered_s=offered - origin, started_s=started - origin,
                finished_s=clock() - origin, error_class=error))

    async def wait_until(self, deadline):
        delay = deadline - asyncio.get_running_loop().time()
        if delay > 0 and not self.abort.is_set():
            try:
                await asyncio.wait_for(self.abort.wait(), delay)
            except TimeoutError:
                pass
        return not self.abort.is_set()

    async def offer(self, entries, *, origin, end, operation, classify):
        """Do not wait for a response or release outstanding work at a phase edge."""
        clock = asyncio.get_running_loop().time
        self.counts['scheduled'] += len(entries)
        for entry in entries:
            if not await self.wait_until(origin + entry['offset_s']):
                return
            offered = clock()
            if offered >= end:
                self.counts['missed_phase_deadline'] += 1
                self.record(dict(**entry, offered_s=None, started_s=None, finished_s=offered - origin,
                    error_class='missed_phase_deadline'))
                continue
            self.counts['offered'] += 1
            if len(self.pending) >= self.limit:
                self.counts['backpressured'] += 1
                self.record(dict(**entry, offered_s=offered - origin, started_s=None,
                    finished_s=offered - origin, error_class='backpressure'))
                continue
            task = asyncio.create_task(self.execute(entry, origin, offered, operation, classify))
            self.pending.add(task)
            self.peak = max(self.peak, len(self.pending))
            task.add_done_callback(self.done)
        await self.wait_until(end)

    def done(self, task):
        self.pending.discard(task)
        if not task.cancelled() and task.exception() is not None:
            self.counts['controller_error'] += 1
            self.abort.set()

    async def drain(self, bound):
        """Return the drain verdict without cancelling still-running native work."""
        if not self.pending:
            return True
        _, pending = await asyncio.wait(tuple(self.pending), timeout=bound)
        return not pending
