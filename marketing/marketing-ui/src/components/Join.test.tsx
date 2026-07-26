import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('Join page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());
  });

  it('renders the headline', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByText('Never miss a post from your favorite creator again.')).toBeInTheDocument();
  });

  it('renders the fan-first pitch', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByText(/You see 100% of what they make/)).toBeInTheDocument();
  });

  it('renders the aspirant pitch', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByText("You're not joining the crowd.")).toBeInTheDocument();
    expect(screen.getByText(/You get your own page here too/)).toBeInTheDocument();
  });

  it('renders the Rise arc steps', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByText('Start broke, start free.')).toBeInTheDocument();
    expect(screen.getByText('Post. Your number is real.')).toBeInTheDocument();
    expect(screen.getByText('Get known in the scene.')).toBeInTheDocument();
    expect(screen.getByText('Pop off.')).toBeInTheDocument();
    expect(screen.getByText('Graduate.')).toBeInTheDocument();
  });

  it('renders the safety line', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByText('Delete means delete.')).toBeInTheDocument();
  });

  it('renders the ownership line', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByText('Your creator owns the building.')).toBeInTheDocument();
  });

  it('renders the founding member line', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByText('You found this place early.')).toBeInTheDocument();
  });

  it('renders two-step join flow in hero and footer', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByTestId('join-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('join-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('join-step-1-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('join-step-2-bottom')).toBeInTheDocument();
  });

  it('step 1 links to social app', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    const step1 = screen.getByTestId('join-step-1');
    expect(step1).toHaveAttribute('href', expect.stringContaining('social.web10'));
    expect(step1).toHaveAttribute('target', '_blank');
  });

  it('step 2 links to signup', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    const step2 = screen.getByTestId('join-step-2');
    expect(step2).toHaveAttribute('href', expect.stringContaining('auth.web10'));
    expect(step2).toHaveAttribute('target', '_blank');
  });

  it('renders step labels', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getAllByText('Get the app')).toHaveLength(2);
    expect(screen.getAllByText('Create your account')).toHaveLength(2);
  });

  it('renders nav links in footer', async () => {
    const { default: Join } = await import('@/pages/Join');
    render(<Join />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trending' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
  });
});