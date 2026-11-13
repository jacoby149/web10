// The hashtag derivation (D110, social/hashtags.md "The write side"): the
// body's `#tag` prose → the derived `body.hashtags` field (the
// `mention_usernames` seam — the node stores an opaque app-owned body, the
// social write layer parses it). One shared pattern (@web10/discover/hashtags)
// feeds this and the read-side render, so the two can never drift.
//
// The walk mirrors data/mentions.ts (`mentionedUsernames`): markdown-it over
// the stored text, text tokens only (never code spans / link labels / raw
// HTML / heading markers — the ATX `#` of a heading is consumed by the
// parser, not a token), link depth tracked so a `#tag` inside a link label
// stays inert. Stored + looked up lowercase, deduped (one board per tag).
import MarkdownIt from 'markdown-it';
import { hashtagMatches, HASHTAG_VALID } from '@web10/discover/hashtags';
import { getDiscoverGroupId } from './groups';
import { readFeedPage, type FeedCursor } from './feed';
import type { PostRecord } from './types';

/**
 * The hashtag board read (D110, social/hashtags.md "The board"): the public,
 * newest-first posts whose `body.hashtags` carries the tag. It is the app's own
 * D73 SELECT (the node stays generic) — `readFeedPage` scoped to the DISCOVER
 * group only (anon-readable, D41/D58), filtered on the body-derived hashtag
 * index (NOT the doc `tags` column), newest-first (no knob state), stable-paged
 * (cursor on created_at/author/doc), reusing the feed's prepare pass and existing
 * engagement/author enrichment, with the D86 surface label `hashtag`.
 */
export async function readHashtagBoard(
  hashtag: string,
  opts: { limit?: number; cursor?: FeedCursor | null; isCurrent?: () => boolean } = {},
): Promise<{ posts: PostRecord[]; has_more: boolean; next_cursor: FeedCursor | null }> {
  const tag = hashtag.toLowerCase();
  if (!HASHTAG_VALID.test(tag)) throw new Error('Invalid hashtag');
  const page = await readFeedPage({
    limit: opts.limit ?? 50,
    cursor: opts.cursor ?? null,
    stable: true,
    groups: [getDiscoverGroupId()],
    hashtags: [tag],
    surface: 'hashtag',
    isCurrent: opts.isCurrent,
  });
  return page;
}

const markdown = new MarkdownIt({ html: true, linkify: true });

/** Derive the post's hashtag index from its markdown body (lowercase, deduped). */
export function hashtagTexts(text?: string): string[] {
  const seen = new Set<string>();
  let heading = false;
  for (const block of markdown.parse(text || '', {})) {
    if (block.type === 'heading_open') heading = true;
    if (block.type === 'heading_close') heading = false;
    if (heading) continue;
    let linkDepth = 0;
    for (const token of block.children || []) {
      if (token.type === 'link_open') linkDepth++;
      else if (token.type === 'link_close') linkDepth--;
      else if (token.type === 'text' && !linkDepth) {
        for (const match of hashtagMatches(token.content)) seen.add(match.hashtag);
      }
    }
  }
  return [...seen];
}
