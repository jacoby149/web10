"""Real API process + source/boot-bound hook receipt, before entering a gate."""
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.request

import arm_f_hooks as hooks
from arm_f_run import save
import restore_realism as restore


class StartupFailure(RuntimeError):
    pass


def verify_hooks(root, boot_id):
    receipt = json.loads((Path(root) / 'fanout-state/hook-install.json').read_bytes())
    if (receipt.get('boot_id') != boot_id or not boot_id
            or set(receipt.get('authorized_membership_routes', [])) != hooks.MEMBERSHIP_PATHS
            or set(receipt.get('authorized_document_routes', [])) != set(hooks.DOCUMENT_PATHS)
            or receipt.get('production_source_modified') is not False
            or receipt.get('adapter_sha256') != hashlib.sha256(Path(__file__).with_name('arm_f_api.py').read_bytes()).hexdigest()
            or receipt.get('installer_sha256') != hashlib.sha256(Path(hooks.__file__).read_bytes()).hexdigest()):
        raise StartupFailure('missing/stale/source-mismatched real F hook receipt')
    return receipt


def ready(root, compose, env, boot_id, *, seconds=30):
    root = Path(root)
    started = time.monotonic()
    try:
        while time.monotonic() - started < seconds:
            container = restore.command(compose, env, 'ps', '-a', '-q', 'api', timeout=5).decode().strip()
            if not container or len(container.splitlines()) != 1:
                raise StartupFailure('missing/ambiguous real F API container')
            state = json.loads(restore.command(['docker'], env, 'inspect', '--format', '{{json .State}}', container, timeout=5))
            if state.get('Status') != 'running':
                raise StartupFailure('real F API exited before readiness')
            try:
                with urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=1) as response:
                    http_ready = response.status == 200
            except (OSError, TimeoutError):
                http_ready = False
            if http_ready:
                receipt = verify_hooks(root, boot_id)
                save(root / 'F-api-ready.json', dict(outcome='PASS', boot_id=boot_id,
                    hook_receipt_sha256=hashlib.sha256((root / 'fanout-state/hook-install.json').read_bytes()).hexdigest(),
                    adapter_sha256=receipt['adapter_sha256'], elapsed_seconds=time.monotonic() - started))
                print('[F-startup] real API ready; all hooks verified', flush=True)
                return receipt
            time.sleep(.25)
        raise StartupFailure('real F API readiness exceeded30 seconds')
    except BaseException as error:
        # Private host-only logs, never stdout HTTP bodies or credential copies in
        # public receipts. A process crash is observed immediately, not after180s.
        try:
            logs = restore.command(compose, env, 'logs', '--no-color', '--no-log-prefix', 'api', timeout=5)
            fd = os.open(root / 'F-startup-api.log', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(logs)
        except Exception:
            pass
        approval = json.loads((root / 'admission.json').read_bytes())
        save(root / 'F-startup-failure.json', dict(outcome='STOP', failure_class=type(error).__name__,
            classification='rehearsal_escape' if approval.get('scope') == 'F_GATES_ONLY' else 'startup_failure',
            elapsed_seconds=time.monotonic() - started, boot_id=boot_id))
        print('[F-startup] STOP', type(error).__name__, flush=True)
        if not isinstance(error, Exception):
            raise
        failure = StartupFailure(str(error) if isinstance(error, StartupFailure)
            else 'real F API startup failed; inspect private startup receipt/log')
        failure.classification = 'rehearsal_escape' if approval.get('scope') == 'F_GATES_ONLY' else 'startup_failure'
        raise failure from error
