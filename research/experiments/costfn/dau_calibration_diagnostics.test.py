"""No-engine controls for utilization observations and banked oracle transfer."""

from pathlib import Path
import tempfile
import unittest

import dau_calibration_diagnostics as diag
from dau_calibration_oracle_reuse import selection_domain


class Diagnostics(unittest.TestCase):
    def test_cpu_rows_keep_each_core_and_exclude_double_accounted_guest_ticks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'stat').write_text('cpu 7 0 2 12 1 0 0 0 3 0\ncpu0 4 0 1 6 1 0 0 0 2 0\n'
                'cpu1 3 0 1 6 0 0 0 0 1 0\nintr 0\n')
            rows = diag.cpu_ticks(root)
            self.assertEqual(set(rows), {'cpu', 'cpu0', 'cpu1'})
            self.assertEqual(rows['cpu0'], [4, 0, 1, 6, 1, 0, 0, 0])

    def test_process_ticks_are_bound_to_pid_start_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '17').mkdir()
            (root / '17/stat').write_text('17 (process ) with spaces) S ' + ' '.join(map(str, range(1, 24))))
            self.assertEqual(diag.process_ticks(17, root), {'user': 11, 'system': 12, 'start_ticks': 19})

    def test_only_native_census_receipt_identity_may_differ_on_rebind(self):
        first = dict(dataset_id='dataset', readers=[{'reader': 'one', 'groups': ['own']}], census_sha256='old')
        self.assertEqual(selection_domain(first), selection_domain(dict(first, census_sha256='new')))
        self.assertNotEqual(selection_domain(first), selection_domain(dict(first, readers=[])))


if __name__ == '__main__':
    unittest.main()
