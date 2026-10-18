import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);
import { Top10Sidebar } from '@web10/discover';
import type { Top10SidebarEntry } from '@web10/discover';

// The shared Top 10 rail (D73) — the one both apps' discover surfaces compose
// (the marketing /trending `TrendingSidebar` + the social `HotGossipSidebar`
// are thin wrappers over it, so the two rails can't drift).

const entries: Top10SidebarEntry[] = [
  { id: 'p1', name: 'Jacob Hoffman', text: 'shemoneeh', score: 12, rank: 1 },
  { id: 'p2', name: 'samhanks', text: 'Watch out new phemon in the scene', score: 5, rank: 2 },
  { id: 'p3', name: 'noodle-empress', text: 'Found a ramen shop that does the thing', score: 0, rank: 3 },
];

describe('Top10Sidebar (the shared rail)', () => {
  it('renders the ranked list with the per-entry testid', () => {
    render(<Top10Sidebar entries={entries} onSelect={() => {}} testId="top10-sidebar" />);
    const sidebar = screen.getByTestId('top10-sidebar');
    expect(sidebar).toHaveAttribute('aria-label', 'Top 10 trending posts');
    expect(screen.getAllByTestId('top10-sidebar-entry')).toHaveLength(3);
  });

  it('shows the rank, the author, the text, and the engagement tally', () => {
    render(<Top10Sidebar entries={entries} onSelect={() => {}} testId="top10-sidebar" />);
    const first = screen.getAllByTestId('top10-sidebar-entry')[0];
    expect(first).toHaveTextContent('1');
    expect(first).toHaveTextContent('Jacob Hoffman');
    expect(first).toHaveTextContent('shemoneeh');
    expect(first).toHaveTextContent('12');
  });

  it('renders a dash for a zero tally', () => {
    render(<Top10Sidebar entries={entries} onSelect={() => {}} testId="top10-sidebar" />);
    const third = screen.getAllByTestId('top10-sidebar-entry')[2];
    expect(third).toHaveTextContent('—');
  });

  it('compacts tallies at 1000+ (the shared formatCount)', () => {
    const big: Top10SidebarEntry[] = [{ id: 'p1', name: 'a', text: 'b', score: 12400, rank: 1 }];
    render(<Top10Sidebar entries={big} onSelect={() => {}} testId="top10-sidebar" />);
    expect(screen.getAllByTestId('top10-sidebar-entry')[0]).toHaveTextContent('12.4k');
  });

  it('calls onSelect with the post id on tap', () => {
    const onSelect = vi.fn();
    render(<Top10Sidebar entries={entries} onSelect={onSelect} testId="top10-sidebar" />);
    fireEvent.click(screen.getAllByTestId('top10-sidebar-entry')[1]);
    expect(onSelect).toHaveBeenCalledWith('p2');
  });

  it('renders nothing for an empty entry list', () => {
    render(<Top10Sidebar entries={[]} onSelect={() => {}} testId="top10-sidebar" />);
    expect(screen.queryByTestId('top10-sidebar')).not.toBeInTheDocument();
  });
});
