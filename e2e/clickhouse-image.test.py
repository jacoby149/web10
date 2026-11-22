"""Runtime upgrade/mirror contract; no local Docker or native engine execution."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mirror_images', Path(__file__).with_name('mirror-images.py'))
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)
VERSION = '26.10.4.207'
TARGET = 'ghcr.io/jacoby149/base-clickhouse:' + VERSION


class ClickHouseImageTests(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((ROOT / 'e2e/mirror-images.json').read_bytes())

    def test_active_runtime_compose_files_share_the_explicit_release(self):
        for name in ('docker-compose.yml', 'e2e/docker-compose.yml', 'ubuntu-deployment/docker-compose.ecosystem.yml'):
            with self.subTest(file=name):
                lines = [line.strip() for line in (ROOT / name).read_text().splitlines() if 'image:' in line and 'clickhouse' in line]
                self.assertEqual(lines, ['image: ' + TARGET])

    def test_new_mirror_is_digest_pinned_and_does_not_retag_old_experiment_images(self):
        selected = mirror.pairs(self.manifest, TARGET)
        self.assertEqual(len(selected), 1)
        self.assertRegex(selected[0][0], '^clickhouse/clickhouse-server:' + VERSION.replace('.', r'\.') + r'@sha256:[a-f0-9]{64}$')
        for version in ('24.3', '24.8'):
            source, _ = mirror.pairs(self.manifest, 'ghcr.io/jacoby149/base-clickhouse:' + version)[0]
            self.assertEqual(source, 'clickhouse/clickhouse-server:' + version)
        self.assertIn('24.8.14.39@sha256:', (ROOT / 'research/experiments/costfn/restore_realism.py').read_text())

    def test_exact_target_mirror_cannot_publish_other_runtime_tags(self):
        self.assertEqual([target for _, target in mirror.pairs(self.manifest, TARGET)], [TARGET])
        self.assertEqual(len(mirror.pairs(self.manifest)), len(self.manifest['images']))
        for target in ('missing', 'ghcr.io/jacoby149/base-clickhouse:*', TARGET + '; echo bad'):
            with self.subTest(target=target), self.assertRaises(ValueError):
                mirror.pairs(self.manifest, target)
        with self.assertRaises(ValueError):
            mirror.pairs({'images': [*self.manifest['images'], *self.manifest['images']]}, TARGET)


if __name__ == '__main__':
    unittest.main()
