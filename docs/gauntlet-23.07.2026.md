# Gauntlet Report — 23.07.2026

**Run against:** `dev.web10.app` (v1.0.139, commit a8f6a2d)
**Method:** API probes, code audit, HTML/JS fetch. NOT a real phone (no device available in this workspace). Phone verification is the next step — this report flags what will break on device.

---

## Step 1: Sign up + log in on the social app without a broken screen

**Status: PARTIAL — the flow works but the login screen has a wrong asset**

**What works:**
- `auth.dev.web10.app` serves correctly, JS bundle loads
- `social.dev.web10.app` serves correctly, JS bundle loads
- The auth popup flow (social → "Log in" → auth portal → consent → token handoff) is wired and was fixed in 1.0.72/1.0.76/1.0.139
- Login button opens the auth portal popup
- `authListen` callback is registered unconditionally (1.0.139 fix — post-popup login no longer requires manual refresh)

**What breaks:**
- **Login screen loads `/alternative.png` as the logo.** `App.tsx:41` — this is the guitar-player illustration, NOT the keys mark. design.md §3 explicitly says "Never use `alternative.png` as a logo." On a phone, this renders as a blank square (white-on-transparent on a dark background). The square mark should come from `.context/brand-assets/keys-mark-source-transparent.png`.
- **No "Create account" path visible on the social app.** The LoginScreen is a single "Log in" button. Account creation happens inside the auth popup (ConsentView → SignupForm, fixed in 1.0.135), but the social app never tells you this. A first-time user sees "Log in" and nothing else — no hint they can create an account.
- **Username validation is unforgiving.** The API rejects hyphens: "usernames take only alphanumeric characters." The persona usernames (`noodle-empress`, `solar-flare-69`) only exist because they were seeded directly into the DB, bypassing the API. A real user trying `noodle-empress` as a username gets rejected.

**Lane for fix:** D (social app login screen asset + CTA), B (auth popup signup visibility)

---

## Step 2: Post a photo → it appears in the feed immediately

**Status: FAIL — text-only posts work; photos are broken on dev**

**What works:**
- `PostComposer` has the full flow: text input, file picker, drag-drop, `uploadMedia()` → `createPost()`
- `createPost` writes to `public_posts` (correct post D5.5 discovery split)
- The API's media upload pipeline works: presigned URLs via MinIO, confirm step, media records
- Text-only posts appear in the feed (persona posts confirm this)

**What breaks:**
- **D23: Media reads 403 on dev.** The media records store bare unsigned object URLs (`record.url`), but dev's MinIO bucket is private. Every avatar, photo, and media reference in the feed will 403. The `request_read_url` endpoint exists but has ZERO callers in the social app. `resolveMediaRefs` returns records with raw URLs that the browser can't fetch.
- **D21: Composer tray is 80x80 hover-square previews.** The plan explicitly calls this out: "the composer's 80x80 hover-square tray." No real-aspect preview, no alt text, no client-side downscale. On a phone, the remove button is invisible on touch.
- **No lightbox.** Feed photos render as flat images with no zoom/swipe.
- **No visibility selector in composer.** `createPost` writes to `public_posts` by default, but the composer has no public/private toggle (D19 Phase B still open). Native posts trap in `public_posts` — there's no choice.
- **Video is a trap.** The picker accepts `video/*` but the feed renders with `<img>`. A picked video just breaks.

**Lane for fix:** D (D23 presigned URLs is the blocker; D21 media polish)

---

## Step 3: Follow a persona → their posts land in your feed

**Status: FAIL — no UI to follow anyone**

**What works:**
- The data layer has `followUser()`, `unfollowUser()`, `readFollows()` in `follows.ts`
- The `follows` service is registered in service terms
- The feed data layer (`readFeed`) reads from the inbox pattern (fan-out on write), which is correct
- Persona contacts are seeded (DMs exist between personas)

**What breaks:**
- **No follow button anywhere.** `followUser` / `unfollowUser` are exported from `@/data` but never imported by any component. `grep` confirms zero UI usage in `src/components/`.
- **No "Following" or "Suggested" screen.** The social app has no way to discover who to follow. There's no user directory, no search, no suggested accounts.
- **Profile screen of OTHER users doesn't exist.** `ProfileScreen` only shows *your* profile (`readMyPosts`, `readProfile`). There's no route to view another user's profile where a follow button would live.
- **The feed is only your own posts.** `readFeed` reads the inbox (fan-out deliveries), but since nobody can follow anyone from the UI, the inbox is empty for any real user. The discovery API (`/discover/posts`) exists but the social app doesn't use it — it's only wired in marketing-ui's `/trending` page.

