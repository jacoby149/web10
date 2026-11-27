"""Research document-stream full-key selectors; existing canonical gate stays intact.

The node's doc_id-only ambiguity denial is unchanged. For the explicitly named
P/F document-stream contract, partition requests by author and narrow each fully
authorized canonical lookup by that author AFTER its policy/history compiler.
Projected bodies/owners never supply authority. Both P/F and the oracle retain
the ordinary prepare passes, including ads/media/faces and every lookup's cost.
"""
from contextvars import ContextVar
from functools import wraps

from fastapi import HTTPException
from sqlglot import exp


def install(endpoint, *, project=None, batch_unique_ids=False):
    canonical = endpoint._canonical_prepare_docs
    execute = endpoint.ch.execute_query
    selected_author = ContextVar('F_canonical_prepare_author', default=None)
    selected_pairs = ContextVar('F_canonical_prepare_pairs', default=None)

    @wraps(execute)
    def exact_lookup(sql, *args, **kwargs):
        pairs = selected_pairs.get()
        if pairs is not None:
            values = ','.join('(' + ','.join(exp.Literal.string(item).sql(dialect='clickhouse') for item in pair) + ')'
                for pair in pairs)
            sql = 'SELECT * FROM (' + sql + ') AS f_full_key_lookup WHERE (author_key,doc_id) IN (' + values + ')'
        author = selected_author.get()
        if author is not None:
            if project is not None:
                return project(lambda query: execute(query, *args, **kwargs), sql, author)
            # This SQL is already the original server-written, safe-query-
            # compiled canonical lookup. A selector can only remove its rows.
            sql = ('SELECT * FROM (' + sql + ') AS f_author_lookup WHERE author_key='
                   + exp.Literal.string(author).sql(dialect='clickhouse'))
        return execute(sql, *args, **kwargs)

    @wraps(canonical)
    def full_key(rows, reader, readable):
        partitions = {}
        for index, row in enumerate(rows):
            author = row.get('author_key')
            if not isinstance(author, str) or not author:
                raise HTTPException(403, 'research prepare requires an explicit full document key')
            partitions.setdefault(author, []).append((index, row))
        ids = [row.get('doc_id') for row in rows]
        if (batch_unique_ids and project is None and ids and all(isinstance(doc, str) and doc for doc in ids)
                and len(set(ids)) == len(ids)):
            # Unique doc IDs allow the original binder to process one batch.
            # Its server-built permission SQL still runs before the full-key
            # narrowing, and its missing/ambiguous authority checks still run.
            token = selected_pairs.set(sorted((row['author_key'], row['doc_id']) for row in rows))
            try:
                return canonical(rows, reader, readable)
            finally:
                selected_pairs.reset(token)
        result = [None] * len(rows)
        for author, indexed in partitions.items():
            token = selected_author.set(author)
            try:
                # ORIGINAL binder: same services/grants/history/visibility,
                # ambiguity denial, body provenance and missing-row refusal.
                bound = canonical([row for _, row in indexed], reader, readable)
            finally:
                selected_author.reset(token)
            for (index, _), row in zip(indexed, bound, strict=True):
                result[index] = row
        return result

    endpoint.ch.execute_query = exact_lookup
    endpoint._canonical_prepare_docs = full_key
    return canonical
