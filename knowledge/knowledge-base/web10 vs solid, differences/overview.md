# web10 vs Solid

Tim Berners-Lee's **Solid** (Social Linked Data) and **web10** try to solve the same problem: users should own their data and control who sees it. They arrive at very different answers because they optimize for different things.

## The Split

**Solid optimizes for the protocol.** Data sovereignty, decentralization, and interoperability are the goals. The social experience is what you build on top.

**web10 optimizes for the product.** The goal is a killer social platform. The protocol serves the product. If a technical decision makes the social experience better, it wins — even if it means centralization.

This one difference explains everything that follows.

## Data Storage

### Solid: Pods

Every user has a **Pod** (Personal Online Data Store) — their own server, their own data. Pods store data as **Linked Data** (RDF triples) in **Containers**. A pod might live on `alice.solidserver.net`, another on `bob.otherprovider.com`. Different pods can run different software.

```
alice.solidserver.net/
  public/
    profile.turtle
  private/
    contacts.turtle
  app/twitter-clone/
      posts.turtle
```

### web10 v3: One Database

All users share **one ClickHouse database**. Every document — every post, reaction, comment — lives in the same `documents` table. Blobs go to MinIO.

```
documents table:
  doc_id: "post-123", author_key: "alice", collection_name: "posts"
  doc_id: "react-abc", author_key: "bob", collection_name: "reactions"
```

### The Trade-off

Solid's pods mean **no cross-user queries**. Bob's app can't efficiently query "all posts from people Alice follows" because those posts live on dozens of different servers. web10's single table makes cross-user queries trivial — they're SQL joins.

Solid wins on data sovereignty. web10 wins on queries.

## Access Control

### Solid: WebACL

Solid uses **WebACL** — access control rules attached to containers and resources. Four modes: `Read`, `Append`, `Write`, `Control`. Rules reference agents (users) or agent groups.

```turtle
# Anyone can read public posts
<#publicRead> a acl:Authorization ;
    acl:accessTo <https://alice.pod.example.com/public/> ;
    acl:agent <http://xmlns.com/foaf/0.1/Agent> ;
    acl:mode acl:Read .

# Only friends can read private stuff
<#friendsRead> a acl:Authorization ;
    acl:accessTo <https://alice.pod.example.com/private/> ;
    acl:agentGroup <https://alice.pod.example.com/lists/friends.turtle> ;
    acl:mode acl:Read .
```

The pod owner writes the rules. The pod enforces them. Apps query the ACL rules before reading.

### web10 v3: Service Contracts + Groups

Two layers. Service contracts control **which apps** can touch your data (CORS origins). Groups control **which people** can see your content.

```
Service contracts (app-level):
  service:posts → allowed: twitter-clone.web10.com

Groups (people-level):
  alice.close-friends → members: bob, charlie
```

A post attached to `alice.close-friends` is visible to bob and charlie, via any app that has a service contract. Both layers must pass.

### The Trade-off

WebACL is fine-grained and flexible. You can set different permissions on every container and resource. The cost: managing ACL rules is a UI nightmare. Solid apps struggle to present access control in a way users understand.

web10 v3 is coarse and simple. You control apps (kill switch) and people (groups). v2 had a more complex system — term records with whitelists, blacklists, regex matching, per-action permissions — and it was **the source of most bugs**. v3 eliminated it. Groups replaced everything.

## Identity

### Solid: WebID

A **WebID** is a URL that identifies you — `https://alice.pod.example.com/profile/card#me`. It points to a profile document with public keys for cryptographic verification. Anyone can create a WebID. There is no central registry.

### web10: User Keys

A **user key** is a string — `alice`, `bob`. The platform assigns it at signup. It's the primary key in every table.

### The Trade-off

WebID is decentralized and cryptographic. You own your identity. The cost: verification requires fetching and parsing profile documents. Key rotation is complex.

User keys are simple strings. The platform controls them. The cost: you're tied to the platform. The benefit: every query is a string comparison, not a cryptographic operation.

## Apps

### Solid: Decoupled

Solid apps are **completely independent** of data storage. An app reads from your pod, writes to your pod, and can read from anyone's pod (if permissions allow). The app doesn't know where data lives. Different users can use different apps and different pods, and everything interoperates through the protocol.

