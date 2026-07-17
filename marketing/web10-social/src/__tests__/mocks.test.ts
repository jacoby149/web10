import { describe, it, expect } from 'vitest';
import mockContacts from '../mocks/MockContacts';
import mockFeed from '../mocks/MockFeed';
import mockWall from '../mocks/MockWall';
import mockChat from '../mocks/MockChat';
import mockIdentity from '../mocks/MockIdentity';
import mockBulletin from '../mocks/MockBulletin';
import mockMedia from '../mocks/MockMedia';
import defaultIdentity from '../mocks/defaultIdentity';

describe('mock data shapes', () => {
  describe('MockContacts', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(mockContacts)).toBe(true);
      expect(mockContacts.length).toBeGreaterThan(0);
    });

    it('each contact has required fields', () => {
      mockContacts.forEach((c) => {
        expect(c.web10).toBeDefined();
        expect(c.name).toBeDefined();
        expect(c.pic).toBeDefined();
        expect(c.bio).toBeDefined();
      });
    });

    it('contact web10 addresses are unique', () => {
      const web10s = mockContacts.map((c) => c.web10);
      expect(new Set(web10s).size).toBe(web10s.length);
    });
  });

  describe('MockFeed', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(mockFeed)).toBe(true);
      expect(mockFeed.length).toBeGreaterThan(0);
    });

    it('each post has required fields', () => {
      mockFeed.forEach((p) => {
        expect(p.html).toBeDefined();
        expect(Array.isArray(p.media)).toBe(true);
        expect(p.time).toBeDefined();
        expect(p.web10).toBeDefined();
      });
    });

    it('media items have type and src', () => {
      mockFeed.forEach((p) => {
        p.media.forEach((m) => {
          expect(['image', 'video']).toContain(m.type);
          expect(m.src).toBeDefined();
        });
      });
    });
  });

  describe('MockWall', () => {
    it('contains only jacoby149 posts', () => {
      mockWall.forEach((p) => {
        expect(p.web10).toBe('api.web10.app/jacoby149');
      });
    });

    it('is a subset of mockFeed', () => {
      mockWall.forEach((p) => {
        const found = mockFeed.find((f) => f._id === p._id);
        expect(found).toBeDefined();
      });
    });
  });

  describe('MockChat', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(mockChat)).toBe(true);
      expect(mockChat.length).toBeGreaterThan(0);
    });

    it('each message has required fields', () => {
      mockChat.forEach((m) => {
        expect(m.message).toBeDefined();
        expect(m.sentTime).toBeDefined();
        expect(m.web10).toBeDefined();
        expect(['in', 'out']).toContain(m.direction);
      });
    });

    it('messages have alternating directions', () => {
      for (let i = 0; i < mockChat.length - 1; i++) {
        expect(mockChat[i].direction).not.toBe(mockChat[i + 1].direction);
      }
    });
  });

  describe('MockIdentity', () => {
    it('has required fields', () => {
      expect(mockIdentity.web10).toBe('api.web10.app/jacoby149');
      expect(mockIdentity.name).toBe('Jacob Hoffman');
      expect(mockIdentity.pic).toBeDefined();
      expect(mockIdentity.bio).toBeDefined();
    });
  });

  describe('MockBulletin', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(mockBulletin)).toBe(true);
      expect(mockBulletin.length).toBeGreaterThan(0);
    });

    it('each bulletin has id and html', () => {
      mockBulletin.forEach((b) => {
        expect(b._id).toBeDefined();
        expect(b.html).toBeDefined();
      });
    });
  });

  describe('MockMedia', () => {
    it('has both image and video types', () => {
      const types = mockMedia.map((m) => m.type);
      expect(types).toContain('image');
      expect(types).toContain('video');
    });
  });

  describe('defaultIdentity', () => {
    it('generates identity from web10 string', () => {
      const id = defaultIdentity('provider/user');
      expect(id.web10).toBe('provider/user');
      expect(id.name).toBe('user');
      expect(id.pic).toBeDefined();
      expect(id.bio).toBeDefined();
    });

    it('handles web10 without slash', () => {
      const id = defaultIdentity('justuser');
      expect(id.web10).toBe('justuser');
      expect(id.name).toBe('justuser');
    });
  });
});