**Lane for fix:** D (follow button, user profiles, suggested accounts — all social app)

---

## Step 4: Like + comment → counts update, feel instant

**Status: PARTIAL — the UI exists and is wired, but counts are stale**

**What works:**
- `PostCard` has a like button (`data-testid="like-button"`) with heart-burst animation
- `handleToggleLike` in `FeedScreen` does optimistic UI update + `toggleReaction()`
- `toggleReaction` writes to the public ledger via `createPublicEntry` (correct per D5.5)
- Comment button toggles `CommentThread` component
- Reaction/comment counts are fetched on feed load (`countReactions`, `countComments`)

**What breaks:**
- **Counts are stale on load, not real-time.** The feed loads counts once. There's no polling, no WebSocket, no realtime update. After liking, the optimistic update works, but if another user likes, your count doesn't change until you refresh.
- **Reactions target `posts` service, not `public_posts`.** `handleToggleLike` calls `toggleReaction('posts', postId, ...)`. But posts live in `public_posts` since D5.5. The `countReactions` function reads the public ledger filtered by `target`, which uses the service name — if the service name is wrong, the count is always 0.
- **No repost button.** The engagement model includes reposts (scored at 5x), but there's no repost UI.
- **Comments may have the same service-name mismatch.** `countComments` and `CommentThread` need to target `public_posts` entries, not legacy `posts`.

**Lane for fix:** D (service name fix is small; realtime is lower priority)

---

## Step 5: DM a persona → the thread reads like a real messenger

**Status: PARTIAL — the DM screen works for existing conversations, but you can't start new ones**

**What works:**
- `DmsScreen` has the full messenger UI: conversation list, message bubbles, input, send button
- Gradient sent-bubble styling (vibrancy overhaul, 1.0.87)
- Presence dots on conversation headers
- `readDms` and `sendDm` are wired correctly
- Persona DMs exist in the DB (seeded conversations between personas)

**What breaks:**
- **No way to start a new conversation with someone you don't already have a thread with.** `listConversations` only returns existing conversations. There's no "New message" button, no contact picker, no compose-to-new-contact flow.
- **Persona DMs are one-directional.** The seed script only writes DMs FROM personas TO other personas. There are no reply DMs. Opening a thread with `butterfly-mechanic` shows only `noodle-empress`'s messages — no responses. It reads like a monologue, not a conversation.
- **No contact list.** `readContacts` exists in the data layer but the contacts are duplicated (seed script re-runs create duplicate entries). The DmsScreen loads contacts but only uses them for display names.
- **No typing indicators in real use.** `TypingIndicator` component exists but is never rendered (no realtime signaling).

**Lane for fix:** D (new conversation flow, persona replies for demo)

---

## Step 6: Your profile reads as a creator page you'd screenshot

**Status: PARTIAL — good structure, missing social proof**

**What works:**
- Banner with gradient + upload capability
- Avatar with upload capability
- Display name, bio, location, website fields
- Stats row (posts count, media count) with tabular-nums
- Posts/Media tabs with grid layout
- Edit profile flow with save/cancel
- Vibrant banner gradient (1.0.87)
- Upload error states with spinner

**What breaks:**
- **No follower/following counts.** The stats row shows "Posts" and "Media" but not "Followers" or "Following." A creator page without follower count is not a creator page — that's the primary social proof metric.
- **No follow button on your own profile** (minor — you wouldn't follow yourself, but visiting another user's profile is impossible per step 3).
- **No "Following" verification badge or node branding.** Nothing distinguishes this as a node-operated creator page vs. any social profile.
- **Profile grid shows text posts as gray boxes.** Text-only posts render as small text in the grid — not visually compelling.
- **`mediaPosts.length` as a stat is odd.** "Media" count isn't a standard social metric. "Followers" is.

**Lane for fix:** D (follower count is the missing piece; requires follows data to work)

---

## Step 7: Trending/discover shows a real, alive feed (personas keep it from demoing empty)

**Status: PARTIAL — exists in marketing-ui, NOT in the social app**

