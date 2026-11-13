import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { TopicFilter } from '@/components/Discover/TopicFilter';

const topics = Array.from({ length: 1000 }, (_, index) => `topic_${String(index).padStart(4, '0')}`);
function Harness({ pool = topics }: { pool?: string[] }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  return <><TopicFilter topics={pool} activeTag={params.get('tag') || 'All'} /><code data-testid="topic-url">{location.search}</code><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></>;
}
function setup(url = '/feed', pool = topics) { return render(<MemoryRouter initialEntries={[url]}><Harness pool={pool} /></MemoryRouter>); }
function open() { fireEvent.click(screen.getByTestId('browse-topics')); }

describe('scalable feed topic controls', () => {
  it('keeps 1,000 topics out of the rail and mounts at most 40 picker rows', () => {
    setup();
    expect(screen.getAllByTestId('discover-topic')).toHaveLength(7);
    expect(screen.queryByTestId('topic-results')).not.toBeInTheDocument();
    open();
    expect(screen.getAllByTestId('topic-result')).toHaveLength(40);
    expect(screen.getByRole('status')).toHaveTextContent('1–40 of 1,000');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Next topics' }));
    expect(screen.getAllByTestId('topic-result')).toHaveLength(40);
    expect(screen.getByRole('status')).toHaveTextContent('41–80 of 1,000');
    expect(screen.getByTestId('topic-url')).toHaveTextContent('topicPage=2');
  });
  it('finds the thousandth topic, pins selection and preserves unrelated URL state', () => {
    setup('/feed?tab=discover&knobs=1,2,3,4,5&q=trail'); open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '#TOPIC_0999' } });
    expect(screen.getAllByTestId('topic-result')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '#topic_0999' }));
    expect(screen.queryByTestId('topic-picker')).not.toBeInTheDocument();
    const chip = screen.getByRole('tab', { name: '#topic_0999' });
    expect(chip).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('discover-topic')).toHaveLength(8);
    const url = screen.getByTestId('topic-url').textContent!;
    const params = new URLSearchParams(url);
    expect(params.get('tag')).toBe('topic_0999');
    expect(params.get('q')).toBe('trail'); expect(params.get('knobs')).toBe('1,2,3,4,5'); expect(params.get('tab')).toBe('discover');
    expect(params.has('topics')).toBe(false); expect(params.has('topicQuery')).toBe(false);
    expect(screen.getByTestId('browse-topics')).toHaveFocus();
  });
  it('restores picker/query/page on a deep link and through back/forward selection', () => {
    setup('/feed?topics=1&topicQuery=topic&topicPage=25');
    expect(screen.getByRole('searchbox')).toHaveValue('topic');
    expect(screen.getByRole('status')).toHaveTextContent('961–1000');
    fireEvent.click(screen.getByRole('button', { name: '#topic_0999' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('searchbox')).toHaveValue('topic');
    expect(screen.getByRole('status')).toHaveTextContent('961–1000');
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByRole('tab', { name: '#topic_0999' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('topic-picker')).not.toBeInTheDocument();
  });
  it('shows honest no-results and resets paging when search changes', () => {
    setup('/feed?topics=1&topicPage=20');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'does-not-exist' } });
    expect(screen.getByText('No matching topics')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 results');
    expect(screen.getByRole('button', { name: 'Next topics' })).toBeDisabled();
    expect(screen.getByTestId('topic-url')).not.toHaveTextContent('topicPage');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByRole('status')).toHaveTextContent('1–40');
  });
  it('supports Escape/Close focus restoration and quick-filter keyboard selection', () => {
    setup(); open(); fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByTestId('topic-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('browse-topics')).toHaveFocus();
    open(); fireEvent.click(screen.getByRole('button', { name: 'Close topic picker' }));
    expect(screen.getByTestId('browse-topics')).toHaveFocus();
    const all = screen.getByRole('tab', { name: 'All' }); all.focus();
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '#topic_0000' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: '#topic_0000' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(all).toHaveFocus(); expect(all).toHaveAttribute('aria-selected', 'true');
  });
  it.each(['garbage', '-1', '999999999', '1.5'])('bounds invalid/out-of-range pages: %s', raw => {
    setup(`/feed?topics=1&topicPage=${raw}`);
    expect(screen.getAllByTestId('topic-result')).toHaveLength(40);
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
  it('keeps a deep-linked topic visible even before its posts load, and All clears only the filter', () => {
    setup('/feed?tag=unloaded_topic&q=trail', []);
    expect(screen.getByRole('tab', { name: '#unloaded_topic' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByTestId('topic-url')).toHaveTextContent('?q=trail');
  });
  it('deduplicates topics and retains familiar chips without a picker for small sets', () => {
    setup('/feed', ['music', 'short', 'music']);
    expect(screen.getAllByTestId('discover-topic')).toHaveLength(3);
    expect(screen.queryByTestId('browse-topics')).not.toBeInTheDocument();
    expect(within(screen.getByRole('tablist')).getByRole('tab', { name: '#music' })).toBeInTheDocument();
  });
});
