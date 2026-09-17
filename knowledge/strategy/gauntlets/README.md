# Gauntlets — the social surface, tortured

[← back to strategy](../README.md) · [the theory this extends](../../ai-use-theory/testing.md)

A gauntlet is how you stop shipping the "I can't trust this button" bug.

The like button has been fixed four times — the 28-likes stacking (3.87.2), the
self-heal (3.88.1), the forgot-my-like gap (3.94.0), the discover flip (3.98.2) —
and it *still* felt untrustworthy to the operator. Each fix was correct. Each fix
was tested. And each fix was tested the wrong way: in isolation, on the happy
path, against a mock. The next bug was a different permutation the isolated test
never drove — a like made in the feed that vanished on refresh, because the
refresh read looked at the wrong group. No unit test could see it. No isolated
component test could see it. Only the *flow*, driven end to end against the real
stack, with the truth checked at every step, could.

This is the gauntlet space. One doctrine, one home, one plan per surface of the
social app. It is the seam rule + fork rule + state rule (the three rules in
`ai-use-theory/testing.md`) combined and applied to a *whole surface* instead of
one affordance.

## The one rule

> **A gauntlet drives a surface's full state machine — every mutation, every
> state transition, every fork, across a refresh — and asserts at EVERY step
> that the UI matches the backend truth.**

Not "the button changed." Not "the console logged the flow." **The UI reflects
the database.** That is the entire difference between a test that passes while
the DB disagrees and a test that makes the button trustworthy. The operator's
complaint is always the same shape: "I clicked it, I can't tell if it's telling
me the truth, I refresh and it's gone." A gauntlet is the executable answer to
that complaint.

