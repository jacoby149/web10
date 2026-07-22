# System Overview

web10 is a creator-owned social platform. Each user owns their data in a personal database collection. Apps are stateless lenses that read and write through a scoped, expiring token. The node operator runs the infrastructure. The user owns the content.

The architecture has three layers: the node (API + database), the apps (React frontends), and the protocol (CRUD + terms + federation).

## The Node

One node = one community. A creator runs a node. Fans join that node. The node serves the API, the auth console, the social app, and media storage.

```mermaid
graph TB
    subgraph Node["Node (rogan.social)"]
        subgraph API["API (FastAPI)"]
            Auth["Auth & Tokens"]
            CRUD["CRUD Endpoints"]
            Media["Media Router"]
            Stripe["Payments"]
        end
        subgraph DB["Database (FerretDB / MongoDB)"]
            subgraph Collections["User Collections"]
                U1["alice (collection)"]
                U2["bob (collection)"]
                U3["charlie (collection)"]
            end
            System["System Collections<br/>(config, discovery, schemas)"]
        end
        subgraph Storage["Object Storage (Minio)"]
            Blobs["Media Blobs<br/>(photos, video)"]
        end
    end

    subgraph Frontends["Frontends"]
        UI["Auth Console (ui/)"]
        Social["Social App (web10-social/)"]
        Marketing["Marketing Site (marketing-ui/)"]
    end

    subgraph External["External"]
        Legacy["Legacy Platforms<br/>(Instagram, Facebook, YouTube)"]
        OtherNodes["Other web10 Nodes"]
    end

    UI --> API
    Social --> API
    Marketing --> API
    API --> DB
    API --> Storage
    Social -.-> Legacy
    Node -.-> OtherNodes
```

## The Data Model

Every user gets their own MongoDB collection, named by username. Every document inside is `{service, body}`. The `services` service holds terms/ACL records. The `*` (star) record holds the account — password hash, phone, Stripe IDs. Star protection prevents CRUD from touching it.

```mermaid
graph LR
    subgraph UserCollection["alice (collection)"]
        subgraph Records["Records"]
            R1["{service: 'posts', body: {...}}"]
            R2["{service: 'contacts', body: {...}}"]
            R3["{service: 'inbox', body: {...}}"]
            R4["{service: 'dms', body: {...}}"]
            R5["{service: 'profile', body: {...}}"]
        end
        Star["{service: '*', body: {password, phone, plan}}"]
        Terms["{service: 'services', body: {terms/ACLs}}"]
    end

    App["App (scoped token)"] -->|"CRUD (scoped by service)"| Records
    App -.->|"BLOCKED"| Star
    App -->|"is_permitted() checks"| Terms
```

## The Token Flow

Apps never hold a user's password. They hold a scoped, expiring JWT. The token carries `username`, `site`, `target`, `provider`, and `expires`. Every request is verified (`certify`) and authorized (`is_permitted` against terms records).

```mermaid
sequenceDiagram
    participant User
    participant App as Social App
    participant Auth as Auth Console
    participant API as Node API

    User->>Auth: Opens app (popup)
    Auth->>API: POST /certify (token)
    API-->>Auth: Token valid, terms pending
    Auth->>User: Shows consent screen
    User->>Auth: Approves
    Auth->>API: POST /web10token (mint scoped token)
    API-->>Auth: Scoped JWT (user, service, expiry)
    Auth->>App: Posts token to opener
    App->>API: PATCH /alice/posts (with scoped token)
    API->>API: certify() + is_permitted()
    API-->>App: Record created
```

## The Actors

| Actor | Owns | Controls |
|-------|------|----------|
| **User** | Their data collection | Who can read/write their data (terms) |
| **App** | Nothing | A scoped token (revocable, expiring) |
| **Node Operator** | Infrastructure | Policy, signup gates, monetization |
| **web10 Inc.** | Nothing | Payment rails (small % of revenue) |

## Federation (M3)

Nodes talk to each other. A user on `rogan.social` can follow a user on `joe.rodney`. Posts cross nodes via the inbox pattern. Private content is end-to-end encrypted — the node operator cannot read it.

```mermaid
graph TB
    subgraph NodeA["Node A (rogan.social)"]
        Alice["alice's collection"]
        API_A["Node API"]
    end

    subgraph NodeB["Node B (joe.rodney)"]
        Bob["bob's collection"]
        API_B["Node API"]
    end

    Alice -->|"follow: bob@joe.rodney"| API_A
    API_A -->|"federation: fetch feed"| API_B
    API_B -->|"read bob's public posts"| Bob
    API_B -->>|"fan-out: deliver to alice's inbox"| API_A
    API_A -->|"write to alice's inbox"| Alice

    style Alice fill:#18181b
    style Bob fill:#18181b
    style NodeA fill:#09090b,stroke:#8b5cf6
    style NodeB fill:#09090b,stroke:#8b5cf6
```