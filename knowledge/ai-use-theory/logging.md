# Logging — The Signal Router

[← back to README](./README.md)

The pyramid says "logs are the gradient." This doc makes that concrete: where logs live, how they get there, and how you query them when something breaks.

## The Problem: Signal Is Scattered

In a distributed system, the signal for one bug is smeared across multiple places:

- The **symptom** is in the browser console (Playwright capture, or the user's DevTools)
- The **request** is in the API (docker logs, or stdout)
- The **state** is in the database (ClickHouse, Postgres, whatever)
- The **test output** is in the test runner (Jest, Playwright, pytest)

Without a unified store, debugging means cross-referencing four systems manually. `docker exec` into the API container. `docker exec` into the database. Read the Playwright output. Open DevTools. Stitch it together in your head. That's archaeology, not debugging.

## The Signal Router: One Queryable Store

The fix: all signal flows into one table. One SQL query gives you the full incident timeline. No docker exec. No manual stitching.

```
Browser console ──┐
                  │  POST /v3/logs
API middleware ───┼──►  logs table (ClickHouse)  ◄── one SELECT = full timeline
                  │
E2E runner ──────┘
```

### The `logs` table

```sql
CREATE TABLE logs (
    ts DateTime64(6),
    service LowCardinality(String) DEFAULT 'api',  -- 'api', 'sdk', 'e2e'
    level LowCardinality(String) DEFAULT 'info',   -- 'info', 'warn', 'error'
    method LowCardinality(String) DEFAULT '',
    path LowCardinality(String) DEFAULT '',
    status UInt16 DEFAULT 0,
    latency_ms UInt32 DEFAULT 0,
    user_key String DEFAULT '',
    origin String DEFAULT '',
    message String DEFAULT '',
    request_body String DEFAULT '',   -- truncated to 4KB
    response_body String DEFAULT '',  -- truncated to 4KB
    meta String DEFAULT ''            -- JSON: error detail, test name, etc.
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(ts)
ORDER BY (ts)
TTL ts + INTERVAL 30 DAY;
```

Append-only. No tombstones. TTL handles cleanup. 30 days is enough for debugging, not enough to fill the disk.

### Three sources, one table

| `service` | Source | What it captures |
|---|---|---|
| `api` | API middleware (every request) | method, path, status, latency, user_key, origin, truncated bodies, error detail |
| `sdk` | Browser SDK via `POST /v3/logs` | Console logs tee'd from the demo app, tagged with user_key + origin |
| `e2e` | Playwright runner via `POST /v3/logs` | Captured browser console + network logs after each test, tagged with test_name |

### The API middleware

Every HTTP request that hits the API gets logged automatically. No per-endpoint instrumentation needed. The middleware:

1. Reads the request body (cached by Starlette, endpoint still works)
2. Extracts `user_key` from the JWT (signature not verified — this is logging, not auth)
3. Captures the `Origin` header
4. Calls `call_next()`
5. Buffers the response body (truncated to 4KB)
6. Fires an `asyncio.create_task` to insert the log row (fire-and-forget — if CH is down, the request still succeeds)

Logging must never break the API. If the insert fails, it's a silent `log.debug`, not a 500.

### The `POST /v3/logs` endpoint

Lightweight, no auth. Accepts a batch of log entries from any external source:

```json
{
  "service": "sdk",
  "user_key": "api.localhost/alice",
  "origin": "http://marketing.localhost",
  "entries": [
    { "level": "error", "message": "[notes-demo] readNotes FAILED: 403", "meta": "{\"status\":403}" },
    { "level": "info", "message": "[notes-demo] showFixAccess — showing fix button" }
  ]
}
```

The SDK tees its `console.log` calls here. The E2E runner dumps Playwright's captured console after each test. Both land in the same table as the API middleware logs.

## The Diagnostic Query

When something breaks, the first thing you do is not read code. You run:

```sql
SELECT ts, service, level, method, path, status, user_key, origin, message
FROM logs
WHERE user_key = 'api.localhost/alice'
  AND ts > now() - INTERVAL 10 MINUTE
ORDER BY ts;
```

One result set. Chronological. API 403, SDK error, demo "showFixAccess" — all in order. That's the compare phase of the four-step flow, reduced to a single query.

### Joining logs with state

The real power: you can JOIN logs with the application data in the same query.

```sql
-- Why was this origin denied?
SELECT l.ts, l.origin, l.message, c.deleted, c.updated_at
FROM logs l
LEFT JOIN (
    SELECT allowed_origin, deleted, updated_at
    FROM (SELECT *, row_number() OVER (PARTITION BY user_key, allowed_origin ORDER BY updated_at DESC) AS rn
          FROM app_contracts WHERE user_key = 'api.localhost/alice')
    WHERE rn = 1
) c ON c.allowed_origin = l.origin
WHERE l.user_key = 'api.localhost/alice' AND l.status = 403
ORDER BY l.ts DESC;
```

The log tells you *when* and *what*. The JOIN tells you *why* (the contract was tombstoned at time X). No docker exec. No manual cross-referencing.

## Design Decisions

- **API inserts directly.** No shipper, no logging driver, no extra container. The API already has a CH connection. One INSERT per request is negligible.
- **Fire-and-forget.** `asyncio.create_task` — if CH is down, the log is lost but the request succeeds. Logging must never be a dependency for the API.
- **Truncated bodies.** 4KB cap. Media goes through S3 presigned URLs, not the API body. Safe.
- **`user_key` is the join key.** Every row carries the user's identity. That's what makes the JOIN queries possible.
- **30-day TTL.** Old logs are gone. That's fine — they were signal, not state.
- **`docker logs` is the fallback.** For the 10% case where the container crashes before it can log. Primary signal is the SQL query.

## What This Means for the Theory

The pyramid's "logs" layer was always right but too vague. The signal router makes it a concrete architectural pattern: **all signal flows into one queryable store.** The compare phase goes from "docker exec into three containers and pray" to "one SELECT." That's not an incremental improvement. It's a different debugging paradigm.

Future projects build this on day one. Not as a logging feature. As a debugging interface. The question "where is the signal?" becomes "run the query."
