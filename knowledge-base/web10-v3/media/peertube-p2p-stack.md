# PeerTube P2P Library Stack

## The Libraries

PeerTube's P2P streaming is built on four libraries that work together:

| Library | Role | Layer |
|---|---|---|
| **WebTorrent** | BitTorrent tracker on the server | Server |
| **P2P Media Loader** | Hooks into hls.js to fetch segments via WebRTC | Client |
| **hls.js** | Parses HLS manifests, requests segments | Client |
| **Video.js** | Player framework, wraps everything | Client |

## How They Fit Together

```
Video.js (player UI, controls)
  ↓
hls.js (parses .m3u8, manages buffer, requests segments)
  ↓
P2P Media Loader (intercepts segment requests)
  ├→ HTTP fetch (origin server, cache instances)
  └→ WebRTC data channels (other browsers watching the same video)
  ↓
hls.js (feeds segments to the decoder)
  ↓
Video.js (renders to <video> element)
```

**P2P Media Loader** is the key innovation. It replaces hls.js's segment fetcher. When hls.js asks for a `.ts` chunk, P2P Media Loader tries to get it from peers first. If no peer has it, it falls back to HTTP. Meanwhile, it seeds chunks to other peers.

## The Server: WebTorrent Tracker

PeerTube runs a slightly custom version of `webtorrent/bittorrent-tracker`. When a video is uploaded:

1. Server transcodes to HLS (multiple bitrates)
2. Server creates a torrent file for the video
3. Tracker announces the torrent to connected peers

Browsers connect to the tracker to discover other viewers watching the same video. The tracker doesn't serve content — it just says "here are the peers who have this video."

## WebSeed (BEP-19)

PeerTube instances can cache each other's videos. When an instance caches a video, it injects itself as a **WebSeed** URL in the torrent metadata. Peers can download chunks from the cache instance via HTTP while still participating in the P2P swarm.

```
Origin instance → caches video
Cache instance → announces as WebSeed
Peers → download from origin + cache + other peers
```

## What web10 Would Need

To replicate PeerTube's P2P approach:

1. **Server-side:** A WebTorrent tracker (or a custom signaling server). PeerTube uses the tracker to help browsers find each other.
2. **Client-side:** P2P Media Loader + hls.js + a player. P2P Media Loader is the heavy lifter — it handles WebRTC connections, chunk exchange, and fallback to HTTP.
3. **HLS transcoding:** P2P Media Loader works with HLS segments (`.ts` files). Raw MP4 files don't benefit from P2P the same way — you need small, seekable chunks.

## Alternatives to P2P Media Loader

P2P Media Loader is mature but opinionated (HLS + WebRTC). Other options:

- **WebTorrent HTTP** — streams any HTTP file over BitTorrent. Less efficient for video (no HLS integration), but works for any file type.
- **livepeer** — WebRTC live streaming with P2P mesh. More for live than VOD.
- **ipfs** — content-addressed storage. Good for distribution, bad for streaming (needs full block before playback).
- **Custom WebRTC data channels** — build your own chunk exchange protocol. Maximum control, maximum work.

## Summary

PeerTube's stack is: **WebTorrent tracker** (server) + **P2P Media Loader** (client, hooks into hls.js) + **hls.js** (HLS parsing) + **Video.js** (player). The P2P Media Loader library is the key — it intercepts HLS segment requests and fulfills them from peers via WebRTC, falling back to HTTP. Requires HLS transcoding on the server side.