The tell of a weak test is that it asserts a *change* ("the count went up," "the
post appeared") instead of a *match* ("the count the UI shows is the count the
database holds"). A change assertion passes while the DB is wrong. A match
assertion cannot.

## The four rules (all mandatory, per gauntlet)

A gauntlet that skips any of these is a corrupted measure wearing a gauntlet's
mask — it looks like coverage of the surface, but it only covers the part the
happy path happens to take. The first three are *single-user* dimensions (one
user's view of one target); the fourth is the *social* dimension (many users'
views of the same target) — and it is the one that separates a toy from a
flagship.

### Rule 1 — the Truth rule

After every step, read the backend truth (via the API, the same `request` the
test already holds) and compare it to the DOM. The primitive is `assertTruth`
(see [the truth primitive](#the-truth-primitive)). It is the load-bearing call
every gauntlet makes, after every mutation, after every refresh.

The truth is not "the API returned 200." It is the *state the database holds for
this target* — the reaction docs, the comment docs, the group membership rows —
read back through the same read path the app uses, and compared field-for-field
to what the UI renders. When the two disagree, the test fails and names the
field.

**Why:** the whole class of "untrustworthy button" bug is a UI/DB disagreement.
The optimistic update says 1, the DB says 0. The refresh read says "not liked,"
the DB says "liked." A change assertion never looks at the DB, so it never sees
the disagreement. The truth rule forces the comparison.

### Rule 2 — the State rule

Drive the flow in **both** states: the cold start (a fresh target, no prior
mutation) and the return run (the target already mutated, then `page.reload()`).
The reload is not optional — it is the step. Persistence, idempotency, and the
refresh read all live on the return run, and the return run is the state a real
user is in almost all the time.

The sequence is always at least: **mutate → assert truth → reload → assert
truth.** The second assert is the one that catches "I refresh and it's gone." If
the UI matches the DB before the reload but not after, the refresh read is
broken — and that is exactly the bug no cold-start test can produce.

**Why:** the cold start never calls the restore code. The return run never calls
the first-time setup code. They are different branches. "It worked the first
time, then it broke on refresh" is a return-run bug by definition.

### Rule 3 — the Fork rule

Drive every code path that reaches the mutation, not just the convenient one.
A like is reachable from the feed, the discover board, the profile feed, the
lightbox deep-link, and the group detail. Each is a separate handler → a separate
data-layer call → a separate code path. Testing the feed's like does not test the
lightbox's like, even though they look identical from the user's chair.

The tell is two affordances that reach the same outcome through different
functions. Enumerate them (the `data-testid`s map the buttons; the routes map the
deep-links), name the code path each takes, and drive each through the seam at
least once with the truth asserted.

**Why:** the approve-all bug (the fork rule's origin story in `testing.md`)
shipped because the round-trip drove one path and the other path — a different
function — was never driven. The same shape is on every social surface: the same
mutation, N entry points, N code paths.

### Rule 4 — the Multi-User rule

Drive the surface with **more than one user** and assert **each user's view
matches the truth for that user**. A social surface is not tested when *user A's*
view is correct; it is tested when *user B's* view reflects *user A's* action,
and when *N users'* actions on the same target produce the correct aggregate.

The three sub-dimensions:

- **Cross-user consistency.** User A mutates (likes, comments, follows, posts);
  user B views the same target. Assert B's view reflects A's action. This is the
  "two contexts" test: drive A in one browser context, B in another, and assert
  both views match the DB truth *for their respective user*. A like that updates
  A's count but not B's view of the same post is a bug no single-user test sees.
- **Concurrency / races.** Two (or more) users mutate the same target at the
  same time. Assert the aggregate is correct — no lost updates, no double-counts,
  no tombstone/ordering bugs. This is the dimension the single-user "mash" does
  not cover: the mash is one user mashing; the race is two users colliding.
- **Scale / data integrity.** N users (10-100) act on the same target. Assert the
  count is exactly N, the dedup holds (no duplicate rows), and every member's view
  is consistent. This is where the ClickHouse ReplacingMergeTree + ref-count +
  group-membership semantics are actually stressed — the single-user test never
  populates the tables enough to break them.

**Why:** flagship social media is a multi-user system. The bugs that matter are
not "my like didn't persist" (single-user) — they are "the count is wrong when
50 people like it," "I don't see your like," "the group feed is different for
each member." Those are multi-user bugs, and a single-user gauntlet is a
corrupted measure wearing a flagship's mask: it looks like coverage of the social
surface, but it only covers one user's slice of it.

**The tell** of a single-user-only gauntlet is that every assertion is about one
user's view. The fix is to add a second context (user B) and assert B's view, and
to add N users (the scale axis, below) and assert the aggregate.

## The scale axis (runner-feasible)

The multi-user rule needs users, and users cost time on a GitHub runner. The
principle: **put the scale where it's cheap.** The API floor is fast (raw calls,
no browser) — it scales to 100 users in seconds. The browser is slow (real
contexts, real timing) — it scales to 10-20 contexts, not 100.

| Layer | Users | What it stresses | Cost |
|---|---|---|---|
| **API floor** | up to **100** | the count under N users, the dedup (no duplicate rows), the ref-count under concurrent writes, the group feed consistency for N members, the race (N concurrent mutations) | seconds |
| **Browser** | **10-20** contexts | cross-user consistency (B sees A's action), the concurrent UI (10 contexts like one post), the presence at 10 peers | a minute or two |

1000 users is insane on a runner — agreed, and it is not the goal. 10-100 is the
right split: the **API floor carries the scale** (100 users, the data-integrity
and race tests), and the **browser carries the cross-user consistency** (10-20
contexts, the "does B see A" tests). The total gauntlet suite fits the e2e budget
because the expensive part (the browser) is kept to 10-20 contexts and the cheap
part (the API floor) does the heavy lifting at 100 users.

The full cross-surface scale + race + cross-user tests live in
[scale.md](./scale.md). Each surface plan also names its own multi-user tests
(the surface-specific "does B see A" + the surface-specific race).

## The test ladder (per surface, both layers kept)

A gauntlet has two layers. They are different *resolutions* of the same surface,
not redundant copies. Keep both.

**Layer 1 — the API floor** (fast, no browser, no timing). The state machine
driven with raw `create`/`update`/`delete` calls against the real API + real
ClickHouse. After each step, read the truth back and assert it. This catches
*backend* bugs: the tombstone dedup, the group attach, the count query, the
stacking. It runs on every PR in seconds.

**Layer 2 — the browser gauntlet** (slow, the real seam). The same state machine
driven by actually clicking in the real app, the truth asserted after each step
*and* across a `page.reload()`. This catches *client* bugs: the optimistic
update, the refresh read, the map seeding, the swap-delta. It is the layer a
mocked unit test cannot fake, because it drives the real wire.

When the browser layer goes red, the API floor tells you whether the break is in
the data layer or in the seam — a floor green + browser red is a client bug; a
floor red is a backend bug. The floor is the diagnostic anchor; the browser layer
is the proof.

## The truth primitive

`assertTruth(page, request, target)` is the one function every gauntlet calls.
It lives in `e2e/tests/gauntlets/helpers/truth.ts`. Its contract:

1. **Read the backend truth** for `target` (a post, a group, a conversation)
   through the same read path the app uses — the reaction docs by `ref_value`,
   the comment docs by `ref_value`, the membership rows, the post doc itself.
   This is the *source of truth*, not the UI.
2. **Read the UI state** for `target` from the DOM — the heart's `aria-pressed`,
   the like count's text, the thumb's `aria-pressed`, the comment count, the
   post's text/visibility.
3. **Compare field-for-field** and assert a match. On a mismatch, the failure
   names the field, the UI value, and the DB value — the break, not a guess.

The primitive is surface-agnostic in shape (read DB, read DOM, compare) and
surface-specific in the fields (a reaction gauntlet compares the like count +
heart state; a group gauntlet compares the membership row + the join button
label). Each surface's plan names its fields.

**The click-sequence driver** sits next to it: a helper that takes a sequence of
UI actions (`click like`, `click like`, `reload`, `click dislike`) and runs them,
asserting the truth after each. This is what makes a gauntlet *readable* — the
test reads as the state machine, not as a pile of `click`/`expect` pairs.

## The state machine shape

Every surface plan defines its state machine as a sequence of steps, each with
the expected truth. The shape is always:

```
cold (the target's resting state)
→ mutate          (the action)
→ assert truth    (UI == DB)
→ mutate          (the next action — often the inverse)
→ assert truth
→ RELOAD          (page.reload())
→ assert truth    (UI == DB — the return run)
→ …               (the full permutation, incl. the mash)
```

The **mash** is the final step: rapid-fire the mutation (5–10 times) and assert
the truth settles at a valid state (1 or 0, never 10). This is the anti-stacking
check — the 28-likes bug, the duplicate-row bug — caught by the flow, not by a
unit test on the toggle function.

## The anti-tests (the negative space)

A gauntlet is not only the happy state machine. It also drives the *broken*
states — the anti-tests (`testing.md`): the target in a state the system must
handle, not just the state it creates. A reaction gauntlet includes: a like on a
post the reader has no read access to (I3), a like that 403s (revoked contract),
a like on a deleted post. A group gauntlet includes: joining a deleted group,
leaving a group you're not in, blocking yourself. The anti-test asserts the
*consequence* (the denial, the empty read, the error UI), not just the status
code, and it asserts *recovery* (the full cycle).

## The diagnostic dump

A failing gauntlet hands you the break. On failure it dumps: the full console
(all levels) + `pageerror` from the app page, the API request/response sequence
(the `request` log), and the truth diff (UI value vs. DB value, per field). That
is the two-sided dump `testing.md` demands — the app side and the wire side —
plus the field that disagreed. No dump, you re-read both sides and speculate.
With the dump, you read the break.

## The code space

The gauntlets live in `e2e/tests/gauntlets/`, mirroring this folder one-to-one:

```
e2e/tests/gauntlets/
  helpers/
    truth.ts        ← assertTruth + the click-sequence driver + the reload helper
    setup.ts        ← shared fixtures (users, followers groups, posts, media)
    expect.ts       ← expectCardState, expectFeedHasPost, …
  reactions.spec.ts
  comments.spec.ts
  posts.spec.ts
  feed.spec.ts
  discover.spec.ts
  groups.spec.ts
  messages.spec.ts
  profile.spec.ts
  media.spec.ts
```

One markdown here, one spec there. The markdown is the *plan* (the state machine,
the fields, the bites); the spec is the *proof* (the driven state machine, the
asserted truth). When they disagree, the spec is wrong (or the surface changed —
update both, the same pass).

The pre-existing ad-hoc gauntlets (`social-groups.spec.ts`, `social-feed.spec.ts`)
are migrated into this space, not left behind — they gain the truth rule (the
`assertTruth` calls) and the state rule (the reload + re-assert) they currently
skip.

## The index

One plan per surface of the social app. Each follows the same shape: **the
surface** (routes, testids, data model) · **the state machine** (the click
sequence per mutation) · **the forks** (the code paths) · **the truth fields**
(what "UI == DB" compares) · **the anti-tests** (the broken states) · **the
bites** (how to build it).

| Surface | Plan | The state machine, in one line |
|---|---|---|
| Reactions (likes/dislikes) | [reactions.md](./reactions.md) | like → unclick → click → **reload** → click → dislike → swap → **reload** → mash |
| Comments | [comments.md](./comments.md) | comment → edit → delete → **reload**, the count, replies |
| Posts | [posts.md](./posts.md) | create → edit → delete → visibility → repost → **reload**, across text·image·video |
| Feed | [feed.md](./feed.md) | follow → post appears → unfollow → post leaves → **reload**, the knobs |
| Discover | [discover.md](./discover.md) | the board read → like/dislike/comment on a board post → **reload** |
| Groups | [groups.md](./groups.md) | create → join → leave → remove → block → unblock → hide → share → **reload** |
| Messages | [messages.md](./messages.md) | DM → read → P2P push → presence → **reload** |
| Profile | [profile.md](./profile.md) | follow → unfollow, the face, the profile feed → **reload** |
| Media | [media.md](./media.md) | upload → transcode → HLS → playback → **reload** |
| **Scale (cross-surface)** | [scale.md](./scale.md) | N users like one post → count is N; the race; the group feed for N members; B sees A's action |

## How this extends the theory

`ai-use-theory/testing.md` gives the three rules for *one affordance*: the seam
rule (drive the wire), the fork rule (drive every path to the goal), the state
rule (drive the cold + return run). A gauntlet is those three rules, combined,
applied to a *whole surface* — and it adds the two the theory implies but doesn't
name: the **truth rule** (assert UI == DB at every step, not just "the UI
changed") and the **multi-user rule** (assert every user's view, not just one
user's). The truth rule converts "the test passed" into "the button is
trustworthy." The multi-user rule converts "one user's button is trustworthy"
into "the social surface is trustworthy" — the difference between a toy and a
flagship.

The relationship to the pyramid: a gauntlet is the *top* of the system pyramid
(`testing.md`) — the slow, full-stack, real-seam layer — but it is built on the
API floor (the fast, deterministic base) so that a red is always localizable. A
gauntlet without its floor is a black box; a floor without its gauntlet is a
corrupted measure (it proves the backend, not the button).

## What a gauntlet is not

- **Not a smoke test.** A smoke test loads the page and checks it didn't crash.
  A gauntlet drives the state machine and checks the truth at every step.
- **Not a screenshot test.** A screenshot checks the pixels. A gauntlet checks
  the *state* — the heart's `aria-pressed`, the count's text, the DB row.
  (The screenshot test is `design.md`'s job; the gauntlet is the state's job.)
- **Not a unit test.** A unit test isolates a function. A gauntlet drives the
  flow through the real stack. They are different resolutions; keep both.
- **Not one big test.** A gauntlet is a *suite* of small, named steps, each
  asserting the truth. One 500-line test that does everything is a corrupted
  measure — when it fails, you don't know which step broke. The click-sequence
  driver keeps each step named and each assertion localized.
