# web10 vs Solid: Differences

## The Core Difference

**Solid is a protocol-first project.** Tim Berners-Lee built Solid to decentralize the web's data layer. The social platform is what you build *on top* of the protocol.

**web10 is a social platform-first project.** The protocol exists to make the social platform work. Every technical decision is judged by whether it makes the social experience better, faster, or more engaging.

This single difference cascades into everything else.

## What They Have in Common

Both systems try to solve the same fundamental problem: users should own their data, control who sees it, and move between apps without losing anything. Both give users a personal data store. Both let users grant and revoke app access. Both want to break platform lock-in.

## Data Storage

### Solid: Pods with LDPC

Solid stores data in **Pods** (Personal Online Data Stores). Each Pod is a collection of **Containers** (like folders) that hold **Resources** (files). Resources are typically RDF/Turtle — structured linked data. The storage format is standardized: LDPC (Linked Data Platform Container).

```
alice.pod.example.com/
  containers/
    posts/
      post1.ttl
      post2.ttl
    profile/
      profile.ttl
```

The data model is schemaless by design — any app can write any RDF graph into any container. There is no enforced structure. The app layer decides what means what.

### web10 v3: ClickHouse Tables

web10 stores everything in **one ClickHouse table**. Documents are JSON blobs with a `collection_name` field. The structure is enforced at the API layer — the CRUD endpoint `/{user}/{service}` is the only way data enters or leaves.

```sql
documents (
    doc_id String,
    author_key String,
    collection_name String,  -- 'posts', 'reactions', 'comments'
    body String,             -- JSON
    discoverable UInt8,
    tags Array(String),
    ...
)
```

Everything is a document. A reaction is a document. A comment is a document. A follow is a group membership. One table, one CRUD, one permission model.

### Difference

Solid's LDPC is a general-purpose data store. It can hold anything — RDF, JSON, binary blobs. The trade-off is that cross-user queries are hard. You can't efficiently query "all posts from people Alice follows" because each Pod is a separate server with its own data.

web10's single table makes cross-user queries native. Discovery, engagement counts, comment threads — all are SQL queries against one table. The trade-off is less flexibility in storage format, but social platforms don't need arbitrary RDF graphs. They need posts, reactions, comments, and groups.

## Access Control

### Solid: WebACL

Solid uses **WebACL** — a W3C standard for access control on linked data. Access rules are attached to containers and resources. Rules define who can read, append, write, or control.

```turtle
<#acl1> a acl:Authorization ;
    acl:accessTo <https://alice.pod.example.com/posts/> ;
    acl:agentGroup <https://alice.pod.example.com/groups/friends.ttl> ;
    acl:mode acl:Read, acl:Write .
```

The rules live in the Pod. The Pod owner manages them. Apps query the ACL to see what they can access.

### web10 v3: Service Contracts + Groups

web10 has **two layers** of access control:

1. **Service contracts** — which websites (origins) can access your data. Browser-enforced via CORS. Kill switch.
2. **Groups** — which people can see which content. Policy containers that hold people, not data.

```
service:posts → allowed: twitter-clone.web10.com  (outer wall)
jazz-collectors → members: alice, dave, eve       (inner permissions)
```

Both must pass. The app needs a service contract to make the call. The group decides what's visible.

### Difference

WebACL is per-resource or per-container. You attach rules to things. Solid's model is granular but complex — managing ACL rules for thousands of resources is a UI problem that Solid apps struggle with.

web10's model is two-axis: apps vs. people. Service contracts handle app-level access (one toggle per app). Groups handle people-level access (one membership, infinite apps). The authenticator manages both with simple toggles: block sharing, opt out, privatize all, kill switch.

web10 v2 had a more complex permission system — term records with whitelists and blacklists per service, regex matching, per-action permissions. It was the source of most bugs in v2. v3 eliminated it entirely in favor of groups.

## Social Features

### Solid: Activity Streams on Top

Solid doesn't define social features. Apps use **Activity Streams** (another W3C standard) to build feeds, notifications, and interactions. Each app implements its own discovery, reactions, comments, and follows. There is no shared social layer.

The result: every Solid app reinvents social features. A Twitter-like app and a Facebook-like app on Solid have different data models for posts, different ways to handle reactions, different follow mechanisms. Interoperability between apps is app-level, not platform-level.

### web10 v3: Platform Social Layer

