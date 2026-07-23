import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Regression for "profile didn't load until I refresh" (reported live on dev).
// App.tsx registered its authListen -> setSignedIn(true) callback ONLY when the
// adapter was signed-out at mount. A returning user with a session cookie took
// the isSignedIn() branch and skipped registration; once they later logged out
// and logged back in via the popup, the popup's auth message fired the
// adapter's own syncDataLayerToken listener (so the cookie landed at social and
// a refresh recovered) but App's setSignedIn listener was never attached — so
// the UI stayed on LoginScreen after the popup closed.
//
// Fix: register authListen unconditionally. Setting already-current state is a
// React no-op, so signing it on the signed-in path is safe.

// Stub the modules App pulls in; only the adapter's authListen/isSignedIn
// behavior matters here. Icons + data layer must exist (the import forces it)
// but never fire on the login screen.
const iconFactory = (name: string) => {
  const Comp = (props: Record<string, unknown>) => {
    const { ...rest } = props;
    return <span data-testid={`icon-${name.toLowerCase()}`} {...rest} />;
  };
  Comp.displayName = name;
  return Comp;
};
const icons = [
  'Home', 'User', 'MessageSquare', 'PlusCircle', 'LogOut', 'Bug',
  'AlertTriangle', 'CheckCircle', 'Heart', 'MessageCircle', 'ArrowUp',
  'ArrowDown', 'Flame', 'Clock', 'ClockArrowDown', 'Sparkles', 'Send',
  'Image', 'ImagePlus', 'X', 'Loader2', 'MapPin', 'Globe', 'Link',
  'Camera', 'Edit3', 'Check', 'ChevronLeft',
];
vi.mock('lucide-react', () => Object.fromEntries(icons.map(n => [n, iconFactory(n)])));

vi.mock('@/data', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    readProfile: vi.fn().mockResolvedValue(null),
    readMyPosts: vi.fn().mockResolvedValue([]),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
  createWapiWrapper: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    isSignedIn: vi.fn().mockReturnValue(false),
    signOut: vi.fn(),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
    setToken: vi.fn(),
  }),
  resetWapi: vi.fn(),
}));

// The adapter mock is parameterized per-test below via the shared builder.
let isSignedInReturn = false;
let authListenCb: (() => void) | null = null;
const adapter = {
  isSignedIn: () => isSignedInReturn,
  authListen: vi.fn((cb: () => void) => { authListenCb = cb; }),
  signOut: vi.fn(),
  login: vi.fn(),
  openAuthPortal: vi.fn(),
  readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  SMROnReady: vi.fn(),
};

vi.mock('web10-npm', () => ({
  wapiInit: vi.fn().mockReturnValue(adapter),
}));

describe('App authListen registration regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSignedInReturn = false;
    authListenCb = null;
  });

  it('registers authListen when signed-out at mount (preserved behavior)', async () => {
    isSignedInReturn = false;
    const { default: App } = await import('@/App');
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-button')).toBeInTheDocument());
    expect(adapter.authListen).toHaveBeenCalled();
  });

  it('STILL registers authListen when signed-in at mount (the fix)', async () => {
    isSignedInReturn = true;
    const { default: App } = await import('@/App');
    render(<App />);
    // When signed-in at mount the login screen isn't rendered, but the
    // authListen hook MUST still have been called — otherwise a later
    // logout/login popup can't flip state without a page refresh.
    await waitFor(() => expect(adapter.authListen).toHaveBeenCalled());
  });

  it('later login popup flips signedIn -> feed (no refresh needed)', async () => {
    isSignedInReturn = false; // signed out at mount: login screen visible
    const { default: App } = await import('@/App');
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-button')).toBeInTheDocument());

    // Sanity: still on login screen.
    expect(screen.queryByText('Log out')).toBeNull();

    // The popup completes auth and fires the stored authListen callback.
    expect(authListenCb).toBeTruthy();
    fireEvent.click(screen.getByTestId('login-button')); // adapter.login() opens popup; not asserted
    authListenCb!(); // popup posts auth message

    // The user is now signed in: Log out is reachable in the Layout nav.
    await waitFor(() => expect(screen.queryByText('Log out')).not.toBeNull());
  });
});