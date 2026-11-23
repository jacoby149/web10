"""Stream complete post identities into the maximal row model on an owned store.

Source JSON is read ONLY for ingest/oracle. No JSON path query is used to build
the typed values. Existing generic identity hints propose reference owners;
canonical full keys verify them. Missing/ambiguous legacy edges refuse, never
become text or a guessed author to manufacture a passing migration.
"""
import row_model as model
import row_model_ingest as ingest
from arm_satellite_sql import identifier, literal as q

COLUMNS = ('doc_id', 'author_key', 'collection_name', 'body', 'ref_value', 'tags',
    'created_at', 'updated_at', 'deleted', 'ad_mode', 'ad_target', 'posted_by')
IDENTITY_BATCH_SIZE = 4096


def lake(tables):
    if not tables:
        raise ValueError('explicit immutable canonical source tables required')
    return '(' + ' UNION ALL '.join('SELECT ' + ','.join(COLUMNS) + ' FROM ' + identifier(table)
        + " WHERE collection_name='posts'" for table in tables) + ')'


def identity_page(tables, after=None, size=IDENTITY_BATCH_SIZE):
    if type(size) is not int or not 1 <= size <= IDENTITY_BATCH_SIZE:
        raise ValueError('bounded complete-identity ingest page required')
    predicate = '' if after is None else ' AND (author_key,doc_id)>(' + q(after[0]) + ',' + q(after[1]) + ')'
    # Exact top-K union: a globally first K distinct identity must be in the
    # first K DISTINCT identities of at least one source. Push cursor/order/K
    # into each physical PK lane rather than sorting the whole remaining lake
    # for every ingest page. This is never a LIMIT over document history.
    branches = ['SELECT DISTINCT author_key,doc_id FROM ' + identifier(table)
        + " WHERE collection_name='posts'" + predicate + ' ORDER BY author_key,doc_id LIMIT ' + str(size) for table in tables]
    if not branches:
        raise ValueError('explicit canonical sources required')
    return ('SELECT DISTINCT author_key,doc_id FROM (' + ' UNION ALL '.join('(' + branch + ')' for branch in branches)
        + ') ORDER BY author_key,doc_id LIMIT ' + str(size))


def histories(tables, identities):
    keys = sorted({(value.author_key, value.doc_id) for value in identities})
    if not keys:
        raise ValueError('explicit full document keys required')
    selected = ','.join('(' + q(author) + ',' + q(doc) + ')' for author, doc in keys)
    branches = ['SELECT ' + ','.join(COLUMNS) + ' FROM ' + identifier(table)
        + " WHERE collection_name='posts' AND (author_key,doc_id) IN (" + selected + ')' for table in tables]
    if not branches:
        raise ValueError('explicit canonical sources required')
    return ('SELECT ' + ','.join(COLUMNS) + ' FROM (' + ' UNION ALL '.join(branches)
        + ') ORDER BY author_key,doc_id,updated_at,deleted')


def declared_edges(document):
    """The legacy post family's existing declared refs, not guessed text paths."""
    result = {}
    for name in ('ref_value', 'ad_target'):
        if name in document and not isinstance(document[name], str):
            raise ValueError('declared legacy document reference must be a string')
        if document.get(name):
            result[(name,)] = document[name]
    body = document.get('body', {})
    if not isinstance(body, dict):
        raise ValueError('canonical post body must be an object')
    for name in ('parent_id', 'target_id', 'ad_id'):
        if name in body and not isinstance(body[name], str):
            raise ValueError('declared legacy target must be a string')
        if body.get(name):
            result['body', name] = body[name]
    refs = body.get('refs', [])
    if not isinstance(refs, list) or any(not isinstance(value, str) for value in refs):
        raise ValueError('declared reference list must be an array')
    for index, value in enumerate(refs):
        if value:
            result['body', 'refs', index] = value
    if any(not isinstance(value, str) for value in result.values()):
        raise ValueError('declared legacy document references must be strings')
    return result


