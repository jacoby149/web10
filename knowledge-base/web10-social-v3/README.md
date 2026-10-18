# web10 Social v3

The social app is the proof. If a full-featured social platform maps cleanly to the v3 protocol, the protocol is right.

**The v3 primitives:**
- One `documents` table — everything is a document
- `ref` type — links documents together (reactions, comments, replies)
- Groups — policy containers for people, not data
- Service contracts — which websites can access your data
- Groups define discovery — one query, no fan-out

**The screens:** Each doc below shows how a social app screen maps to the protocol. No dedicated social endpoints. No special tables. Just CRUD + groups + refs.

## Screens

| Screen | Doc | Status |
|---|---|---|
| Your Profile | `your-profile.md` | ✓ |
| Another Person's Profile | `other-profile.md` | ✓ |
| Public Discover | `discover.md` | ✓ |
| Your Feed | `feed.md` | ✓ |
| Your Messages | `messages.md` | ✓ |
| Groups Tab | `groups-tab.md` | ✓ |
| Post Detail | `post-detail.md` | ✓ |
| Create Post | `create-post.md` | ✓ |
| Search | `search.md` | ✓ |
| Notifications | `notifications.md` | ✓ |
| Settings / Privacy | `settings.md` | ✓ |

## The Proof

If every screen above reduces to:
1. A CRUD call to `/{user}/{service}`
2. A groups call to `/groups`
3. A `ref` in the JSON body

Then the protocol is simpler than v2. If any screen needs a dedicated endpoint, a special table, or a workaround — the protocol has a gap.

**Result: zero gaps.** Every screen is CRUD + groups + refs. No dedicated social endpoints. No special tables. No mirrors. No fan-out.

| v2 Social | v3 Social |
|---|---|
| `/reactions` endpoint | documents table, `reactions` collection |
| `/comments` endpoint | documents table, `comments` collection |
| `/follows` endpoint | group membership |
| `/discover` endpoint | `?discover=true` on CRUD |
| Discovery index mirror | documents table IS the index |
| Client-side double-write | server writes once |
| Public ledger | documents with `ref` type |
| Dedicated notifications | lightweight app-owned table |

The protocol exists to enable the platform to be the very best. The social app is the proof.

## Summary

The social app is the acid test. 11 screens. Zero dedicated endpoints. Zero special tables. Every screen is CRUD + groups + refs. The protocol is simpler than v2. The foundation holds.
