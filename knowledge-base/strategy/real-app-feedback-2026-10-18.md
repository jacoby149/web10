# Real App Feedback — 18.10.2026

Feedback from the operator's Muse AI assistant (account: `silly`), from a
real pass through the app. Each item is verified against the codebase as of
this date. Status: **filed, not built.**

---

## 1. Self-follow weirdness (profile counts + lists)

**The complaint:**
- Profile says "1 Following" but the following list says "Not following
  anyone yet" (count includes self-follow, list doesn't).
- My own profile also shows in my followers list. Confusing.

**Verified against code:**

- `getFollowingCount()` (`src/data/follows.ts:68`) counts ALL groups ending
  in `/followers` from `getMyGroups()`. If the user is a member of their own
  followers group (self-follow), this inflates the count by 1.
- `listUserFollowing()` (`src/data/follows.ts:98`) reads `byUserGroups`
  filtered to the followers tag and returns the *owner* of each group. A
  self-follow (user is a member of their own followers group) would show the
  user in their own following list — but the operator reports the list is
  EMPTY while the count is 1. This suggests the count includes a group the
  list read doesn't return (possibly the user's own followers group, which
  `byUserGroups` may not return because the user is the *owner*, not just a
  member, or the `by-user` read excludes self-owned groups).
- `listUserFollowers()` (`src/data/follows.ts:118`) reads `getGroupMembers`
  on the user's followers group. If the user is a member of their own
  followers group, they appear in their own followers list.

**Root cause:** the self-follow row (user is a member of their own followers
group) is counted by `getFollowingCount` but not consistently handled by the
list reads. The followers list includes the user themselves.

**Fix direction:**
- Exclude self from `getFollowingCount` (or from the following list,
  consistently).
- Exclude self from `listUserFollowers` (the user shouldn't see themselves
  in their own followers list).
- Ensure count and list agree: the count should be the length of the list
  the user actually sees.

**Files:** `marketing/web10-social/src/data/follows.ts`,
`marketing/web10-social/src/components/Bio/UserProfileScreen.tsx`,
`marketing/web10-social/src/components/Bio/UserFollowListScreen.tsx`

---

## 2. "Manage app access" button does nothing

**The complaint:** The "Manage app access" button in Settings did nothing
after three clicks.

**Verified against code:**

`SettingsScreen.tsx:268-272` renders a `LinkRow` with
`href={AUTH_ORIGIN}/contracts`. But `LinkRow` (line 41-53) renders a
`<button onClick={onClick}>` — it does NOT use the `href` prop. The `href`
is accepted in the props type but never applied to the element. The button
has no `onClick` handler, so clicking it does nothing.

**Root cause:** `LinkRow` is a `<button>` that ignores its `href` prop. It
was probably intended to be an `<a>` tag or to call
`window.open(href)` on click.

**Fix direction:**
- Either render an `<a href={href} target="_blank" rel="noopener">` when
  `href` is present, or add `onClick={() => window.open(href, '_blank')}`
  to the button.
- The `ExternalLink` icon already signals "opens externally," so an `<a>`
  with `target="_blank"` is the natural fix.

**Files:** `marketing/web10-social/src/components/Settings/SettingsScreen.tsx`
(line 41-53, `LinkRow`)

---

## 3. Comment toggle shows "0 comments, show" — stray text

**The complaint:** Comment toggle shows "0 comments, show" — stray text.

**Verified against code:**

`PostDetail.tsx` `ActionBtn` (line 55-86): the `aria-label` is
`` `${label}, ${count}` `` (line 71) when `count != null`. The visible text
is just the label (`<span className="font-medium">{label}</span>`, line 80)
+ the count number (lines 81-83, only when `count > 0`). So the visible
text should be "Comment" with no number when count is 0.

The "0 comments, show" the operator sees is likely the **aria-label** being
read by a screen reader or captured in a screenshot tool. The aria-label
reads "Comment, 0" which a screen reader would announce as "Comment, 0."
The word "show" is not in the code — it may be from a different surface
or a misread.

