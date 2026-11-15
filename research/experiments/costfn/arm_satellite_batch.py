"""Disjoint-doc setup batches; canonical history/permissions stay authoritative."""
from collections import defaultdict

import sqlglot
from sqlglot import exp

import arm_satellite_sql as typed


def boundary(sql, index, total, *, documents="documents", links="doc_groups"):
    if type(total) is not int or total < 1 or type(index) is not int or not 0 <= index < total:
        raise ValueError("valid integer batch index/count required")
    tree = sqlglot.parse_one(sql, read="clickhouse")
    seen = set()
    predicate = sqlglot.parse_one("SELECT 1 WHERE cityHash64(doc_id)%" + str(total) + "=" + str(index),
                                 read="clickhouse").args["where"].this
    for table in tree.find_all(exp.Table):
        if table.name in (documents, links):
            seen.add(table.name)
            # Only stable doc_id partitions: no versions or attachments split.
            table.find_ancestor(exp.Select).where(predicate.copy(), copy=False)
    if seen != {documents, links}:
        raise ValueError("both canonical document and attachment histories required")
    return tree.sql(dialect="clickhouse")


def families(counters):
    grouped = defaultdict(list)
    names = set()
    for counter in counters:
        counter.validate()
        if counter.name in names:
            raise ValueError("duplicate counter recipe")
        names.add(counter.name)
        grouped[(counter.service, counter.target_column, counter.target_body_key)].append(counter)
    return list(grouped.values())


def partial_sql(sql, scope, counters, index, total, destination, **sources):
    if len(families(counters)) != 1:
        raise ValueError("one service/reference family required per batched scan")
    # Reuse the original scope/recipe validation without executing its INSERT.
    typed.build_counts({counters[0].service: sql}, scope, counters)
    counter = counters[0]
    target = ("JSONExtractString(body," + typed.literal(counter.target_body_key) + ")"
              if counter.target_body_key is not None else typed.identifier(counter.target_column))
    items = []
    for counter in counters:
        predicate = ("JSONExtractString(body," + typed.literal(counter.match_body_key) + ")="
                     + typed.literal(counter.match_value) if counter.match_body_key is not None else "1")
        value = "uniqExactIf(doc_id," + predicate + ")" if counter.distinct else "countIf(" + predicate + ")"
        items.append("tuple(" + typed.literal(counter.name) + "," + value + ")")
    partitioned = boundary(sql, index, total, **sources)
    return ("INSERT INTO " + typed.identifier(destination) + " (doc_id,counter_name,scope_key,batch,value) "
            "SELECT target_id,tupleElement(item,1)," + typed.literal(scope) + "," + str(index)
            + ",tupleElement(item,2) FROM (SELECT target_id,arrayJoin([" + ",".join(items)
            + "]) AS item FROM (SELECT *," + target + " AS target_id FROM (" + partitioned
            + ")) WHERE target_id!='' GROUP BY target_id) WHERE tupleElement(item,2)>0")


def partial_ddl(name):
    return ("CREATE TABLE " + typed.identifier(name) + " (doc_id String,counter_name String,scope_key String,"
            "batch UInt32,value UInt64) ENGINE=MergeTree ORDER BY (scope_key,counter_name,doc_id,batch) "
            "SETTINGS index_granularity=64")


def require_complete(completed, total):
    if len(completed) != total or set(completed) != set(range(total)):
        raise ValueError("every disjoint batch must finish exactly once before consolidation")


def final_sql(scope, source, destination):
    return ("INSERT INTO " + typed.identifier(destination) + " SELECT doc_id,counter_name,scope_key,sum(value) "
            "FROM " + typed.identifier(source) + " WHERE scope_key=" + typed.literal(scope)
            + " GROUP BY doc_id,counter_name,scope_key")


def count_ddl(name):
    return typed.COUNT_DDL.replace("CREATE TABLE counting_numbers", "CREATE TABLE " + typed.identifier(name), 1)


def read_counts(table, scope, ids, names, generation):
    sql = typed.read_counts(scope, ids, names, built_scope=scope, built_counter_names=names,
                            current_generation=generation, built_generation=generation)
    tree = sqlglot.parse_one(sql, read="clickhouse")
    for source in tree.find_all(exp.Table):
        if source.name == "counting_numbers":
            source.set("this", exp.to_identifier(table))
    return tree.sql(dialect="clickhouse")