web10 **is** the social layer. The platform defines what a post, reaction, comment, and follow is. Apps share the same data model:

- **Posts** — documents in the `documents` table
- **Reactions** — documents with a `ref` type pointing to a post
- **Comments** — documents with a `ref` type and text
- **Follows** — group membership in `alice.followers`

One data model. One permission system. One discovery query. Apps are views on the same data.

### Difference

Solid gives you the freedom to build any social experience. The cost is fragmentation — every app is its own ecosystem.

web10 gives you one social experience that works everywhere. The cost is less freedom to redefine what a "post" or "reaction" means. But social platforms converge — they all end up looking like posts, reactions, comments, and follows.

## Discovery

### Solid: Follow Federated Web Activities (FFA)

Solid apps use **FFA** to discover content from other Pods. FFA is a pub/sub protocol where Pods announce activities (new posts, reactions) to a shared notification service. Apps subscribe to activities from people they follow.

The problem: FFA is optional. Not all Solid apps use it. Not all Pods support it. Discovery is app-dependent, not platform-dependent.

### web10 v3: `?discover=true`

web10 discovery is a CRUD parameter. One query. One table.

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.discoverable = 1
  AND gm.member_key = 'alice'
ORDER BY p.created_at DESC
LIMIT 50;
```

No mirrors. No pub/sub. No federation protocol. Just a join against the documents table.

### Difference

FFA is a federation protocol. It's designed for a world where data lives on thousands of independent servers. The complexity is inherent to the architecture.

web10's discovery is a query. It works because all data lives in one database. Cross-user queries are native, not federated. The trade-off: web10 is centralized at the data layer. Solid is decentralized.

## Groups

### Solid: Agent Groups

Solid has **agent groups** — RDF lists of agents (users) that ACL rules reference. They're part of the access control model, not a social feature. Apps can use them for sharing, but there's no platform-level group management, no join policies, no group feeds.

### web10 v3: Groups as Platform Primitive

Groups are the **core social primitive** in web10. Everything is a group:

- **Follows** — `alice.followers` is a group
- **Close friends** — `alice.close-friends` is a group
- **Communities** — `jazz-collectors` is a group
- **Cross-app sharing** — the same group works in social, music, video apps

Groups have join policies (open, request, invite-only). Groups have moderation. Groups have per-group blacklists. Groups carry across apps. One membership, infinite apps.

### Difference

Solid's agent groups are an access control primitive. web10's groups are a social primitive. The difference is philosophical: Solid sees groups as a way to manage permissions. web10 sees groups as the thing users actually interact with.

## The Stack

### Solid

```
App (Activity Streams, WebACL)
  ↓
Pod (LDPC, RDF/Turtle)
  ↓
Web Server (Node.js, Python, etc.)
  ↓
Storage (any — filesystem, database, cloud)
```

Multiple layers. Multiple standards. Multiple implementations. Each Pod can use different storage. Each app can use different protocols.

### web10 v3

```
App (React, web10 SDK)
  ↓
API (CRUD, Groups, Media)
  ↓
