"""Pure Config P constructors. Pointers narrow canonical reads, never authorize."""
from datetime import UTC

import sqlglot
from sqlglot import exp

import arm_satellite_counts as counts
import arm_satellite_sql as typed


def condition(sql):
    return sqlglot.parse_one("SELECT 1 WHERE " + sql, read="clickhouse").args["where"].this


def literals(values):
    return ",".join(typed.literal(value) for value in sorted(set(values))) or "''"


def bound_sql(sql, parameters):
    """Trusted original helper SQL only; encode every bound string before AST parsing."""
    return sql % {key: typed.literal(value) for key, value in parameters.items()}


def bounded(boundary, pairs):
    tree = boundary.copy()
    keys = ",".join("(" + typed.literal(author) + "," + typed.literal(doc) + ")" for author, doc in sorted(set(pairs)))
    ids = literals([doc for _, doc in pairs])
    for table in tree.find_all(exp.Table):
        select = table.find_ancestor(exp.Select)
        if table.name == "documents":
            select.where(condition("(author_key,doc_id) IN (" + keys + ")" if keys else "0"), copy=False)
        elif table.name == "doc_groups":
            select.where(condition("doc_id IN (" + ids + ")" if pairs else "0"), copy=False)
    return tree


def candidate_sql(compiled, group, after, limit):
    tree = sqlglot.parse_one(compiled, read="clickhouse")
    source = tree.args["from_"].this
    order = tree.args.get("order")
    if tree.args.get("offset") or order is None or len(order.expressions) != 1 or order.expressions[0].args.get("desc") is not True:
        raise ValueError("supported Newest ordering required; no approximate ranking")
    ordered = order.expressions[0].this.sql(dialect="clickhouse").lower()
    alias = source.alias_or_name.lower()
    if ordered not in (alias + ".created_at", "created_at", "tounixtimestamp64milli(" + alias + ".created_at)", "tounixtimestamp64milli(created_at)"):
        raise ValueError("unsupported main ranking")
    predicate = tree.args["where"].this.copy()
    if list(predicate.find_all(exp.Table)) or list(predicate.find_all(exp.Subquery)):
        raise ValueError("unsupported candidate subquery")
    for function in predicate.find_all(exp.Func):
        if isinstance(function, (exp.And, exp.Or, exp.ArrayContains)):
            continue
        if isinstance(function, exp.Anonymous) and function.name.lower() == "tounixtimestamp64milli":
            continue
        raise ValueError("unsupported or non-deterministic candidate function")
    for column in predicate.find_all(exp.Column):
        if column.name not in ("doc_id", "author_key", "group_id", "tags", "created_at", "ref_value"):
            raise ValueError("unsupported candidate predicate; no approximate treatment")
        column.set("table", exp.to_identifier("t"))
    cursor = ""
    if after:
        cursor = " AND (created_at,doc_id,author_key)<(fromUnixTimestamp64Milli(" + str(after["created_ms"]) + ")," + typed.literal(after["doc_id"]) + "," + typed.literal(after["author_key"]) + ")"
    return ("SELECT group_id,author_key,doc_id,toUnixTimestamp64Milli(created_at) AS created_ms "
            "FROM doc_groups_t AS t WHERE group_id=" + typed.literal(group) + " AND collection_name="
            + typed.literal(source.name) + " AND (" + predicate.sql(dialect="clickhouse") + ")" + cursor
            + " ORDER BY created_at DESC,doc_id DESC,author_key DESC LIMIT " + str(limit))


def order_key(row):
    def descending(value):
        return tuple(-ord(char) for char in value) + (1,)
    return -row["created_ms"], descending(row["doc_id"]), descending(row["author_key"]), row["group_id"]


def created_ms(value):
    return round((value if value.tzinfo else value.replace(tzinfo=UTC)).timestamp() * 1000)


def recipe_expressions():
    result = {}
    for counter in counts.RECIPES:
        target = "JSONExtractString(body," + repr(counter.target_body_key) + ")" if counter.target_body_key else counter.target_column
        aggregate = ("countIf(JSONExtractString(body," + repr(counter.match_body_key) + ")=" + repr(counter.match_value) + ")"
                     if counter.match_body_key else "count()")
        canonical = sqlglot.parse_one("SELECT " + aggregate, read="clickhouse").expressions[0].sql(dialect="clickhouse")
        result[counter.service, canonical] = (counter.name, target)
    return result


