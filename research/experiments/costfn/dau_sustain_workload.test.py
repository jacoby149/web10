"""Offline controls for the sustained-DAU workload (contract §8.1)."""
import unittest

import dau_sustain_workload as wl


class Schedule(unittest.TestCase):
    def test_frozen_phase_counts_and_round_robin(self):
        entries = wl.read_schedule([wl.phase('W'), wl.phase('A'), wl.phase('B')])
        by_phase = {}
        for item in entries:
            by_phase.setdefault(item['phase'], []).append(item)
        self.assertEqual(len(by_phase['W']), 4500)
        self.assertEqual(len(by_phase['A']), 9000)
        self.assertEqual(len(by_phase['B']), 5220)
        for phase, items in by_phase.items():
            self.assertEqual([item['reader_index'] for item in items],
                [i % wl.READERS for i in range(len(items))])
            for left, right in zip(items, items[1:]):
                self.assertGreater(right['offset_s'], left['offset_s'])
        self.assertEqual(entries, wl.read_schedule([wl.phase('W'), wl.phase('A'), wl.phase('B')]))
        self.assertNotEqual(wl.schedule_hash(entries),
            wl.schedule_hash([dict(entries[0], offset_s=entries[0]['offset_s'] + 1)]))

    def test_drain_phase_offers_nothing(self):
        self.assertEqual(wl.read_schedule([wl.phase('D')]), [])

    def test_writer_stream_is_constant_and_rotating(self):
        plan = wl.write_schedule(100, slots=300)
        self.assertEqual(len(plan), 300)
        self.assertEqual([item['writer_index'] for item in plan], [i % 100 for i in range(300)])
        deltas = {round(right['offset_s'] - left['offset_s'], 6)
            for left, right in zip(plan, plan[1:])}
        self.assertEqual(deltas, {1.0})
        with self.assertRaisesRegex(ValueError, 'writer rate'):
            wl.write_schedule(100, rate=42, slots=10)
        with self.assertRaisesRegex(ValueError, 'actor count'):
            wl.write_schedule(0, slots=10)


class Accounting(unittest.TestCase):
    def test_offered_is_set_by_the_schedule_not_by_capacity(self):
        a = wl.offered_achieved()
        a.schedule(['W'])
        a.offer('W')
        a.start('W', 100.0)
        a.complete('W', 300.0, latency_ms=200.0)
        recon = a.reconciliation()['W']
        self.assertEqual(recon, dict(scheduled=1, offered=1, started=1, finished=1,
            completed=1, failed=0))
        self.assertEqual(a.completed_since('W', 1000.0, 60_000), 1)
        self.assertEqual(a.completed_since('W', 1000.0, 400), 0)

    def test_closed_loop_reduction_is_refused(self):
        a = wl.offered_achieved()
        a.start('A', 100.0)
        with self.assertRaisesRegex(ValueError, 'closed-loop'):
            a.complete('A', 200.0, error='timeout')
            a.complete('A', 300.0, latency_ms=1.0)

    def test_saturation_stop_on_the_completion_stream(self):
        a = wl.offered_achieved()
        # steady at the 15/s peak: 460 completions inside the last 60 s clears
        # the 50% line (450); the stalled stream slides under it.
        for i in range(460):
            a.start('A', 10_000.0 + i - 100.0)
            a.complete('A', 10_000.0 + i, latency_ms=1.0)
        self.assertFalse(wl.saturation_stop(a, 'A', 70_000.0))
        self.assertTrue(wl.saturation_stop(a, 'A', 100_000.0))
        self.assertFalse(wl.saturation_stop(a, 'D', 100_000.0))


class Gates(unittest.TestCase):
    @staticmethod
    def window(samples):
        return samples

    def test_debt_slope_and_sustained_verdict(self):
        def sample(i, values):
            return dict(i=i, phase='A', values=values, in_flight=1)
        flat = [sample(i, {'x': 10.0, 'y': 5.0}) for i in range(6)]
        rising = [sample(i, {'x': float(i), 'y': 10.0}) for i in range(6)]
        falling = [sample(i, {'x': float(10 - i), 'y': 10.0}) for i in range(6)]
        self.assertFalse(any(wl.sustained_positive(flat).values()))
        self.assertTrue(wl.sustained_positive(rising)['x'])
        self.assertFalse(wl.sustained_positive(falling)['x'])
        self.assertEqual(wl.time_to_bind('x', rising, cap=100), 95 / wl.slope(rising)['x'])
        self.assertIsNone(wl.time_to_bind('x', falling, cap=100))
        with self.assertRaisesRegex(ValueError, 'two samples'):
            wl.slope(flat[:1])
        with self.assertRaisesRegex(ValueError, 'four samples'):
            wl.sustained_positive(rising[:3])

    def test_percentiles_report_not_gate(self):
        values = [float(i) for i in range(1, 101)]
        got = wl.percentiles(values)
        self.assertEqual(got['n'], 100)
        self.assertEqual(got['p50_ms'], 50.5)
        self.assertEqual(got['p95_ms'], 95.05)
        self.assertEqual(got['p99_ms'], 99.01)
        self.assertEqual(wl.percentiles([]), dict(p50_ms=None, p95_ms=None, p99_ms=None, n=0))

    def test_receipt_window_separates_calibration_from_measured(self):
        a = wl.offered_achieved()
        a.schedule(['A'])
        for i in range(30):
            a.start('A', 1000.0 + i - 5.0)
            a.complete('A', 1000.0 + i, latency_ms=float(i + 1))
        debt = [dict(i=i, phase='A',
            values={name: float(i) if name == 'parts:documents' else 0.0
                for name, _ in wl.DEBT_QUANTITIES}, in_flight=0) for i in range(4)]
        got = wl.receipt_window('A', a, {'A': debt}, median_single_read_ms=100.0)
        self.assertIs(got['measured'], True)
        self.assertEqual(got['reconciliation']['completed'], 30)
        self.assertEqual(got['debt']['samples'], 4)
        drain = wl.receipt_window('D', a, {}, median_single_read_ms=100.0)
        self.assertEqual(drain['drain_bound_s'], 0.3)
        self.assertIsNone(wl.receipt_window('W', a, {}, median_single_read_ms=100.0)['drain_bound_s'])

    def test_content_free_receipt_records(self):
        clean = dict(request_id='r1', phase='A', reader_index=3, outcome='ok',
            elapsed_ms=120.5, error_class=None)
        self.assertTrue(wl.content_free(clean))
        for key in ('token', 'password', 'Authorization', 'X-Amz-Signature',
                    'signed_url', 'media_url'):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'content-free'):
                wl.content_free(dict(clean, **{key: 'x'}))


if __name__ == '__main__':
    unittest.main()
