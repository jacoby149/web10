# Streaming at Scale (v4)

v3 ships the layers that make video *work*: range requests (MinIO native) and HLS transcoding (adaptive bitrate, signed segments). See `../../web10-v3/media/streaming.md`.

This doc holds the layers that make video *cheap at scale* — they pay off with concurrent viewers, global latency, or multi-megapixel assets. None of them are needed for video to work; each is triggered by a cost or latency problem that doesn't exist at v3 audience size.

## Layer 3: P2P (When Popular Content Costs Too Much)

WebRTC signaling server. When a video has N concurrent viewers, peers share chunks. Server bandwidth is O(1), not O(N).

```
Server → Viewer A (chunks 1-100)
Server → Viewer B (chunks 1-100)
Viewer A → Viewer B (chunks 1-50)  [P2P]
Viewer B → Viewer A (chunks 51-100) [P2P]
```

This is the PeerTube innovation. It's not about quality — it's about **economics**. A video with 10,000 concurrent viewers costs 10,000x bandwidth on a traditional model. With P2P, it costs maybe 100x (seeders + initial fetch).

**The stack:** WebTorrent tracker (server) + P2P Media Loader (client, hooks into hls.js) + hls.js + a player. Details: `peertube-p2p-stack.md`.

**The security surface (why this is v4, not v3):** peers send you shards of the video. BitTorrent's piece hashing makes *corrupted* shards detectable, but the channel is still untrusted input from arbitrary peers — a new attack surface (resource exhaustion, malformed chunks, tracker abuse) that v3 doesn't need to open. NAT traversal (STUN/TURN) is real operational pain. The first viewer always pays the full cost, and small audiences get zero benefit.

**When:** M2+ scale, real concurrent-viewer counts on real content. Not before.

## Layer 4: Edge Caching (When Global Latency Matters)

Upload to MinIO → replicate to edge nodes → serve from nearest edge.

```
MinIO (source) → Cloudflare / Fastly / CloudFront (edges)
User → nearest edge → cached chunk
```

**Pros:** Low latency. Scales infinitely. Industry standard.

**Cons:** CDN costs. Egress fees. Not P2P — still linear server cost. Caching invalidation for updates/deletes.

**Best for:** Public content with global audience. Static assets.

## Layer 5: Tile-Based Streaming (Images, Maps, 3D)

For large images and 3D models, split into tiles. Client requests tiles based on viewport and zoom level.

```
alice/blueprint.png (10,000 x 10,000 pixels)
→ alice/blueprint/tile/0/0.png  (level 0, tile 0)
→ alice/blueprint/tile/1/0.png  (level 1, tile 0)
→ alice/blueprint/tile/1/1.png  (level 1, tile 1)
```

Client only downloads visible tiles. Zoom in → download higher resolution tiles for visible area.

**Pros:** Massive files become interactive. Only visible data transfers. Works for images, point clouds, 3D models.

**Cons:** Tiling is a preprocessing step. Different tiling formats per type (XYZ for images, Draco for 3D). Client needs a tile renderer.

**Best for:** Satellite imagery, medical scans, architectural blueprints, 3D models.

## What About PeerTube's Torrenting?

BitTorrent for video distribution is clever but has trade-offs:

- **Torrenting requires the full file** — you can't stream partial torrents easily. You need the whole piece before playback.
- **WebRTC is better for streaming** — data channels deliver chunks in order, low latency.
- **Torrenting is better for distribution** — seed a file, everyone downloads in parallel.

PeerTube uses both: WebRTC for live streaming, torrents for on-demand, HLS for fallback. For web10, WebRTC P2P is the priority. Torrenting is niche — useful for large file distribution (datasets, backups), not for social media video.

## Summary

| Layer | When to Use | Infrastructure |
|---|---|---|
| P2P (WebRTC) | Popular content, concurrent viewers | Tracker + P2P Media Loader + TURN |
| Edge caching | Global audience, low latency | CDN |
| Tile-based | Large images, 3D models | Tiling background job |

Each layer is added when its specific cost/latency problem is felt — not before.
