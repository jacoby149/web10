"""Concrete canonical/typed assembly action provider, on one frozen owned store."""
from datetime import UTC, datetime, timedelta
import hashlib
import json
import os
from pathlib import Path
import uuid

from arm_f_native import save
from arm_satellite_sql import literal as q
import row_model as model
import row_model_build as build
import row_model_cell as cell
from row_model_fence import Fence, TABLES, fingerprint
from row_model_store import Store, metadata
from row_model_sql import DDL

DIRECTIVE = 'Jacob Hoffman 2026-11-19 post-family maximal row-model assembly after all-fixes'
SOURCES = ('engagement_documents', 'tally_verify_documents', 'canonical_row_model_fixture')
DISPLAYED = tuple((key,) for key in ('body', 'tags', 'ref_value', 'created_at', 'updated_at', 'posted_by', 'ad_mode', 'ad_target'))


def identity_rows(rows):
    return list(dict.fromkeys(model.Identity(row['author_key'], row['doc_id']) for row in rows))


def project(document, paths):
    if document is None:
        return None
    result = {}
    for path in paths:
        value = document
        try:
            for key in path:
                value = value[key]
        except (KeyError, IndexError):
            continue  # Absent stays absent; never default a missing key to null/zero.
        result[path] = value
    return result


class Actions:
    def __init__(self, root, driver):
        self.root, self.driver = Path(root), driver
        self.query, self.store = driver.query, Store(driver.query, driver.insert)
        self.frozen = None
        self.pages, self.domains, self.zero = {}, {}, None

    def checkpoint(self, name, phase, variant, value):
        save(self.root / 'row-model' / (name + '-' + phase + '-' + variant + '.json'), value)

    def comparison(self, name, expected, actual):
        """Private synthetic-dataset parity packet, never an API/HTTP log or Git receipt."""
        def rows(values):
            result = []
            for identity, document in values.items():
                if isinstance(document, dict) and any(isinstance(key, tuple) for key in document):
                    document = [dict(path=list(path), value=value) for path, value in document.items()]
                result.append(dict(author_key=identity.author_key, doc_id=identity.doc_id, document=document))
            return result
        def wire(value):
            if isinstance(value, datetime):
                return value.isoformat()
            raise TypeError('unsupported assembled wire value')
        folder = self.root / 'row-model/private-comparisons'
        folder.mkdir(mode=0o700, exist_ok=True)
        path = folder / (name + '.json')
        data = json.dumps(dict(expected=rows(expected), actual=rows(actual)), default=wire).encode()
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        return dict(private_file=str(path.relative_to(self.root)), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())

    def canonical(self, identities, *, control=False):
        """Independent winner oracle: never calls decompose/assemble/source_versions."""
        identities = list(identities)
        ordinary = [identity for identity in identities if identity != self.zero]
        selected = {}
        if ordinary:
            statement = build.histories(SOURCES, ordinary)
            if control:
                # The control reads canonical WINNERS, not all historical body
                # versions over the wire. Full history is for the independent
                # verifier only; charging its decoding to assembly would bias
                # the experiment against the current document layout.
                keys = ','.join('(' + q(value.author_key) + ',' + q(value.doc_id) + ')' for value in ordinary)
                columns = ','.join(build.COLUMNS)
                statement = ('SELECT ' + columns + ' FROM (SELECT ' + columns + ',row_number() OVER '
                    '(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS row_model_winner FROM '
                    + build.lake(SOURCES) + ' WHERE (author_key,doc_id) IN (' + keys + ')) WHERE row_model_winner=1')
            for row in self.query(statement):
                identity = model.Identity(row['author_key'], row['doc_id'])
                if identity not in ordinary:
                    raise ValueError('canonical assembly returned a foreign full key')
                # In the control/oracle ONLY, parse source JSON and canonical
                # metadata. Typed treatment never calls this function.
                row = dict(row)
                row['body'] = json.loads(row['body']) if isinstance(row['body'], str) else row['body']
                for key in ('created_at', 'updated_at'):
                    value = row[key]
                    if not isinstance(value, datetime) or value.tzinfo is None:
                        raise ValueError('canonical driver must return aware native timestamps')
                    row[key] = value.astimezone(UTC)
                deleted = row.pop('deleted')
                order = row['updated_at'], deleted
                previous = selected.get(identity)
                if previous is None or order > previous[0]:
                    selected[identity] = order, None if deleted else row
                elif order == previous[0] and not deleted and not model.exact_equal(previous[1], row):
                    raise ValueError('ambiguous canonical live tie cannot certify the row model')
        result = {identity: value for identity, (_, value) in selected.items()}
        if self.zero in identities:
            rows = self.query('SELECT author_key,doc_id,document FROM canonical_row_model_zero WHERE doc_id=' + q(self.zero.doc_id))
            if len(rows) != 1 or model.Identity(rows[0]['author_key'], rows[0]['doc_id']) != self.zero:
                raise ValueError('identity-only canonical fixture missing/ambiguous')
            result[self.zero] = json.loads(rows[0]['document'])
        if set(result) != set(identities):
            raise ValueError('canonical oracle omitted a requested identity')
        return result

    def fixtures(self):
        self.driver.command('CREATE TABLE canonical_row_model_fixture AS engagement_documents')
        self.driver.command('CREATE TABLE canonical_row_model_zero (author_key String,doc_id String,document String) '
            'ENGINE=MergeTree ORDER BY (author_key,doc_id)')
        clock = datetime(2026, 11, 19, tzinfo=UTC)
        owner = 'row-model-verification-fixture'
        ids = {name: model.Identity(owner, str(uuid.uuid5(uuid.NAMESPACE_URL, 'row-model:' + name)))
            for name in ('edited', 'deleted', 'shared-a', 'shared-b', 'empty-body', 'identity-only')}
        shared_body = {'text':'shared row-model value', 'integer':2**70 + 1, 'float':3.5, 'boolean':True,
            'null':None, 'nested':{'array':[1, 'two', None]}, 'a.b':'literal key', 'a':{'b':'nested key'}}
        cases = [('edited', {'text':'old', 'removed':True}, 0, False),
            ('edited', {'text':'new'}, 1, False), ('deleted', {'text':'deleted'}, 0, False),
            ('deleted', {'text':'deleted'}, 1, True), ('shared-a', shared_body, 0, False),
            ('shared-b', shared_body, 0, False), ('empty-body', {}, 0, False)]
        rows = []
        for name, body, offset, deleted in cases:
            identity = ids[name]
            rows.append((identity.doc_id, identity.author_key, 'posts', json.dumps(body), '', [], clock,
                clock + timedelta(seconds=offset), deleted, 'none', '', identity.author_key))
        self.driver.insert('canonical_row_model_fixture', rows, list(build.COLUMNS))
        self.zero = ids['identity-only']
        zero = dict(author_key=self.zero.author_key, doc_id=self.zero.doc_id)
        self.driver.insert('canonical_row_model_zero', [(self.zero.author_key, self.zero.doc_id, json.dumps(zero))],
            ['author_key', 'doc_id', 'document'])
        save(self.root / 'row-model/fixture-manifest.json', dict(
            identities={name: dict(author_key=value.author_key, doc_id=value.doc_id) for name, value in ids.items()},
            zero_pointer_oracle='separate canonical JSON export fixture; not a JSON value in the typed model'))
        self.fixture_ids = ids

    def build(self):
        # The older strings index deliberately omits deleted heads. Resolve
        # legacy doc-only edges using one indexed source-history census instead
        # of guessing authors, losing tombstoned targets or scanning per edge.
        # This is a migration aid, NOT a second treated relationship layout.
        sources = SOURCES  # Migrated canonical copy retains ALL original identities/history; do not scan the lake twice.
        identities = ' UNION ALL '.join('SELECT author_key,doc_id FROM ' + table for table in sources)
        self.driver.command('CREATE TABLE canonical_row_model_identities (author_key String,doc_id String) '
            'ENGINE=MergeTree ORDER BY (doc_id,author_key)')
        self.driver.command('INSERT INTO canonical_row_model_identities SELECT author_key,doc_id FROM ('
            + identities + ') GROUP BY author_key,doc_id')
        for statement in DDL:
            self.driver.command(statement)
        def progress(value):
            self.driver.collect_pending()
            save(self.root / 'row-model/build-progress.json', value)
        result = build.Builder(self.query, self.store, progress,
            source_tables=SOURCES, quiescent_verified=True, identity_table='canonical_row_model_identities').run()
        # Native zero-pointer control, sourced from its independent canonical JSON
        # export. This supplements (does not relabel) the ordinary empty-body post.
        zero = self.canonical([self.zero])[self.zero]
        self.store.write(model.decompose(zero, 1), setup_only=True, writers_stopped=True)
        for table in (*TABLES, 'canonical_row_model_fixture', 'canonical_row_model_zero'):
            self.driver.command('SYSTEM STOP MERGES ' + table)
        return result

    def select_domains(self):
        files = {'ordinary':'uniform-K20', 'paired-P':'paired-P', 'paired-F':'paired-F'}
        for name, suffix in files.items():
            sample = json.loads((self.root / ('cells/all-fixes-' + suffix + '/measured.json')).read_bytes())
            if sample['parity'] != 'PASS':
                raise ValueError('actual banked all-fixes page is not parity certified')
            self.pages[name] = identity_rows(sample['rows'])
        if self.pages['paired-P'] != self.pages['paired-F']:
            raise ValueError('paired P/F actual full-key pages differ')
        fat = identity_rows(self.query("SELECT author_key,doc_id FROM tally_verify_documents WHERE collection_name='posts' GROUP BY author_key,doc_id"))
        sample = identity_rows(self.query('SELECT DISTINCT author_key,doc_id FROM ' + build.lake(SOURCES)
            + ' ORDER BY cityHash64(author_key,doc_id),author_key,doc_id LIMIT 64'))
        ids = self.fixture_ids
        self.domains = dict(ordinary=self.pages['ordinary'], paired=self.pages['paired-P'], fat=fat, sample=sample,
            edits=[ids['edited']], deletions=[ids['deleted']], **{'shared-values':[ids['shared-a'],ids['shared-b']],
            'zero-payload':[ids['empty-body'],self.zero]})

    def verify(self):
        # Wait for already-running merges, not a fixed client-cap STOP. The
        # worker's actual bound lease remains the outer supervision authority.
        import time
        names = ','.join(q(name) for name in TABLES)
        while self.query('SELECT count() AS n FROM system.merges WHERE database=currentDatabase() AND table IN (' + names + ')')[0]['n']:
            time.sleep(2)
        self.select_domains()
        start = len(self.driver.records)
        receipt = cell.verify_domains(self.store.read, self.canonical, self.domains,
            record=lambda name, expected, actual:self.comparison('verification-' + name, expected, actual))
        # Show actual physical sharing, not just equal reconstructed strings.
        shared = self.fixture_ids['shared-a'], self.fixture_ids['shared-b']
        owners = ','.join(q(value.row_id) for value in shared)
        key = q(model.encode_path(('body','text')))
        rows = self.query('SELECT value_row_id FROM row_pointers WHERE document_row_id IN (' + owners
            + ') AND key=' + key + ' AND deleted=0 GROUP BY value_row_id HAVING uniqExact(document_row_id)=2')
        if len(rows) != 1:
            raise ValueError('shared canonical payloads do not reference one immutable value row')
        count = self.query('SELECT count() AS n FROM row_text WHERE value_row_id=' + q(metadata(rows[0]['value_row_id'])))
        if count[0]['n'] != 1:
            raise ValueError('shared value was physically duplicated')
        zero = self.query('SELECT pointer_count FROM row_document_versions WHERE document_row_id=' + q(self.zero.row_id))
        if len(zero) != 1 or zero[0]['pointer_count'] != 0:
            raise ValueError('identity-only control is not a native zero-pointer document')
        parts = self.query('SELECT table,name,rows,data_version FROM system.parts WHERE database=currentDatabase() '
            'AND active AND table IN (' + names + ') ORDER BY table,name')
        records = self.driver.records[start:]
        self.driver.collect_pending()
        self.driver.require_native(records)
        receipt.update(parts_digest=fingerprint(parts), query_ids=[r['query_id'] for r in records],
            zero_pointer_native_verified=True, shared_values_physical_singleton=True)
        self.frozen = Fence(self.query, receipt, cell.binding())
        receipt['native_fence_verified'] = self.frozen.verify()
        original = self.frozen
        driver = self.driver
        class MeasuredFence:
            def verify(self):
                return driver.fence_call(original.verify)
        self.frozen = MeasuredFence()
        save(self.root / 'row-model/verification.json', receipt)
        return receipt

    def measure(self, name, variant, phase):
        if name == 'uniform-K20-feed' or name == 'ordinary-post-open':
            identities = self.pages['ordinary']
        elif name == 'fat-post-open':
            identities = self.domains['fat']
        else:
            identities = self.pages['paired-F' if name == 'paired-F-feed' else 'paired-P']
        paths = DISPLAYED if name.endswith('-feed') else None
        expected = self.canonical(identities)  # Outside measured assembly; never feeds the treatment.
        if paths is not None:
            expected = {identity: project(document, paths) for identity, document in expected.items()}
        def operation():
            if variant == 'rows':
                return self.store.read(identities, paths=paths, frozen=self.frozen)
            actual = self.canonical(identities, control=True)
            return {identity: project(document, paths) for identity, document in actual.items()} if paths is not None else actual
        actual, sample = self.driver.sample(name, variant, phase, operation)
        packet = self.comparison(name + '-' + phase + '-' + variant, expected, actual)
        if not model.exact_equal(actual, expected):
            raise ValueError('measured assembly differs key/type-for-key from independent canonical oracle')
        return dict(sample, parity='PASS', documents=len(identities), displayed_paths=paths,
            comparison_packet=packet,
            scope='ISOLATED_PAYLOAD_ASSEMBLY_NOT_SUBSTITUTED_COMPLETE_FEED',
            fixture_precision='fat post document only; not a claim to assemble its engagement thread')
