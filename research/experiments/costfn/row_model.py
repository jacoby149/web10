"""Post-family row-model experiment: typed immutable values, versioned pointers.

No JSON is stored here. Parsing the canonical source belongs at ingest; the
wire adapter reassembles at egress. This is a frozen experimental snapshot
format, not a production transaction or garbage-collection implementation.

Each committed document version is a COMPLETE pointer snapshot. Removed keys
have explicit pointer tombstones. Reads never inherit keys from a different
version. A skinny commit header binds the complete pointer set, so incomplete
multi-table writes cannot be mistaken for an assembled document.
"""
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import math
import struct

TYPES = frozenset(('text', 'integers', 'floats', 'timestamps', 'booleans', 'nulls', 'objects', 'arrays', 'documents'))


def exact_equal(left, right):
    """Key-for-key/types too: Python's True == 1 is not a parity oracle."""
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(exact_equal(left[k], right[k]) for k in left)
    if isinstance(left, (list, tuple)):
        return len(left) == len(right) and all(exact_equal(a, b) for a, b in zip(left, right, strict=True))
    if isinstance(left, float):
        return struct.pack('>d', left) == struct.pack('>d', right)
    return left == right


def framed(raw):
    return len(raw).to_bytes(8, 'big') + raw


@dataclass(frozen=True)
class Identity:
    author_key: str
    doc_id: str

    @property
    def row_id(self):
        if any(not isinstance(v, str) or not v for v in (self.author_key, self.doc_id)):
            raise ValueError('full document identity required')
        return hashlib.sha256(b'document\0' + framed(self.author_key.encode()) + framed(self.doc_id.encode())).hexdigest()


def encode_path(path):
    result = bytearray()
    for part in path:
        if isinstance(part, str):
            value = part.encode('utf-8')
            result += b'k' + str(len(value)).encode() + b':' + value
        elif type(part) is int and part >= 0:
            result += b'i' + str(part).encode() + b':'
        else:
            raise ValueError('dictionary string or nonnegative array-index path required')
    return result.decode('utf-8')


def decode_path(key):
    raw, cursor, path = key.encode('utf-8'), 0, []
    while cursor < len(raw):
        kind = raw[cursor:cursor + 1]
        separator = raw.find(b':', cursor + 1)
        if separator < 0:
            raise ValueError('malformed dictionary-coded path')
        digits = raw[cursor + 1:separator]
        if not digits.isdigit() or len(digits) > 1 and digits.startswith(b'0'):
            raise ValueError('noncanonical dictionary-coded path')
        size, cursor = int(digits), separator + 1
        if kind == b'k':
            if cursor + size > len(raw):
                raise ValueError('truncated dictionary key')
            path.append(raw[cursor:cursor + size].decode('utf-8'))
            cursor += size
        elif kind == b'i':
            path.append(size)
        else:
            raise ValueError('unknown path kind')
    return tuple(path)


def typed(value):
    if value is None:
        return 'nulls', None
    if type(value) is bool:
        return 'booleans', value
    if type(value) is int:
        if not -(2**255) <= value < 2**255:
            raise ValueError('integer outside admitted Int256 storage type')
        return 'integers', value
    if type(value) is float:
        if not math.isfinite(value):
            raise ValueError('nonfinite numbers are not JSON values')
        return 'floats', value
    if isinstance(value, datetime):
        if value.tzinfo is None or not 1900 <= value.year <= 2299:
            raise ValueError('aware supported DateTime64 timestamp required')
        return 'timestamps', value.astimezone(UTC)
    if isinstance(value, str):
        value.encode('utf-8')
        return 'text', value
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise ValueError('JSON object keys must be strings')
        return 'objects', len(value)
    if isinstance(value, list):
        return 'arrays', len(value)
    raise ValueError('unsupported canonical value type')


