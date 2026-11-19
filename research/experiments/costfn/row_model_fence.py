"""Frozen typed-model generation fence; metadata only, no JSON value parsing."""
import hashlib

from arm_satellite_sql import literal as q
from row_model import framed
from row_model_sql import DDL

TABLES = tuple(sorted(statement.split()[2] for statement in DDL))
DOMAINS = frozenset(('ordinary', 'paired', 'fat', 'sample', 'edits', 'deletions', 'shared-values', 'zero-payload'))


def fingerprint(parts):
    encoded = []
    for part in sorted(parts, key=lambda p: (p['table'], p['name'])):
        if part['table'] not in TABLES or any(type(part[k]) is not int or part[k] < 0 for k in ('rows', 'data_version')):
            raise ValueError('typed exact row-model part metadata required')
        encoded.append(framed(part['table'].encode()) + framed(part['name'].encode())
            + part['rows'].to_bytes(8, 'big') + part['data_version'].to_bytes(8, 'big'))
    return hashlib.sha256(b''.join(encoded)).hexdigest()


class Fence:
    def __init__(self, query, receipt, source_binding):
        if (receipt.get('parity') != 'PASS' or receipt.get('source_binding') != source_binding
                or set(receipt.get('domains', {})) != DOMAINS or not receipt.get('query_ids')
                or any(not values for values in receipt['domains'].values()) or not receipt.get('parts_digest')):
            raise ValueError('complete independently verified model/domains/source required')
        self.query, self.expected = query, receipt['parts_digest']

    def verify(self):
        names = ','.join(q(name) for name in TABLES)
        actual = self.query("SELECT name FROM system.tables WHERE database=currentDatabase() AND name IN (" + names + ')')
        if {row['name'] for row in actual} != set(TABLES):
            raise ValueError('typed model table disappeared after parity')
        parts = self.query('SELECT table,name,rows,data_version FROM system.parts WHERE database=currentDatabase() '
            'AND active AND table IN (' + names + ') ORDER BY table,name')
        if fingerprint(parts) != self.expected:
            raise ValueError('typed model changed after whole-model verification')
        return True
