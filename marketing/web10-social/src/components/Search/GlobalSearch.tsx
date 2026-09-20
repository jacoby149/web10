import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchPeople, searchGroups, searchPosts } from '@/data/search';
import type { PersonCard } from '@/data/people';
import type { GroupDirectoryEntry } from '@/data/groups';
import type { PostRecord } from '@/data/types';

// S1 (global-search.md): the top-bar everything-search surface — the
// expanding-icon state machine: icon (rest) → expanded field → results →
// collapse. S2 adds the three-way fan-out (people/groups/posts) + result
// rows + "see more" deep links into the Discover browsers.

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
  return (
    <button
      type="button"
      data-testid={`global-search-person-${person.username}`}
      onClick={() => navigate(`/u/${person.username}`)}
      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      {person.avatar_url ? (
        <img src={person.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-brand-muted text-brand-300 text-xs font-semibold flex items-center justify-center shrink-0">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{person.display_name || person.username}</p>
        <p className="text-xs text-muted-foreground truncate">@{person.username}</p>
      </div>
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
      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <div className="h-8 w-8 rounded-lg bg-brand-muted text-brand-300 flex items-center justify-center shrink-0">
        <Users className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{group.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          @{group.owner} · {group.member_count} member{group.member_count === 1 ? '' : 's'}
        </p>
      </div>
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
      className="w-full flex items-start gap-3 px-4 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <div className="h-8 w-8 rounded-lg bg-elevated border border-border flex items-center justify-center shrink-0">
        <Search className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{post.text || '(no text)'}</p>
        <p className="text-xs text-muted-foreground truncate">@{author}</p>
      </div>
    </button>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="px-4 py-2" aria-hidden="true">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1.5">{label}</p>
      <div className="skeleton-shimmer h-10 rounded-lg" />
      <div className="skeleton-shimmer h-10 rounded-lg mt-2" />
    </div>
  );
}

function SearchSection({
  label,
  seeMoreHref,
  seeMoreTestId,
  children,
}: {
  label: string;
  seeMoreHref: string;
  seeMoreTestId: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="py-1" data-testid={`global-search-section-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between px-4 py-1">
        <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <button
          type="button"
          data-testid={seeMoreTestId}
          onClick={() => navigate(seeMoreHref)}
          className="text-xs text-brand-300 hover:text-brand-400 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded px-1 py-0.5"
        >
          See more
        </button>
      </div>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(false);
  const { pathname } = useLocation();

  // S2: the three search sections. null = loading, [] = loaded (empty),
  // [...] = loaded (has results). Per-section loading: the slowest read
  // never blocks the others.
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [groups, setGroups] = useState<GroupDirectoryEntry[] | null>(null);
  const [posts, setPosts] = useState<PostRecord[] | null>(null);

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

  // S2: fire the three-way fan-out when the debounced query changes.
  // Per-section loading: each read resolves independently.
  useEffect(() => {
    if (!open) return;
    setPeople(null);
    setGroups(null);
    setPosts(null);
    if (!debouncedQuery) return;
    let cancelled = false;
    searchPeople(debouncedQuery)
      .then((r) => { if (!cancelled) setPeople(r); })
      .catch(() => { if (!cancelled) setPeople([]); });
    searchGroups(debouncedQuery)
      .then((r) => { if (!cancelled) setGroups(r); })
      .catch(() => { if (!cancelled) setGroups([]); });
    searchPosts(debouncedQuery)
      .then((r) => { if (!cancelled) setPosts(r); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [debouncedQuery, open]);

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

  // The results container content: the "type to search" idle state, or the
  // three sections (People/Groups/Posts) with per-section loading.
  const q = debouncedQuery;
  const resultsContent =
    q === '' ? (
      <div
        data-testid="global-search-type-to-search"
        className="flex items-center gap-3 px-4 py-8 text-sm text-muted-foreground"
      >
        <Search className="w-5 h-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>Type to search people, groups, and posts</span>
      </div>
    ) : (
      <div className="py-1">
        {/* People */}
        {people === null ? (
          <SectionSkeleton label="People" />
        ) : people.length > 0 ? (
          <SearchSection
            label="People"
            seeMoreHref={`/discover?tab=people&q=${encodeURIComponent(q)}`}
            seeMoreTestId="global-search-see-more-people"
          >
            {people.map((p) => (
              <PersonRow key={p.username} person={p} />
            ))}
          </SearchSection>
        ) : null}

        {/* Groups */}
        {groups === null ? (
          <SectionSkeleton label="Groups" />
        ) : groups.length > 0 ? (
          <SearchSection
            label="Groups"
            seeMoreHref={`/discover?tab=groups&q=${encodeURIComponent(q)}`}
            seeMoreTestId="global-search-see-more-groups"
          >
            {groups.map((g) => (
              <GroupRow key={g.group_id} group={g} />
            ))}
          </SearchSection>
        ) : null}

        {/* Posts */}
        {posts === null ? (
          <SectionSkeleton label="Posts" />
        ) : posts.length > 0 ? (
          <SearchSection
            label="Posts"
            seeMoreHref={`/discover?q=${encodeURIComponent(q)}`}
            seeMoreTestId="global-search-see-more-posts"
          >
            {posts.map((p) => (
              <PostRow key={p._id || p.created_at} post={p} />
            ))}
          </SearchSection>
        ) : null}

        {/* No results (all three sections loaded, all empty) */}
        {people !== null && groups !== null && posts !== null &&
         people.length === 0 && groups.length === 0 && posts.length === 0 && (
          <div
            data-testid="global-search-no-results"
            className="px-4 py-8 text-center text-sm text-muted-foreground"
          >
            No matches for &ldquo;{q}&rdquo;
          </div>
        )}
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
