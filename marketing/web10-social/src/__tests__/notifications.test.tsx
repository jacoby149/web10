import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';

vi.mock('lucide-react', () => lucideMock);

// Controllable notification state for the hook (the bell + banner + screen all
// read through useNotifications). The mock re-renders on emitMockState, so a
// test can simulate the seed landing AFTER the screen opened (the mark-read
// race) — the one-shot on-mount code would never see it.
let mockState: { unread: number; items: import('@/data/notifications').Notification[] } = {
  unread: 0,
  items: [],
};
const mockSubs = new Set<() => void>();
function emitMockState(): void {
  mockSubs.forEach((f) => f());
}
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => {
    const [, force] = useState(0);
    useEffect(() => {
      const sub = () => force((v) => v + 1);
      mockSubs.add(sub);
      return () => {
        mockSubs.delete(sub);
      };
    }, []);
    return mockState;
  },
}));

// The screen calls markRead on a row click (marks that row) + markAllRead on
// the "Mark all read" button — spies on both. The rest of the module (the
// deep-link resolvers) keeps its real implementation.
const markReadMock = vi.fn(async (_id: string) => {});
const markAllReadMock = vi.fn(async () => {});
vi.mock('@/data/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/notifications')>();
  return { ...actual, markRead: (id: string) => markReadMock(id), markAllRead: () => markAllReadMock() };
});

// The screen resolves the signed-in user for the deep links — a token with a
// known username/provider (null in the tests that don't set one).
let mockToken: { username: string; provider: string } | null = null;
vi.mock('@/data/wapi', () => ({
  getWapi: () => ({ readToken: () => mockToken }),
}));

// The reply deep link re-reads the parent comment + the post through the v3
// client — a controllable readById.
const readByIdMock = vi.fn();
vi.mock('@/data/v3', () => ({
  getV3Client: () => ({ readToken: () => mockToken, readById: (...a: unknown[]) => readByIdMock(...a) }),
}));

import NotificationBell from '@/components/Notifications/NotificationBell';
import NotificationsScreen from '@/components/Notifications/NotificationsScreen';
import { notificationHref } from '@/data/notifications';

// A minimal Layout-like harness for the banner (the banner logic lives in
// Layout; we test the bell + screen directly, and the banner's show/hide via a
// tiny inline replica of its condition).
function renderWithRouter(ui: React.ReactNode, route = '/feed') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

// A screen + a probe route: clicking a row navigates, and the probe renders
// the landed URL (from the router, not window.location — MemoryRouter) so the
// test can assert on it.
function NavProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="nav-probe">{pathname}{search}</div>;
}

