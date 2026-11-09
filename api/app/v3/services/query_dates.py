"""Conservative per-reference date hints; never infer global service eligibility."""

from sqlglot import exp


def dated_references(tree, services):
    """Only a direct FROM and a qualified, literal lower-bound AND conjunct.

    OR/NOT, computed dates, unqualified columns and caller CTEs stay untouched.
    The original predicate remains outside canonical history resolution.
    """
    for select in list(tree.find_all(exp.Select)):
        source = select.args.get("from_")
        table = source.this if source else None
        where = select.args.get("where")
        if not isinstance(table, exp.Table) or table.name not in services or not where:
            continue
        # ClickHouse default-filled outer rows can satisfy an epoch-zero bound.
        # Pruning the default-supplying side can manufacture unmatched rows.
        if any(join.args.get("side") in {"RIGHT", "FULL"} for join in select.args.get("joins", [])):
            continue
        # Alias shadowing in SELECT can change ClickHouse name resolution.
        if any(
            a.alias == "created_at"
            and not (
                isinstance(a.this, exp.Column)
                and a.this.name == "created_at"
                and a.this.table == table.alias_or_name
                and not a.this.db
                and not a.this.catalog
            )
            for a in select.expressions
        ):
            continue
        predicates = [where.this]
        bounds = []
        while predicates:
            predicate = predicates.pop()
            if isinstance(predicate, exp.And):
                predicates.extend([predicate.this, predicate.expression])
                continue
            if not isinstance(predicate, exp.GTE):
                continue
            column, value = predicate.this, predicate.expression
            if not (
                isinstance(column, exp.Column)
                and column.name == "created_at"
                and column.table == table.alias_or_name
                and not column.db
                and not column.catalog
            ):
                continue
            if not (
                isinstance(value, exp.Anonymous)
                and value.name.lower() == "fromunixtimestamp64milli"
                and len(value.expressions) == 1
            ):
                continue
            literal = value.expressions[0]
            if isinstance(literal, exp.Literal) and not literal.is_string and literal.this.isdigit():
                number = int(literal.this)
                if 0 <= number <= 253402300799999:
                    bounds.append(number)
        if bounds:
            yield table, max(bounds)
