import { test, expect, type BrowserContext } from '@playwright/test';
import {
  SOCIAL_BASE, SERVICE,
  signupAndLogin, addAppContract, createGroup, readGroupMembers,
  joinGroup, leaveGroup, removeGroupMember, postToGroup, setTokenCookie,
} from './helpers/setup';
import {
  groupMembershipTruth, groupFeedTruth, assertGroupFeedTruth,
} from './helpers/truth-groups';

/**
 * groups — the group lifecycle, tortured (gauntlets/groups.md).
 *
 * Groups are the core social primitive: follows, communities, DMs, close-
 * friends are all groups with different join policies and roles. The group
 * lifecycle is the most stateful surface — a group has members, roles, a feed,
 * and the moderation/sharing controls. This is the surface where "my group
 * disappeared" / "I can't see the feed" / "I'm still a member after I left"
 * bugs live. The load-bearing assertion is the truth rule — UI == DB at every
 * step, not "the membership changed."
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the lifecycle via raw calls (create → join → leave → remove)
 *     + the group join race (10 users, no duplicate rows) — the data-integrity
 *     core, fast, every PR.
 *   - Browser gauntlet: membership + the group feed via the real UI, truth
 *     asserted after each step + across the reload — the client proof.
 *   - Multi-user: 3 members in a group; one posts; every member's feed shows
 *     the same set of posts — the "the group feed is consistent for every
 *     member" test the single-user gauntlet could never see.
 *
 * Stretch (the KB plan's bite 4, not yet built): the moderation controls —
 * block/unblock, hide/unhide, share pause/resume — each with its truth row
 * (group_blacklist / group_hidden_docs / user_group_sharing) + reload.
 */