**What works:**
- The discovery API returns real persona posts on both dev and prod
- `/discover/posts` (trending sort), `/discover/users`, `/discover/search` all work
- Engagement scores are computed (likes×1 + comments×3 + reposts×5)
- Marketing-ui has a full `/trending` page (1.0.130) with ranked cards, topic filters, sidebar
- 5 personas are seeded with 25+ posts and engagement data
- Persona seed script is modernized for D5.5 (1.0.116)

**What breaks:**
- **The social app has NO trending/discover screen.** `grep` for "discover/trending" in `src/components/` returns zero results. The social app's navigation is: Feed, Chat, Profile. There is no "Discover" tab, no "Trending" page, no "For You" feed.
- **The feed only shows your inbox + your posts.** Without follows (step 3), a new user's feed is empty. Without trending, there's no fallback content.
- **Marketing-ui's `/trending` is a separate site.** It's at `dev.web10.app/trending` — not part of the social app experience. A user on `social.dev.web10.app` can't discover trending content.
- **Topics endpoint returns empty.** `/discover/topics` returns `[]` — the trending hashtags feature is broken or not yet implemented.

**Lane for fix:** D (trending screen in social app — high demo impact)

---

## Step 8: Nothing white-screens; every screen is design.md-grade at 375px, on a real phone, on dev AND prod

**Status: FAIL — known asset issue, mobile unverified, prod diverges**

**What works:**
- Error boundary exists (`ErrorBoundary` wrapping the app)
- `ErrorFallback` offers "Reload" and "Send Report" — no white screen on crash
- Skeleton loading states exist for Feed, Profile, and DMs
- Empty states are story-first (point at importer)
- Bottom nav on mobile (Layout.tsx)
- Touch targets ≥ 44px (design.md §9)
- `focus-visible` rings throughout
- Dark-first, violet brand tokens applied
- Glow tokens used in social (1.0.87)

**What breaks:**
- **`alternative.png` on login screen** (step 1) — renders as blank square on dark background
- **No real phone test possible from this workspace.** The 375px bar is unverified. Key concerns:
  - PostComposer's 80x80 tray is unusable on touch
  - Feed sort dropdown may be too narrow on 375px
  - DM conversation list may overflow on narrow screens
- **Prod is v1.0.139, dev is the same version** — both are aligned (good)
- **`/discover/topics` returns empty on both dev and prod** — trending hashtags are dead
- **The status page shows empty `social` and `marketing` health endpoints on prod** — the health check can't verify these services
- **Persona posts are duplicated.** The seed script ran multiple times (contacts show 4 sets of duplicates, posts show 5 sets). The feed will show the same post 5 times from the same author. This is a seed script issue, not an app bug, but it makes the demo look broken.

**Lane for fix:** D (alternative.png), C (seed script dedup), E (health endpoints)

---

## Summary: Honest Fail List

| Step | Verdict | Demo Impact | Owner |
|------|---------|-------------|-------|
| 1. Sign up + log in | PARTIAL — wrong logo, no signup CTA | HIGH | D (asset), B (signup) |
| 2. Post a photo → feed | FAIL — media 403s on dev | CRITICAL | D (D23 presigned URLs) |
| 3. Follow → posts in feed | FAIL — no follow UI, no user profiles | CRITICAL | D |
| 4. Like + comment | PARTIAL — service name mismatch, stale counts | HIGH | D |
| 5. DM a persona | PARTIAL — can't start new convos, no replies | HIGH | D + persona seed |
| 6. Profile as creator page | PARTIAL — no follower count | MEDIUM | D |
| 7. Trending/discover | FAIL — not in social app | CRITICAL | D |
| 8. No white-screens, 375px | FAIL — wrong asset, mobile unverified, duped posts | HIGH | D, C, E |

**The blocking chain for a demoable product:**
1. **D23 (presigned URLs)** — without this, photos don't render on dev. Everything media-related is dead.
2. **Follow UI** — without following, the feed is empty for new users. The core social loop doesn't exist.
3. **Trending in social app** — without discovery, there's no fallback when the feed is empty. The app demos as empty.
4. **Alternative.png fix** — the login screen shows a blank square. First impression on a phone.

These are all Lane D items. No Lane A or B fixes are needed for the gauntlet — the API endpoints work; the social app just isn't wired to use them all.