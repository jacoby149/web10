"""Frozen-build ClickHouse adapter, injected typed driver; no import-time I/O.

Only explicitly authorized experimental page identities enter reads. This
adapter is not an authorization endpoint. It does not implement production
write concurrency, GC, arbitrary-query planning or a migration away from JSON.
"""
from collections import defaultdict

import row_model as model
import row_model_sql as sql


def metadata(value):
    return value.decode('ascii') if isinstance(value, bytes) else value


def value_rows(kind, rows):
    values, identities = {}, {}
    for row in rows:
        row_id = metadata(row['value_row_id'])
        if kind == 'documents':
            identity = model.Identity(row['author_key'], row['doc_id'])
            if identity.row_id != row_id:
                raise ValueError('document-reference row identity changed')
            identities[row_id] = identity
        else:
            payload = row['value']
            if kind == 'nulls':
                if type(payload) is not int or payload != 0:
                    raise ValueError('invalid typed null sentinel')
                payload = None
            value = model.Value(kind, payload)
            if value.row_id != row_id:
                raise ValueError('immutable typed value row changed')
            key = kind, row_id
            if key in values and values[key] != value:
                raise ValueError('conflicting immutable typed value rows')
            values[key] = value
    return values, identities


class Store:
    def __init__(self, query, insert):
        self.query, self.insert = query, insert

    def fetch_values(self, pointers):
        selected = defaultdict(set)
        for pointer in pointers:
            if not pointer.deleted:
                selected[pointer.type].add(pointer.value_row_id)
        values, identities = {}, {}
        for kind, ids in sorted(selected.items()):
            typed, refs = value_rows(kind, self.query(sql.values(kind, ids)))
            values.update(typed)
            identities.update(refs)
        return values, identities

    def fetch_pointers(self, nodes, *, paths=None):
        result = defaultdict(list)
        allowed = {(node.identity.row_id, node.version) for node in nodes}
        for row in self.query(sql.pointers(nodes, paths=paths)):
            pointer = model.Pointer(**{**row, 'document_row_id': metadata(row['document_row_id']),
                'value_row_id': metadata(row['value_row_id'])})
            if (pointer.document_row_id, pointer.version) not in allowed:
                raise ValueError('unexpected document/version returned by pointer seek')
            result[pointer.document_row_id].append(pointer)
        return result

    def write(self, batch, *, setup_only, writers_stopped):
        return self.write_many([batch], setup_only=setup_only, writers_stopped=writers_stopped)

    def write_many(self, batches, *, setup_only, writers_stopped):
        if setup_only is not True or writers_stopped is not True:
            raise ValueError('row-model writes are isolated quiescent setup only')
        batches = list(batches)
        if not batches:
            raise ValueError('nonempty complete-identity build batch required')
        nodes = {(batch.node.identity.row_id, batch.node.version): batch.node for batch in batches}
        if len(nodes) != len(batches):
            raise ValueError('duplicate commit identity/version in build batch')
        identities = {item.row_id: item for batch in batches for item in (batch.node.identity, *batch.references)}
        existing_rows = self.query(sql.values('documents', identities))
        _, existing = value_rows('documents', existing_rows)
        added = [item for row_id, item in identities.items() if row_id not in existing]
        if added:
            self.insert('row_documents', [(v.row_id, v.author_key, v.doc_id) for v in added],
                ['value_row_id', 'author_key', 'doc_id'])
        by_type = defaultdict(dict)
        for batch in batches:
            for value in batch.values:
                by_type[value.type][value.row_id] = value
        for kind, values in sorted(by_type.items()):
            previous, _ = value_rows(kind, self.query(sql.values(kind, values)))
            added = [value for row_id, value in values.items() if (kind, row_id) not in previous]
            if added:
                self.insert('row_' + kind, [(v.row_id, 0 if kind == 'nulls' else v.value) for v in added],
                    ['value_row_id', 'value'])
        # Stage the entire exact-version pointer batch before publishing a skinny
        # commit header. Missing/corrupt value rows or partial writes refuse it.
        staged = [p for batch in batches for p in batch.pointers]
        if staged:
            self.insert('row_pointers', [(p.document_row_id, p.version, p.key, p.type, p.value_row_id, p.deleted)
                for p in staged], ['document_row_id', 'version', 'key', 'type', 'value_row_id', 'deleted'])
        pointers = defaultdict(list)
        for row in self.query(sql.pointers(nodes.values())):
            p = model.Pointer(**{**row, 'document_row_id': metadata(row['document_row_id']),
                'value_row_id': metadata(row['value_row_id'])})
            if (p.document_row_id, p.version) not in nodes:
                raise ValueError('foreign pointer returned during commit verification')
            pointers[p.document_row_id, p.version].append(p)
        values, references = self.fetch_values([p for rows in pointers.values() for p in rows])
        for key, node in nodes.items():
            model.assemble(node, pointers.get(key, []), values, references)
        self.insert('row_document_versions', [(node.identity.row_id, node.version, node.deleted,
            node.pointer_count, node.pointer_digest) for node in nodes.values()],
            ['document_row_id', 'version', 'deleted', 'pointer_count', 'pointer_digest'])

    def read(self, identities, *, paths=None, frozen=None):
        identities = {identity.row_id: identity for identity in identities}
        if (paths is not None and frozen is None) or (frozen is not None and frozen.verify() is not True):
            raise ValueError('selected-key reads require current whole-model parity and native part fences')
        nodes = {}
        for row in self.query(sql.nodes(identities.values())):
            owner = metadata(row['document_row_id'])
            if owner not in identities or owner in nodes:
                raise ValueError('unexpected or conflicting current document commit')
            nodes[owner] = model.Version(identities[owner], row['version'], row['deleted'],
                row['pointer_count'], metadata(row['pointer_digest']))
        live = [node for node in nodes.values() if not node.deleted]
        pointers = self.fetch_pointers(live, paths=paths) if live else {}
        values, refs = self.fetch_values([pointer for rows in pointers.values() for pointer in rows])
        result = {}
        for owner, identity in identities.items():
            node = nodes.get(owner)
            if node is None:
                raise ValueError('requested canonical document has no committed row-model identity')
            if node.deleted:
                result[identity] = None
            elif paths is None:
                result[identity] = model.assemble(node, pointers.get(owner, []), values, refs)
            else:
                result[identity] = model.assemble_selected(node, pointers.get(owner, []), values, refs, paths,
                    frozen_verified=True)
        if frozen is not None and frozen.verify() is not True:
            raise ValueError('frozen row model changed during selected-key read')
        return result
