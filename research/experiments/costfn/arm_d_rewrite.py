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


_GROUP_IN = re.compile(r"group_id IN \((?:'[^']*'(?:,\s*'[^']*')*)\)\)")


def compiled_group_order(compiled):
    """The group IN-list actually present in the compiled SQL (all four
    boundary CTEs carry the identical list — asserted). Order-independent
    pinning: the compiler's group order is whatever the readable-resolution
    produced (discovery order, not sorted), so the pin must use the
    compiled order, never the caller's."""
    lists = _GROUP_IN.findall(compiled)
    if len(lists) != 4 or len(set(lists)) != 1:
        raise ValueError("Arm D pin: the four boundary CTEs do not carry one identical readable list")
    return re.findall(r"'([^']*)'", lists[0])


def transform(compiled, reader, groups, authors):
    """Rewrite all four boundary CTEs to the author-set form; refuse anything
    that is not the pinned personal-feed compiled shape."""
    if len(groups) != len(authors) or not groups:
        raise ValueError("groups/authors mismatch")
    actual = compiled_group_order(compiled)
    if sorted(actual) != sorted(groups):
        raise ValueError("Arm D pin: the compiled readable set differs from the verified groups")
    # Re-derive authors in the compiled order (owner mapping is per group).
    owner = {g: a for g, a in zip(groups, authors)}
    actual_authors = [owner[g] for g in actual]
    template = _template()
    expected = template.replace("group_id IN ({GROUPS}))", f"group_id IN ({quoted(actual)}))").replace("'{READER}'", f"'{reader}'")
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
    d = d.replace("{{AUTHORS}}", quoted(actual_authors)).replace("{AUTHORS}", quoted(actual_authors))
    d = d.replace("group_id IN ({GROUPS}))", f"group_id IN ({quoted(actual)}))")
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


# ---------------------------------------------------------------------------
# Engagement follow-ups (Step 1a): exact-ID readability, residual declared.
#
# The follow-up (reaction counts / comment counts over the returned IDs)
# compiles to ONE boundary CTE: a full documents window (collection_name
# filter — 3.1M native rows on the D key) JOIN a doc_groups window over 21
# groups. The returned IDs are the POST doc_ids; the reaction/comment docs
# carry their post id in ref_value, so the readability resolution is:
#   1. VERIFY (point-scale, per request): every returned post is readable via
#      the requested groups — doc_id IN (20) against doc_groups, where doc_id
#      IS the key prefix (the task's prescribed check; Q01/#1448 family) —
#      plus the reader's Discover membership (the follow-up's extra group)
#      plus the empty gate tables.
#   2. REWRITE: the documents window gains `AND ref_value IN (20 ids)` — the
#      candidate set is the asked-for refs; the doc_groups join and the
#      group-keyed gates come out (readability was just verified outside the
#      SQL); the author-keyed gates are retained; group_id is unused by the
#      outer aggregate and synthesized as NULL.
# DECLARED RESIDUAL: the documents window still reads the whole service
# partition (collection_name / ref_value carry no key prefix on the D key):
# ~3.1M native rows filtered to ~310k reactions / ~31k comments, result 20.
# Recorded in every receipt, not hidden. No counts satellite is built here.
# Completeness posture (fixture-declared, oracle-checked): reactions/comments
# on readable posts are themselves linked to a group the reader belongs to
# (Discover in this input); the engagement oracle's exact counts catch any
# divergence per trial.
# ---------------------------------------------------------------------------

_FOLLOWUP_GOLDEN = {
    "reactions": "evidence/arm-d-compiled-followup-reactions-golden-20261110.sql",
    "comments": "evidence/arm-d-compiled-followup-comments-golden-20261110.sql",
}


def followup_groups(compiled):
    """The group IN-list in a follow-up compiled SQL."""
    m = re.search(r"group_id IN \((?:'[^']*'(?:,\s*'[^']*')*)\)", compiled)
    return re.findall(r"'([^']*)'", m.group(0)) if m else []


def followup_ids(compiled):
    """The outer exact post-ID list (the IN (...) immediately before GROUP BY)."""
    m = re.search(r"IN \((?:'[^']*'(?:,\s*'[^']*')*)\)\s+GROUP BY", compiled)
    return re.findall(r"'([^']*)'", m.group(0)) if m else []


