"""Offline orchestration gates. No Docker daemon, browser, or cloud required."""
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("collector", Path(__file__).with_name("collector.py"))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.here = self.root / "research/experiments/social"
        self.here.mkdir(parents=True)
        (self.here / "playwright.config.ts").touch()
        for name in ('compose.yml', 'proxy.conf', 'run.sh', 'collector.py', 'runner.test.py',
                     'scenario.spec.ts', 'reporter.ts', 'metrics.mjs', 'interop.mjs', 'interop.test.mjs'):
            (self.here / name).touch()
        cli = self.root / "e2e/node_modules/@playwright/test/cli.js"
        cli.parent.mkdir(parents=True)
        cli.touch()
        (self.root / "e2e/package-lock.json").touch()
        (self.root / "e2e/package.json").touch()
        schema = self.root / "clickhouse-init"
        schema.mkdir()
        (schema / "001.sql.template").write_text("SELECT 1")
        self.calls = []
        self.running = False
        self.failure = None
        self.cleanup_failure = False
        self.interrupt = False
        self.fail_stage = None
        self.removed = False
        self.dirty = False
        self.env = {"WEB10_DISPOSABLE": "social-evaluation"}
        for target, value in (("ROOT", self.root), ("HERE", self.here), ("command", self.fake)):
            p = patch.object(runner, target, value)
            p.start()
            self.addCleanup(p.stop)
        for p in (patch.dict(os.environ, self.env, clear=True),
                  patch.object(Path, "cwd", return_value=self.root),
                  patch.object(runner.shutil, "which", return_value="/fake/bin"),
                  patch.object(runner.socket, "socket"),
                  patch.object(runner.socket, "getaddrinfo", return_value=[(2, 1, 6, '', ('127.0.0.1', 80))]),
                  patch.object(runner.os, "sysconf", return_value=4096),
                  patch.object(runner.urllib.request, "build_opener")):
            p.start()
            self.addCleanup(p.stop)
        # Only the OS probe is redirected; artifact reads/writes remain real.
        original = Path.read_text
        p = patch.object(Path, "read_text", lambda path, *a, **kw: 'ID=ubuntu\n' if str(path) == '/etc/os-release' else original(path, *a, **kw))
        p.start()
        self.addCleanup(p.stop)
        opener = runner.urllib.request.build_opener.return_value
        opener.open.return_value.__enter__.return_value.read.return_value = b'{"experiment":"web10-social-isolated"}'
        # Restore process-global handlers after main, including failure cases.
        handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        self.addCleanup(lambda: [signal.signal(sig, handler) for sig, handler in handlers.items()])

    def fake(self, args, **kwargs):
        self.calls.append((args, kwargs))
        if self.fail_stage and self.fail_stage in args:
            raise subprocess.CalledProcessError(6, args)
        if args[:2] == ["uname", "-s"]:
            return "Linux"
        if args[0] == "uname":
            return "Linux test"
        if args[:3] == ["docker", "ps", "-q"]:
            return "production" if self.running else ""
        if args[:3] == ["git", "rev-parse", "HEAD"]:
            return "a" * 40
        if args[:2] == ["git", "status"]:
            return '?? SECRET-scenario.spec.ts' if self.dirty else ""
        if args[0] == 'node' and '--input-type=module' in args:
            return '{"node":"v22.20.0","playwright":"1.62.1","chromium":"146.0.7680.0"}'
        if args[:3] == ["docker", "ps", "-aq"]:
            return "" if self.removed else "abc123"
        if args[:2] == ["docker", "inspect"]:
            project = next(self.root.glob('.context/evaluation/*')).name
            return json.dumps([{"Config": {"Labels": {"com.docker.compose.project": "web10-eval-" + project, "com.docker.compose.service": "api"}}, "Image": "sha256:abc"}])
        if args[:3] == ["docker", "image", "inspect"]:
            return '[{"RepoDigests":["mirror@sha256:abc"]}]'
        if args[:2] == ["docker", "stats"]:
            return '{"ID":"abc123","CPUPerc":"2%","MemUsage":"1MiB / 1GiB","Secret":"no"}'
        if "logs" in args:
            return "credential=SECRET\n[query] id=secret timing_ms auth=1.25 execute=2.00 token=SECRET"
        if "down" in args:
            if self.cleanup_failure:
                raise subprocess.CalledProcessError(9, args)
            self.removed = True
        if args[0] == "node" and "test" in args:
            if self.interrupt:
                out = Path(kwargs['env']['WEB10_EVAL_RESULTS'])
                (out / 'operations.jsonl').write_text('{"operation":"following","success":true}\n')
                signal.raise_signal(signal.SIGTERM)
            if self.failure:
                raise subprocess.CalledProcessError(self.failure, args)
            out = Path(kwargs['env']['WEB10_EVAL_RESULTS'])
            (out / 'run.json').write_text('{"success":true}')
        return ""

    def manifest(self):
        return json.loads(next(self.root.glob('.context/evaluation/*/manifest.json')).read_text())

    def test_ack_denial_no_writes_or_commands(self):
        os.environ.pop("WEB10_DISPOSABLE")
        with self.assertRaises(RuntimeError):
            runner.main()
        self.assertEqual(self.calls, [])
        self.assertFalse((self.root / '.context').exists())

    def test_production_containers_no_writes_or_provision(self):
        self.running = True
        with self.assertRaises(RuntimeError):
            runner.main()
        self.assertFalse((self.root / '.context').exists())
        self.assertFalse(any('up' in args or 'build' in args for args, _ in self.calls))

    def test_success_scoped_cleanup_and_safe_evidence(self):
        self.assertEqual(runner.main(), 0)
        manifest = self.manifest()
        self.assertTrue(manifest['cleanup_succeeded'])
        self.assertEqual(manifest['repetitions'], 20)
        self.assertRegex(manifest['project'], r'^web10-eval-[a-f0-9]{24}$')
        self.assertTrue(any('stats' in args for args, _ in self.calls))
        for path in self.root.glob('.context/evaluation/*/*'):
            self.assertNotIn('SECRET', path.read_text())
        for args, options in self.calls:
            self.assertIsInstance(args, list)
            self.assertNotIn('prune', args)
            if args[:3] == ['docker', 'compose', '--project-name']:
                self.assertEqual(args[3], manifest['project'])
                self.assertEqual(options['env']['DOCKER_HOST'], 'unix:///var/run/docker.sock')

    def test_failure_preserved_even_if_cleanup_fails(self):
        self.failure = 7
        self.cleanup_failure = True
        self.assertEqual(runner.main(), 7)
        self.assertFalse(self.manifest()['cleanup_succeeded'])
        self.assertEqual([r['phase'] for r in self.manifest()['failures']], ['social-tests', 'cleanup'])

    def test_cleanup_failure_cannot_report_success(self):
        self.cleanup_failure = True
        self.assertNotEqual(runner.main(), 0)

    def test_build_failure_does_not_remove_any_resources(self):
        self.fail_stage = 'build'
        self.assertEqual(runner.main(), 6)
        self.assertFalse(any('down' in args for args, _ in self.calls))
        manifest = self.manifest()
        self.assertEqual(manifest['exit_status'], 6)
        self.assertIsNone(manifest['cleanup_succeeded'])
        self.assertEqual(manifest['failures'][0]['phase'], 'build')
        self.assertEqual(manifest['failures'][0]['failure_class'], 'CommandExit')
        self.assertIn('registry', manifest['failures'][0]['action'])

    def test_partial_up_is_cleaned(self):
        self.fail_stage = 'up'
        self.assertEqual(runner.main(), 6)
        self.assertTrue(self.manifest()['cleanup_succeeded'])
        self.assertEqual(self.manifest()['failures'][0]['phase'], 'storage')
        self.assertTrue(next(self.root.glob('.context/evaluation/*/query-timings.jsonl')).is_file())

    def test_invalid_configuration_rejected_before_commands_or_writes(self):
        cases = {'WEB10_EVAL_WARMUP': ['-1', '11', '1.0', '', 'secret'],
                 'E2E_HTTP_PORT': ['8080', '', '080'],
                 'WEB10_EVAL_REPETITIONS': ['1', '2', '101', '3.0', '+3']}
        for name, values in cases.items():
            for value in values:
                with self.subTest(name=name, value=value), patch.dict(os.environ, {name: value}):
                    with self.assertRaises(RuntimeError):
                        runner.main()
                    self.assertEqual(self.calls, [])
                    self.assertFalse((self.root / '.context').exists())

    def test_valid_configuration_boundaries_exported(self):
        os.environ.update(WEB10_EVAL_WARMUP='10', WEB10_EVAL_REPETITIONS='3', E2E_HTTP_PORT='80')
        self.assertEqual(runner.main(), 0)
        self.assertEqual(self.manifest()['warmups'], 10)
        self.assertEqual(self.manifest()['repetitions'], 3)
        browser_env = next(options['env'] for args, options in self.calls if args[0] == 'node' and 'test' in args)
        self.assertEqual(browser_env['WEB10_EVAL_REPETITIONS'], '3')
        self.assertEqual(browser_env['WEB10_EVAL_WARMUP'], '10')

    def test_failure_diagnostic_does_not_serialize_exception_secrets(self):
        def timeout(args, **options):
            if 'build' in args:
                raise subprocess.TimeoutExpired(['SECRET'], 1800, output='SECRET', stderr='SECRET')
            return self.fake(args, **options)
        with patch.object(runner, 'command', timeout):
            self.assertEqual(runner.main(), 1)
        manifest = self.manifest()
        self.assertEqual(manifest['failures'][0]['phase'], 'build')
        self.assertEqual(manifest['failures'][0]['failure_class'], 'Timeout')
        self.assertNotIn('SECRET', json.dumps(manifest))

    def test_schema_after_storage_health_before_services(self):
        self.assertEqual(runner.main(), 0)
        commands = [args for args, _ in self.calls]
        storage = next(i for i, args in enumerate(commands) if '--wait' in args)
        schema = next(i for i, args in enumerate(commands) if '--multiquery' in args)
        services = next(i for i, args in enumerate(commands) if '--no-build' in args)
        self.assertLess(storage, schema)
        self.assertLess(schema, services)
        args, options = self.calls[schema]
        self.assertEqual(options['data'], 'SELECT 1')
        self.assertEqual(args[args.index('--database') + 1], 'web10')
        self.assertEqual(args[args.index('exec') + 2], 'clickhouse')
        self.assertIn('not attributed to individual operations', self.manifest()['query_timing_scope'])

    def test_missing_schema_refused_before_build_or_writes(self):
        (self.root / 'clickhouse-init/001.sql.template').unlink()
        with self.assertRaises(RuntimeError):
            runner.main()
        self.assertFalse(any('build' in args for args, _ in self.calls))
        self.assertFalse((self.root / '.context').exists())

    def test_stats_restricted_to_project_ids(self):
        self.assertEqual(runner.main(), 0)
        calls = [args for args, _ in self.calls if args[:2] == ['docker', 'stats']]
        self.assertTrue(calls)
        for args in calls:
            self.assertEqual(args[-1], 'abc123')
            self.assertIn('--no-stream', args)

    def test_target_override_denied(self):
        os.environ['API_BASE'] = 'https://production.invalid'
        with self.assertRaises(RuntimeError):
            runner.main()
        self.assertFalse((self.root / '.context').exists())

    def test_interrupt_cleans_project(self):
        self.interrupt = True
        self.assertEqual(runner.main(), 143)
        self.assertTrue(self.manifest()['cleanup_succeeded'])
        progress = next(self.root.glob('.context/evaluation/*/operations.jsonl'))
        self.assertEqual(progress.read_text(), '{"operation":"following","success":true}\n')
        self.assertEqual(self.manifest()['exit_status'], 143)

    def test_dirty_or_untracked_checkout_refused_before_mutation(self):
        self.dirty = True
        with self.assertRaisesRegex(RuntimeError, 'clean committed checkout') as caught:
            runner.main()
        self.assertNotIn('SECRET', str(caught.exception))
        self.assertFalse((self.root / '.context').exists())
        self.assertFalse(any('build' in args or 'up' in args for args, _ in self.calls))

    def test_git_status_error_refused_safely(self):
        self.fail_stage = 'status'
        with self.assertRaisesRegex(RuntimeError, 'Cannot verify clean committed checkout'):
            runner.main()
        self.assertFalse((self.root / '.context').exists())
        self.assertFalse(any('build' in args or 'up' in args for args, _ in self.calls))

    def test_workload_hash_changes_and_dependency_provenance(self):
        before = runner.source_hashes()
        scenario = self.here / 'scenario.spec.ts'
        scenario.write_text('// different workload\n')
        after = runner.source_hashes()
        key = 'research/experiments/social/scenario.spec.ts'
        self.assertNotEqual(before[key], after[key])
        for name in ('playwright.config.ts', 'reporter.ts', 'metrics.mjs', 'interop.mjs', 'interop.test.mjs', 'runner.test.py',
                     'collector.py', 'run.sh', 'proxy.conf', 'compose.yml'):
            self.assertIn('research/experiments/social/' + name, after)
        self.assertIn('e2e/package.json', after)
        self.assertIn('e2e/package-lock.json', after)
        self.assertEqual(runner.main(), 0)
        self.assertEqual(self.manifest()['source_sha256'], after)
        self.assertEqual(self.manifest()['browser_tools'],
                         {'node': 'v22.20.0', 'playwright': '1.62.1', 'chromium': '146.0.7680.0'})

    def test_browser_version_payload_not_retained_unvalidated(self):
        def invalid(args, **options):
            if args[0] == 'node' and '--input-type=module' in args:
                return '{"node":"SECRET","playwright":"1.62.1","chromium":"146.0.7680.0"}'
            return self.fake(args, **options)
        with patch.object(runner, 'command', invalid):
            with self.assertRaisesRegex(RuntimeError, 'Invalid browser-tool version evidence'):
                runner.main()
        self.assertFalse((self.root / '.context').exists())

    def test_results_override_denied_without_writes(self):
        os.environ['WEB10_EVAL_RESULTS'] = '/tmp/not-owned'
        with self.assertRaises(RuntimeError):
            runner.main()
        self.assertFalse((self.root / '.context').exists())

    def test_symlink_parent_denied(self):
        (self.root / '.context').symlink_to(self.here, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            runner.main()
        self.assertFalse((self.here / 'evaluation').exists())

    def test_numeric_phase_allowlist(self):
        self.assertEqual(list(runner.query_timings('secret\n[query] timing_ms auth=1 execute=2.3 total=NaN token=123')),
                         [{'auth': 1.0, 'execute': 2.3}])


class StaticContracts(unittest.TestCase):
    def test_four_hosts_have_exact_marker_and_preserved_host(self):
        text = Path(__file__).with_name('proxy.conf').read_text()
        blocks = re.split(r'(?=^server \{)', text, flags=re.M)
        for host in ('social.localhost', 'auth.localhost', 'api.localhost', 'rtc.localhost'):
            with self.subTest(host=host):
                matches = [block for block in blocks if f'server_name {host};' in block]
                self.assertEqual(len(matches), 1)
                self.assertIn('location = /__experiment {', matches[0])
                self.assertIn('limit_except GET { deny all; }', matches[0])
                self.assertIn('return 200 \'{"experiment":"web10-social-isolated"}\';', matches[0])
                self.assertIn('proxy_set_header Host $http_host;', matches[0])

    def test_compose_production_isolation_structure(self):
        here = Path(__file__).resolve().parent
        text = (here / 'compose.yml').read_text()
        body = text.split('services:\n', 1)[1].split('\nvolumes:\n', 1)[0]
        sections = dict(re.findall(r'^  ([a-z]+):\n(.*?)(?=^  [a-z]+:\n|\Z)', body, re.M | re.S))
        self.assertEqual(set(sections), runner.SERVICES)
        self.assertEqual(re.findall(r'^    ports: (.+)$', body, re.M),
                         ['["127.0.0.1:80:80"]', '["127.0.0.1:9000:9000"]'])
        for forbidden in ('docker.sock', '--reload', 'target: dev', 'container_name:', 'network_mode:', 'privileged:'):
            self.assertNotIn(forbidden, text)
        self.assertRegex(text, r'\nnetworks:\n  default:\n    internal: true\s*\Z')
        for forbidden in ('external:', '    networks:', 'extra_hosts:', 'host.docker.internal', 'driver_opts:'):
            self.assertNotIn(forbidden, text)
        for service, context, dockerfile in (
                ('api', '../../../api', 'Dockerfile'), ('rtc', '../../../api/rtc', 'Dockerfile'),
                ('ui', '../../..', 'ui/Dockerfile'),
                ('social', '../../..', 'marketing/web10-social/Dockerfile')):
            self.assertIn(f'context: {context}\n', sections[service])
            self.assertTrue((here / context / dockerfile).is_file())
            self.assertNotIn('    command:', sections[service])
            self.assertNotIn('    volumes:', sections[service])
        self.assertIn('base-clickhouse:24.8', sections['clickhouse'])
        self.assertIn('healthcheck:', sections['clickhouse'])
        self.assertIn('SERVER_FALLBACK_PAGE: index.html', sections['ui'])
        templates = sorted((here.parents[2] / 'clickhouse-init').glob('*.sql.template'))
        self.assertGreaterEqual(len(templates), 2)
        for template in templates:
            sql = template.read_text()
            self.assertIn('CREATE TABLE IF NOT EXISTS', sql)
            self.assertNotRegex(sql, r'\$\{(?!CLICKHOUSE_DB\})')


if __name__ == '__main__':
    unittest.main()
