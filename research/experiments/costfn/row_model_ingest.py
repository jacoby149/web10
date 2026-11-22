"""Canonical JSON is parsed ONLY here, once at ingest, never by a row read."""
from datetime import UTC, datetime
import json

from row_model import Identity, decompose, exact_equal


def timestamp(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError('canonical source needs an aware timestamp')
    return value.astimezone(UTC)


def parse_source(row):
    result = dict(row)
    body = result.get('body')
    if isinstance(body, str):
        def duplicate_safe(items):
            value = {}
            for key, item in items:
                if key in value:
                    raise ValueError('duplicate JSON object key cannot silently disappear')
                value[key] = item
            return value
        result['body'] = json.loads(body, object_pairs_hook=duplicate_safe)
    for name in ('created_at', 'updated_at'):
        if name in result:
            result[name] = timestamp(result[name])
    deleted = result.pop('deleted', False)
    if type(deleted) is int and deleted in (0, 1):
        deleted = bool(deleted)  # Source ingest conversion, not a value-read cast.
    if type(deleted) is not bool:
        raise ValueError('canonical deletion flag must be Boolean')
    delta = result['updated_at'] - datetime(1970, 1, 1, tzinfo=UTC)
    version = (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
    return result, version, deleted


def source_versions(rows):
    """Deterministic source ties: deletion wins; conflicting live ties refuse.

    This is a bounded fixture/page helper. Full-store loading must stream sorted
    complete identities; it must not collect the realism store in RAM.
    """
    selected = {}
    for row in rows:
        document, version, deleted = parse_source(row)
        identity = Identity(document['author_key'], document['doc_id'])
        key = identity.row_id, version
        prior = selected.get(key)
        if prior is not None:
            if prior[2] or deleted:
                if deleted:
                    selected[key] = document, version, True
                continue
            if not exact_equal(prior[0], document):
                raise ValueError('conflicting canonical live rows at one document version')
        selected[key] = document, version, deleted
    return [selected[key] for key in sorted(selected)]


def batches(rows, *, references=None):
    previous = {}
    for document, version, deleted in source_versions(rows):
        identity = Identity(document['author_key'], document['doc_id'])
        targets = {} if deleted else (references(document) if references else {})
        batch = decompose(document, version, previous=previous.get(identity.row_id, ()),
            deleted=deleted, references=targets)
        previous[identity.row_id] = batch.pointers
        yield batch