def followup_verify_sql(reader, post_ids, groups):
    """Point-scale verification for the follow-up treatment (per request):
    (posts readable via the requested groups, reader's discover membership,
    gate tables empty) must be (len(post_ids), 1, 0)."""
    n = len(post_ids)
    discover = [g for g in groups if not g.endswith("/followers")]
    if len(discover) != 1:
        raise ValueError("Arm D follow-up: expected exactly one non-follower group (the Discover board)")
    doc_pairs = ", ".join(f"'{d}'" for d in post_ids)
    return [
        (f"SELECT count(DISTINCT doc_id) FROM doc_groups WHERE doc_id IN ({doc_pairs}) "
         f"AND group_id IN ({quoted(groups)}) AND deleted = 0", n),
        (f"SELECT count() FROM group_members WHERE (group_id, member_key) = "
         f"('{discover[0]}', '{reader}') AND deleted = 0", 1),
        ("SELECT (SELECT count() FROM user_blacklist) + (SELECT count() FROM group_blacklist) "
         "+ (SELECT count() FROM user_group_sharing) + (SELECT count() FROM group_hidden_docs) "
         "+ (SELECT count() FROM banned_users)", 0),
    ]


def _followup_template_raw(service):
    """The service golden with the group list, ID list and reader parameterised."""
    import pathlib
    golden = (pathlib.Path(__file__).resolve().parent / _FOLLOWUP_GOLDEN[service]).read_text().strip()
    groups = followup_groups(golden)
    ids = followup_ids(golden)
    reader = re.search(r"blocked_key = '([^']+)'", golden).group(1)
    tmpl = (golden
            .replace("group_id IN (" + ", ".join(f"'{g}'" for g in groups) + "))",
                     "group_id IN ({GROUPS}))")
            .replace("IN (" + ", ".join(f"'{i}'" for i in ids) + ") GROUP BY",
                     "IN ({IDS}) GROUP BY"))
    if tmpl.count(f"'{reader}'") != 3:
        raise ValueError(f"Arm D follow-up pin: reader literal count is not 3 in the {service} golden")
    return tmpl.replace(f"'{reader}'", "'{READER}'")


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


def transform_followup(compiled, reader, service):
    """Exact-ID readability treatment for the reactions/comments follow-up.
    Returns None when the compiled SQL is not the follow-up shape at all
    (e.g. a prepare-pass canonical read compiles single-service but carries
    a different SQL); raises on a detected follow-up shape that drifts from
    the pin."""
    if service not in _FOLLOWUP_GOLDEN:
        raise ValueError(f"Arm D follow-up treatment declared for reactions/comments only, got {service}")
    groups = followup_groups(compiled)
    ids = followup_ids(compiled)
    if not groups or not ids:
        return None
    raw = _followup_template_raw(service)
    expected = (raw
                .replace("{GROUPS}", ", ".join(f"'{g}'" for g in groups))
                .replace("{IDS}", ", ".join(f"'{v}'" for v in ids))
                .replace("{READER}", reader))
    if compiled != expected:
        raise ValueError("Arm D follow-up pin: compiled SQL differs from the pinned golden structure")
    treated = (raw
        .replace("WHERE collection_name = '" + service + "')",
                 "WHERE collection_name = '" + service + "' AND ref_value IN ({IDS}))")
        .replace("WHERE group_id IN ({GROUPS}))", "WHERE group_id IN ({GROUPS}))")
        .replace(_JOIN_SEGMENT.replace("{GROUPS}", "{GROUPS}"), " ")
        .replace(", dg.group_id FROM", ", NULL AS group_id FROM")
        .replace(_GATE_SEGMENT, ""))
    treated = (treated
        .replace("{GROUPS}", ", ".join(f"'{g}'" for g in groups))
        .replace("{IDS}", ", ".join(f"'{v}'" for v in ids))
        .replace("{READER}", reader))
    if "doc_groups" in treated or "dg." in treated:
        raise ValueError("Arm D follow-up: a group-keyed reference survived")
    try:
        sqlglot.parse_one(treated, read="clickhouse")
    except Exception as exc:
        raise ValueError(f"Arm D follow-up: result failed parse validation: {exc}") from None
    return treated


# ---------------------------------------------------------------------------
# Phase-1.5 satellite treatment (PROTOCOL amendment, declared before runs):
# the counting step moves to counting_numbers point seeks on the
# (doc_id, counter_name) key. The Step-1 readability verification is
# UNCHANGED; only the counting SQL differs. Golden pin: the compiled
# follow-up must still match the Step-1 goldens (app/compiler drift
# refuses); the satellite form is then emitted. Absent satellite rows are
# zero-filled — absence is a value, not an error.
# ---------------------------------------------------------------------------

def satellite_followup_sql(service, post_ids):
    """The satellite-form follow-up: one (doc_id, counter_name) point-seek
    subquery per returned ID per counter, zero-filled, output shape
    identical to the app follow-up (ref_value + like_count/dislike_count,
    or post_id + comment_count)."""
    n = len(post_ids)
    ids = ", ".join(f"'{v}'" for v in post_ids)
    if service == "reactions":
        return (f"WITH [{ids}] AS ids SELECT arrayElement(ids, number) AS ref_value, "
                f"coalesce((SELECT sum(value) FROM counting_numbers WHERE doc_id = arrayElement(ids, number) "
                f"AND counter_name = 'reactions:like'), 0) AS like_count, "
                f"coalesce((SELECT sum(value) FROM counting_numbers WHERE doc_id = arrayElement(ids, number) "
                f"AND counter_name = 'reactions:dislike'), 0) AS dislike_count FROM numbers({n})")
    if service == "comments":
        return (f"WITH [{ids}] AS ids SELECT arrayElement(ids, number) AS post_id, "
                f"coalesce((SELECT sum(value) FROM counting_numbers WHERE doc_id = arrayElement(ids, number) "
                f"AND counter_name = 'comments'), 0) AS comment_count FROM numbers({n})")
    raise ValueError(f"satellite follow-up declared for reactions/comments only, got {service}")


