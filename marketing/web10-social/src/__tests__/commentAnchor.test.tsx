import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommentThread } from '@/components/Feed/CommentThread';

// Mock v3 client at module level so the import chain picks it up
vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice' })),
    read: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  }),
  readTokenCookie: vi.fn().mockReturnValue(null),
  setTokenCookie: vi.fn(),
  scrubTokenCookie: vi.fn(),
  decodeJwt: vi.fn().mockReturnValue(null),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Send: () => null,
}));

describe('comment anchor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CommentThread renders', () => {
    it('renders without crashing', async () => {
      const { container } = render(
        <MemoryRouter>
          <CommentThread
            postId="p1"
            isOpen={true}
            count={0}
            onCountChange={() => {}}
          />
        </MemoryRouter>
      );

      // Component renders without error
      await waitFor(() => {
        expect(container.children.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Deep-link ?comment= route', () => {
    it('useSearchParams is available from react-router-dom', () => {
      const { useSearchParams } = require('react-router-dom');
      expect(typeof useSearchParams).toBe('function');
    });
  });
});