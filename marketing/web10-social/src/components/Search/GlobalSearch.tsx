import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, X, User, Users, Hash, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchPeople, searchGroups, searchPosts } from '@/data/search';
import type { PersonCard } from '@/data/people';
import type { GroupDirectoryEntry } from '@/data/groups';
import type { PostRecord } from '@/data/types';

// S1 (global-search.md): the top-bar everything-search surface — the
// expanding-icon state machine: icon (rest) → expanded field → results →
// collapse. S2 adds the three-way fan-out (people/groups/posts) + result
// rows. Searching (Enter) opens Discover with the query (?q=), staying on
// the active tab — the query chip (with its X) renders on both the Trending
// and People tabs, so the search can be cleared from either.

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

// ── Result row components ─────────────────────────────────────────────────────

function PersonRow({ person }: { person: PersonCard }) {
  const navigate = useNavigate();
  const initial = (person.display_name || person.username).charAt(0).toUpperCase();
  // Facebook-style suggestion row: the round glyph chip leads, the account's
  // own avatar trails on the right (the operator's reference, 25.09.2026).
  return (
    <button
      type="button"
      data-testid={`global-search-person-${person.username}`}
      onClick={() => navigate(`/u/${person.username}`)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:bg-elevated"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated">
        <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground truncate">{person.display_name || person.username}</span>
        <span className="block text-xs text-muted-foreground truncate">@{person.username}</span>
      </span>
      {person.avatar_url ? (
        <img src={person.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
      ) : (
        <span className="h-9 w-9 rounded-full bg-brand-muted text-brand-300 text-xs font-semibold flex items-center justify-center shrink-0">
          {initial}
        </span>
      )}
    </button>
  );
}

function GroupRow({ group }: { group: GroupDirectoryEntry }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid={`global-search-group-${group.group_id}`}
      onClick={() => navigate(`/groups/${encodeURIComponent(group.group_id)}`)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:bg-elevated"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated">
        <Hash className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground truncate">{group.name}</span>
        <span className="block text-xs text-muted-foreground truncate">
          @{group.owner} · {group.member_count} member{group.member_count === 1 ? '' : 's'}
        </span>
      </span>
    </button>
  );
}

function PostRow({ post }: { post: PostRecord }) {
  const navigate = useNavigate();
  const author = post.author_username || 'unknown';
  const href = post._id ? `/u/${author}/p/${post._id}` : `/u/${author}`;
  return (
    <button
      type="button"
      data-testid={`global-search-post-${post._id || 'unknown'}`}
      onClick={() => navigate(href)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:bg-elevated"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated">
        <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-foreground truncate">{post.text || '(no text)'}</span>
        <span className="block text-xs text-muted-foreground truncate">@{author}</span>
      </span>
    </button>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="px-3 py-2" aria-hidden="true">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1.5">{label}</p>
      <div className="skeleton-shimmer h-10 rounded-lg" />
      <div className="skeleton-shimmer h-10 rounded-lg mt-2" />
    </div>
  );
}

function SearchSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1" data-testid={`global-search-section-${label.toLowerCase()}`}>
      <p className="px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</p>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GlobalSearch({ variant }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  // The results mode: `posts` (the default — "the moment you search it should
  // show the discover posts being searched") + `people` (people + groups, the
  // chunky toggle the operator asked for — labeled "People" to match
  // Discover's tabs). Reset to `posts` on collapse.
  const [mode, setMode] = useState<'posts' | 'people'>('posts');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(false);
  const { pathname, search: locationSearch } = useLocation();

  // S2: the three search sections. null = loading, [] = loaded (empty),
  // [...] = loaded (has results). Per-section loading: the slowest read
  // never blocks the others.
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [groups, setGroups] = useState<GroupDirectoryEntry[] | null>(null);
  const [posts, setPosts] = useState<PostRecord[] | null>(null);
  const navigate = useNavigate();

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
      setMode('posts');
      setPeople(null);
      setGroups(null);
      setPosts(null);
      collapseTimer.current = null;
    }, COLLAPSE_MS);
  }, []);

  const expand = () => {
    clearCollapseTimer();
    setClosing(false);
    setOpen(true);
  };

  // Desktop: close ONLY the results dropdown (animate out 150ms, then
  // open=false). The field is always visible on desktop (the operator's call),
  // so this does NOT clear the query — clicking away keeps what was typed.
  const closeDropdown = useCallback(() => {
    setClosing(true);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      collapseTimer.current = null;
    }, COLLAPSE_MS);
  }, []);

  // The X button: clear the typed query and keep focus in the field so the
  // user can immediately type a new one (the dropdown, if open, falls back to
  // the "type to search" idle state). The field itself never disappears.
  const clearQuery = () => {
    setQuery('');
    setDebouncedQuery('');
    inputRef.current?.focus();
  };

  // Clear a pending collapse if the component unmounts mid-animation.
  useEffect(() => clearCollapseTimer, []);

  // Mobile: focus lands in the field the moment the full-screen view opens.
  // Desktop: the field is always visible, so focus is driven by the user (the
  // input's onFocus opens the results dropdown) — never stolen on mount.
  useEffect(() => {
    if (open && variant === 'mobile') inputRef.current?.focus();
  }, [open, variant]);

  // Mobile: when the full-screen view closes, return focus to the trigger so
  // keyboard users land somewhere sane (design.md §11 — fully keyboard-
  // operable). Desktop has no trigger (the field is always visible), so this
  // is a no-op there.
  useEffect(() => {
    if (variant !== 'mobile') return;
    if (wasOpen.current && !open) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    } else if (open) {
      wasOpen.current = true;
    }
  }, [open, variant]);

  // The debounced query (the app's 400ms idiom) — S2's fan-out reads this.
  // Always tracks the field (the desktop field is always visible), so the
  // dropdown reopens onto the current query rather than a stale one.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // S2: fire the fan-out when the debounced query (or the mode) changes.
  // Mode-aware: posts are the default; people + groups are fetched only when
  // the user flips to the "People" mode (no wasted reads). Per-section
  // loading: each read resolves independently.
  useEffect(() => {
    if (!open) return;
    setPeople(null);
    setGroups(null);
    setPosts(null);
    if (!debouncedQuery) return;
    let cancelled = false;
    searchPosts(debouncedQuery)
      .then((r) => { if (!cancelled) setPosts(r); })
      .catch(() => { if (!cancelled) setPosts([]); });
    if (mode === 'people') {
      searchPeople(debouncedQuery)
        .then((r) => { if (!cancelled) setPeople(r); })
        .catch(() => { if (!cancelled) setPeople([]); });
      searchGroups(debouncedQuery)
        .then((r) => { if (!cancelled) setGroups(r); })
        .catch(() => { if (!cancelled) setGroups([]); });
    }
    return () => { cancelled = true; };
  }, [debouncedQuery, open, mode]);

  // Navigate → close the results UI (the state machine's fourth exit).
  // Desktop: just close the dropdown (the field stays, the query persists).
  // Mobile: full collapse (the full-screen view closes and resets).
  useEffect(() => {
    if (open) {
      if (variant === 'desktop') closeDropdown();
      else collapse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Desktop: click outside the bar → close the dropdown (the field stays).
  useEffect(() => {
    if (!open || variant !== 'desktop') return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) closeDropdown();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, variant, closeDropdown]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Searching opens Discover with the query (?q=), staying on the active
      // tab — the query chip (with its X) renders on BOTH the Trending and
      // People tabs, so the search can be cleared from either. Works on both
      // variants (the mobile full-screen view collapses via the pathname-
      // change effect).
      if (query.trim()) submitSearch();
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (variant === 'desktop') closeDropdown();
      else collapse();
    }
  };

  // The search submit: navigate to Discover carrying the query (?q=) and
  // STAY on whatever tab is active (the operator's call: the search happens
  // on both tabs — the query chip, with its X, renders on Trending AND
  // People, so it can be cleared from either). A bare /discover?q= lands on
  // Trending (the bare-URL default); /discover?tab=explore&q= lands on
  // People. The query is screen state the URL holds (the deep-link rule).
  const submitSearch = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    // Stay on the active Discover tab if we're already there (?tab=explore
    // rides along); otherwise land on the bare URL (Trending, the default).
    const params = new URLSearchParams(locationSearch);
    if (params.get('tab') === 'explore') {
      navigate(`/discover?tab=explore&q=${encodeURIComponent(q)}`);
    } else {
      navigate(`/discover?q=${encodeURIComponent(q)}`);
    }
  }, [query, navigate, locationSearch]);

  const field = (sizeClass: string) => (
    <input
      ref={inputRef}
      data-testid="global-search-field"
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onFocus={expand}
      onKeyDown={handleKeyDown}
      placeholder="Search web10"
      aria-label="Search"
      autoComplete="off"
      spellCheck={false}
      className={cn(
        'flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground outline-none',
        sizeClass,
      )}
    />
  );

  // The results container content: the "type to search" idle state, or the
  // mode-specific results. The mode toggle (Trending | People) is the
  // chunky switch the operator asked for — posts are the default; one tap
  // flips to people + groups. It renders as soon as there's a query (immediate,
  // not debounced) so it's clickable while the results are still loading.
  const q = debouncedQuery;
  const allLoaded = (s: unknown) => s !== null;

  const resultsContent =
    query.trim() === '' ? (
      <div
        data-testid="global-search-type-to-search"
        className="flex items-center gap-3 px-4 py-8 text-sm text-muted-foreground"
      >
        <Search className="w-5 h-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>Type to search people, groups, and posts</span>
      </div>
    ) : (
      <div className="py-1">
        {/* The mode toggle — Trending (default) | People. The labels match
            Discover's tabs (the operator: "it is supposed to be Trending and
            People, not Posts and People"). Slim segmented control (the
            Facebook-style dropdown, 25.09.2026 — no chunky pills). It
            renders as soon as there's a query (immediate, not debounced) so
            it's clickable while the results are still loading. */}
        <div className="px-3 pt-2 pb-1">
          <div
            className="inline-flex items-center gap-0.5 rounded-full bg-elevated p-0.5"
            role="tablist"
            aria-label="Search results type"
            data-testid="global-search-mode-toggle"
          >
            {([
              ['posts', 'Trending', FileText],
              ['people', 'People', Users],
            ] as ['posts' | 'people', string, typeof FileText][]).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                data-testid={`global-search-mode-${m}`}
                onClick={() => setMode(m)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
                  mode === m
                    ? 'bg-brand-muted text-brand-300'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {mode === 'posts' ? (
          <>
            {/* Trending posts (the default — "show the discover posts being searched") */}
            {posts === null ? (
              <SectionSkeleton label="Trending" />
            ) : posts.length > 0 ? (
              <SearchSection label="Trending">
                {posts.map((p) => (
                  <PostRow key={p._id || p.created_at} post={p} />
                ))}
              </SearchSection>
            ) : (
              <div
                data-testid="global-search-no-results"
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No posts match &ldquo;{q}&rdquo;
              </div>
            )}
          </>
        ) : (
          <>
            {/* People */}
            {people === null ? (
              <SectionSkeleton label="People" />
            ) : people.length > 0 ? (
              <SearchSection label="People">
                {people.map((p) => (
                  <PersonRow key={p.username} person={p} />
                ))}
              </SearchSection>
            ) : null}

            {/* Groups */}
            {groups === null ? (
              <SectionSkeleton label="Groups" />
            ) : groups.length > 0 ? (
              <SearchSection label="Groups">
                {groups.map((g) => (
                  <GroupRow key={g.group_id} group={g} />
                ))}
              </SearchSection>
            ) : null}

            {/* No results (both sections loaded, both empty) */}
            {allLoaded(people) && allLoaded(groups) &&
             people.length === 0 && groups.length === 0 && (
              <div
                data-testid="global-search-no-results"
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No people or groups match &ldquo;{q}&rdquo;
              </div>
            )}
          </>
        )}

        {/* The search CTA — Enter (or this) opens Discover with the query,
            staying on the active tab (the query chip clears it from either). */}
        {mode === 'people' && (allLoaded(people) || allLoaded(groups)) && (
          <button
            type="button"
            data-testid="global-search-open-explore"
            onClick={submitSearch}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-brand-300 hover:text-brand-400 hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Search className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            See all results for &ldquo;{q}&rdquo; in Discover
          </button>
        )}
      </div>
    );

  if (variant === 'desktop') {
    return (
      <div ref={containerRef} className="relative w-full flex items-center">
        {/* The field is always visible on desktop (the operator's call): the
            persistent placeholder is more informative than a bare icon.
            Focus opens the dropdown; the X (only when there's a query)
            clears it; clicking away closes the dropdown (field stays). The
            field lives in the sidebar (the operator's Facebook-style
            chrome); the results dropdown anchors below it and overflows the
            sidebar into the content (the Facebook-style wide panel — the
            sidebar itself is NOT overflow-hidden, 25.09.2026). */}
        <div
          data-testid="global-search-field-wrap"
          className="flex items-center gap-2 flex-1 h-10 w-full rounded-full bg-elevated border border-border/60 pl-3.5 pr-1.5 transition-colors duration-150 focus-within:border-brand/50 focus-within:bg-background"
        >
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          {field('text-sm')}
          {query.trim() !== '' && (
            <button
              type="button"
              data-testid="global-search-close"
              aria-label="Clear search"
              onClick={clearQuery}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
        {open && (
          <div
            data-testid="global-search-results"
            className={cn(
              'absolute top-full left-0 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover shadow-[0_12px_40px_rgb(0_0_0/0.45)] z-40 overflow-hidden',
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
