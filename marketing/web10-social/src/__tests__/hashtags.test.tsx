import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { hashtagMatches, defaultHashtagHref } from '@web10/discover/hashtags';
import { hashtagTexts } from '@/data/hashtags';
import { PostBody, PostBodyInline } from '@/components/Feed/PostBody';
import { MarkdownText } from '../../../shared/discover/src/MarkdownText';

describe('hashtags: one prose pattern and both renderers', () => {
  it('normalizes, deduplicates and separates machine words from prose', () => {
    expect(hashtagTexts('#Walking #walking (#AD) #short #video #music #product #node_ad')).toEqual(['walking', 'ad', 'short', 'video', 'music', 'product', 'node_ad']);
    expect(hashtagMatches('a#bad user#email@example.com https://x/#url #walk-king #123 #_')).toEqual([
      expect.objectContaining({ hashtag: 'walk' }), expect.objectContaining({ hashtag: '123' }), expect.objectContaining({ hashtag: '_' }),
    ]);
  });
  it('never truncates long runs and supports the exact 30-character boundary', () => {
    expect(hashtagTexts(`#${'a'.repeat(31)} #${'b'.repeat(30)}`)).toEqual(['b'.repeat(30)]);
  });
  it.each([
    '`#code`', '```\n#fence\n```', '## Heading #heading', '#heading\n===',
    '[#label](https://example.com/#url)', '![#image](x)', '<div> #html </div>',
    'https://example.com/#url', '<span title="#attribute">x</span>',
  ])('does not index or render excluded markdown: %s', text => {
    expect(hashtagTexts(text)).toEqual([]);
    const view = render(<PostBody text={text} />);
    expect(view.container.querySelector('[data-testid="post-body-hashtag"]')).toBeNull();
  });
  it.each(['full', 'light', 'inline'])('renders a safe internal hashtag at %s density with original casing', density => {
    const text = 'Hi @nova — #Walking **#night_walk**';
    const view = render(density === 'inline' ? <PostBodyInline text={text} /> : <PostBody text={text} density={density as 'full' | 'light'} />);
    const links = [...view.container.querySelectorAll('[data-testid="post-body-hashtag"]')];
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/tag/walking', '/tag/night_walk']);
    expect(links[0]).toHaveTextContent('#Walking');
    expect(links[0]).not.toHaveAttribute('target', '_blank');
    expect(view.container.querySelector('a[href="/u/nova"]')).toBeTruthy();
  });
  it('routes a tap without reloading and supports browser modifier navigation', () => {
    function Location() { return <output>{useLocation().pathname}</output>; }
    const openPost = vi.fn();
    render(<MemoryRouter><div onClick={openPost}><PostBody text="#Walking" /></div><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: '#Walking' }));
    expect(screen.getByRole('status')).toHaveTextContent('/tag/walking');
    expect(openPost).not.toHaveBeenCalled();
  });
  it('keeps shared consumers inert unless opted in; isolates a social comment tap', () => {
    const inert = render(<MarkdownText text="#walking" />);
    expect(inert.container.querySelector('a')).toBeNull();
    inert.unmount();
    const navigate = vi.fn(); const bubble = vi.fn();
    render(<div onClick={bubble}><MarkdownText text="#Walking" hashtagHref={defaultHashtagHref} onHashtagClick={navigate} /></div>);
    const link = screen.getByRole('link', { name: '#Walking' });
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('walking');
    expect(bubble).not.toHaveBeenCalled();
    navigate.mockClear();
    fireEvent.click(link, { metaKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });
});