function renderNotificationNav(route = '/notifications') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/notifications" element={<NotificationsScreen />} />
        <Route path="*" element={<NavProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    mockState = { unread: 0, items: [] };
    markReadMock.mockClear();
    markAllReadMock.mockClear();
  });

  it('shows no badge when there are no notifications', () => {
    renderWithRouter(<NotificationBell open={false} onToggle={() => {}} />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('notification-bell')).toHaveAccessibleName('Notifications');
  });

  it('shows the count badge (glow-pulse) when there are unread notifications', () => {
    mockState = { unread: 3, items: [] };
    renderWithRouter(<NotificationBell open={false} onToggle={() => {}} />);
    const badge = screen.getByTestId('notification-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveClass('animate-glow-pulse');
    expect(screen.getByTestId('notification-bell')).toHaveAccessibleName('Notifications (3 unread)');
  });

  it('caps the badge at 99+', () => {
    mockState = { unread: 150, items: [] };
    renderWithRouter(<NotificationBell open={false} onToggle={() => {}} />);
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('99+');
  });

  it('is a toggle — reports the tap, reflects open state, never navigates', () => {
    const onToggle = vi.fn();
    renderWithRouter(
      <>
        <NotificationBell open={false} onToggle={onToggle} />
        <NavProbe />
      </>,
      '/feed',
    );
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('nav-probe')).toHaveTextContent('/feed');
  });
});

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockState = { unread: 0, items: [] };
    mockToken = null;
    markReadMock.mockClear();
    markAllReadMock.mockClear();
  });

  it('shows the empty state when there are no notifications', () => {
    renderWithRouter(<NotificationsScreen />, '/notifications');
    expect(screen.getByTestId('notifications-empty')).toBeInTheDocument();
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('defaults to the Unread filter (hides read rows) and All shows everything', () => {
    mockState = {
      unread: 1,
      items: [
        { id: 'n1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: new Date().toISOString() },
        { id: 'n2', type: 'comment', from: 'carol', ref_doc_id: 'post-1', read: true, created_at: new Date().toISOString() },
      ],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    // Default = Unread: only the unread row (bob) shows; carol (read) is hidden.
    expect(screen.getByTestId('notifications-filter-unread')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('notification-row')).toHaveLength(1);
    expect(screen.getByText('bob reacted to your post')).toBeInTheDocument();
    expect(screen.queryByText('carol commented on your post')).not.toBeInTheDocument();
    // Switch to All: both rows show.
    fireEvent.click(screen.getByTestId('notifications-filter-all'));
    expect(screen.getByTestId('notifications-filter-all')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('notification-row')).toHaveLength(2);
    expect(screen.getByText('carol commented on your post')).toBeInTheDocument();
  });

  it('does NOT auto-mark-read on open (the Unread filter needs the unread state)', () => {
    mockState = {
      unread: 2,
      items: [
        { id: 'n1', type: 'reaction', from: 'bob', read: false, created_at: new Date().toISOString() },
        { id: 'n2', type: 'reaction', from: 'carol', read: false, created_at: new Date().toISOString() },
      ],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    // Opening shows the unread rows; it does NOT mark them read (the badge
    // clears only via the explicit "Mark all read" action).
    expect(markAllReadMock).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('notification-row')).toHaveLength(2);
  });

  it('clicking "Mark all read" clears the badge', async () => {
    mockState = {
      unread: 2,
      items: [
        { id: 'n1', type: 'reaction', from: 'bob', read: false, created_at: new Date().toISOString() },
        { id: 'n2', type: 'reaction', from: 'carol', read: false, created_at: new Date().toISOString() },
      ],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    fireEvent.click(screen.getByTestId('mark-all-read-button'));
    await vi.waitFor(() => expect(markAllReadMock).toHaveBeenCalled());
  });

  it('clicking a row marks THAT row read (not the others) — the badge clears via navigation', async () => {
    mockToken = { username: 'me', provider: 'api.localhost' };
    mockState = {
      unread: 2,
      items: [
        { id: 'reaction:bob:post-1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: new Date().toISOString() },
        { id: 'reaction:carol:post-1', type: 'reaction', from: 'carol', ref_doc_id: 'post-1', read: false, created_at: new Date().toISOString() },
      ],
    };
    renderNotificationNav();
    // Click the bob row (the first one).
    fireEvent.click(screen.getAllByTestId('notification-row')[0]);
    // It marks bob's row read — by id, not everything.
    await vi.waitFor(() => expect(markReadMock).toHaveBeenCalledWith('reaction:bob:post-1'));
    expect(markReadMock).toHaveBeenCalledTimes(1);
    expect(markAllReadMock).not.toHaveBeenCalled();
    // It still navigates to the row's destination.
    expect(screen.getByTestId('nav-probe')).toHaveTextContent('/u/me/p/post-1');
  });

  it('shows a "caught up" empty state when the Unread filter is empty but history exists', () => {
    mockState = {
      unread: 0,
      items: [
        { id: 'n1', type: 'reaction', from: 'bob', read: true, created_at: new Date().toISOString() },
      ],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    // Default Unread filter is empty (the one item is read) → caught-up state,
    // not the "no notifications" state.
    expect(screen.getByTestId('notifications-empty')).toBeInTheDocument();
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.queryByTestId('notifications-list')).not.toBeInTheDocument();
    // "View all" switches to the All filter and shows the history.
    fireEvent.click(screen.getByTestId('caught-up-view-all'));
    expect(screen.getAllByTestId('notification-row')).toHaveLength(1);
  });

  it('shows the "Mark all read" button when there are unread notifications', () => {
    mockState = {
      unread: 1,
      items: [{ id: 'n1', type: 'reaction', from: 'bob', read: false, created_at: new Date().toISOString() }],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    expect(screen.getByTestId('mark-all-read-button')).toBeInTheDocument();
  });

  it('hides the "Mark all read" button when everything is read', () => {
    mockState = {
      unread: 0,
      items: [{ id: 'n1', type: 'reaction', from: 'bob', read: true, created_at: new Date().toISOString() }],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    expect(screen.queryByTestId('mark-all-read-button')).not.toBeInTheDocument();
  });
});

describe('NotificationsScreen (panel mode — the bell\'s popover, not a page)', () => {
  beforeEach(() => {
    mockState = { unread: 0, items: [] };
    mockToken = { username: 'me', provider: 'api.localhost' };
    markReadMock.mockClear();
    markAllReadMock.mockClear();
    readByIdMock.mockReset();
  });

  it('shows the X close button and calls onClose when tapped', () => {
    const onClose = vi.fn();
    mockState = {
      unread: 1,
      items: [{ id: 'n1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: new Date().toISOString() }],
    };
    renderWithRouter(<NotificationsScreen onClose={onClose} />, '/feed');
    const close = screen.getByTestId('notifications-close');
    expect(close).toHaveAccessibleName('Close notifications');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no X close button in route mode (the full page closes via the bell)', () => {
    mockState = {
      unread: 1,
      items: [{ id: 'n1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: new Date().toISOString() }],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    expect(screen.queryByTestId('notifications-close')).not.toBeInTheDocument();
  });

  it('a row click in panel mode navigates AND closes the panel (back where you were)', async () => {
    const onClose = vi.fn();
    mockState = {
      unread: 1,
      items: [{ id: 'reaction:bob:post-1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: new Date().toISOString() }],
    };
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Routes>
          <Route path="/feed" element={<NotificationsScreen onClose={onClose} />} />
          <Route path="*" element={<NavProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('notification-row'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('nav-probe')).toHaveTextContent('/u/me/p/post-1');
    // Opening the row's destination marks that row read (the badge path).
    await vi.waitFor(() => expect(markReadMock).toHaveBeenCalledWith('reaction:bob:post-1'));
  });

  it('panel mode: opening does NOT auto-mark-read; "Mark all read" clears the badge', async () => {
    mockState = {
      unread: 2,
      items: [
        { id: 'n1', type: 'reaction', from: 'bob', read: false, created_at: new Date().toISOString() },
        { id: 'n2', type: 'reaction', from: 'carol', read: false, created_at: new Date().toISOString() },
      ],
    };
    renderWithRouter(<NotificationsScreen onClose={() => {}} />, '/feed');
    // Opening the panel shows the unread rows (default Unread filter) and does
    // NOT mark them read.
    expect(markAllReadMock).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('notification-row')).toHaveLength(2);
    // The explicit "Mark all read" clears the badge.
    fireEvent.click(screen.getByTestId('mark-all-read-button'));
    await vi.waitFor(() => expect(markAllReadMock).toHaveBeenCalled());
  });
});

describe('notification deep links (row click → the place the event is about)', () => {
  beforeEach(() => {
    mockState = { unread: 0, items: [] };
    mockToken = { username: 'me', provider: 'api.localhost' };
    markReadMock.mockClear();
    markAllReadMock.mockClear();
    readByIdMock.mockReset();
  });

  const now = () => new Date().toISOString();

  it('a reaction row opens the post permalink on my profile', () => {
    mockState = {
      unread: 1,
      items: [{ id: 'reaction:bob:post-1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: now() }],
    };
    renderNotificationNav();
    fireEvent.click(screen.getByTestId('notification-row'));
    expect(screen.getByTestId('nav-probe')).toHaveTextContent('/u/me/p/post-1');
  });

  it('a comment row opens the post permalink with the comment highlighted', () => {
    // The derived row id carries the comment's doc id (comment:{from}:{docId}).
    mockState = {
      unread: 1,
      items: [{ id: 'comment:carol:cmt-9', type: 'comment', from: 'carol', ref_doc_id: 'post-1', read: false, created_at: now() }],
    };
    renderNotificationNav();
    fireEvent.click(screen.getByTestId('notification-row'));
    expect(screen.getByTestId('nav-probe')).toHaveTextContent('/u/me/p/post-1?comment=cmt-9');
  });

  it('a comment row without a comment id still lands on the post', () => {
    // A live nudge's id has a timestamp tail — no highlight, the post still.
    mockState = {
      unread: 1,
      items: [{ id: 'comment:carol:post-1:2026-09-13T00:00:00.000Z', type: 'comment', from: 'carol', ref_doc_id: 'post-1', read: false, created_at: now() }],
    };
    renderNotificationNav();
    fireEvent.click(screen.getByTestId('notification-row'));
    expect(screen.getByTestId('nav-probe')).toHaveTextContent('/u/me/p/post-1');
  });

  it('a follow_request row opens the follower\'s profile', () => {
    mockState = {
      unread: 1,
      items: [{ id: 'follow_request:alice', type: 'follow_request', from: 'alice', read: false, created_at: now() }],
    };
    renderNotificationNav();
    fireEvent.click(screen.getByTestId('notification-row'));
    expect(screen.getByTestId('nav-probe')).toHaveTextContent('/u/alice');
  });

  it('a reply row re-reads the parent comment + post, then opens the post with the comment highlighted', async () => {
    mockState = {
      unread: 1,
      items: [{ id: 'reply:dave:cmt-4', type: 'reply', from: 'dave', ref_doc_id: 'cmt-4', read: false, created_at: now() }],
    };
    // parent comment → its post; the post's author owns the permalink.
    readByIdMock
      .mockResolvedValueOnce({ doc_id: 'cmt-4', author_key: 'me', ref_value: 'post-7', body: { text: 'parent', post_id: 'post-7' }, created_at: now() })
      .mockResolvedValueOnce({ doc_id: 'post-7', author_key: 'me', body: { text: 'the post' }, created_at: now() });
    renderNotificationNav();
    fireEvent.click(screen.getByTestId('notification-row'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('nav-probe')).toHaveTextContent('/u/me/p/post-7?comment=cmt-4');
    });
    expect(readByIdMock).toHaveBeenNthCalledWith(1, 'cmt-4', 'comments');
    expect(readByIdMock).toHaveBeenNthCalledWith(2, 'post-7', 'posts');
    // The resolved reply marks its row read too.
    expect(markReadMock).toHaveBeenCalledWith('reply:dave:cmt-4');
  });

  it('a reply row whose chain breaks (deleted post) does not navigate', async () => {
    mockState = {
      unread: 1,
      items: [{ id: 'reply:dave:cmt-4', type: 'reply', from: 'dave', ref_doc_id: 'cmt-4', read: false, created_at: now() }],
    };
    readByIdMock.mockRejectedValueOnce(new Error('404'));
    renderNotificationNav();
    fireEvent.click(screen.getByTestId('notification-row'));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('nav-probe')).not.toBeInTheDocument();
  });

  it('a row with no resolvable destination is not clickable', () => {
    mockState = {
      unread: 1,
      items: [{ id: 'reaction:bob', type: 'reaction', from: 'bob', read: false, created_at: now() }],
    };
    renderNotificationNav();
    const row = screen.getByTestId('notification-row');
    expect(row.tagName).toBe('LI'); // not a button
    fireEvent.click(row);
    expect(screen.queryByTestId('nav-probe')).not.toBeInTheDocument();
  });

  it('without a signed-in user, rows are not clickable', () => {
    mockToken = null;
    mockState = {
      unread: 1,
      items: [{ id: 'reaction:bob:post-1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: now() }],
    };
    renderNotificationNav();
    const row = screen.getByTestId('notification-row');
    expect(row.tagName).toBe('LI');
  });
});

describe('notificationHref (the resolver)', () => {
  const me = { username: 'me', provider: 'api.localhost' };
  const now = () => new Date().toISOString();

  it('maps each type to its destination', () => {
    expect(notificationHref({ id: 'r', type: 'reaction', from: 'bob', ref_doc_id: 'p1', read: false, created_at: now() }, me))
      .toBe('/u/me/p/p1');
    expect(notificationHref({ id: 'comment:bob:c1', type: 'comment', from: 'bob', ref_doc_id: 'p1', read: false, created_at: now() }, me))
      .toBe('/u/me/p/p1?comment=c1');
    expect(notificationHref({ id: 'f:alice', type: 'follow_request', from: 'alice', read: false, created_at: now() }, me))
      .toBe('/u/alice');
    expect(notificationHref({ id: 'g:g1', type: 'group_join', from: 'bob', ref_doc_id: 'api.localhost/groups/users/me/g1', read: false, created_at: now() }, me))
      .toBe(`/groups/${encodeURIComponent('api.localhost/groups/users/me/g1')}`);
    expect(notificationHref({ id: 'g', type: 'group_join', from: 'bob', read: false, created_at: now() }, me))
      .toBe('/groups');
  });

  it('returns null when the destination is unresolvable', () => {
    expect(notificationHref({ id: 'r', type: 'reaction', from: 'bob', read: false, created_at: now() }, me)).toBeNull();
    expect(notificationHref({ id: 'f', type: 'follow_request', from: '', read: false, created_at: now() }, me)).toBeNull();
  });
});

// The banner's show/hide condition (unread > 0 && not on /notifications) — a
// tiny replica of the Layout logic, so the rule is pinned without rendering the
// whole Layout (which needs the full data-layer mock set).
function Banner({ unread, pathname }: { unread: number; pathname: string }) {
  if (unread > 0 && pathname !== '/notifications') {
    return <button data-testid="notification-banner">{unread} new</button>;
  }
  return null;
}

describe('notification banner (show/hide rule)', () => {
  it('shows when there are unread notifications and not on /notifications', () => {
    renderWithRouter(<Banner unread={2} pathname="/feed" />);
    expect(screen.getByTestId('notification-banner')).toHaveTextContent('2 new');
  });

  it('hides when on /notifications (the screen clears it)', () => {
    renderWithRouter(<Banner unread={2} pathname="/notifications" />);
    expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument();
  });

  it('hides when there are no unread notifications', () => {
    renderWithRouter(<Banner unread={0} pathname="/feed" />);
    expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument();
  });
});
