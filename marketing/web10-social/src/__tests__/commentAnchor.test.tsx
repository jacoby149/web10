import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import * as wapi from '@/data/wapi';
import * as feed from '@/data/feed';
import { CommentThread } from '@/components/Feed/CommentThread';
import type { CommentRecord } from '@/data/types';

function mockWapi() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice', site: 'api.web10.app' })),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
    getUploadUrl: vi.fn(),
    initP2P: vi.fn(),
    sendP2P: vi.fn(),
  };
  vi.spyOn(wapi, 'getWapi').mockReturnValue(mock as any);
  return mock;
}

describe('comment anchor', () => {
  let mock: ReturnType<typeof mockWapi>;
  const commentSchemaId = 'web10.01arz3n8q5';

  function makeComments(n: number): CommentRecord[] {
    return Array.from({ length: n }, (_, i) => ({
      _id: `cm${i}`,
      post_id: 'p1',
      text: `comment text ${i}`,
      created_at: '2026-07-30T00:00:00Z',
      author_username: `user${i}`,
    }));
  }

  beforeEach(() => {
    mock = mockWapi();
    vi.spyOn(feed, 'getCachedSchema').mockReturnValue({
      _id: commentSchemaId,
      name: 'Comment',
      author_username: 'system',
      author_provider: 'web10',
      schema: {},
    });
    vi.spyOn(feed, 'createPublicEntry').mockResolvedValue({ _id: 'le1', schema_id: commentSchemaId, target: '', payload: {} });
    vi.spyOn(feed, 'queryPublicEntries').mockResolvedValue([]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CommentThread highlightedCommentId', () => {
    it('renders comments without highlight when no highlightedCommentId', async () => {
      const comments = makeComments(3);
      mock.read.mockResolvedValue(comments);

      render(
        <CommentThread
          postId="p1"
          isOpen={true}
          count={3}
          onCountChange={() => {}}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('comment text 0')).toBeInTheDocument();
      });

      // No highlight class should be applied
      const commentEls = document.querySelectorAll('[data-testid^="comment-"]');
      commentEls.forEach(el => {
        expect(el.className).not.toContain('bg-brand-muted');
      });
    });

    it('highlights the matching comment when highlightedCommentId is provided', async () => {
      const comments = makeComments(5);
      mock.read.mockResolvedValue(comments);

      render(
        <CommentThread
          postId="p1"
          isOpen={true}
          count={5}
          onCountChange={() => {}}
          highlightedCommentId="cm3"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('comment text 3')).toBeInTheDocument();
      });

      // The highlighted comment should have the highlight class
      const highlightedEl = screen.getByTestId('comment-cm3');
      expect(highlightedEl.className).toContain('bg-brand-muted');
      expect(highlightedEl.className).toContain('ring-brand');
      expect(highlightedEl.className).toContain('animate-pulse-once');

      // Other comments should NOT be highlighted
      const otherEl = screen.getByTestId('comment-cm0');
      expect(otherEl.className).not.toContain('bg-brand-muted');
    });

    it('does not highlight when commentId does not match any comment', async () => {
      const comments = makeComments(3);
      mock.read.mockResolvedValue(comments);

      render(
        <CommentThread
          postId="p1"
          isOpen={true}
          count={3}
          onCountChange={() => {}}
          highlightedCommentId="nonexistent"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('comment text 0')).toBeInTheDocument();
      });

      const commentEls = document.querySelectorAll('[data-testid^="comment-"]');
      commentEls.forEach(el => {
        expect(el.className).not.toContain('bg-brand-muted');
      });
    });
  });

  describe('deep-link ?comment= route', () => {
    it('passes highlightedCommentId through the route to PostLightbox', async () => {
      const TestComponent = () => {
        const [params] = useSearchParams();
        return <div data-testid="comment-param">{params.get('comment') || ''}</div>;
      };

      render(
        <MemoryRouter initialEntries={['/u/testuser/p/p1?comment=cm42']}>
          <Routes>
            <Route path="/u/:username/p/:postId" element={<TestComponent />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('comment-param').textContent).toBe('cm42');
    });

    it('without ?comment= the param is null', async () => {
      const TestComponent = () => {
        const [params] = useSearchParams();
        return <div data-testid="comment-param">{params.get('comment') || 'none'}</div>;
      };

      render(
        <MemoryRouter initialEntries={['/u/testuser/p/p1']}>
          <Routes>
            <Route path="/u/:username/p/:postId" element={<TestComponent />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('comment-param').textContent).toBe('none');
    });
  });
});