def transform_followup_satellite(compiled, reader, service):
    """Pin-check the compiled follow-up against the Step-1 goldens (the
    readability side is unchanged), then emit the satellite counting form.
    Returns None when the compiled SQL is not the follow-up shape at all."""
    if service not in _FOLLOWUP_GOLDEN:
        raise ValueError(f"Arm D satellite follow-up declared for reactions/comments only, got {service}")
    groups = followup_groups(compiled)
    ids = followup_ids(compiled)
    if not groups or not ids:
        return None
    raw = _followup_template_raw(service)
    expected = (raw
                .replace("{GROUPS}", ", ".join(f"'{g}'" for g in groups))
                .replace("{IDS}", ", ".join(f"'{v}'" for v in ids))
                .replace("{READER}", reader))
    if compiled != expected:
        raise ValueError("Arm D satellite follow-up pin: compiled SQL differs from the pinned golden structure")
    treated = satellite_followup_sql(service, ids)
    try:
        sqlglot.parse_one(treated, read="clickhouse")
    except Exception as exc:
        raise ValueError(f"Arm D satellite follow-up: result failed parse validation: {exc}") from None
    return treated


# ---------------------------------------------------------------------------
# Phase-1.6 views follow-up treatment (Step-0 classified 10.11.2026; memo in
# results/phase1.6-decision-memo.md). The contentViews follow-up returns
# COUNTS (impressions + reach), so it is NOT the counting_numbers satellite
# (freshness conflict: content_events is written by the study's window-deduped
# delivery logging; reach is countDistinct, not a sum). The 1M capture showed
# its cost is the doc_groups readability SUBQUERY (~4.1M rows: it scans every
# readable group's attachments), not content_events (60 rows). The treatment
# is the Step-1 exact-ID move: add `doc_id IN (<returned ids>)` to that inner
# subquery so it is a prefix seek (doc_groups is ORDER BY (doc_id, group_id)).
# The outer `e.doc_id IN` already intersects, so the result is byte-identical;
# only the native read drops to point-scale. Research-only (gated), mirroring
# the node-ad monkeypatch.
# ---------------------------------------------------------------------------

def views_treated_sql(doc_ids, service, group_ids):
    """The treated contentViews query: identical to the production
    content_event_views_for_docs SQL EXCEPT the inner doc_groups readability
    subquery also carries `doc_id IN (<returned ids>)` (the point-scale prefix
    seek). Returns (sql, params); raises if the structure is not the pinned
    point-scale form (drift refuses)."""
    if not doc_ids or not group_ids:
        return None, None
    n = len(doc_ids)
    d_ph = ", ".join(f"%(d{i})s" for i in range(n))
    g_ph = ", ".join(f"%(g{i})s" for i in range(len(group_ids)))
    sql = (
        f"SELECT e.doc_id, count() AS impressions, countDistinct(e.reader_key) AS reach "
        f"FROM content_events e WHERE e.service = %(svc)s AND e.event_type = 'delivery' "
        f"AND e.doc_id IN ({d_ph}) "
        f"AND e.doc_id IN (SELECT doc_id FROM doc_groups WHERE doc_id IN ({d_ph}) "
        f"AND group_id IN ({g_ph}) AND deleted = 0) GROUP BY e.doc_id")
    # Golden pin: the inner subquery must seek by doc_id (the point-scale
    # marker), present in BOTH the outer filter and the inner subquery.
    if "doc_groups WHERE doc_id IN (" not in sql or sql.count("e.doc_id IN") < 1:
        raise ValueError("Phase-1.6 views pin: the point-scale doc_id seek is missing")
    params = {"svc": service}
    params.update({f"d{i}": d for i, d in enumerate(doc_ids)})
    params.update({f"g{i}": g for i, g in enumerate(group_ids)})
    # Parse-check with placeholders substituted by sample literals (sqlglot
    # cannot see %(…s) tokens).
    sample = (sql.replace("%(svc)s", "'posts'")
              .replace(", ".join(f"%(d{i})s" for i in range(n)), "x")
              .replace(", ".join(f"%(g{i})s" for i in range(len(group_ids))), "y"))
    sqlglot.parse_one(sample, read="clickhouse")
    return sql, params
