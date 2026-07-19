import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conversationServiceName } from '../../data/dms';

describe('dms', () => {
  describe('conversationServiceName', () => {
    it('produces deterministic service name regardless of argument order', () => {
      const a = { provider: 'api.web10.app', username: 'alice' };
      const b = { provider: 'api.web10.app', username: 'bob' };

      const name1 = conversationServiceName(a, b);
      const name2 = conversationServiceName(b, a);

      expect(name1).toBe(name2);
      expect(name1).toBe('dm-api.web10.app/alice--api.web10.app/bob');
    });

    it('works across different providers', () => {
      const a = { provider: 'node1.web10.app', username: 'alice' };
      const b = { provider: 'node2.web10.app', username: 'bob' };

      const name = conversationServiceName(a, b);
      expect(name).toBe('dm-node1.web10.app/alice--node2.web10.app/bob');
    });

    it('handles same provider different users', () => {
      const a = { provider: 'api.web10.app', username: 'zara' };
      const b = { provider: 'api.web10.app', username: 'amir' };

      const name = conversationServiceName(a, b);
      expect(name).toBe('dm-api.web10.app/amir--api.web10.app/zara');
    });
  });
});