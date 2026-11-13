"""Explicit floor SIGKILL/resume drill (Docker or pinned native); never
connects to the cloud run. Engine execution for this lane is Digital Ocean
only; the drill runs on the approved host against its floor dataset."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def docker():
    command=['docker']
    if os.environ.get('REALISM_DOCKER_CONTEXT'):
        command+=['--context',os.environ['REALISM_DOCKER_CONTEXT']]
    return command


def remove_owned_container(work):
    # A SIGKILL cannot execute finally/close. Match the exact unique fixture
    # workspace mount, not a container name prefix or somebody else's engine.
    ids=subprocess.check_output(docker()+['ps','-q'],text=True).split()
    for ident in ids:
        info=json.loads(subprocess.check_output(docker()+['inspect',ident],text=True))[0]
        if any(m.get('Source')==str(work.resolve()) and m.get('Destination')=='/work' for m in info['Mounts']):
            subprocess.run(docker()+['rm','--force',ident],check=True,capture_output=True,timeout=30)


def cleanup(work,docker_mode):
    if docker_mode:
        remove_owned_container(work)


def run(dataset,root,reference):
    docker_mode=os.environ.get('REALISM_CLICKHOUSE_DOCKER')=='1'
    if os.environ.get('REALISM_CLICKHOUSE_REUSE_WORK'):
        raise ValueError('drill cannot target an existing import workspace')
    root.mkdir(exist_ok=False)
    entry=Path(__file__).with_name('realism_validate.py')
    trials={}
    for label in ('uninterrupted','interrupted'):
        trial=root/label
        target=trial/'dataset'
        target.mkdir(parents=True)
        for path in dataset.iterdir():
            if path.is_symlink() or not path.is_file():
                raise ValueError('floor must contain regular input files')
            os.link(path,target/path.name)
        command=[sys.executable,str(entry),str(target),'--out',str(trial/'receipt.json'),'--keep-work']
        logpath=trial/'run.log'
        with logpath.open('w') as log:
            child=subprocess.Popen(command,stdout=log,stderr=log,start_new_session=True)
            if label=='uninterrupted':
                try:
                    if child.wait(timeout=420):
                        raise RuntimeError('uninterrupted floor failed; retain log')
                finally:
                    if child.poll() is None:
                        os.killpg(child.pid,signal.SIGKILL)
                        child.wait()
                        for work in trial.glob('realism-clickhouse-*'):
                            cleanup(work,docker_mode)
            else:
                deadline=time.monotonic()+420
                try:
                    while child.poll() is None:
                        text=logpath.read_text()
                        segment=text.rsplit('stage=delivery_window ',1)
                        if len(segment)==2 and '[clickhouse-validator] read operation=SELECT ' in segment[1]:
                            work=next(trial.glob('realism-clickhouse-*'))
                            if (work/'checkpoints/verdicts/delivery_window.json').exists():
                                raise RuntimeError('missed interruption window; no simulated success')
                            os.killpg(child.pid,signal.SIGKILL)
                            child.wait()
                            break
                        if time.monotonic()>deadline:
                            raise TimeoutError('floor never reached the real delivery-window query')
                        time.sleep(.05)
                    else:
                        raise RuntimeError('validator exited before the intended kill')
                finally:
                    if child.poll() is None:
                        os.killpg(child.pid,signal.SIGKILL)
                        child.wait()
                    for work in trial.glob('realism-clickhouse-*'):
                        cleanup(work,docker_mode)
                records=work/'checkpoints/verdicts'
                completed={p.name:p.read_bytes().hex() for p in records.glob('*.json')}
                if len(completed)!=11 or (records/'delivery_window.json').exists():
                    raise RuntimeError('kill did not leave exactly eleven completed checks')
                with (trial/'resume.log').open('w') as resumed:
                    subprocess.run(command+['--resume'],stdout=resumed,stderr=resumed,check=True,timeout=420)
                text=(trial/'resume.log').read_text()
                assert text.count('action=reuse verdict=True')==11
                assert 'check=delivery_window action=complete verdict=True' in text
                assert all((records/name).read_bytes().hex()==value for name,value in completed.items())
                assert len(list(records.glob('*.json')))==50
        trials[label]=json.loads((trial/'receipt.json').read_text())
    assert trials['uninterrupted']==trials['interrupted'],'resumed receipt differs from uninterrupted receipt'
    assert (root/'uninterrupted/receipt.json').read_bytes()==(root/'interrupted/receipt.json').read_bytes()
    assert trials['interrupted']['complete'] and len(trials['interrupted']['checks'])==50
    old=json.loads(reference.read_text())
    for key in ('checks','authorship','per_account','per_post','concentration','correlations','cells','arithmetic','tables'):
        assert trials['interrupted'][key]==old[key],key
    proof={'complete':True,'signal':'SIGKILL','completed_checks_skipped':11,
        'interrupted_check':'delivery_window','interrupted_check_reran_whole':True,
        'final_checks':50,'identical_final_receipts':True,'pinned_reference_summary_parity':True}
    (root/'drill.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--reference',type=Path,required=True)
    args=parser.parse_args()
    run(args.dataset.resolve(),args.out.resolve(),args.reference.resolve())
