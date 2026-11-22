"""Generic typed satellite SQL for the additive Config P research arm.

Construction only: no engine, API imports, resource creation or frozen rewrites.
Caller supplies canonical boundary SELECTs from the unmodified compiler at build
time. Scope identity includes reader, actual service groups, canonical generation
and aggregation recipes. A different policy/source generation is a different
scope, never permission to reuse a stale scalar.
"""
from dataclasses import asdict, dataclass
import hashlib
import json
import re


COUNT_DDL = """CREATE TABLE counting_numbers (
    doc_id String, counter_name String, scope_key String, value UInt64
) ENGINE = MergeTree ORDER BY (doc_id, counter_name, scope_key)
SETTINGS index_granularity=64"""


def literal(value):
    if not isinstance(value, str):
        raise ValueError("string value required")
    # Hex does not depend on ClickHouse's backslash/string escaping settings.
    return "unhex('" + value.encode().hex() + "')"


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z_][a-zA-Z_0-9-]*", value):
        raise ValueError("simple identifier required")
    return "`" + value + "`"


@dataclass(frozen=True)
class Counter:
    name: str
    service: str
    target_column: str = "ref_value"
    target_body_key: str | None = None
    match_body_key: str | None = None
    match_value: str | None = None
    distinct: bool = False

    def validate(self):
        if not self.name or not self.service or type(self.distinct) is not bool:
            raise ValueError("counter name/service and explicit aggregation mode required")
        identifier(self.service)
        if self.target_column not in ("ref_value", "doc_id", "author_key"):
            raise ValueError("unsupported canonical target column")
        for value in (self.target_body_key, self.match_body_key, self.match_value):
            if value is not None and not isinstance(value, str):
                raise ValueError("body keys and match values must be strings")
        if (self.match_body_key is None) != (self.match_value is None):
            raise ValueError("predicate key/value required together")
        literal(self.name)


def scope_key(reader, services, source_generation, counters):
    if not isinstance(reader, str) or not reader or not isinstance(source_generation, str) or not source_generation:
        raise ValueError("reader and canonical generation required")
    if not isinstance(services, dict) or not services or not counters:
        raise ValueError("actual service/group mapping and recipes required")
    mapping = {}
    for service, groups in services.items():
        identifier(service)
        if not isinstance(groups, (list, tuple)) or any(not isinstance(group, str) or not group for group in groups):
            raise ValueError("explicit group list required")
        if len(groups) != len(set(groups)):
            raise ValueError("duplicate readable group")
        mapping[service] = sorted(groups)
    names = []
    for counter in counters:
        counter.validate()
        if counter.service not in mapping:
            raise ValueError("counter service has no readable scope")
        names.append(counter.name)
    if len(names) != len(set(names)):
        raise ValueError("counter names must be unique within a scope")
    value = {"reader": reader, "services": mapping, "source_generation": source_generation,
             "counters": sorted((asdict(counter) for counter in counters), key=lambda row: row["name"])}
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def build_counts(boundaries, scope, counters):
    """One setup INSERT per recipe; preserve canonical row multiplicity or DISTINCT.

    No group-to-author shortcut or per-page pin. An empty readable boundary
    produces zero rows; absence is zero only in a successfully built scope.
    """
    if not re.fullmatch(r"[a-f0-9]{64}", scope):
        raise ValueError("bound scope digest required")
    statements = []
    names = set()
    for counter in counters:
        counter.validate()
        if counter.name in names:
            raise ValueError("duplicate counter name")
        names.add(counter.name)
        boundary = boundaries.get(counter.service)
        if not isinstance(boundary, str) or not boundary.strip():
            raise ValueError("canonical boundary required")
        target = ("JSONExtractString(body," + literal(counter.target_body_key) + ")"
                  if counter.target_body_key is not None else identifier(counter.target_column))
        predicate = ("JSONExtractString(body," + literal(counter.match_body_key) + ")=" + literal(counter.match_value)
                     if counter.match_body_key is not None else "1")
        aggregate = "uniqExactIf(doc_id," + predicate + ")" if counter.distinct else "countIf(" + predicate + ")"
        statements.append("INSERT INTO counting_numbers SELECT target_id," + literal(counter.name) + ","
                          + literal(scope) + "," + aggregate + " AS value FROM (SELECT *," + target
                          + " AS target_id FROM (" + boundary + ")) WHERE target_id!='' "
                          "GROUP BY target_id HAVING value>0")
    if not statements:
        raise ValueError("at least one counter recipe required")
    return statements


def read_counts(scope, doc_ids, counter_names, *, built_scope, built_counter_names, current_generation, built_generation):
    """Bounded stored values only. Incomplete/stale scopes fail, never zero-fill."""
    if scope != built_scope or current_generation != built_generation:
        raise ValueError("missing or stale count scope; rebuild before serving")
    if not re.fullmatch(r"[a-f0-9]{64}", scope):
        raise ValueError("scope digest required")
    if not doc_ids or not counter_names:
        raise ValueError("explicit document and counter keys required")
    if not set(counter_names) <= set(built_counter_names):
        raise ValueError("counter not included in this completed scope build")
    return ("SELECT doc_id,counter_name,value FROM counting_numbers WHERE scope_key=" + literal(scope)
            + " AND doc_id IN (" + ",".join(literal(doc) for doc in sorted(set(doc_ids))) + ")"
            + " AND counter_name IN (" + ",".join(literal(name) for name in sorted(set(counter_names))) + ")")


def slice_limit(page_size):
    if type(page_size) is not int or page_size < 1:
        raise ValueError("positive request page size required")
    return page_size + 1  # one tie/continuation guard, derived from the request


def group_slice(group_id, service, page_size, *, before=None):
    """Config P slice only, not authority. Resolver owns live checks and refill."""
    limit = slice_limit(page_size)
    cursor = ""
    if before is not None:
        created_ms, doc_id, author_key = before
        if type(created_ms) is not int:
            raise ValueError("integer cursor time required")
        cursor = (" AND (created_at,doc_id,author_key)<(fromUnixTimestamp64Milli("
                  + str(created_ms) + ")," + literal(doc_id) + "," + literal(author_key) + ")")
    return ("SELECT group_id,author_key,doc_id,toUnixTimestamp64Milli(created_at) AS created_ms "
            "FROM doc_groups_t WHERE group_id=" + literal(group_id) + " AND collection_name="
            + literal(service) + cursor + " ORDER BY created_at DESC,doc_id DESC,author_key DESC LIMIT " + str(limit))
