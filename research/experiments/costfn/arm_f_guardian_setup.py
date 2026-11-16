"""Set up one admitted isolated controller; credentials remain in private state."""
import argparse
import base64
from datetime import UTC, datetime
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import shlex
import shutil
import subprocess
import sys
import tarfile
import time
import uuid
import yaml

HERE = Path('research/experiments/costfn').resolve()
sys.path.insert(0, str(HERE))
import arm_f_cloud as cloud  # noqa: E402
import arm_f_guardian as guardian  # noqa: E402
import arm_f_provider as provider  # noqa: E402

STATE = Path('.context/guardian-controller.json')
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes', '-o', 'IPQoS=none', 'jacob@192.168.8.25']


def prepare(*,resume=False):
    if resume:
        previous=json.loads(STATE.read_bytes())
        if previous['phase']!='preparing' or cloud.api('compute','droplet','list'):
            raise ValueError('only pre-resource preparation may resume')
        name,root=previous['name'],Path(previous['root'])
    else:
        if STATE.exists():
            raise ValueError('existing controller preparation; no repeat or adoption')
        name = 'web10-f-guardian-' + uuid.uuid4().hex[:12]
        root = Path.home() / '.local/state/web10-research' / name
        root.mkdir(mode=0o700)
        cloud.save(STATE, dict(root=str(root), name=name, phase='preparing'))
    raw = yaml.safe_load((Path.home() / '.local/state/web10-research/guardian-auth/doctl.yaml').read_text())
    context = 'f-cleanup-guardian'
    oauth = raw['oauth-tokens'][context]
    if not set(oauth['scope'].split()) <= provider.SCOPES:
        raise ValueError('broad provider credential refused')
    auth = dict(access_token=raw['auth-contexts'][context], refresh_token=oauth['refresh-token'],
        scope=oauth['scope'], client_id=oauth['client-id'], token_endpoint=oauth['token-endpoint'],
        expires_at=str(oauth['expires-at']).replace(' ', 'T'))
    # Actual refresh/read proof while there are no paid resources. From this
    # point only this isolated JSON owns the rotating cleanup refresh token.
    if not (root/'cleanup-auth.json').exists():
        auth['expires_at'] = '2020-01-01T00:00:00+00:00'
        cloud.save(root / 'cleanup-auth.json', auth)
    account = provider.invoke(['--http-retry-max', '0', '--output', 'json', 'account', 'get'], root / 'cleanup-auth.json')
    expected = cloud.api('account', 'get')
    expected = expected[0] if isinstance(expected, list) else expected
    if account['uuid'] != expected['uuid']:
        raise ValueError('scoped account differs')
    address = subprocess.check_output([*SSH, 'curl -fsS --max-time 10 https://api.ipify.org'], timeout=20).decode().strip()
    import ipaddress
    source = str(ipaddress.IPv4Address(address)) + '/32'
    for key in ('client-key', 'host-key'):
        if not (root/key).exists():
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(root / key)], check=True, capture_output=True)
    # Mint exact-key PUT/GET only inside the existing API process. No general
    # storage credential or configuration leaves the production host.
    code = '''import json
from app.services.media import get_s3_signing_client
from app import settings
s = get_s3_signing_client()
prefix = 'research/costfn/guardian/CONTROLLER/'
slots=[]
for i in range(96):
 p={'Bucket':settings.S3_BUCKET,'Key':prefix+str(i)+'.tar.gz'}
 slots.append({m:s.generate_presigned_url(op,Params=p,ExpiresIn=28800) for m,op in [('put','put_object'),('get','get_object')]})
print(json.dumps({'slots':slots}))
'''.replace('CONTROLLER', name)
    minted = int(time.time())
    result = subprocess.run([*SSH, 'docker exec -i web10-prod-api-1 /web10/.venv/bin/python -'], input=code.encode(), capture_output=True, check=True, timeout=30)
    cloud.save(root / 'sink.json', json.loads(result.stdout))
    account_receipt = dict(scoped_account_matches=True, actual_scoped_refresh_read=True,
        account_uuid=account['uuid'], scope=oauth['scope'])
    cloud.save(root / 'auth-proof.json', account_receipt)
    cloud.save(STATE, dict(root=str(root), name=name, ssh_source_cidr=source, account_uuid=account['uuid'],
        sink_expires_epoch=minted+28800, phase='prepared'))
    print(json.dumps(dict(phase='prepared', name=name, scoped_refresh_read='PASS', no_paid_resource=True)))