```
Twitter-clone app → reads alice.solidserver.net/public/posts.turtle
Facebook-clone app → reads alice.solidserver.net/public/posts.turtle
Both apps see the same data because it's the same Linked Data.
```

### web10: Platform Apps

web10 apps are **clients of the platform**. They call the CRUD API. They don't talk to each other or to user data directly. The platform is the intermediary.

```
Social app → POST /alice/posts → ClickHouse
Music app  → POST /alice/playlists → ClickHouse
Both apps use the same API, the same tables, the same permissions.
```

### The Trade-off

Solid's decoupled apps mean true interoperability. Any app can read any pod. The cost: every app implements its own social features. Two apps on Solid might have different notions of what a "post" or "reaction" is.

web10's platform apps share everything. One data model. One permission system. The cost: apps are locked into the platform. The benefit: every app has the same features, same performance, same permissions.

## Groups

### Solid: Agent Groups

Solid has **agent groups** — RDF lists of WebIDs. They're used in ACL rules to grant access to multiple people at once. They're a permission primitive, not a social feature.

```turtle
<https://alice.pod.example.com/lists/friends.turtle> a foaf:PersonalProfileDocument ;
    foaf:maker <#me> ;
    <#friends> a foaf:Person ;
        foaf:knows <https://bob.pod.example.com/profile/card#me> ;
        foaf:knows <https://charlie.pod.example.com/profile/card#me> .
```

### web10 v3: Groups as the Platform Primitive

Groups are **the core social abstraction**. Follows are groups. Friend lists are groups. Communities are groups. Cross-app sharing is groups.

```
alice.followers → join policy: request, members: bob, charlie, dave
jazz-collectors → join policy: open, members: 50,000 people
```

One membership. Infinite apps. A group works in the social app, the music app, the video app. Managed once at the platform level.

### The Trade-off

Solid's agent groups are a permission tool. web10's groups are a social tool. Solid uses groups to answer "who can read this?" web10 uses groups to answer "who gets to see this?" and "what do they see when they log in?"

## Discovery

### Solid: FFA (FollowedFeeds Activities)

Solid apps use **FFA** — a pub/sub protocol for activity streams. When Alice posts, her pod publishes an activity. Apps subscribed to Alice's activities receive the notification. Discovery is push-based, app-level, and federated.

### web10 v3: `?discover=true`

Discovery is a **SQL query**. One parameter on the CRUD endpoint. The query joins documents, groups, and memberships. No pub/sub. No federation. No mirrors.

```sql
SELECT p.* FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.discoverable = 1 AND gm.member_key = 'alice'
ORDER BY p.created_at DESC LIMIT 50;
```

### The Trade-off

FFA is federated and real-time. The cost: it's complex, optional, and app-dependent. Not all Solid apps implement it. Not all pods support it.

`?discover=true` is a query. The cost: it's centralized. The benefit: it always works, it's fast, and it's the same for every app.

## Summary

| | Solid | web10 v3 |
|---|---|---|
| **Goal** | Decentralize the web | Build a social platform |
| **Data** | Pods (RDF, per-user servers) | ClickHouse (one table, shared) |
| **Cross-user queries** | Federated (hard) | SQL joins (native) |
| **Permissions** | WebACL (per-resource, fine-grained) | Service contracts + Groups (coarse, simple) |
| **Identity** | WebID (decentralized, cryptographic) | User keys (platform-assigned strings) |
| **Apps** | Decoupled (any app, any pod) | Platform clients (shared API) |
| **Groups** | Agent groups (ACL primitive) | Platform primitive (follows, communities, cross-app) |
| **Discovery** | FFA (pub/sub, federated) | SQL query (centralized) |
| **Simplicity** | Protocol is complex, apps are free | Protocol is simple, apps are constrained |

## Why web10 Made These Choices

web10 v2 tried to give users their own data collections (MongoDB, one collection per user) while also supporting cross-user queries. The sync between personal data and discovery indexes was the source of most bugs. The permission system — term records with regex whitelists and blacklists — was complex and error-prone.

v3 accepted that a social platform needs fast cross-user queries, simple permissions, and a shared data model. It centralized storage, simplified permissions to groups, and made discovery a SQL query. The platform works because the hard problems are solved at the platform level, not delegated to apps.

Solid made the opposite choice. It decentralized everything and delegated the hard problems to apps. The protocol is clean. The social experience depends on whoever builds the app.

Both are valid. They optimize for different things.