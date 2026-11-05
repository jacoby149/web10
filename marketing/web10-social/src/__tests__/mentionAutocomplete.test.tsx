import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MentionInput } from '@/components/shared/MentionInput';
import { mentionToken } from '@/components/shared/MentionAutocomplete';

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/data/mentionSearch', () => ({ searchMentionPeople: search }));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ readToken: () => ({ username: 'me', provider: 'node' }) }) }));
const people = [{ username: 'nova', displayName: 'Nova Lane' }, { username: 'noah', displayName: 'Noah Reed' }];
function Input({ scope = 'post' }: { scope?: string }) {
  const [value, onChange] = useState('');
  return <form onSubmit={e => { e.preventDefault(); throw new Error('Suggestion selection submitted the form'); }}><MentionInput value={value} onChange={onChange} scope={scope} placeholder="Comment" disabled={false} /></form>;
}
beforeEach(() => { search.mockReset(); search.mockImplementation(async (_q, _signal, update) => { update(people); return people; }); });

describe('people autocomplete', () => {
  it('restores the caret even when choosing the same handle changes no text', async () => {
    render(<Input />);
    const input = screen.getByTestId('comment-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '@nova ', selectionStart: 3, selectionEnd: 3 } });
    await screen.findByRole('option', { name: /Nova Lane/ });
    fireEvent.click(screen.getByRole('option', { name: /Nova Lane/ }));
    expect(input).toHaveValue('@nova '); expect(input.selectionStart).toBe(6);
  });

  it('does not search during IME composition and opens after composition ends', async () => {
    render(<Input />);
    const input = screen.getByTestId('comment-input');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '@no' } });
    await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
    expect(search).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(await screen.findByRole('option', { name: /Nova Lane/ })).toBeVisible();
  });

  it('debounces a prefix and inserts the chosen exact handle without losing the surrounding draft', async () => {
    render(<Input />);
    const input = screen.getByTestId('comment-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hello @no and friends', selectionStart: 9, selectionEnd: 9 } });
    expect(search).not.toHaveBeenCalled();
    await screen.findByRole('option', { name: /Nova Lane/ });
    fireEvent.click(screen.getByRole('option', { name: /Nova Lane/ }));
    expect(input.value).toBe('Hello @nova and friends');
    expect(input.selectionStart).toBe(12);
    expect(input).toHaveFocus();
  });

  it('supports arrows, Enter/Tab selection and Escape dismissal without publishing', async () => {
    render(<Input />);
    const input = screen.getByTestId('comment-input');
    fireEvent.change(input, { target: { value: '@no' } });
    await screen.findByRole('option', { name: /Nova Lane/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('@noah ');
    fireEvent.change(input, { target: { value: '@no' } });
    await screen.findByRole('option', { name: /Nova Lane/ });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.change(input, { target: { value: '@nov' } });
    await screen.findByRole('option', { name: /Nova Lane/ });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('@nova ');
  });

  it('keeps loading, empty and failed searches distinct and retries without losing text', async () => {
    search.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    render(<Input />);
    fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'Hi @n' } });
    expect(screen.getByRole('status')).toHaveTextContent('Finding people');
    await screen.findByText("Couldn't find people. Your draft is safe.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No matching people. Try another name or handle.');
    expect(screen.getByTestId('comment-input')).toHaveValue('Hi @n');
  });

  it('ignores obsolete query and scope replies even when the transport ignores cancellation', async () => {
    let late!: (rows: typeof people) => void;
    search.mockImplementationOnce((_q, _signal, update) => new Promise(resolve => { late = rows => { update(rows); resolve(rows); }; }));
    const view = render(<Input scope="one" />);
    const input = screen.getByTestId('comment-input');
    fireEvent.change(input, { target: { value: '@old' } });
    await waitFor(() => expect(search).toHaveBeenCalled());
    view.rerender(<Input scope="two" />);
    fireEvent.change(input, { target: { value: '@no' } });
    await screen.findByRole('option', { name: /Nova Lane/ });
    await act(async () => late([{ username: 'stale', displayName: 'Stale Person' }]));
    expect(screen.queryByText('Stale Person')).toBeNull();
  });

  it.each(['mail@nova.com', 'https://example.com/@nova', '`@nova', '[@nova](url)'])('does not open in non-tag context %s', value => {
    expect(mentionToken(value, value.length)).toBeNull();
  });
});