**Possible root cause:** The aria-label format `${label}, ${count}` is
awkward for screen readers when count is 0. "Comment, 0" reads oddly.

**Fix direction:**
- When `count === 0`, the aria-label should just be the label (no count).
- Or: `${label} (${count})` for a more natural reading.
- Check if any surface renders "show" as visible text near the comment
  button (the operator may be seeing a different label).

**Files:** `marketing/web10-social/src/components/Feed/PostDetail.tsx`
(line 71, `ActionBtn` aria-label)

---

## 4. "1 people reached" — should be "1 person reached"

**The complaint:** Post stats say "1 people reached" — should be "1 person
reached."

**Verified against code:**

Two locations:
- `marketing/shared/discover/src/PostActions.tsx:342` —
  `` aria-label={`${formatCount(reach)} people reached`} ``
- `marketing/web10-social/src/components/Shorts/ShortsScreen.tsx:600` —
  `` aria-label={`${viewsMap[short.post._id!]?.reach ?? short.post.reach ?? 0} people reached`} ``

Both hardcode "people" regardless of the count. When reach is 1, it reads
"1 people reached."

**Fix direction:**
- Pluralize: `${count === 1 ? 'person' : 'people'} reached`
- Apply to both locations.

**Files:** `marketing/shared/discover/src/PostActions.tsx` (line 342),
`marketing/web10-social/src/components/Shorts/ShortsScreen.tsx` (line 600)

---

## 5. Following empty state addresses you in third person

**The complaint:** Following empty state: "When they follow someone,
they'll show up here." — should address the user directly.

**Verified against code:**

`UserFollowListScreen.tsx:360-363`:
```
{kind === 'followers'
  ? 'When people follow, they\'ll show up here.'
  : 'When they follow someone, they\'ll show up here.'}
```

