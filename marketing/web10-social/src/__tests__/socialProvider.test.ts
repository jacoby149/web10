import { describe, expect, it } from 'vitest';
import { API_HOST } from '../lib/origins';
import { resolveSocialProvider } from '../lib/socialProvider';

describe('social provider resolution', () => {
  it.each([undefined, '', 'web10'])('resolves %j to the current node or configured API for anonymous readers', (provider) => {
    expect(resolveSocialProvider(provider, 'api.dev.web10.app')).toBe('api.dev.web10.app');
    expect(resolveSocialProvider(provider)).toBe(API_HOST);
  });

  it.each(['other.node', 'web10.app', 'api.web10.app'])('never rewrites an explicit provider %j', (provider) => {
    expect(resolveSocialProvider(provider, 'api.dev.web10.app')).toBe(provider);
  });
});