def create():
    state = json.loads(STATE.read_bytes())
    root, name = Path(state['root']), state['name']
    if state['phase'] != 'prepared' or cloud.api('compute', 'droplet', 'list'):
        raise ValueError('fresh isolated controller only, no retry/adoption')
    size = next(r for r in cloud.api('compute', 'size', 'list') if r['slug'] == 's-1vcpu-1gb')
    if size['price_hourly'] != .00893 or not size['available'] or 'nyc3' not in size['regions']:
        raise ValueError('exact bounded auxiliary SKU unavailable')
    now = int(time.time())
    if now + 21600 + 600 > state['sink_expires_epoch']:
        raise ValueError('prepared capabilities do not cover the original controller lifetime plus margin')
    lease = dict(name=name, tag=name, size=size['slug'], region='nyc3', created_epoch=now,
        deadline=now+21600, max_usd=.10, hourly_usd=.00893, account_uuid=state['account_uuid'],
        ssh_source_cidr=state['ssh_source_cidr'])
    guardian.validate(lease)
    cloud.save(root/'controller-lease.json',lease)
    for filename in ('arm_f_cloud.py','arm_f_guardian.py'):
        shutil.copyfile(HERE/filename,root/filename)
    shutil.copyfile(HERE/'arm_f_guardian_watch.py',root/'secondary-watchdog.py')
    program=cloud.watchdog_program(root/'secondary-watchdog.py',root/'controller-lease.json')
    label='app.web10.guardian.'+name.rsplit('-',1)[1]
    plist=Path.home()/'Library/LaunchAgents'/(label+'.plist')
    with plist.open('wb') as stream:
        plistlib.dump(dict(Label=label,ProgramArguments=program,RunAtLoad=True,StartInterval=30,
            StandardOutPath=str(root/'secondary.out'),StandardErrorPath=str(root/'secondary.err')),stream)
    subprocess.run(['launchctl','bootstrap','gui/'+str(os.getuid()),str(plist)],check=True,capture_output=True)
    subprocess.run(program,check=True,capture_output=True,timeout=30)
    state['watchdog_label']=label
    cloud.save(STATE,state)
    public=(root/'client-key.pub').read_text().strip()
    key=cloud.api('compute','ssh-key','create',name,'--public-key',public)
    key=key[0] if isinstance(key,list) else key
    lease.update(ssh_key_id=key['id'],key_fingerprint=key['fingerprint'])
    cloud.save(root/'controller-lease.json',lease)
    cloud.api('compute','tag','create',name)
    fw=cloud.api('compute','firewall','create','--name',name,'--tag-names',name,
        '--inbound-rules','protocol:tcp,ports:22,address:'+state['ssh_source_cidr'],
        '--outbound-rules','protocol:tcp,ports:1-65535,address:0.0.0.0/0 protocol:udp,ports:1-65535,address:0.0.0.0/0 protocol:icmp,address:0.0.0.0/0')
    fw=fw[0] if isinstance(fw,list) else fw
    lease['firewall_id']=fw['id']
    cloud.save(root/'controller-lease.json',lease)
    checked=cloud.api('compute','firewall','get',str(fw['id']))
    cloud.firewall_verified(checked[0] if isinstance(checked,list) else checked,lease)
    names=['arm_f_cloud.py','arm_f_checkpoint.py','arm_f_safety.py','arm_f_sink.py','arm_f_provider.py','arm_f_guardian.py']
    payload=io.BytesIO()
    with tarfile.open(fileobj=payload,mode='w:gz') as archive:
        for filename in names:
            archive.add(HERE/filename,arcname=filename,recursive=False)
    digest=hashlib.sha256(payload.getvalue()).hexdigest()
    cloud.save(root/'source-hashes.json',{n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in names})
    expire=datetime.fromtimestamp(lease['deadline']-300,UTC).strftime('%Y-%m-%d %H:%M:%S UTC')
    boot='''import json,subprocess,urllib.request
with urllib.request.urlopen('http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address',timeout=3) as r: ip=r.read(64).decode().strip()
raise SystemExit(subprocess.call(['/usr/bin/python3','-I','-S','/opt/web10-guardian/code/arm_f_safety.py','serve','--root','/opt/web10-guardian/state','--doctl','/opt/web10-guardian/code/arm_f_provider.py','--account-uuid','ACCOUNT','--ssh-source-cidr',ip+'/32']))
'''.replace('ACCOUNT',state['account_uuid'])
    service='[Unit]\nAfter=network-online.target cloud-final.service\n[Service]\nType=simple\nExecStart=/usr/bin/python3 -I -S /opt/web10-guardian/boot.py\nRestart=always\nRestartSec=5\n[Install]\nWantedBy=multi-user.target\n'
    finalizer='[Unit]\nAfter=network-online.target\nStartLimitIntervalSec=0\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 -I -S /opt/web10-guardian/expiry/arm_f_guardian.py\nRestart=on-failure\nRestartSec=20\n'
    timer='[Unit]\nDescription=Original absolute guardian deletion deadline\n[Timer]\nOnCalendar='+expire+'\nAccuracySec=1s\nRandomizedDelaySec=0\nPersistent=true\n[Install]\nWantedBy=timers.target\n'
    files=[]
    def add(path,data,permissions='0600'):
        files.append(dict(path=path,encoding='b64',permissions=permissions,content=base64.b64encode(data).decode()))
    add('/opt/web10-guardian/code.tar.gz',payload.getvalue())
    # Independent flat expiry programme is written BEFORE archive extraction;
    # even a corrupt/interrupted main payload cannot remove self-deletion.
    for filename in ('arm_f_provider.py','arm_f_guardian.py'):
        add('/opt/web10-guardian/expiry/'+filename,(HERE/filename).read_bytes())
    compatibility='''import arm_f_provider as provider
def api(*args):
 return provider.invoke(['--http-retry-max','0','--output','json',*args])
def account(lease):
 if api('account','get')['uuid']!=lease['account_uuid']:raise ValueError('controller account differs')
'''
    add('/opt/web10-guardian/expiry/arm_f_cloud.py',compatibility.encode())
    add('/opt/web10-guardian/controller-lease.json',json.dumps(lease).encode())
    add('/opt/web10-guardian/cleanup-auth.json',(root/'cleanup-auth.json').read_bytes())
    add('/opt/web10-guardian/boot.py',boot.encode())
    add('/etc/systemd/system/web10-guardian.service',service.encode(),'0644')
    add('/etc/systemd/system/web10-guardian-expire.service',finalizer.encode(),'0644')
    add('/etc/systemd/system/web10-guardian-expire.timer',timer.encode(),'0644')
    unpack="import hashlib,tarfile;from pathlib import Path;p=Path('/opt/web10-guardian/code.tar.gz');assert hashlib.sha256(p.read_bytes()).hexdigest()=="+repr(digest)+";tarfile.open(p).extractall('/opt/web10-guardian/code',filter='data')"
    userdata=dict(ssh_deletekeys=False,ssh_genkeytypes=[],ssh_pwauth=False,disable_root=False,
        ssh_keys=dict(ed25519_private=(root/'host-key').read_text(),ed25519_public=(root/'host-key.pub').read_text().strip()),
        users=[dict(name='root',lock_passwd=True,ssh_authorized_keys=[public])],write_files=files,
        runcmd=[['chmod','700','/opt/web10-guardian'],['install','-d','-m','700','/opt/web10-guardian/state'],
            ['systemctl','daemon-reload'],['systemctl','enable','--now','web10-guardian-expire.timer'],
            ['/usr/bin/python3','-c',unpack],['chmod','700','/opt/web10-guardian/code/arm_f_provider.py'],
            ['systemctl','enable','web10-guardian.service'],['systemctl','start','--no-block','web10-guardian.service']])
    data='#cloud-config\n'+json.dumps(userdata)
    if len(data.encode())>64000:
        raise ValueError('bounded cloud-init payload exceeded')
    (root/'cloud-init.yaml').write_text(data)
    (root/'cloud-init.yaml').chmod(0o600)
    state['phase']='creation_uncertain'
    cloud.save(STATE,state)
    row=cloud.api('compute','droplet','create',name,'--region','nyc3','--size',size['slug'],
        '--image','ubuntu-24-04-x64','--ssh-keys',str(key['id']),'--tag-names',name,'--user-data-file',str(root/'cloud-init.yaml'))
    row=row[0] if isinstance(row,list) else row
    state.update(phase='created',droplet_id=row['id'])
    lease['droplet_id']=row['id']
    cloud.save(root/'controller-lease.json',lease)
    cloud.save(STATE,state)
    print(json.dumps(dict(droplet_id=row['id'],deadline_utc=datetime.fromtimestamp(lease['deadline'],UTC).isoformat(),
        hourly_usd=lease['hourly_usd'],six_hour_estimate_usd=lease['hourly_usd']*6)))


