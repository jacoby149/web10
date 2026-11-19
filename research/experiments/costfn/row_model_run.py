"""Host-side bridge into the actual typed API-container driver; no provisioning."""
import argparse
import json
from pathlib import Path
import subprocess

import engagement_cells as cells
import engagement_certificates as certificates
import engagement_modern as modern
import row_model_cell as cell
from row_model_actions import DIRECTIVE


def source_ready(approval):
    if (approval.get('row_model_admitted') is not True or approval.get('row_model_directive') != DIRECTIVE
            or approval.get('row_model_source_binding') != cell.binding()):
        raise ValueError('explicit current-source row-model admission required before either phase starts')


def command(session, root):
    return [*session.compose, 'run', '--rm', '-T', '--no-deps', '-v', str(Path(root).resolve()) + ':/row-state',
        'api', 'uv', 'run', 'python', '/research/row_model_worker.py', '/row-state']


def run(root):
    root = Path(root).resolve()
    approval = json.loads((root / 'admission.json').read_bytes())
    source_ready(approval)
    cell.require_banked_composition(json.loads((root / 'programme-all-fixes/summary.json').read_bytes()))
    if (root / 'row-model').exists():
        raise FileExistsError('preserve the existing row-model attempt; no implicit retry or overwrite')
    modern.install_sessions()
    session = modern.Session(root)
    session.verify_envelope()  # Actual owned container28GiB and server22GiB, not just source constants.
    certificates.verify(root)
    cells.stop(root)  # No concurrent API writer while fixtures/typed rows are built.
    with (root / 'row-model-worker.log').open('xb') as log:
        # No fixed client/process timeout abandons an otherwise live worker.
        # Every native statement has600s; admission/self-kill timers bound the host.
        subprocess.run(command(session, root), env=session.env, stdout=log, stderr=subprocess.STDOUT, check=True)
    certificates.verify(root)
    result = json.loads((root / 'row-model/result.json').read_bytes())
    if result['outcome'] != 'OBSERVATIONS_COMPLETE':
        raise ValueError('row-model cell incomplete; inspect preserved native/partial receipts')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
