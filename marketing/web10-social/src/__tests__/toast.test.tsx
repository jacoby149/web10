import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);
const login = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/interfaces/auth', () => ({ getSocialAuth: () => ({ login }) }));

import { Toaster, toast, errorMessage } from '@/components/shared/Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    login.mockReset().mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('explains missing approval, offers recovery, and keeps the exact reason in details', () => {
    render(<Toaster />);
    act(() => {
      toast.error('No app contract for https://social.dev.web10.app to create on web10-social-group-identity');
    });
    const el = screen.getByTestId('toast-error');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('role', 'alert');
    expect(el).toHaveTextContent('This app needs your approval');
    expect(screen.getByRole('button', { name: 'Allow access' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(el).toBeInTheDocument(); // an actionable approval request must not vanish
    expect(el).toHaveTextContent('No app contract for https://social.dev.web10.app to create on web10-social-group-identity');
  });

  it('success toasts use role=status, not alert', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Post published');
    });
    const el = screen.getByTestId('toast-success');
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveTextContent('Post published');
  });

  it('shows the exact arbitrary service in code and opens approval only on a tap', () => {
    render(<Toaster />);
    act(() => { toast.error('No app contract for https://app.example to create on recipes'); });
    expect(screen.getByText('recipes', { selector: 'code' })).toBeVisible();
    expect(login).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow access' }));
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/return and try again/)).toBeVisible();
  });

  it('offers sign-in recovery for a caught dead-token failure, including a blocked popup', () => {
    login.mockReturnValue(false);
    render(<Toaster />);
    act(() => { toast.error('incorrect token'); });
    act(() => { vi.advanceTimersByTime(10000); });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(screen.getByText(/Allow pop-ups/)).toBeVisible();
    expect(screen.getByTestId('toast-error')).toBeInTheDocument();
  });

  it('auto-dismisses after the timeout', () => {
    render(<Toaster />);
    act(() => {
      toast.error('boom');
    });
    expect(screen.getByTestId('toast-error')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByTestId('toast-error')).toBeNull();
  });

  it('can be dismissed manually', () => {
    render(<Toaster />);
    act(() => {
      toast.error('boom');
    });
    fireEvent.click(screen.getByTestId('toast-dismiss'));
    expect(screen.queryByTestId('toast-error')).toBeNull();
  });

  it('caps the visible toasts at three (oldest drop off)', () => {
    render(<Toaster />);
    act(() => {
      toast.error('one');
      toast.error('two');
      toast.error('three');
      toast.error('four');
    });
    const toasts = screen.getAllByTestId('toast-error');
    expect(toasts).toHaveLength(3);
    // The oldest ("one") dropped off; the newest three remain.
    expect(screen.queryByText('one')).toBeNull();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('four')).toBeInTheDocument();
  });
});

describe('errorMessage', () => {
  it('prefers the Error message (the API detail)', () => {
    expect(errorMessage(new Error('invalid credentials'), 'fallback')).toBe('invalid credentials');
  });
  it('falls back for a non-Error rejection', () => {
    expect(errorMessage(undefined, 'Something went wrong. Try again.')).toBe('Something went wrong. Try again.');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
  });
  it('uses a plain string rejection as-is', () => {
    expect(errorMessage('network down', 'fallback')).toBe('network down');
  });
});
