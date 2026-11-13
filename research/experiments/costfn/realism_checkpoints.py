"""Bound, synced check-phase sidecars; no partial-query or failed-verdict adoption."""
import json
from pathlib import Path
import time

from realism_contract import encoded, sha
import hashlib


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


class CheckFailed(ValueError):
    def __init__(self,name,checks):
        super().__init__('recorded failed check: '+name)
        self.name,self.checks=name,dict(checks)


class Checkpoints:
    def __init__(self,db,manifest,*,resume=False):
        from realism_clickhouse import VERSION, atomic_json
        self.db,self.write=db,atomic_json
        self.root=db.work/'checkpoints'
        if self.root.is_symlink():
            raise ValueError('checkpoint directory must not be a symlink')
        self.root.mkdir(exist_ok=True)
        here=Path(__file__).parent
        context={'dataset_id':manifest['dataset_id'],'files':manifest['files'],
            'entrypoint':sha(here/'realism_validate.py'),'engine_source':sha(here/'realism_clickhouse.py'),
            'checkpoint_source':sha(__file__),'contract_source':sha(here/'realism_contract.py'),
            'engine':VERSION,'profile':db.profile,'settings':db.settings}
        path=self.root/'context.json'
        if path.is_symlink():
            raise ValueError('checkpoint context must not be a symlink')
        if path.exists():
            if json.loads(path.read_text())!=context:
                raise ValueError('stale check context; input/source/engine/profile mismatch')
            if not resume:
                raise ValueError('check context exists; explicit resume required')
        else:
            if any(self.root.iterdir()):
                raise ValueError('unbound checkpoint records; refuse adoption')
            self.write(path,context)
        self.context=digest(context)
        self.checks={}
        self.tables={name:json.loads((db.work/'imports'/f'{name}.json').read_text())
            for name in manifest['files']}
        for kind in ('verdicts','derived','reports'):
            folder=self.root/kind
            if folder.is_symlink():
                raise ValueError('checkpoint subdirectory must not be a symlink')
            folder.mkdir(exist_ok=True)
        self.denied=frozenset(self.denied_names())
        # Detect tampering/FAIL before repeating any expensive derived work.
        for path in sorted((self.root/'verdicts').glob('*.json')):
            record=self.load(path)
            if type(record.get('verdict')) is not bool:
                raise ValueError('invalid verdict record')
            if not record['verdict']:
                raise CheckFailed(record['name'],{record['name']:False})

    def denied_names(self):
        path=self.root/'admissions.json'
        if not path.exists():
            return []
        if path.is_symlink():
            raise ValueError('admission record must not be a symlink')
        envelope=json.loads(path.read_text())
        if envelope.get('sha256')!=digest(envelope['denied']):
            raise ValueError('tampered admission record')
        return list(envelope['denied'])

    def deny(self,name):
        # A hash build that still hit the memory limit keeps the disk-capable
        # algorithm for the remainder of this work directory; the recorded
        # verdict settings make a resumed run replay the same decision.
        self.denied=self.denied|{name}
        self.write(self.root/'admissions.json',{'denied':sorted(self.denied),'sha256':digest(sorted(self.denied))})

    def load(self,path):
        if path.is_symlink():
            raise ValueError('checkpoint record must not be a symlink')
        envelope=json.loads(path.read_text())
        record=envelope['record']
        if envelope.get('sha256')!=digest(record) or record.get('context')!=self.context:
            raise ValueError('tampered or stale checkpoint record: '+path.name)
        return record

    def save(self,path,record):
        record={'context':self.context,**record}
        self.write(path,{'record':record,'sha256':digest(record)})

    def evaluate(self,name,producer,definition=None):
        path=self.root/'verdicts'/f'{name}.json'
        expected={'name':name,'definition':digest(definition or name),'tables':self.tables}
        start=time.monotonic()
        if path.exists():
            record=self.load(path)
            if any(record.get(k)!=v for k,v in expected.items()):
                raise ValueError('check definition/table binding changed: '+name)
            verdict=record['verdict']
            elapsed=record['elapsed_seconds']
            action='reuse'
        else:
            try:
                verdict=bool(producer())
            except RuntimeError as error:
                if 'Memory limit' in str(error) and (definition or {}).get('settings',{}).get('join_algorithm')=='hash':
                    self.deny(name)
                raise
            elapsed=time.monotonic()-start
            self.save(path,{**expected,'verdict':verdict,'elapsed_seconds':elapsed})
            action='complete'
        self.checks[name]=verdict
        print(f'[clickhouse-validator] check={name} action={action} verdict={verdict} elapsed_seconds={elapsed:.3f}',flush=True)
        if not verdict:
            raise CheckFailed(name,self.checks)
        return verdict

    def read(self,sql,settings=None):
        settings=settings or {}
        path=self.root/'reports'/(digest({'query':sql,'settings':settings})+'.json')
        expected={'query':sql,'settings':settings,'tables':self.tables}
        if path.exists():
            record=self.load(path)
            if any(record.get(k)!=v for k,v in expected.items()):
                raise ValueError('report query/table/settings binding changed')
            return record['rows']
        start=time.monotonic()
        rows=self.db.query(sql,settings_override=settings or None)
        self.save(path,{**expected,'rows':rows,'elapsed_seconds':time.monotonic()-start})
        return rows

    def completed(self):
        paths={p.stem:p for p in (self.root/'verdicts').glob('*.json')}
        if set(paths)!=set(self.checks):
            raise ValueError('unexpected/missing verdict records at completion')
        checks={name:self.load(paths[name])['verdict'] for name in self.checks}
        for name,verdict in checks.items():
            if verdict is not True:
                raise CheckFailed(name,checks)
        return checks

    def derived(self,name,query,order):
        path=self.root/'derived'/f'{name}.json'
        expected={'name':name,'query':query,'order':order,'dependencies':dict(self.tables)}
        # Never include a table's own previous incarnation as its dependency.
        expected['dependencies'].pop(name,None)
        rows=self.db.query("SELECT toString(uuid) FROM system.tables WHERE database='validation' AND name='"+name+"'")
        valid=False
        if path.exists():
            record=self.load(path)
            valid=(all(record.get(k)==v for k,v in expected.items()) and bool(rows)
                and record.get('uuid')==rows[0][0]
                and record.get('rows')==self.db.scalar(f'SELECT count() FROM {name}'))
        if not valid:
            print(f'[clickhouse-validator] derived={name} action=rebuild',flush=True)
            self.db.query(f'DROP TABLE IF EXISTS {name}')
            self.db.table(name,query,order)
            record={**expected,'uuid':self.db.scalar("SELECT toString(uuid) FROM system.tables WHERE database='validation' AND name='"+name+"'"),
                'rows':self.db.scalar(f'SELECT count() FROM {name}')}
            self.save(path,record)
        else:
            print(f'[clickhouse-validator] derived={name} action=reuse rows={record["rows"]}',flush=True)
        self.tables[name]={'uuid':record['uuid'],'rows':record['rows'],'producer':digest(expected)}
