"""Isolated immutable history substitution after the original authorization and F fences."""
import json
import os
from pathlib import Path

from engagement_composition_api import e, application as application
from engagement_observe import uniform_guard
import engagement_window as window
import hybrid_k20_attachment as attachment


published = json.loads(Path(os.environ['HYBRID_K20_ATTACHMENT_PROOF']).read_bytes())
if (published['parity'] != 'PASS' or published['host'] != e.p.host or published['table'] != attachment.TABLE
        or not window.task(e.f.admission) or os.environ.get('HYBRID_K20_PROJECTED') != '1'
        or [row['bucket'] for row in published['checks']] != list(range(attachment.BUCKETS))
        or any(row['mismatches'] or row['ties'] for row in published['checks'])):
    raise ValueError('exact same-host attachment census required')
measured_query = e.p._query


def hybrid_query(sql=None, *args, **kwargs):
    if sql is None:
        sql = kwargs.pop('query')
    if not attachment.marker(sql):
        return measured_query(sql, *args, **kwargs)
    current = e.p.observer.current.get()
    if not current or current.get('request_id') in (None, 'unlabelled'):
        raise ValueError('hybrid requires the admitted and observed request')
    if not current.get('hybrid_attachment_checked'):
        def inspect_parts(query):
            result = e.f.original_query(query, settings={'log_comment': 'F_READ:' + current['request_id']})
            return [dict(zip(result.column_names, row, strict=True)) for row in result.result_rows]
        attachment.verify_parts(inspect_parts, published)
        current['hybrid_attachment_checked'] = True
    uniform_guard(sql, current)
    return measured_query(attachment.rewrite(sql), *args, **kwargs)


e.p._query = hybrid_query