def configure():
    state=json.loads(STATE.read_bytes())
    if state['phase']!='created':
        raise ValueError('configure only the exact newly created controller')
    root=Path(state['root'])
    lease=json.loads((root/'controller-lease.json').read_bytes())
    guardian.identity(lease,state['droplet_id'])
    start=time.monotonic()
    while True:
        row=cloud.api('compute','droplet','get',str(state['droplet_id']))
        row=row[0] if isinstance(row,list) else row
        addresses=[r['ip_address'] for r in row.get('networks',{}).get('v4',[]) if r.get('type')=='public']
        if row.get('status')=='active' and len(addresses)==1:
            break
        if time.monotonic()-start>120:
            raise TimeoutError('controller IPv4 readiness')
        time.sleep(2)
    import ipaddress
    address=str(ipaddress.IPv4Address(addresses[0]))
    (root/'known_hosts').write_text(address+' '+(root/'host-key.pub').read_text().strip()+'\n')
    alias='f-guardian-'+state['name'].rsplit('-',1)[1]
    config='Host '+alias+'\n HostName '+address+'\n User root\n IdentityFile '+str(root/'client-key')+'\n UserKnownHostsFile '+str(root/'known_hosts')+'\n StrictHostKeyChecking yes\n IPQoS none\n ProxyCommand ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o IPQoS=none -W %h:%p jacob@192.168.8.25\n'
    (root/'ssh_config').write_text(config)
    (root/'ssh_config').chmod(0o600)
    options=['ssh','-F',str(root/'ssh_config'),'-o','BatchMode=yes','-o','ConnectTimeout=10',alias]
    start=time.monotonic()
    while True:
        result=subprocess.run([*options,'true'],capture_output=True,timeout=15)
        if result.returncode==0:
            break
        if time.monotonic()-start>120:
            raise TimeoutError('controller pinned SSH readiness')
        time.sleep(2)
    def ssh(command,*,data=None,timeout=35):
        result=subprocess.run([*options,command],input=data,capture_output=True,timeout=timeout)
        if result.returncode:
            (root/'configure-last-stderr.txt').write_bytes(result.stderr)
            raise RuntimeError('controller configuration command failed; private stderr retained')
        return result.stdout
    ssh('cloud-init status --wait || test "$?" = 2',timeout=90)
    ssh('systemctl is-active web10-guardian-expire.timer')
    sink=json.loads((root/'sink.json').read_bytes())
    probe=sink['slots'].pop()
    install="import os,sys;fd=os.open('/opt/web10-guardian/state/sink.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);f=os.fdopen(fd,'wb');f.write(sys.stdin.buffer.read());f.flush();os.fsync(f.fileno());f.close()"
    ssh('python3 -I -S -c '+shlex.quote(install),data=json.dumps(sink).encode())
    code="import sys,json;from pathlib import Path;sys.path.insert(0,'/opt/web10-guardian/code');import arm_f_cloud as c,arm_f_sink as s;p=Path('/opt/web10-guardian/state/offsite-probe.json');p.write_text(json.dumps({'controller_droplet_id':"+str(state['droplet_id'])+",'not_a_gate_verdict':True},sort_keys=True));r=s.publish(p,json.load(sys.stdin));r['controller_droplet_id']="+str(state['droplet_id'])+";c.save('/opt/web10-guardian/state/offsite-proof.json',r);print(json.dumps(r))"
    proof=json.loads(ssh('python3 -I -S -c '+shlex.quote(code),data=json.dumps(probe).encode()))
    # An actual private off-controller object must remain anonymous-denied.
    import urllib.request
    import urllib.error
    try:
        urllib.request.urlopen('https://minio.web10.app'+proof['key'],timeout=10)
    except urllib.error.HTTPError as error:
        if error.code!=403:
            raise ValueError('unexpected anonymous receipt status') from None
    else:
        raise ValueError('private receipt unexpectedly anonymous-readable')
    probe_status="import json,sys;from pathlib import Path;sys.path.insert(0,'/opt/web10-guardian/code');import arm_f_safety as s;print(json.dumps(s.status(Path('/opt/web10-guardian/state'))))"
    start=time.monotonic()
    while True:
        live=json.loads(ssh('python3 -I -S -c '+shlex.quote(probe_status)))
        if live.get('offsite_ready') is True:
            break
        if time.monotonic()-start>15:
            raise TimeoutError('controller offsite-ready heartbeat')
        time.sleep(1)
    expected=json.loads((root/'source-hashes.json').read_bytes())
    if live['sources']!=expected:
        raise ValueError('executing guardian source binding differs')
    config=dict(host=alias,root='/opt/web10-guardian/state',script='/opt/web10-guardian/code/arm_f_safety.py',
        known_hosts=str(root/'known_hosts'),identity=str(root/'client-key'),ssh_config=str(root/'ssh_config'),controller=lease)
    cloud.save('.context/fanout-safety-controller.json',config)
    cloud.save(root/'readiness.json',dict(live=live,offsite=proof,anonymous_read_status=403,
        expiry_timer='ACTIVE',no_engine=True))
    state.update(phase='configured',ip=address,alias=alias)
    cloud.save(STATE,state)
    print(json.dumps(dict(controller_droplet_id=state['droplet_id'],offsite_write_readback='PASS',
        anonymous_status=403,independent_guardian='LIVE',expiry_timer='ACTIVE',engine_executed=False)))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['prepare','resume-prepare','create','configure'])
    args=parser.parse_args()
    {'prepare':prepare,'resume-prepare':lambda:prepare(resume=True),'create':create,'configure':configure}[args.action]()
