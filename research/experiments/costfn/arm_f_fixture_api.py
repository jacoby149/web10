"""Explicit setup-only server clock/identity fixtures through REAL authorized create.

No new endpoint or auth substitution. The ordinary create endpoint certifies the
human/app/group first; original create_as rechecks authority. Existing trusted
server timestamp/doc-id seams let the fixture exercise ties and same-ID authors.
Never used by a measured writer, T4 or R+W worker; production never imports it.
"""
from datetime import datetime
from functools import wraps
import os
import uuid

import research_api as observer
from app.v3.endpoints import documents

FIXTURE_TIME = datetime.fromisoformat(os.environ['FANOUT_FIXTURE_TIME'])
if FIXTURE_TIME.tzinfo is None or os.environ.get('FANOUT_FIXTURE_SETUP') != '1':
    raise RuntimeError('explicit isolated fixture clock setup required')
original = documents.create_as


@wraps(original)
def create(request, data, real_author, client_id, **kwargs):
    kwargs['version_time'] = FIXTURE_TIME
    # create_as forwards its trusted clock to insert_document only with an ID.
    # Every setup post must share the clock, not just marked collision posts.
    kwargs.setdefault('doc_id', str(uuid.uuid4()))
    marker = data.body.get('fixture_same_id') if isinstance(data.body, dict) else None
    if marker is not None:
        if not isinstance(marker, str) or not 1 <= len(marker) <= 80:
            raise ValueError('bounded synthetic collision marker required')
        kwargs['doc_id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'F-author-collision:' + marker))
    return original(request, data, real_author, client_id, **kwargs)


documents.create_as = create
application = observer.application