def counter_query(select, scope, ids, presence_scope=None):
    if any(select.args.get(key) for key in ("joins", "having", "qualify", "distinct")):
        raise ValueError("unsupported aggregate topology; preserve caller semantics")
    source = select.args["from_"].this.name
    mapping, targets = [], []
    known = recipe_expressions()
    for projection in select.expressions[1:]:
        expression = projection.this if isinstance(projection, exp.Alias) else projection
        item = known.get((source, expression.sql(dialect="clickhouse")))
        if item is None:
            raise ValueError("unbuilt counter semantics; refuse treatment")
        mapping.append((projection.alias_or_name, item[0]))
        targets.append(item[1])
    if not mapping or len(set(targets)) != 1:
        raise ValueError("one built reference family required")
    target = select.expressions[0]
    target_expr = target.this if isinstance(target, exp.Alias) else target
    group = select.args.get("group")
    if group is None or len(group.expressions) != 1 or group.expressions[0].sql(dialect="clickhouse") not in (
            target_expr.sql(dialect="clickhouse"), target.alias_or_name):
        raise ValueError("unsupported grouping multiplicity")
    if target_expr.sql(dialect="clickhouse") != sqlglot.parse_one("SELECT " + targets[0], read="clickhouse").expressions[0].sql(dialect="clickhouse"):
        raise ValueError("counter reference differs from build")
    allowed = condition(targets[0] + "<>''").sql(dialect="clickhouse")
    where = select.args.get("where")
    if where and where.this.sql(dialect="clickhouse") != allowed:
        # Literal-ID follow-ups additionally constrain precisely these targets.
        in_pred = where.this
        if (not isinstance(in_pred, exp.In) or in_pred.this.sql(dialect="clickhouse") != target_expr.sql(dialect="clickhouse")
                or any(not isinstance(value, exp.Literal) or not value.is_string for value in in_pred.expressions)
                or set(value.this for value in in_pred.expressions) != set(ids)):
            raise ValueError("unsupported counter predicate; do not drop caller conditions")
    names = [name for _, name in mapping]
    scopes = [scope]
    if presence_scope:
        names.append(source + ":present")
        scopes.append(presence_scope)
    fields = ["doc_id AS " + typed.identifier(target.alias_or_name)]
    fields.extend("maxIf(value,counter_name=" + typed.literal(name) + ") AS " + typed.identifier(alias) for alias, name in mapping)
    result = ("SELECT " + ",".join(fields) + " FROM counting_numbers_p2 WHERE scope_key IN (" + literals(scopes)
            + ") AND counter_name IN (" + literals(names) + ") AND doc_id IN (" + literals(ids) + ") GROUP BY doc_id")
    if select.args.get("order"):
        result += " " + select.args["order"].sql(dialect="clickhouse")
    if select.args.get("limit"):
        result += " " + select.args["limit"].sql(dialect="clickhouse")
    if select.args.get("offset"):
        result += " " + select.args["offset"].sql(dialect="clickhouse")
    return result


def main_sql(compiled, pointers, profile_pairs, scope):
    tree = sqlglot.parse_one(compiled, read="clickhouse")
    source = tree.args["from_"].this
    pairs = [(row["author_key"], row["doc_id"]) for row in pointers]
    ids = [row["doc_id"] for row in pointers]
    for cte in tree.args["with_"].expressions:
        if cte.alias == source.name:
            cte.set("this", bounded(cte.this, pairs))
        elif cte.alias == "profile":
            cte.set("this", bounded(cte.this, profile_pairs))
    for join in tree.args.get("joins", []):
        selected = join.this.this if isinstance(join.this, exp.Subquery) else None
        if isinstance(selected, exp.Select) and any(list(item.find_all(exp.AggFunc)) for item in selected.expressions):
            join.this.set("this", sqlglot.parse_one(counter_query(selected, scope, ids), read="clickhouse"))
    triples = ",".join("(" + ",".join(typed.literal(row[key]) for key in ("author_key", "doc_id", "group_id")) + ")" for row in pointers)
    alias = source.alias_or_name
    tree.where(condition("(" + alias + ".author_key," + alias + ".doc_id," + alias + ".group_id) IN (" + triples + ")" if triples else "0"), copy=False)
    return tree.sql(dialect="clickhouse")


def lookup_pairs_sql(service, ids):
    return ("SELECT author_key,doc_id FROM strings WHERE owner_key IN (" + literals(ids)
            + ") AND field_name=" + typed.literal("document:" + service))


def scoped_lookup(compiled, pairs_by_service):
    tree = sqlglot.parse_one(compiled, read="clickhouse")
    for cte in tree.args["with_"].expressions:
        if cte.alias in pairs_by_service:
            cte.set("this", bounded(cte.this, pairs_by_service[cte.alias]))
    return tree.sql(dialect="clickhouse")
