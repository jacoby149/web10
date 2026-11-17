"""No-engine admission controls for the newly approved research arm."""
from datetime import UTC, datetime, timedelta
import unittest
from unittest.mock import Mock

from arm_satellite_runtime import Session, admitted
import arm_t


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 15, 12, tzinfo=UTC)
        self.operation = {"kind": "SATELLITE_CONFIG_P_OPERATION_APPROVAL", "approved_by": "Jacob",
            "dataset_id": arm_t.DATASET, "configuration": "P", "droplet_id": 619510510,
            "approved_utc": self.now.isoformat(), "deadline_utc": (self.now + timedelta(hours=4)).isoformat(),
            "canonical_sources_approved": True, "scope_qualified_counts_approved": True,
            "fanout": False, "watchdog_verified": True, "budget_usd": 2}

    def test_approved_own_host_is_admitted(self):
        self.assertEqual(admitted(self.operation, 619510510, self.now), self.now + timedelta(hours=4))

    def test_f_subordinate_infrastructure_accepts_verified_self_kill_not_standalone_p(self):
        operation = {**self.operation, 'watchdog_verified': False,
            'cleanup_model': 'agent-supervised-self-kill', 'host_self_kill_verified': True,
            'scope': 'F_GATES_ONLY', 'parent_admission_sha256': 'a' * 64}
        self.assertEqual(admitted(operation, 619510510, self.now), self.now + timedelta(hours=4))
        for changes in ({'host_self_kill_verified': False}, {'scope': None}, {'parent_admission_sha256': None}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                admitted({**operation, **changes}, 619510510, self.now)

    def test_expired_other_host_config_f_budget_or_incomplete_approval_denied(self):
        for field, value in (("deadline_utc", self.now.isoformat()), ("configuration", "F"),
                             ("budget_usd", 2.01), ("fanout", True), ("watchdog_verified", False),
                             ("canonical_sources_approved", False), ("scope_qualified_counts_approved", False),
                             ("droplet_id", 619371600), ("dataset_id", "other")):
            with self.subTest(field=field), self.assertRaises(ValueError):
                admitted({**self.operation, field: value}, 619510510, self.now)

    def test_lifetime_cannot_extend_past_four_hours(self):
        operation = {**self.operation, "deadline_utc": (self.now + timedelta(hours=4, seconds=1)).isoformat()}
        with self.assertRaises(ValueError):
            admitted(operation, 619510510, self.now)

    def test_native_read_stop_applies_to_cell_not_separately_recorded_setup(self):
        for measured in (False, True):
            session = object.__new__(Session)
            session.stopped = False
            session.query = Mock()
            session.record = Mock()
            native = {"read_rows": "10000001", "exception_code": 0}
            session.rows = Mock(return_value=([native], "inspection-id"))
            self.assertEqual(session.native("satellite-p-123abc", measured=measured), native)
            self.assertEqual(session.stopped, measured)
            self.assertEqual(session.record.called, measured)


if __name__ == "__main__":
    unittest.main()
