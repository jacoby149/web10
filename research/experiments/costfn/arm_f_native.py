"""Native F build from canonical alone, only AFTER reported Step0 P parity.

Initial historical backfill is setup, not a measured publish shortcut. Workload
writes must enter arm_f_api's real authorized endpoints and coordinator.
"""
from datetime import UTC, datetime
import ast
import hashlib
import json
from pathlib import Path
import re

import arm_f as f
from arm_f_runtime import Session
import arm_satellite_counts as counts
from arm_satellite_sql import literal as q


def recent_canonical(groups):
    """Canonical-only rebuild root. No fanout/transpose/string/counter dependency."""
    selected = ','.join(q(group) for group in groups) or "''"
    return ("SELECT d.author_key AS author_key,d.doc_id AS doc_id,d.created_at AS created_at,g.group_id AS group_id FROM (SELECT author_key,doc_id,created_at,deleted,"
        "row_number() OVER (PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents) AS d "
        "INNER JOIN (SELECT doc_id,group_id,deleted,row_number() OVER (PARTITION BY doc_id,group_id "
        "ORDER BY updated_at DESC,deleted DESC) AS rn FROM doc_groups WHERE group_id IN (" + selected
        + ")) AS g ON d.doc_id=g.doc_id WHERE d.rn=1 AND g.rn=1 AND d.deleted=0 AND g.deleted=0 "
        "QUALIFY row_number() OVER (PARTITION BY g.group_id ORDER BY d.created_at DESC,d.doc_id DESC,d.author_key DESC)<="
        + str(f.CAP) + ' ORDER BY d.created_at DESC,d.doc_id DESC,d.author_key DESC,g.group_id')


def save(path, value):
    path = Path(path)
    with path.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        __import__('os').fsync(stream.fileno())


def authorized_sources(*, closure=None):
    """Offline admission preflight as well as the final native-build guard."""
    repository = Path(__file__).resolve().parents[3]
    text = closure if closure is not None else Path(__file__).with_name('ARM-F-DESIGN-CLOSURE.md').read_text()
    entries = re.findall(r'^([a-f0-9]{64})  (.+)$', text, re.M)
    if not entries:
        raise ValueError('approved authorized source manifest missing')
    for expected, name in entries:
        if hashlib.sha256((repository / name).read_bytes()).hexdigest() != expected:
            raise ValueError('approved authorized source drift: ' + name)
    return {name: expected for expected, name in entries}


