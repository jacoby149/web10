#!/usr/bin/env python3
"""Arm D treatment — the key-exploiting query rewrite (research-only).

PROTOCOL §4 declares Arm D's treatment: "the query must be written to
exploit the key (author set + time predicate pushed into the scan); a
rank-everything-then-filter query wastes any key and invalidates the
comparison's point."

Today's compiled personal-feed main query resolves "readable via my 20
followers groups" by full-scan: per service it windows the WHOLE documents
table (3.1M rows) and the WHOLE doc_groups table (4.1M rows) — four
services per main query, ~30M native rows to find 20 docs. This module
rewrites each boundary CTE to the author-set form:

  documents WHERE collection_name='posts'                      (3.1M scan)
      JOIN doc_groups WHERE group_id IN (20 groups)            (4.1M scan)
  becomes
  documents WHERE collection_name='posts'
      AND author_key IN (20 verified owners)                   (20 prefix
                                                               seeks on the
                                                               D key)
  with the group-keyed gates (group_blacklist, user_group_sharing,
  group_hidden_docs) dropped — they are empty on the stack, verified per
  request by verify_sql() before the treatment is issued — and dg.group_id
  synthesized as a CASE over the verified author->owner-group mapping.

The rewrite is a byte-exact structural pin, not a regex guess: the compiled
SQL must equal the pinned golden
(evidence/arm-d-compiled-main-golden-20261109.sql) with the 20-group IN
lists and the reader literal parameterised, else the treatment is refused.
If the compiler's wording ever changes, the golden re-capture + review
(arm_d_rewrite.test.py) is the only path back in.

The I3 gate is retained: the author-set shortcut is only issued after the
verification queries prove (a) the reader is a live member of all groups,
(b) each claimed author is the live owner of their group, and (c) the five
gate tables are empty. Any failure refuses the treatment — the request gets
the 400, not the rewrite. The result is parse-validated with sqlglot before
execution, and the treatment's compiled hash is recorded per request.
"""
import hashlib
import re

import sqlglot

SERVICES = ("posts", "reactions", "comments", "profile")
_GOLDEN_PATH = "evidence/arm-d-compiled-main-golden-20261109.sql"


def _golden():
    import pathlib
    return (pathlib.Path(__file__).resolve().parent / _GOLDEN_PATH).read_text().strip()


def _groups_in_list(sql):
    """The first `group_id IN (...)` list in the compiled SQL (all four CTEs
    carry the identical list — asserted by the pin)."""
    m = re.search(r"group_id IN \((?:'[^']*'(?:,\s*'[^']*')*)\)\)", sql)
    if not m:
        raise ValueError("Arm D pin: no group IN-list found in the compiled SQL")
    return m.group(0)[len("group_id IN ("):-2]


def _reader_literal(sql):
    m = re.search(r"blocked_key = '([^']+)'", sql)
    return m.group(1) if m else None


def _template():
    """The pinned A-form template: the golden with the group lists and the
    reader literal parameterised."""
    if not hasattr(_template, "cache"):
        golden = _golden()
        glist = _groups_in_list(golden)
        reader = _reader_literal(golden)
        if golden.count(f"group_id IN ({glist}))") != 4:
            raise ValueError("Arm D pin: the golden's readable list is not present in all four boundary CTEs")
        if golden.count(f"'{reader}'") != 12:
            raise ValueError("Arm D pin: the golden's reader literal count is not 12 (3 gate literals x 4 CTEs)")
        _template.cache = (golden
            .replace(f"group_id IN ({glist}))", "group_id IN ({GROUPS}))")
            .replace(f"'{reader}'", "'{READER}'"))
    return _template.cache


def quoted(values):
    return ", ".join(f"'{v}'" for v in values)


def owner_of_group(group_id):
    """`provider/groups/users/<username>/followers` -> <username>. Refuses
    non-follower groups (the treatment is declared for personal feeds)."""
    m = re.fullmatch(r".*?/groups/users/([a-z0-9_-]+)/followers", group_id)
    if not m:
        raise ValueError(f"Arm D treatment refuses non-follower group: {group_id}")
    return m.group(1)


def verify_sql(reader, groups, authors):
    """Point-scale verification statements, run before the treatment is
    issued. (count of live memberships, count of live owner pairs, sum of
    gate-table rows) must be (len(groups), len(groups), 0)."""
    n = len(groups)
    mem_pairs = ", ".join(f"('{g}','{reader}')" for g in groups)
    own_pairs = ", ".join(f"('{g}','{a}')" for g, a in zip(groups, authors))
    return [
        (f"SELECT count(DISTINCT group_id) FROM group_members "
         f"WHERE (group_id, member_key) IN ({mem_pairs}) AND deleted = 0", n),
        (f"SELECT count(DISTINCT group_id) FROM group_members "
         f"WHERE (group_id, member_key) IN ({own_pairs}) AND role = 'owner' AND deleted = 0", n),
        ("SELECT (SELECT count() FROM user_blacklist) + (SELECT count() FROM group_blacklist) "
         "+ (SELECT count() FROM user_group_sharing) + (SELECT count() FROM group_hidden_docs) "
         "+ (SELECT count() FROM banned_users)", 0),
    ]


