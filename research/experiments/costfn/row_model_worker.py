"""Typed-driver row-model proving worker. Explicit owned DO admission only.

Launched inside the existing isolated API Compose service, not an HTTP server.
Never creates a lease, restores a lake, rewrites production, or deletes JSON.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

from arm_f_failure import details
from arm_f_native import save
import arm_t
import engagement_limits as limits
import engagement_modern as modern
import row_model_cell as cell
from row_model_actions import Actions
from row_model_native import Driver
from row_model_run import source_ready


def admission(root, host):
    root = Path(root)
    value = json.loads((root / 'admission.json').read_bytes())
    modern.admitted(value, host)
    source_ready(value)
    banked = json.loads((root / 'programme-all-fixes/summary.json').read_bytes())
    cell.require_banked_composition(banked)
    return value, banked


def copy_fence(driver, root):
    rows = driver.query("SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts "
        "WHERE database='web10' AND active AND table='engagement_documents' ORDER BY name")
    expected = json.loads((Path(root) / 'copy-proof.json').read_bytes())['parts_sha256']
    if hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest() != expected:
        raise ValueError('canonical all-fixes copy changed before/during the row-model cell')


def run(root, client_factory=None, host=None):
    root = Path(root)
    if client_factory is None and os.environ.get('COSTFN_DISPOSABLE') != '1':
        raise ValueError('row-model native worker must run in the explicit disposable research container')
    host = arm_t.digitalocean_id() if host is None else host
    approval, banked = admission(root, host)
    output = root / 'row-model'
    output.mkdir(mode=0o700, exist_ok=False)
    result = dict(outcome='RUNNING', source_binding=cell.binding(), dataset_id=approval['dataset_id'],
        droplet_id=host, deadline_utc=approval['deadline_utc'], production=False, complete_feed_replacement=False)
    save(output / 'result.json', result)
    def guard():
        modern.admitted(approval, host)
        if modern.remaining(approval) <= 0:
            raise TimeoutError('original row-model lease cleanup margin reached')
    driver = None
    try:
        if client_factory is None:
            limits.clients()  # Pinned numeric init then read=None, retries=0; never fixed-client abandonment.
            from app.v3.services import clickhouse as ch
            client_factory = ch._get_client
        client = client_factory()
        driver = Driver(client, output / 'native', guard)
        actions = Actions(root, driver)
        version = driver.query('SELECT version() AS version')
        cap = driver.query("SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")
        if version != [dict(version=modern.ENGINE)] or int(cap[0]['value']) != 22 * 1024**3:
            raise ValueError('row-model engine/envelope differs from banked all-fixes store')
        copy_fence(driver, root)
        print('[row-model] build canonical controls and typed post family', flush=True)
        actions.fixtures()
        result['build'] = actions.build()
        save(output / 'result.json', result)
        driver.collect_pending()
        driver.require_native(driver.records)
        print('[row-model] independent full-key/type/domain verification', flush=True)
        result['verification'] = actions.verify()
        save(output / 'result.json', result)
        copy_fence(driver, root)
        print('[row-model] verified; start isolated assembly comparisons', flush=True)
        result['measurements'] = cell.measure(actions, banked, result['verification'])
        copy_fence(driver, root)
        phases = [phase for values in result['measurements'].values() for phase in values]
        complete = all(value[variant]['parity'] == 'PASS' for value in phases for variant in ('canonical', 'rows'))
        measured = [value['comparison']['verdict'] for value in phases if value['phase'] == 'measured' and 'comparison' in value]
        result.update(outcome='OBSERVATIONS_COMPLETE' if complete else 'PARTIAL_MEASUREMENTS',
            measured_assembly_verdicts=measured, native_acceptance='SEE_EACH_ASSEMBLY_STAGE_NOT_WHOLE_ARM',
            orphan_value_gc='OPEN_REFCOUNT_QUESTION', canonical_JSON_preserved=True)
        return result
    except BaseException as error:
        result.update(outcome='STOP_BEFORE_OR_DURING_ROW_CELL', **details(error))
        raise
    finally:
        if driver is not None:
            try:
                driver.collect_pending()
            except Exception as error:
                result['final_collection_failure'] = details(error)
        save(output / 'result.json', result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
