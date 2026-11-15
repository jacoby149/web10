"""Collect a stopped setup's receipts without restarting an engine or any cell.

Only content-free experiment receipts/known synthetic SQL go into Git. Raw
system query-log parts stay in private controller storage, not the repository.
"""
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import tarfile


def collect_fixture():
    """File-only collection of a completed tiny preflight while restore continues."""
    state = json.loads(Path('.context/fanout-run.json').read_bytes())
    private = Path(state['root'])
    host = json.loads((private / 'host.json').read_bytes())
    options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=yes',
               '-o', 'UserKnownHostsFile=' + str(private / 'known_hosts'), '-i', str(private / 'client-key')]
    if state.get('ssh_jump'):
        options += ['-J', state['ssh_jump']]
    destination = 'root@' + host['ip']
    script = """from pathlib import Path
import json,tarfile
root=Path('/opt/fanout/checker-native-fixture')
assert json.loads((root/'result.json').read_bytes())['outcome']=='PASS'
with tarfile.open('/opt/fanout/checker-native-evidence.tar.gz','w:gz') as archive:
 for p in root.rglob('*'):
  if p.is_file() and p.suffix in ('.json','.sql'):archive.add(p,arcname=str(p.relative_to(root)))
 for name in ['arm_satellite_reconcile.py','arm_satellite_reconcile_native.py','arm_satellite_metadata.py']:
  archive.add(Path('/opt/fanout/repo/research/experiments/costfn')/name,arcname='executing-source/'+name)
print('tiny native checker evidence collected without SQL or engine interference')
"""
    subprocess.run(['ssh', *options, destination, 'python3 -c ' + shlex.quote(script)],
                   capture_output=True, check=True, timeout=60)
    archive = private / 'checker-native-evidence.tar.gz'
    subprocess.run(['scp', *options, destination + ':/opt/fanout/checker-native-evidence.tar.gz', str(archive)],
                   capture_output=True, check=True, timeout=120)
    output = Path('research/experiments/costfn/evidence/arm-f-batched-20261115/checker-native-fixture')
    output.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive) as data:
        data.extractall(output, filter='data')
    manifest = {str(path.relative_to(output)): {'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(output.rglob('*')) if path.is_file()}
    (output / 'artifact-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print((output / 'result.json').read_text())


def collect():
    state = json.loads(Path('.context/fanout-run.json').read_bytes())
    private = Path(state['root'])
    host = json.loads((private / 'host.json').read_bytes())
    options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=yes',
               '-o', 'UserKnownHostsFile=' + str(private / 'known_hosts'), '-i', str(private / 'client-key')]
    if state.get('ssh_jump'):
        options += ['-J', state['ssh_jump']]
    destination = 'root@' + host['ip']
    script = r"""from pathlib import Path
import hashlib,json,re,subprocess,tarfile
root=Path('/opt/fanout/attempt2')
project='web10-costfn-frozen-satellite-fstep0a2'
assert json.loads((root/'result.json').read_bytes())['outcome']=='STOP'
running=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project]).decode().split()
assert not running,'arm must already be stopped'
containers=[]
ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project]).decode().split()
for identifier in ids:
 info=json.loads(subprocess.check_output(['docker','inspect',identifier]))[0]
 containers.append({'name':info['Name'].lstrip('/'),'status':info['State']['Status'],'exit_code':info['State']['ExitCode'],
                    'oom_killed':info['State']['OOMKilled'],'memory_limit_bytes':info['HostConfig']['Memory']})
 if info['Config']['Labels'].get('com.docker.compose.service')=='clickhouse':
  source=next(m['Source'] for m in info['Mounts'] if m['Destination']=='/var/lib/clickhouse')
  system=Path(source)/'metadata/system'
  if system.is_symlink():
   target=system.readlink()
   system=(Path(source)/target.relative_to('/var/lib/clickhouse')) if target.is_absolute() else (system.parent/target).resolve()
  metadata=system/'query_log.sql'
  if metadata.is_file():
   text=metadata.read_text(); uid=re.search(r"UUID '([a-f0-9-]+)'",text).group(1)
   folder=Path(source)/'store'/uid[:3]/uid
   total=sum(p.stat().st_size for p in folder.rglob('*') if p.is_file())
   assert total<256*1024**2,'bounded query-log archive only'
   with tarfile.open('/opt/fanout/private-query-log.tar.gz','w:gz') as archive:
    archive.add(metadata,arcname='query_log.sql')
    archive.add(folder,arcname='parts')
  (root/'stopped-clickhouse.log').write_bytes(subprocess.check_output(['docker','logs',identifier],stderr=subprocess.STDOUT))
(root/'evidence/stopped-containers.json').write_text(json.dumps(containers,indent=2))
allowed=['result.json','restore.json','evidence/archive.json','evidence/query-ledger.jsonl','evidence/operation.json',
 'evidence/stage-observer-update.json','evidence/stopped-containers.json','counts-batch-p2','metadata','profile/inventory.json']
with tarfile.open('/opt/fanout/stopped-public-receipts.tar.gz','w:gz') as archive:
 for relative in allowed:
  path=root/relative
  if path.exists():archive.add(path,arcname=relative)
 for name in ['arm_f_run.py','arm_f_step0.py','arm_f_profile_api.py','arm_satellite_runtime.py','arm_satellite_metadata.py',
              'arm_satellite_batch_run.py','arm_satellite_batch.py','arm_satellite_batch_fixture.py','arm_satellite_counts.py']:
  path=root/'repo/research/experiments/costfn'/name
  archive.add(path,arcname='executing-source/'+name)
print(json.dumps({'containers':containers,'no_engine_restart':True,'receipt_bytes':Path('/opt/fanout/stopped-public-receipts.tar.gz').stat().st_size,
 'private_query_log_bytes':Path('/opt/fanout/private-query-log.tar.gz').stat().st_size if Path('/opt/fanout/private-query-log.tar.gz').exists() else None}))
"""
    process = subprocess.run(['ssh', *options, destination, 'python3 -c ' + shlex.quote(script)],
                             capture_output=True, check=True, timeout=120)
    summary = json.loads(process.stdout)
    (private / 'collection.json').write_text(json.dumps(summary, indent=2))
    for name in ('stopped-public-receipts.tar.gz', 'private-query-log.tar.gz'):
        if name.startswith('private') and summary['private_query_log_bytes'] is None:
            continue
        subprocess.run(['scp', *options, destination + ':/opt/fanout/' + name, str(private / name)],
                       capture_output=True, check=True, timeout=180)
    output = Path('research/experiments/costfn/evidence/arm-f-20261115/P-setup-stop')
    if output.exists():
        # Extend collection provenance; never overwrite the first raw stop,
        # executing sources or receipt manifest on a second forensic collection.
        log = private / 'private-query-log.tar.gz'
        supplement = dict(kind='STOPPED_QUERY_LOG_PRESERVATION', no_engine_restart=True,
            previous_artifact_manifest_sha256=hashlib.sha256((output / 'artifact-manifest.json').read_bytes()).hexdigest(),
            private_only=True, available=log.is_file())
        if log.is_file():
            supplement.update(bytes=log.stat().st_size, sha256=hashlib.sha256(log.read_bytes()).hexdigest())
        target = output / 'private-query-log-preserved.json'
        with target.open('x') as stream:
            json.dump(supplement, stream, indent=2)
        print(json.dumps(supplement, indent=2))
        return
    output.mkdir(parents=True, exist_ok=False)
    with tarfile.open(private / 'stopped-public-receipts.tar.gz') as archive:
        archive.extractall(output, filter='data')
    stream = (private / 'attempt2-stream.log').read_text()
    lower = stream.index('[realism-restore] command exec failed (241)')
    upper = stream.index('[arm-f] STOP P_satellite_setup', lower)
    (output / 'native-failure.txt').write_text(stream[lower:upper])
    ledger = [json.loads(line) for line in (output / 'evidence/query-ledger.jsonl').read_text().splitlines()]
    failed = [row for row in ledger if row.get('label') == 'transpose_exact_reconciliation']
    verdict = dict(kind='CONFIG_F_PROGRAMME_P_SETUP_STOP', outcome='STOP_BEFORE_STEP0_SERVING',
        droplet_id=host['id'], dataset_id='2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd',
        native_exception_code=241, failure_stage='P transpose exact reconciliation', server_limit_GiB=22,
        server_error_would_use_GiB=27.29, query_tracked_peak='NOT_COLLECTED_WITHOUT_ENGINE_RESTART',
        failed_read_rows='NOT_COLLECTED_WITHOUT_ENGINE_RESTART', failed_read_bytes='NOT_COLLECTED_WITHOUT_ENGINE_RESTART',
        query_ledger=failed, count_T1='PASS', complete_response_samples=0, F_native_gates='NOT_RUN',
        sort_order_arm='PLANNED_NOT_ADMITTED', deadline_utc='2026-11-15T21:23:23Z',
        no_retry_or_limit_increase=True, containers=summary['containers'], native_log_private=summary['private_query_log_bytes'] is not None,
        no_engine_restart=True)
    (output / 'stop.json').write_text(json.dumps(verdict, indent=2) + '\n')
    manifest = {str(path.relative_to(output)): {'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(output.rglob('*')) if path.is_file()}
    (output / 'artifact-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(verdict, indent=2))


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['--fixture']:
        collect_fixture()
    elif sys.argv[1:]:
        raise SystemExit('only explicit --fixture or stopped setup collection accepted')
    else:
        collect()
