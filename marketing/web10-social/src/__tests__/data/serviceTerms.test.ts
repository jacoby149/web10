import { describe, it, expect } from 'vitest';
import { buildSocialServiceSirs } from '../../data/serviceTerms';

// D19 Phase A regression: every post tier's anon-access boundary must
// match the security model in decisions.md D30. The sirs list is what the
// social app registers with the node's Service Manager on signup/login
// (contractOnReady); a service WITH a Read whitelist opens anon-read access,
// WITHOUT keeps the node's default-deny (only the owner's own token
// passes via is_permitted's owner-shortcut). These are the security
// invariants the staging layer relies on.

function find(sirs: ReturnType<typeof buildSocialServiceSirs>, service: string) {
  const sir = sirs.find((s) => s.service === service);
  if (!sir) throw new Error(`no sir registered for ${service}`);
  return sir;
}

describe('buildSocialServiceSirs — D19 Phase A / D30 collection boundaries', () => {
  const sirs = buildSocialServiceSirs(['localhost', 'social.web10.app']);

  describe('staging_posts (D19 Phase A — owner-only)', () => {
    it('registers staging_posts', () => {
      expect(() => find(sirs, 'staging_posts')).not.toThrow();
    });

    it('carries NO anon-read whitelist (owner-only by default-deny)', () => {
      const sir = find(sirs, 'staging_posts');
      expect(sir.whitelist).toBeUndefined();
    });

    it('cross_origins includes the social app host so the app can act on its owner\'s collection', () => {
      const sir = find(sirs, 'staging_posts');
      expect(sir.cross_origins).toEqual(expect.arrayContaining(['localhost', 'social.web10.app']));
    });
  });

  describe('public_posts (anon-read — discovery-indexed)', () => {
    it('has an anon-read whitelist (anyone can read)', () => {
      const sir = find(sirs, 'public_posts');
      expect(sir.whitelist).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: '.*', username: '.*', read: true }),
        ]),
      );
    });
  });

  describe('private_posts (owner-only)', () => {
    it('has NO anon-read whitelist', () => {
      const sir = find(sirs, 'private_posts');
      expect(sir.whitelist).toBeUndefined();
    });
  });

  describe('legacy posts (anon-read — kept for back-compat only)', () => {
    // legacy `posts` still has the legacy anon-read whitelist so existing
    // third-party consumers don't break, but D19 Phase A stops the social
    // app from WRITING new imports to it. readMyPosts no longer reads it
    // (see posts.test.ts).
    it('keeps its whitelist', () => {
      const sir = find(sirs, 'posts');
      expect(sir.whitelist).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: '.*', username: '.*', read: true }),
        ]),
      );
    });
  });

  it('registers every conventions-schema service the social app uses', () => {
    const expected = [
      'identity',
      'bulletin',
      'contact-addresses',
      'message-inbox',
      'message-outbox',
      'posts',
      'public_posts',
      'private_posts',
      'staging_posts',
      'crm-contacts',
      'crm-notes',
      'mail',
      'profile',
      'contacts',
      'inbox',
      'comments',
      'reactions',
      'media',
      'follows',
      'dms',
    ];
    const registered = sirs.map((s) => s.service).sort();
    expect(registered).toEqual(expect.arrayContaining(expected));
    expect(registered.length).toBeGreaterThanOrEqual(expected.length);
  });
});