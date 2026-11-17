"""Setup-only clock seam: create_as forwards version_time only with an explicit ID."""
from datetime import datetime, UTC
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
import uuid


class FixtureClockTests(unittest.TestCase):
    def load(self):
        endpoint = ModuleType('app.v3.endpoints')
        endpoint.documents = SimpleNamespace(create_as=lambda *args, **kwargs: kwargs)
        observer = ModuleType('research_api')
        observer.application = object()
        spec = importlib.util.spec_from_file_location('fixture_clock_control',
            Path(__file__).with_name('arm_f_fixture_api.py'))
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'app.v3.endpoints': endpoint, 'research_api': observer}), patch.dict(
                'os.environ', {'FANOUT_FIXTURE_SETUP': '1', 'FANOUT_FIXTURE_TIME': '2026-11-17T00:00:00+00:00'}):
            spec.loader.exec_module(module)
        return module

    def test_unmarked_fixture_creates_also_supply_id_so_timestamp_is_forwarded(self):
        module = self.load()
        for _ in range(2):
            result = module.create(None, SimpleNamespace(body={}), 'writer', 'client')
            self.assertEqual(result['version_time'], datetime(2026, 11, 17, tzinfo=UTC))
            self.assertIsInstance(uuid.UUID(result['doc_id']), uuid.UUID)

    def test_collision_ids_remain_equal_for_different_authors_and_same_clock(self):
        module = self.load()
        data = SimpleNamespace(body={'fixture_same_id': 'same-marker'})
        first = module.create(None, data, 'one', 'client')
        second = module.create(None, data, 'two', 'client')
        self.assertEqual(first, second)
        self.assertEqual(first['doc_id'], str(uuid.uuid5(uuid.NAMESPACE_URL, 'F-author-collision:same-marker')))


if __name__ == '__main__':
    unittest.main()
