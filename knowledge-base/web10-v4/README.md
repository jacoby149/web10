# web10 v4 — Beyond the Architecture Switch

v3 is the core: ClickHouse, groups as the primitive, CRUD with groups, auth, social app.

v4 is everything that requires the foundation to be stable first:

## FAQ

- `faq/could-rock-for-finance.md` — using web10 for finance/HFT. Event sourcing, append-only ledgers, compute-on-read balances. Speculative but the patterns work.

## Future

- `future/federated-groups.md` — cross-provider federation. Groups span providers, ClickHouse `remote()` queries other instances.
- `future/real-time-feeds.md` — Redis + WebSocket push layer for hot groups. Day-two scaling, not day-one.

## Media

P2P delivery at scale. The working media pipeline (HLS transcoding, streaming layers, auth split) is v3 — `../web10-v3/media/`:

- `media/streaming.md` — streaming at scale: WebRTC P2P, edge caching, tile-based
- `media/peertube-p2p-stack.md` — PeerTube's WebTorrent + P2P Media Loader + hls.js + Video.js stack

## Also in v3 files

Some v3 docs have sections that are v4 territory. The v3 files have been trimmed and reference here:

- `sdk/api.md` — `w.query()` CTE wrapping, `powerMean` sorting, cross-node addressing → v4
- `sdk/document-typing.md` — enforced schemas → v4
- `social/cross-app-sharing.md` — provider service contracts → v4

## Summary

v3 is: groups, CRUD, ClickHouse, auth, social app screens, HLS media pipeline.
v4 is: federation, P2P delivery at scale, real-time, finance, advanced SDK, monetization.