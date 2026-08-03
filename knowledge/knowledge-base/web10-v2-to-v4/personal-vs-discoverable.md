# Personal Data vs Discoverable Data

## Two Kinds of Data, Two Kinds of Needs

web10 has to serve two fundamentally different needs:

**Personal data** — the user's private bucket. Posts, messages, media, follows, settings. The user owns it, controls it, can delete it, can take it with them. This is the sovereignty story.

**Discoverable data** — the public surface. A trending feed, engagement counts, follower counts, search results, suggested accounts. This is the growth story. An influencer needs people to find them. A platform needs content to surface.

In v2, these are built as separate systems that happen to overlap. The overlap is where everything breaks.

## Personal Data — The User Collection

Every user gets a collection. Everything they own lives there. Service terms control access. The CRUD endpoints are the gate.

```
alice/
  ├── star record (*)          — identity, verification, credits
  ├── services                 — contracts for each service
  ├── public_posts             — public posts (anon-read whitelisted)
  ├── private_posts            — private posts (owner-only)
  ├── staging_posts            — drafts (owner-only)
  ├── inbox                    — delivered content (fan-out writes)
  ├── follows                  — who alice follows
  ├── reactions                — alice's reactions
  ├── comments                 — alice's comments
  ├── dms                      — direct messages
  ├── media                    — private media metadata
  └── public_media             — public media metadata
```

This works perfectly for ownership. Alice controls every record. She can change the terms. She can export and leave. The platform can't touch her data without a contract.

**The problem:** nothing is discoverable by default. Every collection is a walled garden. To find Alice's content, you need to know her username, hit her CRUD endpoint, and hope her contract allows it. That's fine for DMs, terrible for a trending feed.

## Discoverable Data — The System Collections

To make content findable, v2 added system collections — cross-user surfaces that live outside any single user's control:

```
web10/
  ├── discovery_posts          — public post index (text, tags, media refs)
  ├── public                   — structured interactions (reactions, comments, follows)
  ├── schemas                  — JSON schema registry
  ├── apps                     — app store registrations
  └── metering_events          — per-request metering
```

The discovery index is a **projection** — a subset of each user's public posts, stripped down to what's needed for display (text, tags, author, created_at). Engagement counts are derived at read time from the public ledger.

The public ledger is a **mirror** — every reaction, comment, and follow gets copied here so it can be read by anyone, including anon.

**The problem:** these are separate data surfaces that the client is responsible for keeping in sync. The double-write problem exists because personal data and discoverable data live in different places and the client has to write to both.

## The Tension

| | Personal Data | Discoverable Data |
|---|---|---|
| **Owner** | The user | The system |
| **Access** | Contract-gated | Public (anon-read) |
| **Write** | CRUD endpoint | Projection hooks + ledger mirrors |
| **Read** | `PATCH /{user}/{service}` | `PATCH /discover/*`, `PATCH /public/entries` |
| **Sync** | Source of truth | Derived, must stay current |
| **Delete** | User deletes, gone | Projection must be cleaned up |

The tension is: **the user must own their data, but the system must be able to project it.**

In v2, the compromise is "the system projects from the user's data via server-side hooks." That works for posts (discovery index). It doesn't work for reactions, comments, and follows — those still need the client to write the ledger mirror.

## Why It's Like This

The public ledger exists because of invariant I3: you can't read another user's collection directly for engagement counts. If Alice wants to know how many people reacted to her post, the system can't aggregate across every user's `reactions` collection — that would be a cross-collection read. So reactions must be written to a shared surface the system can query.

The discovery index exists for the same reason: a trending feed can't scan every user's `public_posts` collection. It needs a single index to sort and paginate.

Both are necessary. But both create a sync problem when the client is responsible for the mirror.

## What v3 Should Do

Marry the two together. Not merge them — keep personal data personal, keep discoverable data public — but make the projection automatic and server-side for everything, not just posts.

**The principle:** every CRUD write that should be discoverable triggers a server-side projection. The client never writes to a system collection directly. The client writes to their own collection. The server handles the rest.

```
Client → POST /alice/reactions → Server
                                  → CRUD write (source of truth)
                                  → server-side hook: mirror to web10.public
                                  → engagement count updated
```

Same for comments. Same for follows. Same for everything that needs to be public.

**The result:** one client call. One source of truth. The projection is a server-side guarantee, not a client-side hope. The personal data stays personal. The discoverable data stays discoverable. They're married by the hook, not by the client.

## The Deeper Question

There's a deeper architectural question underneath this: **should the system collections even exist?**

The discovery index and public ledger are projections because the database model (one collection per user) makes cross-user queries impossible. But what if the data model supported both personal ownership and cross-user discovery natively?

That's a v3 question. The v2 answer is "server-side hooks." The v3 answer might be "a data model that doesn't require two surfaces."

Until then, the hooks are the bridge. Make them comprehensive, make them reliable, and make the client never think about sync again.