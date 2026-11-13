import { useEffect, useId, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const QUICK_COUNT = 6;
const PAGE_SIZE = 40;
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const LOG = (...args: unknown[]) => console.log('[social:topics]', ...args);

/** A bounded top rail and URL-owned picker over the loaded feed, not a global index. */
export function TopicFilter({ topics, activeTag }: { topics: string[]; activeTag: string }) {
  const [params, setParams] = useSearchParams();
  const open = params.get('topics') === '1';
  const query = params.get('topicQuery') || '';
  const pool = useMemo(() => [...new Set(topics.filter(topic => topic && topic !== 'All'))].sort(), [topics]);
  const quick = pool.slice(0, QUICK_COUNT);
  const chips = ['All', ...(activeTag !== 'All' ? [activeTag] : []), ...quick.filter(topic => topic !== activeTag)];
  const filtered = useMemo(() => {
    const needle = query.trim().replace(/^#/, '').toLowerCase();
    return pool.filter(topic => topic.toLowerCase().includes(needle));
  }, [pool, query]);
  const rawPage = Number(params.get('topicPage') || 1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1, pageCount);
  const results = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const panelId = useId();
  const inputId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [page, query]);
  useEffect(() => { if (rail.current) rail.current.scrollLeft = 0; }, [activeTag]);

  function close() {
    LOG('picker close');
    setParams(previous => { const next = new URLSearchParams(previous); next.delete('topics'); next.delete('topicQuery'); next.delete('topicPage'); return next; });
  }
  function select(topic: string) {
    LOG('filter selected');
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (topic === 'All') next.delete('tag'); else next.set('tag', topic);
      next.delete('topics'); next.delete('topicQuery'); next.delete('topicPage');
      return next;
    });
  }
  function changePage(nextPage: number) {
    LOG('picker page', { page: nextPage });
    setParams(previous => { const next = new URLSearchParams(previous); next.set('topicPage', String(nextPage)); return next; });
  }

  return <div data-testid="topic-filter" onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="flex min-w-0 items-center gap-2">
      <div ref={rail} role="tablist" aria-label="Filter by topic" className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next]?.focus(); tabs[next]?.click();
        }}>
        {chips.map(topic => <button key={topic} type="button" role="tab" aria-selected={topic === activeTag}
          tabIndex={topic === activeTag ? 0 : -1} data-testid="discover-topic" onClick={() => select(topic)} title={topic === 'All' ? 'All' : `#${topic}`}
          className={cn('min-h-11 max-w-40 shrink-0 truncate rounded-full border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            topic === activeTag ? 'border-brand bg-brand-muted text-brand-300' : 'border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-elevated')}>
          {topic === 'All' ? 'All' : `#${topic}`}
        </button>)}
      </div>
      {(pool.length > QUICK_COUNT || open) && <Button ref={trigger} variant="outline" className={cn('min-h-11 shrink-0 gap-2 rounded-full', FOCUS)} aria-expanded={open} aria-controls={panelId}
        data-testid="browse-topics" onClick={() => { if (open) close(); else { LOG('picker open', { count: pool.length }); setParams(previous => { const next = new URLSearchParams(previous); next.set('topics', '1'); return next; }); } }}>
        <Search className="h-4 w-4" /><span className="sm:hidden">Topics</span><span className="hidden sm:inline">Browse topics</span>
      </Button>}
    </div>
    {open && <section id={panelId} aria-label="Browse feed topics" className="mt-3 overflow-hidden rounded-lg border border-border bg-card" data-testid="topic-picker">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div><h2 className="font-semibold text-foreground">Topics in this feed</h2><p className="mt-1 text-xs text-muted-foreground">Search {pool.length.toLocaleString()} topics from loaded posts.</p></div>
        <Button variant="ghost" size="icon" className={cn('h-11 w-11 shrink-0', FOCUS)} aria-label="Close topic picker" onClick={close}><X className="h-4 w-4" /></Button>
      </div>
      <div className="px-4 pb-3"><label htmlFor={inputId} className="mb-2 block text-sm font-medium text-foreground">Find a topic</label>
        <Input ref={input} id={inputId} type="search" placeholder="Search hashtags…" value={query} className={cn('min-h-11', FOCUS)} onChange={event => {
          const value = event.target.value;
          setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set('topicQuery', value); else next.delete('topicQuery'); next.delete('topicPage'); return next; }, { replace: true });
        }} />
      </div>
      <div ref={list} className="max-h-72 overflow-y-auto overscroll-contain border-t border-border" data-testid="topic-results">
        {results.map(topic => <button key={topic} type="button" aria-pressed={topic === activeTag} onClick={() => select(topic)} data-testid="topic-result"
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <span className="min-w-0 truncate" title={`#${topic}`}>#{topic}</span>{topic === activeTag && <Check className="h-4 w-4 shrink-0 text-brand-300" />}
        </button>)}
        {!results.length && <div className="px-4 py-8 text-center"><p className="text-sm font-medium text-foreground">No matching topics</p><p className="mt-2 text-xs text-muted-foreground">Try another name. Only topics in the loaded feed appear here.</p></div>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
        <span role="status" className="text-xs text-muted-foreground">{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length.toLocaleString()}` : '0 results'}</span>
        <div className="flex gap-1"><Button variant="ghost" size="icon" className={cn('h-11 w-11', FOCUS)} aria-label="Previous topics" disabled={page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className={cn('h-11 w-11', FOCUS)} aria-label="Next topics" disabled={page >= pageCount} onClick={() => changePage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
      </div>
    </section>}
  </div>;
}
