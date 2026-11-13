import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ComposerProvider, useComposer } from '@/context/ComposerContext';
import { PersonalProfileContext } from '@/context/PersonalProfileContext';
import PostEntryPrompt from '@/components/Feed/PostEntryPrompt';

const state = vi.hoisted(() => ({ signedIn: true, track: vi.fn() }));
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: () => state.signedIn ? { username: 'alice' } : null }) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: state.track }));
function Probe() { const composer = useComposer(); return <output>{composer.composerOpen ? 'Composer open' : 'Composer closed'}</output>; }

describe('Posts stream invitation', () => {
  beforeEach(() => { state.signedIn = true; state.track.mockClear(); });
  afterEach(cleanup);

  it('uses personal chrome and opens the existing composer without an inline editor', () => {
    render(<ComposerProvider><PersonalProfileContext.Provider value={{ name: 'Alice', avatarUrl: 'https://media.test/alice.jpg' }}><PostEntryPrompt /><Probe /></PersonalProfileContext.Provider></ComposerProvider>);
    const prompt = screen.getByTestId('post-entry-prompt');
    expect(prompt.querySelector('img')).toHaveAttribute('src', 'https://media.test/alice.jpg');
    expect(screen.getByText('Share something! :)')).toBeInTheDocument();
    expect(prompt.querySelector('input,textarea,[contenteditable]')).toBeNull();
    expect(screen.getByText('Composer closed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create a post' }));
    expect(screen.getByText('Composer open')).toBeInTheDocument();
    expect(state.track).toHaveBeenCalledWith('new_post_open');
  });

  it('does not offer posting to signed-out readers', () => {
    state.signedIn = false;
    render(<PostEntryPrompt />);
    expect(screen.queryByTestId('post-entry-prompt')).not.toBeInTheDocument();
  });
});