The "following" empty state says "When **they** follow someone" — but the
user is looking at **their own** following list (or someone else's). If it's
their own list, "they" should be "you." If it's someone else's list, "they"
is correct but confusing.

**Fix direction:**
- For the user's own profile (`isOwn`): "When you follow someone, they'll
  show up here."
- For a visitor's profile: "When {name} follows someone, they'll show up
  here." (or keep "they" but make it clearer)
- The `isOwn` flag is already available in the component (line 176).

**Files:** `marketing/web10-social/src/components/Bio/UserFollowListScreen.tsx`
(lines 360-363)

---

## 6. "Pin an ad" in the composer has no explanation

**The complaint:** "Pin an ad" in the composer has no explanation.

**Verified against code:**

`PostComposer.tsx:1169` — the "Pin an ad" button (Megaphone icon) opens the
`AdPicker` bottom sheet. The picker (`AdPicker.tsx`) lists the creator's ads
with a title "Pin an ad" but no explanation of what pinning does.

The `CreatorMonetization.tsx:429` has a one-liner: "Your ads, albums, and
the posts they run on. Pin an ad to a post and it shows with that post,
every time." — but this is on the Monetization surface, not in the composer.

**Fix direction:**
- Add a one-line description in the `AdPicker` sheet (under the "Pin an ad"
  title): "Pinning an ad to a post shows the ad with the post, every time."
- Or: a tooltip on the composer's "Pin an ad" button.

**Files:** `marketing/web10-social/src/components/Feed/AdPicker.tsx`
(line 45, the title area)

---

## 7. Recovery page mentions "A20's email recovery" — jargon

**The complaint:** The recovery page mentions "A20's email recovery" —
jargon no one knows.

**Verified against code:**

`ui/src/components/Settings/RecoveryContact.tsx:72`:
```
Once A20's email recovery lands, you'll be able to set a recovery email
here too.
```

"A20" is an internal lane/item identifier. The user has no idea what A20 is.

**Fix direction:**
- Replace with plain language: "Email recovery is coming soon. Once it's
  available, you'll be able to set a recovery email here too."
- Or remove the note entirely if email recovery is not imminent.

**Files:** `ui/src/components/Settings/RecoveryContact.tsx` (line 72)

---

## 8. studio.web10.app doesn't resolve

**The complaint:** studio.web10.app doesn't resolve; only the join page's
own link reaches the Studio.

**Verified against code:**

- `marketing/marketing-ui/src/pages/Join.tsx:23` — the Join page's step 3
  links to `${AUTH_ORIGIN}?mode=studio` (the authenticator's studio mode).
  This works.
- No reference to `studio.web10.app` exists in the codebase. The operator
  likely tried to navigate to `studio.web10.app` directly (guessing the
  URL) and found it doesn't resolve.
- The Studio is reachable via `auth.web10.app?mode=studio` (the
  authenticator), not via a separate `studio.` subdomain.

**Fix direction:**
- This is a DNS/deployment issue, not a code issue. If `studio.web10.app`
  should resolve, it needs a DNS record + nginx location.
- Alternatively, document the correct URL (`auth.web10.app?mode=studio`)
  in any place that references "the Studio."
- If the operator expects `studio.web10.app` to work, file a deployment
  item to add the subdomain.

**Files:** N/A (deployment/DNS) or `marketing/marketing-ui/src/pages/Join.tsx`
(if the link copy needs updating)

---

## 9. Marketing nav shows "Sign In" while signed into the apps

**The complaint:** Marketing nav still shows "Sign In" while you're signed
into the apps.

**Verified against code:**

`marketing/marketing-ui/src/components/Navbar.tsx:151-153` (desktop) and
`208-209` (mobile) — the "Sign In" button always renders, linking to
`SOCIAL_ORIGIN`. There's no check for whether the user is already signed in.

The marketing site is a separate origin from the social app, so it can't
read the social app's cookie directly. But the `SOCIAL_ORIGIN` redirect
would land the user on the social app where they're already signed in — so
the "Sign In" label is misleading for a user who's already authenticated.

**Fix direction:**
- The marketing site can't easily check the social app's auth state
  (different origin, no shared cookie). Options:
  - Rename the button to "Open App" or "Go to web10" (neutral, doesn't
    imply sign-in).
  - Or: add a query param to the social app that checks auth state and
    redirects back (complex, probably not worth it).
  - Simplest: rename to "Open App" — it's a CTA to open the app, not a
    sign-in action.

**Files:** `marketing/marketing-ui/src/components/Navbar.tsx` (lines 151-153,
208-209), plus the "Sign In" links in `Home.tsx:301`, `Freedom.tsx:276`,
`Exporter.tsx:279`, `Join.tsx:361`

---

## 10. "Node" concept is unexplained at signup

**The complaint:** A non-technical creator will read "node" as "my account
home" — harmless but unhelpful. It shows up unexplained at signup
("Create your node"), and the signup form pre-fills a provider field
("api.web10.app") that invites the question "should I change this?" One
plain sentence would fix it, e.g. "Your node is your personal home for your
data — apps ask permission to use it."

**Verified against code:**

- `ui/src/components/CredentialPage/SignupForm.tsx:19` — headline:
  "Create your node"
- `ui/src/components/CredentialPage/SignupForm.tsx:20` — subtext: "Own your
  data from the first record."
- `ui/src/components/CredentialPage/FormInputs/Provider.tsx:8-9` — label:
  "web10 provider", pre-filled with `REACT_APP_DEFAULT_API`
  (`api.web10.app`)
- `ui/src/components/Consent/ConsentView.tsx:323` — "Create your node to
  connect {host}"

The word "node" is used without explanation. The provider field is
pre-filled with a technical URL that the user doesn't understand.

**Fix direction:**
- Add a one-line explanation under "Create your node": "Your node is your
  personal home for your data — apps ask permission to use it."
- For the provider field: add a helper text: "This is where your data
  lives. You can leave this as-is unless you're joining a different node."
  Or: make the field read-only for the common case (most users won't change
  it) and only editable for advanced users.

**Files:** `ui/src/components/CredentialPage/SignupForm.tsx` (lines 19-20),
`ui/src/components/CredentialPage/FormInputs/Provider.tsx` (lines 8-9)
