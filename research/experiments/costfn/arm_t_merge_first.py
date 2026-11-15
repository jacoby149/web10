"""Arm T query revision: merge/page first, canonically verify only that page.

The original builder/rewrite remain intact for the immutable layout receipt.
This revision's own source hash is recorded by the isolated adapter per request.
"""
import arm_t_rewrite as original

SERVICES = original.SERVICES
InvalidArm = original.InvalidArm
canonical_page = original.canonical_page
main_sql = original.main_sql


def candidates_sql(compiled, reader, groups):
    tree = original.pinned(compiled, reader, groups)
    policy = original._boundaries(tree)["posts"].args["where"].this.copy()
    for column in policy.find_all(original.exp.Column):
        if column.table == "dg":
            column.set("table", original.exp.to_identifier("d"))
    slices = []
    for group in groups:
        slices.append(
            "(SELECT d.author_key,d.doc_id,d.group_id,"
            "toUnixTimestamp64Milli(d.created_at) AS created_ms FROM doc_groups_t AS d "
            "WHERE d.group_id=" + original.literal(group)
            + " AND d.collection_name='posts' AND NOT has(d.tags,'ad') "
            "AND NOT has(d.tags,'product') AND (" + policy.sql(dialect="clickhouse")
            + ") ORDER BY d.created_at DESC LIMIT 22)")
    return ("/* arm-t merge-first slices */ SELECT * FROM (" + " UNION ALL ".join(slices)
            + ") ORDER BY created_ms DESC LIMIT 22")


def verification_sql(compiled, reader, groups, selected):
    # Validate bounds/ties before any canonical query. Keep the guard for exact
    # canonical comparison, not just the 21 returned winners.
    canonical_page(selected)
    if any(row.get("group_id") not in groups for row in selected):
        raise InvalidArm("selected attachment outside actual readable groups")
    boundary = original._boundaries(original.pinned(compiled, reader, groups))["posts"]
    if selected:
        identities = " UNION ALL ".join(
            "SELECT " + original.literal(a) + " AS author_key,"
            + original.literal(d) + " AS doc_id"
            for a, d in sorted({(row["author_key"], row["doc_id"]) for row in selected}))
    else:
        identities = "SELECT '' AS author_key,'' AS doc_id WHERE 0"
    checked = original._scope(boundary, identities).sql(dialect="clickhouse")
    return ("/* arm-t merge-first verification */ SELECT p.author_key,p.doc_id,p.group_id,"
            "toUnixTimestamp64Milli(p.created_at) AS created_ms FROM (" + checked
            + ") AS p WHERE NOT has(p.tags,'ad') AND NOT has(p.tags,'product') "
            "ORDER BY created_ms DESC LIMIT 23")


def verified_page(selected, checked):
    if selected != checked:
        raise InvalidArm("bounded snapshot page differs from canonical attachment/time/policy")
    return canonical_page(checked)
