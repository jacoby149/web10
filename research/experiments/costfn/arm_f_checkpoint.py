"""Bounded file-only private checkpoints. Never query/restart an engine.

Invoked by an independent collector over pinned SSH, not by the paid worker.
Only declared receipt trees are eligible; input, credentials and stores are not.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import tarfile
import tempfile

MAX_BYTES = 256 * 1024**2
MAX_FILES = 20000
TREES = frozenset(('F-gates', 'failures', 'trim-first', 'F-stages', 'profile',
    'counts-batch-p2', 'metadata', 'metadata-parity', 'presence', 'F-build',
    'population', 'evidence', 'orchestration-preflight'))
FILES = frozenset(('result.json', 'scoped-stop.json', 'fresh-trial.json',
    'fresh-trial-failure.json', 'F-startup-failure.json', 'F-api-ready.json',
    'restore.json', 'source-manifest.json', 'failure.json', 'F.stop'))
SECRET_NAMES = frozenset(('archive-urls.json', 'manifest.json', 'admission.json',
    'operation.json', 'cloud-init.yaml', 'client-key', 'host-key'))


def eligible(relative):
    parts = relative.parts
    if any(p in SECRET_NAMES or p.startswith('.') for p in parts):
        return False
    if len(parts) >= 3 and parts[0] == 'trials':
        parts = parts[2:]
    return (bool(parts) and (len(parts) == 1 and parts[0] in FILES
        or parts[0] in TREES and relative.suffix in ('.json', '.jsonl', '.sql')))


def snapshot(root, output):
    root = Path(root).resolve(strict=True)
    admission = json.loads((root / 'admission.json').read_bytes())
    manifest = json.loads((root / 'source-manifest.json').read_bytes())
    value = dict(kind='F_PRIVATE_FILE_CHECKPOINT', droplet_id=admission['droplet_id'],
        deadline_utc=admission['deadline_utc'], source_manifest=manifest,
        admission_sha256=hashlib.sha256((root / 'admission.json').read_bytes()).hexdigest(),
        files={}, not_a_gate_verdict=True)
    total = 0
    # Assemble entirely before emitting: a refused/partial walk cannot look like
    # a completed checkpoint. Never follow directory symlinks (e.g. trial input).
    with tempfile.TemporaryFile() as spool:
        with tarfile.open(fileobj=spool, mode='w:gz') as archive:
            for directory, dirs, files, directory_fd in os.fwalk(root, follow_symlinks=False):
                current = Path(directory).relative_to(root).parts
                allowed = TREES | {'trials'} if not current else TREES if len(current) == 2 and current[0] == 'trials' else None
                dirs[:] = sorted(d for d in dirs if not (Path(directory) / d).is_symlink()
                    and (allowed is None or d in allowed))
                for name in sorted(files):
                    path = Path(directory) / name
                    relative = path.relative_to(root)
                    if not eligible(relative):
                        continue
                    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
                    with os.fdopen(fd, 'rb') as stream:
                        before = os.fstat(stream.fileno())
                        if not stat.S_ISREG(before.st_mode):
                            raise ValueError('checkpoint requires regular receipt files')
                        if total + before.st_size > MAX_BYTES or len(value['files']) >= MAX_FILES:
                            raise ValueError('private checkpoint bound exceeded')
                        data = stream.read(before.st_size + 1)
                        after = os.fstat(stream.fileno())
                    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                        # Append-only live ledgers may move. Omit explicitly;
                        # immutable gate results are still collected next time.
                        value.setdefault('changing_files', []).append(str(relative))
                        continue
                    total += len(data)
                    info = tarfile.TarInfo(str(relative))
                    info.size, info.mode = len(data), 0o600
                    archive.addfile(info, io.BytesIO(data))
                    value['files'][str(relative)] = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            data = json.dumps(value, sort_keys=True).encode()
            info = tarfile.TarInfo('checkpoint.json')
            info.size, info.mode = len(data), 0o600
            archive.addfile(info, io.BytesIO(data))
        spool.seek(0)
        while data := spool.read(1024**2):
            output.write(data)
    return value


def verify(path, *, droplet_id, deadline_utc, source_manifest):
    """Independent sink readback. No extraction or trusting archive paths."""
    class Limited:
        remaining = MAX_BYTES + 32 * 1024**2

        def __init__(self, stream):
            self.stream = stream

        def read(self, size):
            if size < 0 or size > self.remaining:
                raise ValueError('decompressed checkpoint bound exceeded')
            data = self.stream.read(size)
            self.remaining -= len(data)
            return data

    observed, value = {}, None
    with gzip.open(path, 'rb') as decompressed, tarfile.open(fileobj=Limited(decompressed), mode='r|') as archive:
        for member in archive:
            if (len(observed) >= MAX_FILES + 1 or member.name in observed or not member.isfile()
                    or member.size < 0 or member.size > MAX_BYTES):
                raise ValueError('invalid/bounded checkpoint archive required')
            if member.name != 'checkpoint.json':
                relative = Path(member.name)
                if relative.is_absolute() or '..' in relative.parts or not eligible(relative):
                    raise ValueError('undeclared checkpoint path')
            stream = archive.extractfile(member)
            digest, length = hashlib.sha256(), 0
            if member.name == 'checkpoint.json':
                if member.size > 8 * 1024**2:
                    raise ValueError('checkpoint manifest bound exceeded')
                value = json.load(stream)
            else:
                while data := stream.read(1024**2):
                    length += len(data)
                    digest.update(data)
            observed[member.name] = dict(bytes=length, sha256=digest.hexdigest())
        if value is None:
            raise ValueError('checkpoint manifest missing')
        if (value.get('kind') != 'F_PRIVATE_FILE_CHECKPOINT' or value.get('droplet_id') != droplet_id
                or value.get('deadline_utc') != deadline_utc or value.get('source_manifest') != source_manifest
                or value.get('not_a_gate_verdict') is not True
                or set(value['files']) != set(observed) - {'checkpoint.json'}):
            raise ValueError('checkpoint host/deadline/source/files differ')
        if any(observed[name] != expected for name, expected in value['files'].items()):
            raise ValueError('checkpoint file digest differs')
        return value


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--root', type=Path)
    group.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if args.verify:
        verify(args.verify, **json.load(sys.stdin))
    else:
        snapshot(args.root, sys.stdout.buffer)
