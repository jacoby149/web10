import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

import { Toaster, toast, errorMessage } from '@/components/shared/Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an error toast with the real reason and role=alert', () => {
    render(<Toaster />);
    act(() => {
      toast.error('No app contract for https://social.dev.web10.app to create on web10-social-group-identity');
    });
    const el = screen.getByTestId('toast-error');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('role', 'alert');
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
