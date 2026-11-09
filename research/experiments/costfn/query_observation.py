"""Metadata-only native SELECT attribution for the disposable research wrapper."""
import hashlib
import time
import uuid

LIMIT = 256


def instrument_client(client, current):
    """Keep the node's per-thread client; never bind one thread's connection globally."""
    if getattr(client, "_costfn_query_observed", False):
        return client
    original = client.query

    def query(*args, **kwargs):
        observation = current()
        if observation is None:
            return original(*args, **kwargs)
        rows = observation.setdefault("native_queries", [])
        settings = (args[2] if len(args) > 2 else kwargs.get("settings")) or {}
        sql = args[0] if args else kwargs.get("query")
        # Existing IDs/positional transport/context-only calls keep their exact
        # behavior; missing attribution is explicit, never guessed from timing.
        if len(rows) >= LIMIT or len(args) > 3 or settings.get("query_id") or not isinstance(sql, str):
            observation["native_query_observation_skipped"] = observation.get("native_query_observation_skipped", 0) + 1
            return original(*args, **kwargs)
        identifier = uuid.uuid4().hex
        options = dict(kwargs)
        if len(args) > 2:
            args = (*args[:2], {**settings, "query_id": identifier})
        else:
            # clickhouse-connect routes query_id from settings into URL params;
            # transport_settings is HTTP headers and does NOT select query IDs.
            options["settings"] = {**settings, "query_id": identifier}
        record = {"query_id": identifier, "sql_sha256": hashlib.sha256(sql.encode()).hexdigest(), "failed": True}
        rows.append(record)
        started = time.perf_counter()
        try:
            result = original(*args, **options)
            record["failed"] = False
            if getattr(result, "query_id", identifier) != identifier:
                observation["native_query_id_mismatch"] = True
            return result
        finally:
            # No SQL, bound parameters, transport headers or exception text.
            record["client_ms"] = (time.perf_counter() - started) * 1000

    client.query = query
    client._costfn_query_observed = True
    return client
