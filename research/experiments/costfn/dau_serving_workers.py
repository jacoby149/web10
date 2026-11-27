"""Run four isolated read processes and the single canonical publication owner."""

import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

from dau_serving_bundle import worker_layout


def main():
    parent = Path(os.environ['FANOUT_STATE'])
    workers = []

    def stop(signum, frame):
        raise SystemExit(0)

    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, stop)
    try:
        for index, (port, role, tokens) in enumerate(worker_layout()):
            env = {**os.environ, 'DAU_BUNDLE_ACTIVE': '1', 'DAU_THREAD_TOKENS': str(tokens), 'DAU_WORKER_ROLE': role,
                   'DAU_WORKER_PORT': str(port)}
            if role == 'read':
                shard = parent / 'read-workers' / str(index)
                shard.mkdir(mode=0o700, parents=True, exist_ok=True)
                for name in ('build.json', 'admission.json'):
                    shutil.copyfile(parent / name, shard / name)
                env['FANOUT_STATE'] = str(shard)
            env['DAU_OBSERVATION_ROOT'] = str(parent)
            workers.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'dau_sustain_cell:application',
                '--host', '0.0.0.0', '--port', str(port), '--workers', '1', '--no-access-log'], env=env))
        while all(worker.poll() is None for worker in workers):
            time.sleep(0.25)
        raise RuntimeError('owned DAU worker exited; stop the complete cell')
    finally:
        for worker in workers:
            if worker.poll() is None:
                worker.terminate()
        for worker in workers:
            worker.wait()


if __name__ == '__main__':
    main()
