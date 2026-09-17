import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readDmMessages } from './setup';

/**
 * The messages (DM) truth primitive (gauntlets/messages.md, the truth rule).
 * The DM counterpart of truth.ts: read the backend truth (the DM group's posts
 * docs, the same read path the app uses), read the UI state (the conversation's
 * messages), and compare field-for-field. A gauntlet that asserts a *change*
 * ("the message appeared") instead of a *match* ("the message the UI shows is
 * the message the database holds") is a corrupted measure — this is the match.
 *
 * A DM message is a `posts` doc in the 2-member DM group. The text lives in
 * `body.text` (the API-floor write via postToGroup) or `body.message` (the
 * client's sendDm write) — both are checked.
 */

/** The DM truth for a conversation (the DB, not the UI). */
export interface DmTruth {
  /** The number of messages in the DM group. */
  count: number;
  /** The message texts, in the order the DB read returns them. */
  messages: string[];
}

/**
 * Read the backend truth for a DM conversation: the DM group's posts docs
 * (the same read path the app uses, readDmMessages), reduced to the count +
 * the list of message texts. This is the source of truth, not the UI.
 *
 * The text is `body.text` or `body.message` — a DM message written by the API
 * floor (postToGroup) carries `body.text`, while one written by the client's
 * sendDm carries `body.message`. Both are checked.
 */
export async function dmTruth(
  request: APIRequestContext,
  token: string,
  dmGroupId: string,
): Promise<DmTruth> {
  const docs = await readDmMessages(request, token, dmGroupId);
  const messages = docs.map((d) => d.body?.text ?? d.body?.message ?? '');
  return { count: docs.length, messages };
}

/**
 * Whether the given message text is rendered in the open conversation's message
 * list. Scoped to the `dm-message` bubbles inside the `dm-conversation`
 * container (the open conversation), so the conversation list's last-message
 * preview (which also renders the text) is not counted.
 *
 * NOTE: the message bubble has a stable testid (`dm-message`), so we scope by
 * that rather than a bare `getByText`.
 */
async function dmMessageVisible(page: Page, messageText: string): Promise<boolean> {
  const count = await page
    .locator('[data-testid="dm-conversation"]')
    .locator('[data-testid="dm-message"]')
    .filter({ hasText: messageText })
    .count();
  return count > 0;
}

/**
 * The full truth assertion: the UI (the conversation's messages, scoped by the
 * message text) matches the DB truth, field-for-field. On a mismatch, the
 * failure names the field, the UI value, and the DB value — the break, not a
 * guess.
 *
 * The page must be on the open conversation (`${SOCIAL_BASE}/messages/{conv}`),
 * so the message bubbles (`dm-message`) are rendered. Both reads are
 * toPass-settled: the DB read tolerates ClickHouse write latency, and the UI
 * read tolerates the async conversation read.
 */
export async function assertDmTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  dmGroupId: string,
  messageText: string,
  present: boolean,
  timeout = 20000,
): Promise<DmTruth> {
  // 1. The DB converges to the expected presence (the anchor).
  await expect(async () => {
    const t = await dmTruth(request, token, dmGroupId);
    const dbHas = t.messages.includes(messageText);
    expect(
      dbHas,
      `DB DM ${dbHas ? 'has' : 'lacks'} "${messageText}" but expected present=${present}`,
    ).toBe(present);
  }).toPass({ timeout });

  // Re-read the DB truth now that it has converged (for the match + return).
  const truth = await dmTruth(request, token, dmGroupId);
  const dbHas = truth.messages.includes(messageText);

  // 2. The UI converges to the expected presence (the async conversation read).
  await expect(async () => {
    const uiHas = await dmMessageVisible(page, messageText);
    expect(
      uiHas,
      `UI conversation ${uiHas ? 'shows' : 'hides'} "${messageText}" but expected present=${present}`,
    ).toBe(present);
  }).toPass({ timeout });

  // 3. The load-bearing match: the UI reflects the database.
  const uiHas = await dmMessageVisible(page, messageText);
  expect(
    uiHas,
    `UI conversation ${uiHas ? 'shows' : 'hides'} "${messageText}" but DB ${dbHas ? 'has' : 'lacks'} it`,
  ).toBe(dbHas);

  return truth;
}
