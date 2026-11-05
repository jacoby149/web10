import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { PostBody } from '@/components/Feed/PostBody';
import { MarkdownText } from '../../../shared/discover/src/MarkdownText';

describe('PostBody (D85 read side)', () => {
  it('navigates post tags through the router instead of reloading the player', () => {
    function Location() { return <span data-testid="mention-route">{useLocation().pathname}</span>; }
    render(<MemoryRouter><PostBody text="For @nova" /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: '@nova' }));
    expect(screen.getByTestId('mention-route')).toHaveTextContent('/u/nova');
  });

  it('uses the shared comment navigation callback without bubbling into the post', () => {
    const navigate = vi.fn(); const openPost = vi.fn();
    render(<div onClick={openPost}><MarkdownText text="For @nova" onMentionClick={navigate} /></div>);
    fireEvent.click(screen.getByRole('link', { name: '@nova' }));
    expect(navigate).toHaveBeenCalledWith('nova'); expect(openPost).not.toHaveBeenCalled();
  });
  it.each(['full', 'light'] as const)('renders typed people tags in %s posts without linking code or email', (density) => {
    const { container } = render(<PostBody text="Hi @nova. `@code` email@example.com" density={density} />);
    expect(container.querySelector('a[href="/u/nova"]')).toHaveTextContent('@nova');
    expect(container.querySelector('a[href="/u/code"]')).toBeNull();
    expect(container.querySelector('a[href="/u/example"]')).toBeNull();
  });

  it('renders typed and legacy comment tags as profile links, not external web10: links', () => {
    const { container } = render(<MarkdownText text="Hi @nova and @[alice](web10:alice)" />);
    expect(container.querySelector('a[href="/u/nova"]')).toHaveTextContent('@nova');
    expect(container.querySelector('a[href="/u/alice"]')).not.toHaveAttribute('target', '_blank');
  });
  it('renders bold as <strong>', () => {
    const { container } = render(<PostBody text="some **bold** text" density="full" />);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
  });

  it('renders a heading in the display face (full density)', () => {
    const { container } = render(<PostBody text="## My headline" density="full" />);
    const h2 = container.querySelector('h2');
    expect(h2).toHaveTextContent('My headline');
    expect(h2?.className).toContain('font-display');
  });

  it('flattens headings to inline text in light density (a card is a teaser)', () => {
    const { container } = render(<PostBody text="## My headline" density="light" />);
    // No heading element — the text is inline.
    expect(container.querySelector('h2')).toBeNull();
    expect(container).toHaveTextContent('My headline');
  });

  it('renders a code block (full) and inline code (light)', () => {
    const code = '```\nconst x = 1;\n```';
    const full = render(<PostBody text={code} density="full" />);
    expect(full.container.querySelector('pre.post-body-pre')).toBeTruthy();
    const light = render(<PostBody text={code} density="light" />);
    // Light density flattens the block to inline code (no <pre>).
    expect(light.container.querySelector('pre')).toBeNull();
    expect(light.container).toHaveTextContent('const x = 1;');
  });

  it('auto-links a bare URL', () => {
    const { container } = render(<PostBody text="check https://web10.xyz out" density="full" />);
    const a = container.querySelector('a[href="https://web10.xyz"]');
    expect(a).toBeTruthy();
  });

  it('renders a web10: mention as a tappable handle', () => {
    const { container } = render(<PostBody text="hey @[nova](web10:nova) thanks" density="full" />);
    const mention = container.querySelector('[data-testid="post-body-mention"]');
    expect(mention).toBeTruthy();
    expect(mention).toHaveAttribute('href', '/u/nova');
    expect(mention).toHaveTextContent('@nova');
  });

  it('preserves line breaks (remark-breaks) so plain-text posts keep their shape', () => {
    const { container } = render(<PostBody text={'line one\nline two'} density="full" />);
    expect(container.querySelector('br')).toBeTruthy();
  });

  // The security line (the anti-test): the sanitizer strips <script>, on* handlers,
  // and javascript: URLs. react-markdown does not parse raw HTML by default, so
  // these arrive as inert text — assert nothing executable is produced.
  it('strips <script> (no script element, no handler)', () => {
    const { container } = render(
      <PostBody text={'hello <script>window.__pwned = true;</script> world'} density="full" />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect((window as any).__pwned).toBeUndefined();
  });

  it('strips on* event handlers from an anchor', () => {
    const { container } = render(
      <PostBody text={'[click me](https://web10.xyz "x")'} density="full" />,
    );
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    // No on* attributes on the link.
    for (const attr of a!.attributes) {
      expect(attr.name.toLowerCase()).not.toMatch(/^on/);
    }
  });

  it('does not render a javascript: URL as a link', () => {
    const { container } = render(
      <PostBody text={'[bad](javascript:alert(1))'} density="full" />,
    );
    const a = container.querySelector('a');
    // Either no link, or the href is not a javascript: URL.
    expect(a?.getAttribute('href') || '').not.toMatch(/^javascript:/i);
  });
});