def build(root, *, step0_root=None):
    root = Path(root)
    session = Session(root)
    baseline = Path(step0_root) if step0_root is not None else root
    scoped = session.operation.get('scope') in ('F_GATES_ONLY', 'F_DEPLOY_REHEARSAL')
    if scoped:
        import arm_f_banked
        reference = arm_f_banked.citation(root)
        step0_digest = reference['archive_sha256']
        step0_status = 'CITED_PASS'
    else:
        step0 = json.loads((baseline / 'serve-probe/config-p.json').read_bytes())
        if step0.get('T2') != 'PASS' or step0.get('droplet_id') != session.host_id or not (baseline / 'step0-stage-table.json').is_file():
            raise ValueError('source-bound complete P Step0/parity required before any F build')
        report = json.loads((baseline / 'evidence/step0-reported.json').read_bytes())
        if report.get('stage_table_sha256') != hashlib.sha256((baseline / 'step0-stage-table.json').read_bytes()).hexdigest():
            raise ValueError('report P stage table before building F')
        step0_digest = hashlib.sha256((baseline / 'serve-probe/config-p.json').read_bytes()).hexdigest()
        step0_status = 'PASS'
    authorized_sources()
    output = root / 'F-build'
    output.mkdir(mode=0o700, exist_ok=False)
    profile = json.loads((root / 'profile/inventory.json').read_bytes())
    result = dict(kind='CONFIG_F_CANONICAL_BUILD', outcome='BUILDING', P_Step0_T2=step0_status,
        Step0_reference='PR#1572 cited, not re-measured' if scoped else str(baseline), Step0_receipt_sha256=step0_digest,
        droplet_id=session.host_id, dataset_id=session.operation['dataset_id'], cutoff=f.CUTOFF,
        logical_cap=f.CAP, DDL_sha256=hashlib.sha256(f.DDL.encode()).hexdigest(),
        group_members={}, queries=[], rebuild_sources=['documents', 'doc_groups', 'group_members'],
        scope='one predeclared ordinary reader historical backfill; not global-reader capacity',
        source_sha256={name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                       for name in ('arm_f.py', 'arm_f_api.py', 'arm_f_journal.py', 'arm_f_store.py',
                                    'arm_f_native.py', 'arm_f_runtime.py', 'arm_f_profile_api.py')})
    result['adapter_hook_lines'] = [{'symbol': node.name, 'line': node.lineno}
        for node in ast.walk(ast.parse(Path(__file__).with_name('arm_f_api.py').read_text()))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in ('create', 'member', 'compile_query', 'execute_query', 'application', 'install_membership_hook')]
    save(output / 'result.json', result)
    def query(label, sql):
        (output / (label + '.sql')).write_text(sql + '\n')
        raw, query_id = session.query(label, sql, setup_seconds=900)
        result['queries'].append({'label': label, 'native': session.native(query_id)})
        save(output / 'result.json', result)
        return raw
    try:
        result['envelope'] = session.verify_envelope()
        before, _ = counts.generation(session)
        query('F_ddl', f.DDL)
        result['actual_ddl'] = query('F_show_create', 'SHOW CREATE TABLE fanout')
        for index, group in enumerate(profile['groups']):
            # Read count and recipient set together even when the lane is seek.
            sql = f.MEMBERS.replace('{group_id:String}', q(group)) + ' FORMAT JSON'
            keys = [row['member_key'] for row in json.loads(query('F_members_' + str(index), sql))['data']]
            if profile['reader'] not in keys or len(keys) != len(set(keys)):
                raise ValueError('canonical reader membership/recipient set differs')
            result['group_members'][group] = len(keys)
        small = [group for group, number in result['group_members'].items() if number < f.CUTOFF]
        # One full canonical pass, not group->author inference or another satellite.
        candidates = json.loads(query('F_canonical_recent', recent_canonical(small) + ' FORMAT JSON'))['data'] if small else []
        identities = []
        for row in candidates:
            identity = row['author_key'], row['doc_id']
            if identity not in identities:
                identities.append(identity)
        retained = set(identities[:f.CAP])
        selected = [row for row in candidates if (row['author_key'], row['doc_id']) in retained]
        if selected:
            values = ['(' + ','.join([q(profile['reader']),
                'parseDateTime64BestEffort(' + q(row['created_at']) + ",3,'UTC')", q(row['author_key']),
                q(row['doc_id']), q(row['group_id']), '1', '0']) + ')' for row in selected]
            query('F_historical_backfill', 'INSERT INTO fanout (' + ','.join(f.COLUMNS) + ') VALUES ' + ','.join(values))
        stored = json.loads(query('F_verify_cache', f.cache_sql(profile['reader'], small) + ' FORMAT JSON'))['data']
        expected = {(row['author_key'], row['doc_id'], row['group_id']) for row in selected}
        actual = {(row['author_key'], row['doc_id'], row['group_id']) for row in stored}
        if len(stored) != len(actual) or actual != expected:
            raise ValueError('canonical historical fanout cache mismatch')
        after, _ = counts.generation(session)
        if after != before:
            raise ValueError('canonical sources changed during F historical build')
        result.update(outcome='F_BUILD_READY_FOR_T4', canonical_generation=after,
                      logical_identities=len(retained), physical_route_rows=len(selected))
        state = root / 'fanout-state'
        state.mkdir(mode=0o700, exist_ok=False)
        (state / 'admission.json').write_bytes((root / 'admission.json').read_bytes())
        # Bootstrap backfill consumes logical revision1; real journal intents must
        # start above it, otherwise their first tombstone/edit can tie the seed.
        from arm_f_journal import Journal
        journal = Journal(state / 'journal')
        journal.run('canonical-bootstrap', '__derived_setup__', 'bootstrap', {}, lambda: None,
                    lambda *args: {'canonical_backfill': True}, lambda *args: None)
        journal.close()
        save(state / 'build.json', result)
    except Exception as error:
        result.update(outcome='STOP', failure_class=type(error).__name__)
        raise
    finally:
        result['updated_utc'] = datetime.now(UTC).isoformat()
        save(output / 'result.json', result)
    return result


if __name__ == '__main__':
    import sys
    print(json.dumps(build(Path(sys.argv[1])), indent=2))
