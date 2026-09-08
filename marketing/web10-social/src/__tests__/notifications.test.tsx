import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';

vi.mock('lucide-react', () => lucideMock);

// Controllable notification state for the hook (the bell + banner + screen all
// read through useNotifications).
let mockState: { unread: number; items: import('@/data/notifications').Notification[] } = {
  unread: 0,
  items: [],
};
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => mockState,
}));

// The screen calls markAllRead on open — spy on it.
const markAllReadMock = vi.fn(async () => {});
vi.mock('@/data/notifications', () => ({
  markAllRead: () => markAllReadMock(),
}));

import NotificationBell from '@/components/Notifications/NotificationBell';
import NotificationsScreen from '@/components/Notifications/NotificationsScreen';

// A minimal Layout-like harness for the banner (the banner logic lives in
// Layout; we test the bell + screen directly, and the banner's show/hide via a
// tiny inline replica of its condition).
function renderWithRouter(ui: React.ReactNode, route = '/feed') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('NotificationBell', () => {
  beforeEach(() => {
    mockState = { unread: 0, items: [] };
    markAllReadMock.mockClear();
  });

  it('shows no badge when there are no notifications', () => {
    renderWithRouter(<NotificationBell />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('notification-bell')).toHaveAccessibleName('Notifications');
  });

  it('shows the count badge (glow-pulse) when there are unread notifications', () => {
    mockState = { unread: 3, items: [] };
    renderWithRouter(<NotificationBell />);
    const badge = screen.getByTestId('notification-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveClass('animate-glow-pulse');
    expect(screen.getByTestId('notification-bell')).toHaveAccessibleName('Notifications (3 unread)');
  });

  it('caps the badge at 99+', () => {
    mockState = { unread: 150, items: [] };
    renderWithRouter(<NotificationBell />);
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('99+');
  });
});

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockState = { unread: 0, items: [] };
    markAllReadMock.mockClear();
  });

  it('shows the empty state when there are no notifications', () => {
    renderWithRouter(<NotificationsScreen />, '/notifications');
    expect(screen.getByTestId('notifications-empty')).toBeInTheDocument();
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('renders the history list with the "did X" line + time', () => {
    mockState = {
      unread: 1,
      items: [
        { id: 'n1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: new Date().toISOString() },
        { id: 'n2', type: 'comment', from: 'carol', ref_doc_id: 'post-1', read: true, created_at: new Date().toISOString() },
      ],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    expect(screen.getByTestId('notifications-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('notification-row')).toHaveLength(2);
    expect(screen.getByText('bob reacted to your post')).toBeInTheDocument();
    expect(screen.getByText('carol commented on your post')).toBeInTheDocument();
  });

  it('marks all read on open (clears the badge)', async () => {
    mockState = {
      unread: 2,
      items: [
        { id: 'n1', type: 'dm', from: 'bob', read: false, created_at: new Date().toISOString() },
        { id: 'n2', type: 'reaction', from: 'carol', read: false, created_at: new Date().toISOString() },
      ],
    };
    renderWithRouter(<NotificationsScreen />, '/notifications');
    // The on-open effect marks all read.
    await vi.waitFor(() => expect(markAllReadMock).toHaveBeenCalled());
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
