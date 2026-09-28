// Screenshot-harness mock for @/data/moderation — seeded moderation data so the
// Node Settings surface renders offline (no backend, no login).
export type {
  ModerationFlag,
  ModerationConfig,
  ParsedWeb10Link,
} from '../../src/data/moderation';

// Re-export the pure parser for real (it has no I/O).
export { parseWeb10Link } from '../../src/data/moderation';

const FLAGS = [
  { username: 'badguy', flag_count: 3, last_flagged: '2026-01-02T00:00:00', matched_words: ['slur', 'spam'] },
  { username: 'trollface', flag_count: 1, last_flagged: '2026-01-01T00:00:00', matched_words: ['hate'] },
];

export async function readModerationFlags() {
  return FLAGS;
}
export async function setUserAutoHidden(_username: string, hide: boolean) {
  return hide ? ['badguy'] : [];
}
export async function saveModerationConfig() {}
export async function hidePostFromBoard() {}
export async function unhidePostFromBoard() {}

export async function readUserPostsForModeration(_username: string) {
  return {
    posts: [
      { _id: 'post-1', text: 'escorts for hire — dm me', created_at: '2026-01-02T00:00:00Z' },
      { _id: 'post-2', text: 'check my profile for more', created_at: '2026-01-01T00:00:00Z' },
    ],
    face: { username: _username, provider: 'web10', display_name: 'Bad Guy' },
  };
}