const postTextFor = (who: string) =>
  `gauntlet group ${who} post ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// An open group: the owner can do everything; a member can read + post.
const GROUP_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE], permissions: ['readAll', 'create'] },
];

// ---------------------------------------------------------------------------
// API floor — the lifecycle via raw calls (fast, no browser). The
// data-integrity core: the create/join/leave/remove membership state machine,
// and the group join race (10 users, no duplicate rows).
// ---------------------------------------------------------------------------

test.describe('groups — API floor', () => {
  test('the lifecycle: create → join → leave → remove, the membership truth holds at every step', async ({ request }) => {
    const owner = await signupAndLogin(request, 'gfa');
    await addAppContract(request, owner.token);
    const groupId = await createGroup(
      request, owner.token, 'gauntlet-group', 'open', GROUP_ROLES,
      [{ member_key: owner.username, role: 'owner' }],
    );

    // cold: the owner is a member (role owner)
    let t = await groupMembershipTruth(request, owner.token, groupId, owner.username);
    expect(t).toEqual({ isMember: true, role: 'owner' });

    // a 2nd user joins → is a member (role member)
    const member = await signupAndLogin(request, 'gfb');
    await addAppContract(request, member.token);
    await joinGroup(request, member.token, groupId);
    t = await groupMembershipTruth(request, owner.token, groupId, member.username);
    expect(t).toEqual({ isMember: true, role: 'member' });

    // the member leaves → not a member
    await leaveGroup(request, member.token, groupId);
    t = await groupMembershipTruth(request, owner.token, groupId, member.username);
    expect(t).toEqual({ isMember: false, role: null });

    // the owner removes a member → not a member
    const other = await signupAndLogin(request, 'gfc');
    await addAppContract(request, other.token);
    await joinGroup(request, other.token, groupId);
    await removeGroupMember(request, owner.token, groupId, other.username);
    t = await groupMembershipTruth(request, owner.token, groupId, other.username);
    expect(t).toEqual({ isMember: false, role: null });
  });

  test('the group join race: 10 users join in parallel → exactly 11 members, no duplicate rows', async ({ request }) => {
    test.setTimeout(120_000);
    const owner = await signupAndLogin(request, 'gfr');
    await addAppContract(request, owner.token);
    const groupId = await createGroup(
      request, owner.token, 'gauntlet-race', 'open', GROUP_ROLES,
      [{ member_key: owner.username, role: 'owner' }],
    );

    // 10 users, each with their own token + contract, join the same group in
    // parallel. The aggregate must be exactly 11 (10 joiners + the owner) — a
    // lost join (10) or a duplicate row (12) fails.
    const joiners: { token: string; username: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const u = await signupAndLogin(request, `gfj${i}`);
      await addAppContract(request, u.token);
      joiners.push(u);
    }
    await Promise.all(joiners.map((u) => joinGroup(request, u.token, groupId)));

    const members = await readGroupMembers(request, owner.token, groupId);
    expect(members.length, `expected exactly 11 members (10 joiners + owner), got ${members.length}`).toBe(11);
    // No duplicate rows: 11 distinct member_keys.
    const keys = members.map((m) => m.member_key);
    expect(new Set(keys).size, `duplicate member rows: ${keys.join(', ')}`).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — membership + the group feed via the real UI (the client
// proof). The truth is asserted after every step + across the reload. The
// reload is the step that catches "I refresh and the feed is gone."
// ---------------------------------------------------------------------------

test.describe('groups — browser gauntlet', () => {
  test('create → join → the feed → member posts → owner sees it → RELOAD persists', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const owner = await signupAndLogin(request, 'gbb');
    await addAppContract(request, owner.token);
    const groupId = await createGroup(
      request, owner.token, 'gauntlet-browser', 'open', GROUP_ROLES,
      [{ member_key: owner.username, role: 'owner' }],
    );
    const ownerPost = postTextFor('owner');
    await postToGroup(request, owner.token, groupId, ownerPost);

    const member = await signupAndLogin(request, 'gbc');
    await addAppContract(request, member.token);
    await joinGroup(request, member.token, groupId);

    // The member opens the group detail → the group feed shows the owner's post.
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', member.token);
    await page.goto(`${SOCIAL_BASE}/groups/${groupId}`);
    await expect(async () => {
      expect(await page.locator('[data-testid="group-post-card"]').count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });
    // The member sees the owner's post (UI == DB).
    await assertGroupFeedTruth(page, request, member.token, groupId, ownerPost, true);

    // The member posts to the group (via the API — the member's action).
    const memberPost = postTextFor('member');
    await postToGroup(request, member.token, groupId, memberPost);

    // The owner's view (a 2nd context) shows the member's post (and the owner's own).
    const ownerContext: BrowserContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await setTokenCookie(ownerContext, 'social.localhost', owner.token);
    await ownerPage.goto(`${SOCIAL_BASE}/groups/${groupId}`);
    await expect(async () => {
      expect(await ownerPage.locator('[data-testid="group-post-card"]').count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });
    await assertGroupFeedTruth(ownerPage, request, owner.token, groupId, memberPost, true);
    await assertGroupFeedTruth(ownerPage, request, owner.token, groupId, ownerPost, true);

    // RELOAD → the posts persist (the member's own page re-reads the feed).
    await page.reload();
    await expect(async () => {
      expect(await page.locator('[data-testid="group-post-card"]').count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });
    await assertGroupFeedTruth(page, request, member.token, groupId, ownerPost, true);
    await assertGroupFeedTruth(page, request, member.token, groupId, memberPost, true);

    await context.close();
    await ownerContext.close();
  });
});

// ---------------------------------------------------------------------------
// Multi-user (the multi-user rule) — 3 members in a group; one posts; every
// member's view of the group feed shows the same set of posts. The single-user
// gauntlet only checks one member's view; this checks the feed is consistent
// for every member.
// ---------------------------------------------------------------------------

test.describe('groups — multi-user (the group feed is consistent)', () => {
  test('3 members in a group; one posts; every member sees the same feed', async ({ request }) => {
    test.setTimeout(90_000);
    const users: { token: string; username: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const u = await signupAndLogin(request, `gmu${i}`);
      await addAppContract(request, u.token);
      users.push(u);
    }
    // The first user creates the group (owner); the other two join.
    const groupId = await createGroup(
      request, users[0].token, 'gauntlet-multi', 'open', GROUP_ROLES,
      [{ member_key: users[0].username, role: 'owner' }],
    );
    await joinGroup(request, users[1].token, groupId);
    await joinGroup(request, users[2].token, groupId);

    // One member posts to the group.
    const postText = postTextFor('multi');
    await postToGroup(request, users[1].token, groupId, postText);

    // Every member's view of the group feed (the DB) shows the post — and the
    // same set of posts (same count, same content) for all 3 members.
    const feeds: string[][] = [];
    for (const u of users) {
      const feed = await groupFeedTruth(request, u.token, groupId);
      feeds.push(feed);
      expect(
        feed.includes(postText),
        `member ${u.username} does not see "${postText}" in the group feed (feed: ${feed.join(' | ')})`,
      ).toBe(true);
    }
    const baseline = feeds[0].slice().sort();
    for (let i = 1; i < feeds.length; i++) {
      expect(
        feeds[i].slice().sort(),
        `member ${users[i].username} sees a different feed than member ${users[0].username}`,
      ).toEqual(baseline);
    }
  });
});