ClickHouse (structured) + MinIO (blobs)
```

Two services. One table. One blob store. The stack is opinionated. The opinion is "social platform."

## Media & Video: A Concrete Example

The transcoding conversation shows the philosophical difference in practice.

### Solid: The Protocol Answer

Solid gives you a Pod to store files. How you handle video is up to you. Transcode on your pod? Stream from your pod? Build a transcoding service? The protocol doesn't care. The protocol is clean — it's a data store. The social experience depends on whoever builds the app.

### web10: The Product Answer

web10 makes concrete decisions so the product works:

- **Browser uploads:** ffmpeg.wasm transcodes in the browser. User's CPU does the work. No server cost. 720p H.264. Good enough for social media.
- **Mobile uploads:** hardware encoders (AVAssetExportSession, MediaCodec). 1080p in seconds. The mobile app is where client-side transcoding shines.
- **Pro feature:** server-side transcoding. HLS adaptive bitrate. Multiple resolutions. AV1. For users who care about quality.
- **Playback:** range requests for free tier. HLS + P2P (WebRTC) for popular content. JWT-signed segments for private groups.

Every decision is judged by one question: does this make video work for social media? The answer is yes. The protocol serves the product.

### Difference

Solid's approach is clean. web10's approach ships. One optimizes for the protocol. The other optimizes for what users actually do — upload videos, watch videos, share videos.

## Influencer Economics

### Solid: No Model

Solid has no concept of creator compensation, monetization, or influencer economics. The protocol is about data sovereignty, not economics. If an app wants to pay creators, it builds its own system on top. The result: no shared economy, no cross-app monetization, no platform-level creator tools.

### web10: The Automattic of Creator-Owned Social

web10 is built for one customer: the creator. Users are free and arrive with the creator.

**The problem it solves:** creators rent their audience. 1M subs, 300k delivered. The rent (reach throttling, demonetization, deplatforming) rises every year. web10 sells the building, not a nicer landlord.

**The node:** each creator gets their own node — their domain, their brand, 100% delivery by architecture. No algorithm. No shadow bans. No demonetization. Newest first. That's it. The creator owns the building and can never be evicted.

**The economics:**
- **Hosted nodes** — subscription by community size ($49-$499/mo). Flat pricing, not percentage. Gets cheaper as the creator grows. Self-hosting stays free forever (the credibility of the ownership story depends on it).
- **Payment rails** — ~3% of revenue flowing through web10 Stripe Connect. Memberships, tips, sponsor payouts at ~97% payout.
- **Sponsor marketplace** — the nano-tier ($20 promos at 5k followers) up to real campaigns. 3% take — 2-3x cheaper than Paved (30%), Kit (23-30%), OnlyFans (20%).
- **Add-not-move** — platform #6, the only one they own. Creators keep YouTube, TikTok, Instagram. web10 is the owned layer.

**The comparison that closes deals:** a creator doing $3k/mo in memberships pays Substack ~$300, OnlyFans $600, Skool/Whop $600-900. web10 hosted: $199 + $90 rails = $289. Cheaper at $3k/mo and massively cheaper as they grow ($10k/mo: Substack $1k vs web10 $499). The take is flat-ish, not proportional — web10 gets cheaper as the creator wins. That's a pricing story no percentage platform can match.

**The authenticator controls everything:** creators manage who sees what, where, and how. Service contracts control app access. Groups control audience access. The authenticator is the creator's control panel.

### Difference

Solid gives you data sovereignty. web10 gives you data sovereignty **and** a way to make a living. One is a protocol. The other is a platform creators can build careers on. The customer is the creator. Users are free. The software is the funnel, hosting is the margin, rails are the compounding asset.

## Summary

| | Solid | web10 v3 |
|---|---|---|
| **Goal** | Decentralize the web | Build a killer social platform |
| **First principle** | Protocol | Product |
| **Data store** | Pods (LDPC, RDF) | ClickHouse (one table) |
| **Access control** | WebACL (per-resource) | Service contracts + Groups |
| **Social layer** | App-level (Activity Streams) | Platform-level (one data model) |
| **Discovery** | FFA (pub/sub federation) | SQL query (one table) |
| **Groups** | Agent groups (ACL primitive) | Platform primitive (follows, communities, cross-app) |
| **Cross-user queries** | Federated (hard) | Native (SQL joins) |
| **Storage** | Decentralized (any server) | Centralized (ClickHouse + MinIO) |
| **App interoperability** | App-level (each app defines its model) | Platform-level (shared data model) |
| **Media** | App decides (no platform support) | Client-side transcoding, HLS, P2P streaming |
| **Creator economics** | None (protocol doesn't address it) | Creator-owned nodes, flat pricing, 3% rails |

## The Trade-off

Solid trades simplicity for decentralization. Every Pod is independent. Every app is independent. The result is maximum freedom and maximum fragmentation.

web10 trades decentralization for simplicity. One database. One table. One permission model. The result is a social platform that works because the hard problems (discovery, cross-user queries, shared identity) are solved at the platform level, not delegated to apps.

web10 v2 tried to have both — user-owned data with cross-user queries — and it was bug-prone because the architecture fought itself. v3 accepted the trade-off: one database, one table, groups for permissions, SQL for discovery. The social platform works because the protocol serves the product, not the other way around.

web10 takes the Solid idea — users own their data — and makes it realistic. Data ownership means nothing if you can't build an audience, monetize content, and grow a following. web10 adds the economics layer: creator-owned nodes, flat pricing that gets cheaper as creators grow, 3% payment rails, a sponsor marketplace. The transcoding conversation shows it: ffmpeg.wasm in the browser, hardware encoders on mobile, server-side for pro users. Every decision judged by one question: does this make the social experience work and the creator economy viable?