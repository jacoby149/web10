# Real-Time Feeds

Hot groups need real-time updates. ClickHouse is fast but not instant for push. This doc covers the Redis + WebSocket layer for high-activity groups.

## The Problem

A celeb has 100k followers. Someone comments. 100k clients shouldn't poll. Polling is wasteful. The answer is push.

## The Architecture

```
Client → WebSocket → API → Redis (pub/sub) → ClickHouse (source of truth)
```

Three layers:
1. **ClickHouse** — source of truth. All writes go here.
2. **Redis** — cache for hot group activity. Pub/sub for push.
3. **WebSocket** — persistent connection to each client. Pushes updates.

## The Write Path

When Bob posts to `alice.followers`:

```
1. API receives POST /bob/posts { groups: ["alice.followers"] }
2. API writes to ClickHouse (INSERT INTO documents, doc_groups)
3. API writes to Redis:
   - SET group:alice.followers:recent:{doc_id} → post data, TTL 30s
   - RPUSH group:alice.followers:feed → doc_id, LTRIM to 100
   - PUBLISH group:alice.followers:updates → { doc_id, author: "bob" }
4. WebSocket server subscribes to channel, pushes to all clients in the group
```

The API does the Redis write. No pub/sub from ClickHouse needed. The API knows about the write — it just pushes to both.

## The Read Path

**Initial load (page open):**
```
1. Client opens /alice/posts?discover=true
2. API checks Redis: group:alice.followers:recent
3. If cache hit → return cached documents (fast)
4. If cache miss → query ClickHouse, populate cache, return
```

**Live updates (after page open):**
```
1. Client opens WebSocket: ws://api/websocket?groups=alice.followers
2. Server subscribes to Redis channel: group:alice.followers:updates
3. New post arrives → Redis pub → WebSocket push → client updates
```

No polling. No long-polling. Real push.

## The Redis Keys

```
group:{group_id}:recent:{doc_id}   → Hash: post data, TTL 30s
group:{group_id}:feed               → List: post IDs (newest first), LTRIM 100
group:{group_id}:trending           → Sorted Set: post IDs scored by engagement, TTL 5m
group:{group_id}:updates            → Pub/Sub channel: live push
group:{group_id}:members            → Set: member keys (for WebSocket fan-out)
```

## The WebSocket Server

```python
# Subscribes to Redis channels for groups the client follows
async def handle_websocket(ws):
    groups = ws.query_params['groups']  # 'alice.followers,bob.posts'
    
    # Subscribe to Redis pub/sub
    pubsub = redis.pubsub()
    for g in groups:
        pubsub.subscribe(f'group:{g}:updates')
    
    # Forward messages to client
    async for message in pubsub.listen():
        if message['type'] == 'message':
            doc_id = message['data']['doc_id']
            post = redis.hgetall(f'group:{g}:recent:{doc_id}')
            await ws.send(json.dumps(post))
```

## The Scale

**Small group** (< 1k members): ClickHouse direct query. No Redis. No WebSocket. Simple.

**Medium group** (1k - 10k): Redis cache for recent posts. No WebSocket. Polling is fine.

**Hot group** (10k+): Redis cache + WebSocket push. Real-time updates. The infrastructure scales with the group.

## The Trade-off

Complexity. You're adding Redis and WebSockets to a stack that was "ClickHouse + MinIO." But this is day-two complexity. Day one, ClickHouse handles reasonable group sizes with polling. The Redis + WebSocket layer is the scaling story, not the foundation.

## Summary

ClickHouse is the source. Redis caches hot activity and pushes updates. WebSocket delivers to clients. The API writes to both ClickHouse and Redis on every insert. No pub/sub from ClickHouse needed. The model doesn't change — the infrastructure adds a cache and a push channel.