_JOIN_SEGMENT = (" JOIN (SELECT doc_id, group_id FROM (SELECT doc_id, group_id, deleted, "
                 "row_number() OVER (PARTITION BY doc_id, group_id ORDER BY updated_at DESC) "
                 "AS rn FROM doc_groups WHERE group_id IN ({GROUPS})) WHERE rn = 1 AND "
                 "deleted = 0) dg ON d.doc_id = dg.doc_id ")

_GATE_SEGMENT = (" AND (d.author_key, dg.group_id) NOT IN (SELECT user_key, group_id FROM "
                 "(SELECT user_key, group_id, blocked_key, deleted, row_number() OVER "
                 "(PARTITION BY user_key, group_id, blocked_key ORDER BY updated_at DESC, "
                 "deleted DESC) AS rn FROM group_blacklist) WHERE rn = 1 AND deleted = 0 AND "
                 "blocked_key = '{READER}') AND NOT (d.author_key != '{READER}' AND "
                 "(d.author_key, dg.group_id) IN (SELECT user_key, group_id FROM (SELECT "
                 "user_key, group_id, sharing_enabled, deleted, row_number() OVER "
                 "(PARTITION BY user_key, group_id ORDER BY updated_at DESC) AS rn FROM "
                 "user_group_sharing) WHERE rn = 1 AND deleted = 0 AND sharing_enabled = 0)) "
                 "AND (d.doc_id, dg.group_id) NOT IN (SELECT doc_id, group_id FROM (SELECT "
                 "group_id, doc_id, deleted, row_number() OVER (PARTITION BY group_id, doc_id "
                 "ORDER BY updated_at DESC, deleted DESC) AS rn FROM group_hidden_docs) WHERE "
                 "rn = 1 AND deleted = 0)")


def transform(compiled, reader, groups, authors):
    """Rewrite all four boundary CTEs to the author-set form; refuse anything
    that is not the pinned personal-feed compiled shape."""
    if len(groups) != len(authors) or not groups:
        raise ValueError("groups/authors mismatch")
    template = _template()
    glist = quoted(groups)
    expected = template.replace("group_id IN ({GROUPS}))", f"group_id IN ({glist}))").replace("'{READER}'", f"'{reader}'")
    if compiled != expected:
        raise ValueError("Arm D pin: compiled SQL differs from the pinned golden structure; re-capture and review before treating")
    case = " ".join(f"WHEN '{a}' THEN '{g}'" for a, g in zip(authors, groups))
    d = template
    for svc in SERVICES:
        old = (f"FROM documents WHERE collection_name = '{svc}') WHERE rn = 1 AND "
               f"deleted = 0) d JOIN")
        new = (f"FROM documents WHERE collection_name = '{svc}' AND author_key IN "
               f"({{AUTHORS}})) WHERE rn = 1 AND deleted = 0) d JOIN")
        if d.count(old) != 1:
            raise ValueError(f"Arm D transform: the {svc} documents window anchor moved")
        d = d.replace(old, new)
    if d.count(_JOIN_SEGMENT) != 4:
        raise ValueError("Arm D transform: the doc_groups join segment moved")
    d = d.replace(_JOIN_SEGMENT, " ")
    if d.count(", dg.group_id FROM") != 4:
        raise ValueError("Arm D transform: the dg.group_id projection moved")
    d = d.replace(", dg.group_id FROM", f", (CASE d.author_key {case} ELSE NULL END) AS group_id FROM")
    if d.count(_GATE_SEGMENT) != 4:
        raise ValueError("Arm D transform: the group-gate segment moved")
    d = d.replace(_GATE_SEGMENT, "")
    d = d.replace("{{AUTHORS}}", quoted(authors)).replace("{AUTHORS}", quoted(authors))
    d = d.replace("group_id IN ({GROUPS}))", f"group_id IN ({glist}))")
    d = d.replace("'{READER}'", f"'{reader}'")
    if "doc_groups" in d or "dg." in d:
        raise ValueError("Arm D transform: a group-keyed reference survived")
    try:
        sqlglot.parse_one(d, read="clickhouse")
    except Exception as exc:
        raise ValueError(f"Arm D transform: result failed parse validation: {exc}") from None
    return d


def treatment_meta(rewritten):
    return {"compiled_sha256": hashlib.sha256(rewritten.encode()).hexdigest()}