class Builder:
    def __init__(self, query, store, checkpoint, *, source_tables, quiescent_verified=False, identity_table=None):
        if quiescent_verified is not True:
            raise ValueError('frozen source and stopped experimental writers must be verified before build')
        self.query, self.store, self.checkpoint = query, store, checkpoint
        self.tables = tuple(source_tables)
        self.identity_table = identifier(identity_table) if identity_table is not None else None
        lake(self.tables)  # Validate fixed source identifiers before any I/O.

    def reference_owners(self, names):
        if not names:
            return {}
        selected = ','.join(q(value) for value in sorted(names))
        if self.identity_table is None:
            hints = self.query('SELECT author_key,doc_id FROM strings WHERE owner_key IN (' + selected
                + ") AND startsWith(field_name,'document:') GROUP BY author_key,doc_id")
        else:
            hints = self.query('SELECT author_key,doc_id FROM ' + self.identity_table
                + ' WHERE doc_id IN (' + selected + ') GROUP BY author_key,doc_id')
        if not hints:
            raise ValueError('canonical legacy references have no indexed identity candidates')
        # Validate the entire full-key candidate set against actual canonical
        # history. A metadata hint never creates a document or grants its body.
        keys = ','.join('(' + q(row['author_key']) + ',' + q(row['doc_id']) + ')' for row in hints)
        canonical_sources = ('documents',) if self.identity_table is None else tuple(dict.fromkeys(('documents', *self.tables)))
        canonical = self.query('SELECT author_key,doc_id FROM (' + ' UNION ALL '.join(
            'SELECT author_key,doc_id FROM ' + identifier(table) + ' WHERE (author_key,doc_id) IN (' + keys + ')'
            for table in canonical_sources) + ') GROUP BY author_key,doc_id')
        owners = {}
        for row in canonical:
            identity = model.Identity(row['author_key'], row['doc_id'])
            if identity.doc_id in owners and owners[identity.doc_id] != identity:
                raise ValueError('ambiguous legacy doc-only reference requires an explicit full target identity')
            owners[identity.doc_id] = identity
        if set(owners) != set(names):
            raise ValueError('missing canonical reference identity; do not silently store the edge as text')
        return owners

    def run(self):
        after, built, versions = None, 0, 0
        while True:
            page = self.query(identity_page(self.tables, after))
            if not page:
                break
            identities = [model.Identity(row['author_key'], row['doc_id']) for row in page]
            keys = [(value.author_key, value.doc_id) for value in identities]
            if keys != sorted(set(keys)) or after is not None and keys[0] <= after:
                raise ValueError('canonical full-key cursor failed to advance exactly')
            rows = self.query(histories(self.tables, identities))
            actual = {(row['author_key'], row['doc_id']) for row in rows}
            if actual != set(keys):
                raise ValueError('canonical history fetch omitted a complete identity')
            parsed = ingest.source_versions(rows)  # One ingest parse, never a serving read.
            declared = [(document, version, deleted, {} if deleted else declared_edges(document))
                for document, version, deleted in parsed]
            owners = self.reference_owners({value for _, _, _, edges in declared for value in edges.values()})
            previous, batches = {}, []
            for document, version, deleted, edges in declared:
                identity = model.Identity(document['author_key'], document['doc_id'])
                batch = model.decompose(document, version, previous=previous.get(identity.row_id, ()),
                    deleted=deleted, references={path: owners[value] for path, value in edges.items()})
                previous[identity.row_id] = batch.pointers
                batches.append(batch)
            self.store.write_many(batches, setup_only=True, writers_stopped=True)
            built += len(keys)
            versions += len(batches)
            after = keys[-1]
            self.checkpoint(dict(identities=built, versions=versions, after=after, native_acceptance=False))
        if not built:
            raise ValueError('empty post-family build is not evidence')
        return dict(identities=built, versions=versions, complete=True, native_acceptance=False,
            build_scope='all post identities from explicitly named canonical sources; no other family decomposed')
