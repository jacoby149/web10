"""Additive Arm T main treatment. Pure SQL construction; never executes an engine.

Keep every canonical boundary/gate. The transpose supplies identities, not
authority. No owner mapping, synthetic group IDs, counts or date predicate.
"""
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

HERE = Path(__file__).resolve().parent
SERVICES = frozenset(("posts", "reactions", "comments", "profile"))
PAGE = 21


class InvalidArm(ValueError):
    """An unsupported exact-parity condition; stop the arm, do not time it."""


def canonical_page(rows):
    """A guard row detects undefined tie ordering without changing the oracle."""
    if len(rows) > PAGE + 1:
        raise InvalidArm("canonical candidate bound exceeded")
    times = [r["created_ms"] for r in rows]
    if any(type(t) is not int for t in times) or times != sorted(times, reverse=True):
        raise InvalidArm("canonical candidate time projection/order differs")
    if len(set(times)) != len(times):
        raise InvalidArm("ambiguous captured Newest timestamp tie; no approved tie-breaker")
    return rows[:PAGE]


def literal(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_./:@-]+", value):
        raise ValueError("Arm T requires a nonempty synthetic identifier")
    return "'" + value + "'"


def literals(values):
    if not values:
        raise ValueError("Arm T refuses an empty IN list")
    return ", ".join(literal(v) for v in values)


def pinned(compiled, reader, groups):
    """Exact compiler/wire pin; parameterize only the reader and readable list."""
    literal(reader)
    if not groups or len(set(groups)) != len(groups) or len(groups) > 1001:
        raise ValueError("Arm T requires 1..1001 distinct readable groups")
    literals(groups)
    golden = (HERE / "evidence/arm-d-compiled-main-golden-20261109.sql").read_text().strip()
    pattern = r"group_id IN \(((?:'[^']*'(?:,\s*'[^']*')*))\)\)"
    found = re.findall(pattern, compiled)
    old = re.findall(pattern, golden)
    if (len(found) != 4 or len(set(found)) != 1 or len(old) != 4
            or set(re.findall(r"'([^']*)'", found[0])) != set(groups)):
        raise ValueError("Arm T readable-group/compiler pin differs")
    expected = golden.replace(old[0], found[0]).replace("'c42-reader'", literal(reader))
    if compiled != expected:
        raise ValueError("Arm T compiled main differs from reviewed golden; refusing drift")
    return sqlglot.parse_one(compiled, read="clickhouse")


def _condition(sql):
    return sqlglot.parse_one("SELECT 1 WHERE " + sql, read="clickhouse").args["where"].this


def _scope(boundary, identities):
    """Push full document identity and original link key BEFORE both windows."""
    boundary = boundary.copy()
    for table in list(boundary.find_all(exp.Table)):
        if table.name == "documents":
            table.find_ancestor(exp.Select).where(
                _condition("(author_key, doc_id) IN (" + identities + ")"), copy=False)
        elif table.name == "doc_groups":
            table.find_ancestor(exp.Select).where(
                _condition("doc_id IN (SELECT doc_id FROM (" + identities + "))"), copy=False)
    return boundary


def _boundaries(tree):
    return {c.alias: c.this for c in tree.args["with_"].expressions}


def candidates_sql(compiled, reader, groups):
    """Per-group LIMIT, then canonical point checks and global Newest page.

    Slice policy is the original boundary WHERE with only aliases rebound.
    Canonical policy runs again. Immutable snapshot admission is necessary for
    completeness; if it is stale parity must fail, never relax authorization.
    """
    tree = pinned(compiled, reader, groups)
    boundary = _boundaries(tree)["posts"]
    policy = boundary.args["where"].this.copy()
    for column in policy.find_all(exp.Column):
        if column.table == "dg":
            column.set("table", exp.to_identifier("d"))
    clauses = []
    for group in groups:
        clauses.append(
            "(SELECT d.author_key, d.doc_id FROM doc_groups_t AS d WHERE d.group_id="
            + literal(group) + " AND d.collection_name='posts' "
            "AND NOT has(d.tags,'ad') AND NOT has(d.tags,'product') AND ("
            + policy.sql(dialect="clickhouse") + ") ORDER BY d.created_at DESC LIMIT 22)")
    identities = " UNION ALL ".join(clauses)
    checked = _scope(boundary, identities).sql(dialect="clickhouse")
    return ("/* arm-t candidates: all reads belong to main */ SELECT p.author_key,p.doc_id,p.group_id,"
            "toUnixTimestamp64Milli(p.created_at) AS created_ms "
            "FROM (" + checked + ") AS p WHERE NOT has(p.tags,'ad') AND NOT has(p.tags,'product') "
            "ORDER BY toUnixTimestamp64Milli(p.created_at) DESC LIMIT 22")


def _winner_pairs(winners):
    if not 0 <= len(winners) <= PAGE:
        raise ValueError("Arm T requires a canonical page of at most 21 rows")
    # Do not deduplicate output rows: shared attachments are part of the oracle.
    return sorted({(r["author_key"], r["doc_id"]) for r in winners})


def main_sql(compiled, reader, groups, winners):
    """Retain all joins/counts/gates; scope canonical reads to exact identities.

    Related metadata reads seek group prefixes but are NOT page-bounded. This
    residual is measured, particularly for canyon/shared groups.
    """
    tree = pinned(compiled, reader, groups)
    pairs = _winner_pairs(winners)
    if any(r.get("group_id") not in groups for r in winners):
        raise ValueError("Arm T winner outside the actual readable groups")
    if not pairs:
        for cte in tree.args["with_"].expressions:
            cte.set("this", _scope(cte.this, "SELECT author_key,doc_id FROM doc_groups_t WHERE 0"))
        tree.where(_condition("0"), copy=False)
        return "/* arm-t canonical empty main */ " + tree.sql(dialect="clickhouse")
    keys = ", ".join("(" + literal(a) + "," + literal(d) + ")" for a, d in pairs)
    ids = literals(sorted({d for _, d in pairs}))
    authors = literals(sorted({a for a, _ in pairs}))
    selectors = {
        "posts": "(author_key,doc_id) IN (" + keys + ") OR repost_of IN (" + ids + ")",
        "reactions": "ref_value IN (" + ids + ")",
        "comments": "comment_post_id IN (" + ids + ")",
        "profile": "author_key IN (" + authors + ")",
    }
    for cte in tree.args["with_"].expressions:
        service = cte.alias
        identities = ("SELECT author_key,doc_id FROM doc_groups_t WHERE group_id IN ("
                      + literals(groups) + ") AND collection_name=" + literal(service)
                      + " AND (" + selectors[service] + ")")
        cte.set("this", _scope(cte.this, identities))
    tree.where(_condition("(p.author_key,p.doc_id) IN (" + keys + ")"), copy=False)
    return "/* arm-t canonical main */ " + tree.sql(dialect="clickhouse")
