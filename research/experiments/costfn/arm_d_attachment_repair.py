"""Pure additive Arm D correctness revision; no engine or activation side effects.

Author hints restrict candidates, never replace the canonical group/policy gates.
The caller owns source-bound completeness and attribution of hint acquisition.
"""
import json

import sqlglot
from sqlglot import exp

import arm_t_rewrite

AGGREGATES = ("likes", "dislikes", "comments", "reposts", "score")


def author_hints(groups, group_authors):
    if not isinstance(group_authors, dict) or set(group_authors) != set(groups):
        raise ValueError("exact readable-group author inventory required")
    authors = set()
    for group in groups:
        values = group_authors[group]
        if not isinstance(values, (list, tuple)):
            raise ValueError("distinct author list required for every readable group")
        for author in values:
            arm_t_rewrite.literal(author)
            authors.add(author)
        if len(set(values)) != len(values):
            raise ValueError("distinct author list required for every readable group")
    return sorted(authors)


def transform(compiled, reader, groups, group_authors):
    """Keep canonical SQL; change only physical documents and a narrowing hint."""
    tree = arm_t_rewrite.pinned(compiled, reader, groups)
    authors = author_hints(groups, group_authors)
    condition = ("author_key IN (" + arm_t_rewrite.literals(authors) + ")") if authors else "0"
    predicate = sqlglot.parse_one("SELECT 1 WHERE " + condition, read="clickhouse").args["where"].this
    rewritten = 0
    for cte in tree.args["with_"].expressions:
        for table in list(cte.this.find_all(exp.Table)):
            if table.name != "documents":
                continue
            table.find_ancestor(exp.Select).where(predicate.copy(), copy=False)
            table.set("this", exp.to_identifier("documents_d"))
            rewritten += 1
    if rewritten != 4:
        raise ValueError("expected exactly four canonical document boundaries")
    return "/* arm-d attachment-checked v2 */ " + tree.sql(dialect="clickhouse")


def native_rows(raw):
    """Decode native JSON without comparing UInt64 strings to API integers."""
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("native main response must be an object")
    rows = payload.get("data")
    if not isinstance(rows, list):
        raise ValueError("native main response must contain a row list")
    result = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("native main response contains a non-object row")
        row = row.copy()
        for field in AGGREGATES:
            value = row.get(field)
            if isinstance(value, str) and value.isascii() and value.isdecimal():
                value = int(value)
            if type(value) is not int or not 0 <= value < 2**64:
                raise ValueError("native main aggregate has an invalid integer representation")
            row[field] = value
        result.append(row)
    return result
