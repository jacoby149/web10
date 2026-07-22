# Posting Content

A user writes a post. The node delivers it to every follower. No algorithm. No throttling. No "reach optimization." The inbox pattern — fan-out on write — makes this structural.

## The Post Flow

```mermaid
sequenceDiagram
    participant User
    participant Social as Social App
    participant API as Node API
    participant DB as Database
    participant Media as Object Storage (Minio)

    User->>Social: Composes post + attaches photo
    Social->>API: POST /user/upload (request presigned URL)
    API->>API: certify() + is_permitted()
    API-->>Social: Presigned upload URL
    Social->>Media: PUT photo (direct upload via presigned URL)
    Media-->>Social: 200 OK
    Social->>API: POST /user/posts (with media ref)
    API->>API: certify() + is_permitted()
    API->>DB: Writes post record to user's collection
    API->>DB: Writes media metadata record
    API->>API: emit_event() (metering)
    API-->>Social: Post created
    Social->>User: Post published
```

## The Inbox Delivery

The post reaches 100% of followers. This is not a policy — it is architecture. The fan-out happens at write time. There is no feed algorithm to demote the post later.

```mermaid
sequenceDiagram
    participant API as Node API
    participant DB as Database
    participant F1 as Follower 1 Inbox
    participant F2 as Follower 2 Inbox
    participant FN as Follower N Inbox

    API->>DB: Writes post to user's collection
    API->>DB: Queries followers of user
    par Fan-out to all followers
        API->>F1: Writes post to follower 1's inbox
        API->>F2: Writes post to follower 2's inbox
        API->>FN: Writes post to follower N's inbox
    end
    DB-->>API: All inboxes updated
    Note over API,FN: 100% delivery by architecture.<br/>No algorithm. No throttle.
```

## Post with Media

When a post includes media, the flow adds a presigned upload step. The social app never touches the blob — it uploads directly to Minio. The API writes a metadata record in the user's collection.

```mermaid
graph TB
    subgraph PostRecord["Post Record (in user's collection)"]
        P1["{ service: 'posts',"]
        P2["  body: {"]
        P3["    text: 'Hello world',"]
        P4["    media_refs: ['media/abc123.jpg'],"]
        P5["    visibility: 'public',"]
        P6["    created_at: ISODate(...)"]
        P7["  } }"]
    end

    subgraph MediaRecord["Media Record (in user's collection)"]
        M1["{ service: 'media',"]
        M2["  body: {"]
        M3["    url: 's3://bucket/abc123.jpg',"]
        M4["    filename: 'photo.jpg',"]
        M5["    size: 245760,"]
        M6["    mime: 'image/jpeg'"]
        M7["  } }"]
    end

    PostRecord -.->|"media_refs"| MediaRecord
```

## Visibility Toggle

Posts split into `public_posts` and `private_posts` collections. Public posts are discoverable — the discovery index picks them up. Private posts are invisible to anyone without a scoped token.

```mermaid
graph LR
    User["User Posts"] -->|"visibility: public"| Public["public_posts"]
    User -->|"visibility: private"| Private["private_posts"]
    Public --> Discovery["Discovery Index<br/>(searchable, indexable)"]
    Private -.->|"No discovery"| None["—"]
    Public --> Followers["Followers' Inboxes"]
    Private --> Followers

    style Public fill:#18181b,stroke:#22c55e
    style Private fill:#18181b,stroke:#ef4444
```

## Reactions and Comments

Reactions are entries in the public ledger, keyed by schema. Comments are records in the user's collection, threaded on the parent post.

```mermaid
sequenceDiagram
    participant Reactor
    participant Social as Social App
    participant API as Node API
    participant Ledger as Public Ledger

    Reactor->>Social: Taps like on post
    Social->>API: POST /public/entries<br/>(schema: Reaction, type: like)
    API->>API: Validate against schema
    API->>Ledger: Writes reaction entry
    API->>API: Updates cached engagement count
    API-->>Social: Reaction recorded
    Social->>Reactor: Heart burst animation

    Reactor->>Social: Types comment
    Social->>API: POST /reactor/comments
    API->>API: certify() + is_permitted()
    API-->>Social: Comment created
    Social->>Reactor: Comment posted
```