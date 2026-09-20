import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// S1 (global-search.md): the top-bar everything-search surface — the
// expanding-icon state machine: icon (rest) → expanded field → results →
// collapse. This is the SHELL only: the debounced query state, the results
// container (dropdown on desktop / full-screen view on mobile), and the
// "type to search" idle state. The three-way fan-out (people/groups/posts)
// and result rows land in S2 (src/data/search.ts + this component).

// The app's debounce idiom (feed/discover knob re-reads settle at 400ms).
const SEARCH_DEBOUNCE_MS = 400;
// design.md §7 — panels animate out at 150ms.
const COLLAPSE_MS = 150;

type GlobalSearchVariant = 'desktop' | 'mobile';

interface GlobalSearchProps {
  /**
   * desktop: slim top bar, field expands in place, results in a dropdown.
   * mobile: icon in the 56px header; open → full-screen results view with an
   * X (a dropdown from a 56px header over a scrollable screen + keyboard is
   * fiddly — the operator's call).
   */
  variant: GlobalSearchVariant;
}

export default function GlobalSearch({ variant }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(false);
  const { pathname } = useLocation();

  const clearCollapseTimer = () => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  };

  // Collapse: animate out (150ms), then reset to the icon (rest).
  const collapse = useCallback(() => {
    setClosing(true);
    clearCollapseTimer();
    collapseTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setQuery('');
      setDebouncedQuery('');
      collapseTimer.current = null;
    }, COLLAPSE_MS);
  }, []);

  const expand = () => {
    clearCollapseTimer();
    setClosing(false);
    setOpen(true);
  };

  // Clear a pending collapse if the component unmounts mid-animation.
  useEffect(() => clearCollapseTimer, []);

  // Focus lands in the field the moment it opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // When the search collapses, return focus to the trigger so keyboard users
  // land somewhere sane (design.md §11 — fully keyboard-operable). Runs after
  // the trigger remounts, so the ref is fresh in both variants.
  useEffect(() => {
    if (wasOpen.current && !open) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    } else if (open) {
      wasOpen.current = true;
    }
  }, [open]);

  // The debounced query (the app's 400ms idiom) — S2's fan-out reads this.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, open]);

  // Navigate → collapse (the state machine's fourth exit).
  useEffect(() => {
    if (open) collapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Desktop: click outside the bar → collapse.
  useEffect(() => {
    if (!open || variant !== 'desktop') return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) collapse();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, variant, collapse]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      collapse();
    }
  };

  const field = (sizeClass: string) => (
    <input
      ref={inputRef}
      data-testid="global-search-field"
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Search people, groups, posts…"
      aria-label="Search"
      autoComplete="off"
      spellCheck={false}
      className={cn(
        'flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground outline-none',
        sizeClass,
      )}
    />
  );

  // The results container content (S1: the shell's designed states — the
  // "type to search" idle + a skeleton slot the S2 fan-out fills).
  const resultsContent =
    debouncedQuery === '' ? (
      <div
        data-testid="global-search-type-to-search"
        className="flex items-center gap-3 px-4 py-8 text-sm text-muted-foreground"
      >
        <Search className="w-5 h-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>Type to search people, groups, and posts</span>
      </div>
    ) : (
      // S2 replaces this with the People/Groups/Posts sections (per-section
      // loading). Skeletons are the designed loading state in the meantime.
      <div data-testid="global-search-results-placeholder" className="px-4 py-3 space-y-3" aria-hidden="true">
        <div className="skeleton-shimmer h-10 rounded-lg" />
        <div className="skeleton-shimmer h-10 rounded-lg" />
        <div className="skeleton-shimmer h-10 rounded-lg" />
      </div>
    );

  if (variant === 'desktop') {
    return (
      <div ref={containerRef} className="relative flex-1 min-w-0 flex items-center h-14 px-4">
        {open ? (
          <div
            data-testid="global-search-field-wrap"
            className={cn(
              'flex items-center gap-2 flex-1 h-9 rounded-lg bg-elevated border border-input px-3 transition-colors duration-150',
              'focus-within:border-brand/60',
              !closing && 'animate-panel-in',
              closing && 'opacity-0 transition-opacity duration-150 ease-out',
            )}
          >
            <Search className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            {field('text-sm')}
            <button
              type="button"
              data-testid="global-search-close"
              aria-label="Close search"
              onClick={collapse}
              className="h-6 w-6 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            data-testid="global-search-trigger"
            aria-label="Search"
            aria-expanded={false}
            onClick={expand}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Search className="w-5 h-5" strokeWidth={1.75} />
          </button>
        )}
        {open && (
          <div
            data-testid="global-search-results"
            className={cn(
              'absolute top-full left-4 right-4 mt-1 rounded-lg border border-border bg-popover shadow-[0_8px_30px_rgb(0_0_0/0.35)] z-30 overflow-hidden',
              !closing && 'animate-panel-in',
              closing && 'opacity-0 transition-opacity duration-150 ease-out',
            )}
          >
            {resultsContent}
          </div>
        )}
      </div>
    );
  }

  // Mobile: the trigger sits inline in the 56px header; open → a full-screen
  // results view (not a dropdown) with an X to collapse. Portaled to <body>
  // because the header's backdrop-blur would become the fixed overlay's
  // containing block (backdrop-filter establishes one).
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="global-search-trigger"
        aria-label="Search"
        aria-expanded={open}
        onClick={expand}
        className="h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <Search className="w-5 h-5" strokeWidth={1.75} />
      </button>
      {open &&
        createPortal(
          <div
            data-testid="global-search-fullscreen"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className={cn(
              'fixed inset-0 z-50 flex flex-col bg-background',
              !closing && 'animate-overlay-in',
              closing && 'opacity-0 transition-opacity duration-150 ease-out',
            )}
          >
            <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
              <Search className="w-5 h-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              {field('text-base')}
              <button
                type="button"
                data-testid="global-search-close"
                aria-label="Close search"
                onClick={collapse}
                className="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <div data-testid="global-search-results" className="flex-1 min-h-0 overflow-y-auto">
              {resultsContent}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
