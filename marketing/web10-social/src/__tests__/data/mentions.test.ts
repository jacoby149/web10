import { describe, it, expect } from 'vitest';
import { mentionedUsernames } from '@/data/mentions';

describe('people tags', () => {
  it('collects plain handles and legacy mention links, once per person', () => {
    expect(mentionedUsernames('Hi @alice, **@bob** and @[carol](web10:carol). @alice.')).toEqual(['alice', 'bob', 'carol']);
  });

  it('does not tag emails, URLs, linked labels, code, images or HTML attributes', () => {
    expect(mentionedUsernames('alice@example.com https://example.com/@bob [@carol](https://example.com) `@dave`\n\n```\n@erin\n```\n\n![photo @frank](x) <span title="@gary">hello</span>')).toEqual([]);
  });

  it('does not truncate invalid long or domain-qualified names into local tags', () => {
    expect(mentionedUsernames(`@alice.example @${'a'.repeat(65)} x@bob`)).toEqual([]);
  });

  it('clears the index when the last tag is removed', () => {
    expect(mentionedUsernames('hello')).toEqual([]);
    expect(mentionedUsernames()).toEqual([]);
  });
});
