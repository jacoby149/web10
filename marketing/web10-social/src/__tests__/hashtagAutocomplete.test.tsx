import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MentionInput } from '@/components/shared/MentionInput';
import { hashtagToken } from '@/components/shared/HashtagAutocomplete';

const { search, mentions } = vi.hoisted(() => ({ search: vi.fn(), mentions: vi.fn() }));
vi.mock('@/data/hashtagSearch', async original => ({ ...await original<object>(), searchHashtags: search }));
vi.mock('@/data/mentionSearch', () => ({ searchMentionPeople: mentions }));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ readToken: () => ({ username: 'me', provider: 'node' }) }) }));
const items = [{ hashtag: 'music', postCount: 100000 }, { hashtag: 'musician', postCount: 200000 }];
function Input({ scope = 'post' }: { scope?: string }) {
  const [value, onChange] = useState('');
  return <form onSubmit={e => { e.preventDefault(); throw new Error('Completion submitted the draft'); }}><MentionInput value={value} onChange={onChange} scope={scope} placeholder="Comment" disabled={false} /></form>;
}
beforeEach(() => { search.mockReset(); mentions.mockReset(); search.mockResolvedValue(items); });

describe('hashtag autocomplete', () => {
  it('opens for a bare # and shows compact counts with exact accessible counts', async () => {
    render(<Input />);
    fireEvent.change(screen.getByTestId('comment-input'), { target: { value: '#' } });
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Finding hashtags');
    await waitFor(() => expect(search).toHaveBeenCalled());
    const option = await screen.findByRole('option', { name: '#music 100,000 public posts' });
    expect(option).toHaveTextContent('100K posts');
    expect(search).toHaveBeenCalledWith('', expect.any(AbortSignal), expect.any(Function));
    expect(mentions).not.toHaveBeenCalled();
  });
  it('completes the whole token at a middle caret, preserves prose/focus and creates no mention markup', async () => {
    render(<Input />); const input = screen.getByTestId('comment-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hello #MuS friends', selectionStart: 8, selectionEnd: 8 } });
    fireEvent.click(await screen.findByRole('option', { name: '#music 100,000 public posts' }));
    expect(input).toHaveValue('Hello #music friends'); expect(input.selectionStart).toBe(13); expect(input).toHaveFocus();
    expect(search).toHaveBeenCalledWith('mus', expect.any(AbortSignal), expect.any(Function));
  });
  it('supports Arrow/Enter/Tab and Escape without publishing or disturbing @ completion', async () => {
    render(<Input />); const input = screen.getByTestId('comment-input');
    fireEvent.change(input, { target: { value: '#mus' } });
    await screen.findByRole('option', { name: '#music 100,000 public posts' });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('#musician ');
    fireEvent.change(input, { target: { value: '#mus' } });
    await screen.findByRole('option', { name: '#music 100,000 public posts' });
    fireEvent.keyDown(input, { key: 'Escape' }); expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.change(input, { target: { value: '#music' } });
    await screen.findByRole('option', { name: '#music 100,000 public posts' }); fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('#music ');
    mentions.mockResolvedValue([{ username: 'nova', displayName: 'Nova' }]);
    fireEvent.change(input, { target: { value: '#music @no' } });
    await screen.findByRole('option', { name: /Nova/ }); fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('#music @nova ');
  });
  it('keeps empty/new-hashtag and retryable failure distinct, retaining the draft', async () => {
    search.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    render(<Input />); const input = screen.getByTestId('comment-input');
    fireEvent.change(input, { target: { value: 'Hello #new' } });
    await screen.findByText("Couldn't find hashtags. Your draft is safe.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No matching hashtags yet. Keep typing to start a new one.');
    expect(input).toHaveValue('Hello #new');
  });
  it('suppresses IME and selected text and ignores stale scope/query replies', async () => {
    const view = render(<Input scope="one" />); const input = screen.getByTestId('comment-input');
    fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: '#mus' } });
    await act(async () => new Promise(r => setTimeout(r, 300))); expect(search).not.toHaveBeenCalled();
    let late!: (rows: typeof items) => void;
    search.mockImplementationOnce(() => new Promise(r => { late = r; }));
    fireEvent.compositionEnd(input); await waitFor(() => expect(search).toHaveBeenCalled());
    view.rerender(<Input scope="two" />);
    await screen.findByRole('option', { name: '#music 100,000 public posts' });
    await act(async () => late([{ hashtag: 'stale', postCount: 1 }])); expect(screen.queryByText('#stale')).toBeNull();
    fireEvent.select(input, { target: { selectionStart: 1, selectionEnd: 4 } }); expect(screen.queryByRole('listbox')).toBeNull();
  });
  it.each(['mail#music', 'word,#music', 'https://example.com/#music', '`#music', '[#music](url)', '# heading #music', `#${'a'.repeat(31)}`])('does not suggest in non-tag context %s', text => {
    expect(hashtagToken(text, text.length)).toBeNull();
  });
});
