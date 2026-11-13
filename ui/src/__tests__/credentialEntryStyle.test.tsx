import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LoginForm from '../components/CredentialPage/LoginForm';
import CredentialPage from '../components/CredentialPage/CredentialPage';

const harness = (overrides = {}) => ({
  mode: 'login', config: { REACT_APP_DEFAULT_API: 'api.example' },
  rememberedAccounts: [{ username: 'alice', provider: 'api.example' }],
  login: vi.fn(), setMode: vi.fn(), setLoginUsername: vi.fn(),
  ...overrides,
});

describe('credential entry presentation', () => {
  beforeEach(() => window.history.replaceState(null, '', '/?consent=1&redirect=keep'));

  it('puts signup before accounts and does not promote unavailable phone/email sign-in', () => {
    render(<LoginForm I={harness()} embedded continueAction={<button>Continue as alice</button>} />);
    expect(screen.getByTestId('account-picker')).toBeVisible();
    expect(screen.getByTestId('login-submit')).not.toBeVisible();
    expect(screen.queryByTestId('login-contact-cta')).toBeNull();
    expect(screen.getByTestId('login-create-account')).toBeVisible();
    const other = screen.getByRole('button', { name: 'Use another account' });
    expect(other.className).toContain('border-border');
    expect(other.className).toContain('text-foreground');
    expect(other.className).toContain('min-h-16');
    expect(other.querySelector('svg')).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create an account' });
    expect(create.className).toContain('w-full');
    expect(create.className).toContain('border-brand/50');
    expect(create.className).toContain('bg-brand-muted/30');
    expect(create.querySelector('svg')).toBeTruthy();
    expect(create.compareDocumentPosition(screen.getByTestId('account-picker')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('reveals the password form, focuses username and preserves consent/redirect URL context', () => {
    const I = harness();
    render(<LoginForm I={I} embedded />);
    fireEvent.click(screen.getByTestId('account-picker-other'));
    expect(screen.getByTestId('username-input')).toHaveFocus();
    expect(screen.getByTestId('account-picker')).not.toBeVisible();
    expect(screen.getByTestId('login-submit')).toBeVisible();
    const url = new URL(window.location.href);
    expect(url.searchParams.get('signin')).toBe('password');
    expect(url.searchParams.get('redirect')).toBe('keep');
    expect(url.searchParams.has('consent')).toBe(true);
    expect(I.login).not.toHaveBeenCalled();
  });

  it('shows contact methods only inside add-account entry, explicitly disabled as coming soon', () => {
    const I = harness();
    render(<LoginForm I={I} embedded />);
    expect(screen.queryByTestId('login-email-coming-soon')).toBeNull();
    expect(screen.queryByTestId('login-phone-coming-soon')).toBeNull();
    fireEvent.click(screen.getByTestId('account-picker-other'));
    for (const method of ['email', 'phone']) {
      const button = screen.getByTestId(`login-${method}-coming-soon`);
      expect(button).toBeVisible();
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Coming soon');
      fireEvent.click(button);
    }
    expect(I.setMode).not.toHaveBeenCalled();
    expect(I.login).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-submit')).toBeVisible();
  });

  it('non-vaulted selection focuses password and submits the exact existing fields', () => {
    const I = harness();
    render(<LoginForm I={I} embedded />);
    fireEvent.click(screen.getByTestId('account-picker-alice'));
    expect(screen.getByTestId('password-input')).toHaveFocus();
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'synthetic-password' } });
    fireEvent.submit(screen.getByTestId('login-submit').closest('form')!);
    expect(I.login).toHaveBeenCalledWith('api.example', 'alice', 'synthetic-password');
  });

  it('password deep links survive remount and popstate restores the account view', () => {
    window.history.replaceState(null, '', '/?signin=password&consent=1');
    render(<LoginForm I={harness()} embedded />);
    expect(screen.getByTestId('login-submit')).toBeVisible();
    act(() => {
      window.history.replaceState(null, '', '/?consent=1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('account-picker')).toBeVisible();
    expect(screen.getByTestId('login-submit')).not.toBeVisible();
  });

  it('cold visitors retain password-manager fields and readable server identity', () => {
    render(<LoginForm I={harness({ rememberedAccounts: [] })} />);
    expect(screen.getByTestId('username-input')).toBeVisible();
    expect(screen.getByTestId('username-input')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByTestId('password-input')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Account server')).toHaveValue('api.example');
    expect(screen.queryByText(/1–30/)).toBeNull();
  });

  it('signup is URL-owned, has human-facing copy and retains explicit registration', () => {
    const I = harness({ rememberedAccounts: [] });
    render(<CredentialPage I={I} />);
    fireEvent.click(screen.getByTestId('login-create-account'));
    expect(new URL(window.location.href).searchParams.get('credential')).toBe('signup');
    expect(screen.getByRole('heading', { name: 'Create your account.' })).toBeVisible();
    expect(screen.getByTestId('signup-submit')).toBeVisible();
    expect(I.setMode).toHaveBeenCalledWith('signup');
    act(() => {
      window.history.replaceState(null, '', '/?consent=1&redirect=keep');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('login-create-account')).toBeVisible();
  });

  it('does not retain signup locally after successful authentication cleaned the URL', () => {
    window.history.replaceState(null, '', '/?credential=signup');
    const I = harness({ rememberedAccounts: [] });
    const { rerender } = render(<CredentialPage I={I} />);
    expect(screen.getByTestId('signup-submit')).toBeVisible();
    window.history.replaceState(null, '', '/');
    rerender(<CredentialPage I={I} />);
    expect(screen.getByTestId('login-submit')).toBeVisible();
    expect(screen.queryByTestId('signup-submit')).toBeNull();
  });
});
