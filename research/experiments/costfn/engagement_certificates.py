"""Frozen-store physical rebinding; cached values never authorize canonical reads."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from arm_f_native import save
import arm_f_infrastructure as infrastructure
import arm_satellite_counts as counts
import engagement_modern as modern
import restore_realism as restore


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def content_files(parts, volume):
    """Hash base column bytes/types, not projection or physical mutation metadata."""
    volume = Path(volume).resolve()
    result = []
    for part in parts:
        relative = Path(part['path']).relative_to('/var/lib/clickhouse')
        directory = (volume / relative).resolve()
        directory.relative_to(volume)
        files = [p for p in directory.iterdir() if p.name == 'columns.txt' or p.suffix == '.bin']
        if not files or not any(p.suffix == '.bin' for p in files):
            raise ValueError('active canonical part has no base column bytes')
        columns = []
        for path in sorted(files):
            if path.is_symlink() or not path.is_file():
                raise ValueError('canonical base file must be a regular owned file')
            hashed = hashlib.sha256()
            with path.open('rb') as stream:
                while chunk := stream.read(8 * 1024**2):
                    hashed.update(chunk)
            columns.append(dict(name=path.name, bytes=path.stat().st_size, sha256=hashed.hexdigest()))
        result.append(dict(table=part['table'], files=columns))
    return sorted(result, key=lambda row: json.dumps(row, sort_keys=True))


def fingerprint(session):
    generation, parts = counts.generation(session)
    rows, _ = session.rows('completion_canonical_paths', "SELECT table,path FROM system.parts WHERE database='web10' AND active "
        'AND table IN (' + ','.join("'" + table + "'" for table in infrastructure.CANONICAL_TABLES) + ') ORDER BY table,name')
    container = restore.command(session.compose, session.env, 'ps', '-q', 'clickhouse').decode().strip()
    info = json.loads(restore.command(['docker'], session.env, 'inspect', container))[0]
    if info['HostConfig']['Memory'] != 28 * 1024**3:
        raise ValueError('owned completion engine memory differs')
    volume = next(m['Source'] for m in info['Mounts'] if m['Destination'] == '/var/lib/clickhouse')
    files = content_files(rows, volume)
    if counts.generation(session)[0] != generation:
        raise ValueError('canonical parts changed during byte fingerprint')
    return dict(canonical_generation=generation, canonical_parts=parts,
        canonical_content_sha256=hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest(), base_files=files)


def receipt_paths(root):
    root = Path(root)
    return {name: root / relative for name, relative in {
        'counts-ordinary': 'counts-ordinary.json', 'counts-fixture': 'counts-fixture.json',
        'presence-ordinary': 'presence-ordinary.json', 'presence-fixture': 'presence-fixture.json',
        'metadata': 'metadata/result.json', 'parity': 'metadata-parity/result.json',
        'fanout': 'fanout-template/build.json'}.items()}


def bind(root, session, generation, provenance):
    """Keep old scope keys addressing the SAME immutable values; refresh hashes too."""
    paths = receipt_paths(root)
    for name, path in paths.items():
        value = json.loads(path.read_bytes())
        value.setdefault('scope_source_generation', value['canonical_generation'])
        value.update(droplet_id=session.host_id, canonical_generation=generation, generation_rebinding=provenance)
        if name == 'metadata':
            value['count_receipt_sha256'] = digest(paths['counts-ordinary'])
        elif name == 'parity':
            value['metadata_sha256'] = digest(paths['metadata'])
        save(path, value)
    certificate = dict(canonical_generation=generation, droplet_id=session.host_id,
        receipts={name: digest(path) for name, path in paths.items()}, provenance=deepcopy(provenance))
    save(Path(root) / 'certification.json', certificate)
    return certificate


def refresh(root, before, name):
    root = Path(root)
    output = root / ('certification-' + name)
    output.mkdir(mode=0o700, exist_ok=False)
    session = modern.Session(root)
    after = fingerprint(session)
    save(output / 'before.json', before)
    save(output / 'after.json', after)
    def totals(value):
        result = {}
        for part in value['canonical_parts']:
            result[part['table']] = result.get(part['table'], 0) + int(part['rows'])
        return result
    if (before['canonical_content_sha256'] != after['canonical_content_sha256']
            or before['base_files'] != after['base_files'] or totals(before) != totals(after)):
        raise ValueError('canonical base data changed: cannot rebind physical certificates')
    provenance = dict(kind='IDENTICAL_CANONICAL_BASE_BYTES_AFTER_MATERIALIZATION',
        before_generation=before['canonical_generation'], after_generation=after['canonical_generation'],
        canonical_content_sha256=after['canonical_content_sha256'], proof_sha256=digest(output / 'after.json'),
        cached_values_rebuilt=False, scope_keys_rewritten=False)
    certificate = bind(root, session, after['canonical_generation'], provenance)
    save(output / 'certificate.json', certificate)
    verify(root)
    return certificate


def verify(root):
    root = Path(root)
    session = modern.Session(root)
    certificate = json.loads((root / 'certification.json').read_bytes())
    current, _ = counts.generation(session)
    if certificate['canonical_generation'] != current or certificate['droplet_id'] != session.host_id:
        raise ValueError('uncertified generation refused BEFORE measurement')
    for name, path in receipt_paths(root).items():
        value = json.loads(path.read_bytes())
        if (digest(path) != certificate['receipts'][name] or value['canonical_generation'] != current
                or value['droplet_id'] != session.host_id):
            raise ValueError('counter/metadata/fanout certificate disagrees BEFORE measurement: ' + name)
    return certificate