def value_bytes(kind, value):
    if kind == 'text':
        if not isinstance(value, str):
            raise ValueError('typed text required')
        return value.encode('utf-8')
    if kind in ('integers', 'objects', 'arrays'):
        if type(value) is not int or (kind != 'integers' and value < 0):
            raise ValueError('typed integer/container length required')
        return value.to_bytes(32, 'big', signed=True)
    if kind == 'floats':
        if type(value) is not float or not math.isfinite(value):
            raise ValueError('typed finite float required')
        return struct.pack('>d', value)
    if kind == 'timestamps':
        if not isinstance(value, datetime) or value.tzinfo is None:
            raise ValueError('typed aware timestamp required')
        delta = value.astimezone(UTC) - datetime(1970, 1, 1, tzinfo=UTC)
        micros = (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
        return micros.to_bytes(16, 'big', signed=True)
    if kind == 'booleans' and type(value) is bool:
        return bytes([value])
    if kind == 'nulls' and value is None:
        return b''
    raise ValueError('type and immutable value disagree')


@dataclass(frozen=True)
class Value:
    type: str
    value: object

    @property
    def row_id(self):
        return hashlib.sha256(self.type.encode() + b'\0' + value_bytes(self.type, self.value)).hexdigest()


@dataclass(frozen=True)
class Pointer:
    document_row_id: str
    version: int
    key: str
    type: str
    value_row_id: str
    deleted: bool = False


def pointer_digest(pointers):
    rows = []
    for pointer in sorted(pointers, key=lambda item: item.key):
        rows.append(framed(pointer.key.encode()) + framed(pointer.type.encode())
            + framed(pointer.value_row_id.encode()) + bytes([pointer.deleted]))
    return hashlib.sha256(b''.join(rows)).hexdigest()


@dataclass(frozen=True)
class Version:
    identity: Identity
    version: int
    deleted: bool
    pointer_count: int
    pointer_digest: str


@dataclass(frozen=True)
class Batch:
    node: Version
    pointers: tuple
    values: tuple
    references: tuple


def decompose(document, version, *, previous=(), deleted=False, references=None):
    if type(version) is not int or not 0 <= version < 2**63:
        raise ValueError('explicit nonnegative Int64 document version required')
    identity = Identity(document['author_key'], document['doc_id'])
    owner = identity.row_id
    pointers, values, edges = {}, {}, {}
    references = references or {}
    used = set()
    def add(path, value):
        key = encode_path(path)
        if path in references:
            target = references[path]
            if not isinstance(target, Identity) or value != target.doc_id:
                raise ValueError('declared document edge differs from canonical scalar')
            kind, value_id = 'documents', target.row_id
            edges[value_id] = target
            used.add(path)
        else:
            kind, payload = typed(value)
            stored = Value(kind, payload)
            value_id = stored.row_id
            values[kind, value_id] = stored
        pointers[key] = Pointer(owner, version, key, kind, value_id)
        if isinstance(value, dict):
            for name, child in value.items():
                add((*path, name), child)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                add((*path, index), child)
    if not deleted:
        for name, value in document.items():
            if name not in ('author_key', 'doc_id'):
                add((name,), value)
    if used != set(references):
        raise ValueError('declared reference path missing from canonical document')
    # Every new version writes its complete live pointer set. Explicit key
    # tombstones keep deletion visible without carrying fat JSON or old values.
    for prior in previous:
        if prior.document_row_id != owner or prior.version >= version:
            raise ValueError('previous pointers must belong to an older version of the exact document')
        if not deleted and prior.key not in pointers:
            pointers[prior.key] = Pointer(owner, version, prior.key, '', '', True)
    rows = tuple(sorted(pointers.values(), key=lambda item: item.key))
    node = Version(identity, version, deleted, len(rows), pointer_digest(rows))
    return Batch(node, rows, tuple(values.values()), tuple(edges.values()))


def assemble(node, pointers, values, identities):
    """Assemble ONE exact committed version, refusing mixed/partial snapshots."""
    owner = node.identity.row_id
    selected = {}
    for pointer in pointers:
        if pointer.document_row_id != owner or pointer.version != node.version:
            raise ValueError('foreign or mixed-version pointer set')
        if pointer.key in selected and selected[pointer.key] != pointer:
            raise ValueError('conflicting pointer winners at the committed version')
        selected[pointer.key] = pointer
    rows = tuple(selected.values())
    if node.pointer_count != len(rows) or node.pointer_digest != pointer_digest(rows):
        raise ValueError('incomplete or changed committed pointer snapshot')
    if node.deleted:
        if rows:
            raise ValueError('deleted document commit cannot retain payload pointers')
        return None
    payload = hydrate(node, rows, values, identities)
    children = child_map(payload)
    result = dict(author_key=node.identity.author_key, doc_id=node.identity.doc_id)
    result.update({name: materialize(payload, children, (name,)) for name in children.get((), [])})
    return result


def hydrate(node, rows, values, identities):
    payload, seen = {}, {}
    for pointer in rows:
        if pointer.document_row_id != node.identity.row_id or pointer.version != node.version:
            raise ValueError('foreign or mixed-version pointer set')
        if pointer.key in seen and seen[pointer.key] != pointer:
            raise ValueError('conflicting selected pointer winners')
        seen[pointer.key] = pointer
        path = decode_path(pointer.key)
        if not path or not isinstance(path[0], str) or path[0] in ('author_key', 'doc_id'):
            raise ValueError('payload pointer cannot replace document identity')
        if pointer.deleted:
            if pointer.type or pointer.value_row_id:
                raise ValueError('key tombstone cannot carry a value')
            continue
        if pointer.type == 'documents':
            target = identities.get(pointer.value_row_id)
            if target is None or target.row_id != pointer.value_row_id:
                raise ValueError('missing or mismatched referenced document identity')
            value = target.doc_id  # Identity only, never follow the edge for authority/content.
        else:
            stored = values.get((pointer.type, pointer.value_row_id))
            if stored is None or stored.type != pointer.type or stored.row_id != pointer.value_row_id:
                raise ValueError('missing, changed or mistyped immutable value')
            value = stored.value
        if path in payload and payload[path] != (pointer.type, value):
            raise ValueError('conflicting selected pointer winners')
        payload[path] = pointer.type, value
    return payload


def child_map(payload):
    children = {}
    for path in payload:
        parent = path[:-1]
        if parent and (parent not in payload or payload[parent][0] not in ('objects', 'arrays')):
            raise ValueError('orphaned pointer below a missing/noncontainer parent')
        children.setdefault(parent, []).append(path[-1])
    return children


def materialize(payload, children, path):
    kind, value = payload[path]
    names = children.get(path, [])
    if kind == 'objects':
        if len(names) != value or any(not isinstance(name, str) for name in names):
            raise ValueError('incomplete object pointer children')
        return {name: materialize(payload, children, (*path, name)) for name in names}
    if kind == 'arrays':
        if any(type(name) is not int for name in names) or sorted(names) != list(range(value)):
            raise ValueError('incomplete array pointer children')
        return [materialize(payload, children, (*path, index)) for index in range(value)]
    if names:
        raise ValueError('scalar pointer has children')
    return value


def assemble_selected(node, pointers, values, identities, paths, *, frozen_verified):
    """Frozen experiment only: fetch selected subtrees, not unselected payload.

    The mandatory native whole-model parity/part fence certifies completeness
    BEFORE this cheaper path is used. It does not promise concurrent publication
    or production snapshot isolation. All returned values still verify immutable
    IDs, exact owner/version, ancestor shape and complete requested subtrees.
    """
    if frozen_verified is not True:
        raise ValueError('selected-key assembly requires an unchanged verified frozen model')
    if node.deleted:
        return None
    payload = hydrate(node, pointers, values, identities)
    children = child_map(payload)
    return {path: materialize(payload, children, path) for path in paths if path in payload}


class MemoryStore:
    """Exact no-engine reference for staged builds; not a production DB."""
    def __init__(self):
        self.values, self.identities, self.pointers, self.versions = {}, {}, {}, {}

    def stage(self, batch):
        self.identities[batch.node.identity.row_id] = batch.node.identity
        for identity in batch.references:
            self.identities[identity.row_id] = identity
        for value in batch.values:
            key = value.type, value.row_id
            if key in self.values and self.values[key] != value:
                raise ValueError('immutable value identity conflict')
            self.values[key] = value
        key = batch.node.identity.row_id, batch.node.version
        if key in self.pointers and self.pointers[key] != batch.pointers:
            raise ValueError('immutable pointer version conflict')
        self.pointers[key] = batch.pointers

    def publish(self, node):
        key = node.identity.row_id, node.version
        assemble(node, self.pointers.get(key, ()), self.values, self.identities)
        if key in self.versions and self.versions[key] != node:
            raise ValueError('document commit version conflict')
        self.versions[key] = node

    def read(self, identity, *, at=None):
        versions = [node for (owner, version), node in self.versions.items()
            if owner == identity.row_id and (at is None or version <= at)]
        if not versions:
            return None
        node = max(versions, key=lambda item: item.version)
        return assemble(node, self.pointers[node.identity.row_id, node.version], self.values, self.identities)
