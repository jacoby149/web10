import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, User, Users, Hash, Video, Smartphone, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchPeople, searchGroups, searchPosts, searchVideo, searchShorts } from '@/data/search';
import type { PersonCard } from '@/data/people';
import type { GroupDirectoryEntry } from '@/data/groups';
import type { PostRecord } from '@/data/types';
import type { ShortPost } from '@/data';

// S1 (global-search.md): the top-bar everything-search surface. S7 made the
// search PEOPLE-FIRST. S8 (28.09.2026) made the search four categories — the
// Discover split's four flat destinations (Video · Shorts · Hot Gossip ·
// People) are the four search categories. **S9 (29.09.2026) makes the search
// the open tab's live filter:** the four categories are the four nav tabs —
// one tap OPENS that tab (navigates to its destination), and typing in the
// field, while a tab is open, filters THAT tab as you type (the query is
// written to the destination's URL as ?q=, debounced — the destinations'
// existing ?q= client-side filters do the rest, live). The field is the
// tab's search box; the dropdown is the preview (a few rows + the "open the
// tab" CTA). The state machine (always-expanded field, focus → dropdown, X
// clears the query, the typed query persists) is unchanged.

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

// The four search categories = the four flat destinations (S8). The mode is
// the category the dropdown previews; S9: it follows the OPEN tab when one is
// open (the field is that tab's search box), and defaults to People when no
// destination is open (S7: the search is people-first).
type SearchMode = 'people' | 'video' | 'shorts' | 'gossip';

// The destination each category opens (S9: a category tap IS the tab).
const MODE_DESTINATION: Record<SearchMode, string> = {
  people: '/people',
  video: '/video',
  shorts: '/shorts',
  gossip: '/hot-gossip',
};

const MODE_LABEL: Record<SearchMode, string> = {
  people: 'People',
  video: 'Video',
  shorts: 'Shorts',
  gossip: 'Hot Gossip',
};

// The open tab (S9): which search-aware destination is the current route.
// `/shorts` (the wall) and `/shorts/:postId` (the lens) are both the Shorts
// tab — both honor ?q=. Everything else (feed, profile, messages, …) is not
// a search destination: typing there shows the preview only (no ?q= write).
function destinationFromPath(pathname: string): SearchMode | null {
  if (pathname.startsWith('/people')) return 'people';
  if (pathname.startsWith('/video')) return 'video';
  if (pathname.startsWith('/shorts')) return 'shorts';
  if (pathname.startsWith('/hot-gossip')) return 'gossip';
  return null;
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
        <span className="block text-sm text-foreground truncate">{post.title || post.text || '(no text)'}</span>
        <span className="block text-xs text-muted-foreground truncate">@{author}</span>
      </span>
    </button>
  );
}

function VideoRow({ post }: { post: PostRecord }) {
  const navigate = useNavigate();
  const author = post.author_username || 'unknown';
  const href = post._id ? `/u/${author}/p/${post._id}` : `/u/${author}`;
  return (
    <button
      type="button"
      data-testid={`global-search-video-${post._id || 'unknown'}`}
      onClick={() => navigate(href)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:bg-elevated"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated">
        <Video className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-foreground truncate">{post.title || post.text || '(no text)'}</span>
        <span className="block text-xs text-muted-foreground truncate">@{author}</span>
      </span>
    </button>
  );
}

function ShortRow({ short }: { short: ShortPost }) {
  const navigate = useNavigate();
  const post = short.post;
  const author = post.author_username || 'unknown';
  return (
    <button
      type="button"
      data-testid={`global-search-short-${post._id || 'unknown'}`}
      onClick={() => navigate(post._id ? `/shorts/${post._id}` : '/shorts')}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:bg-elevated"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated">
        <Smartphone className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-foreground truncate">{post.title || post.text || '(no text)'}</span>
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
    <div className="py-1" data-testid={`global-search-section-${label.toLowerCase().replace(/\s+/g, '-')}`}>
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
  // The results mode (S8): the four flat destinations are the four search
  // categories. S9: when a destination tab is OPEN, the mode follows it (the
  // field is that tab's search box — the preview matches the open tab); when
  // no destination is open, People is the default (S7: the search is
  // people-first). A category tap navigates to that destination (opens the
  // tab) — it no longer just flips the preview.
  const [mode, setMode] = useState<SearchMode>('people');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(false);
  const { pathname, search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // S9: the open tab. When one of the four search destinations is the current
  // route, the field is THAT tab's search box: typing writes ?q= to its URL
  // (debounced) and the tab's existing ?q= filter does the rest, live. On any
  // other route the field is the front door (the preview only — no ?q= write,
  // a ?q= on /feed or /u/:username would be noise).
  const openDestination = destinationFromPath(pathname);

  // S9: the field mirrors the open tab's ?q= (deep-link + refresh-safe — the
  // URL is the single source of truth, the field derives from it). When no
  // destination is open, the field is free (the dropdown's working query).
  const urlQuery = searchParams.get('q') || '';
  useEffect(() => {
    if (openDestination) setQuery(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery, openDestination]);

  // S9: the mode follows the open tab (the preview matches the tab being
  // filtered); on other routes it rests on People (S7).
  useEffect(() => {
    setMode(openDestination ?? 'people');
  }, [openDestination]);

  // S9: the field is the open tab's search box only while the user has it
  // focused (the live-filter gesture). The ?q= write is gated on focus AND on
  // a real interaction (a keystroke or the X clear) — never on mount or a
  // bare focus — so a deep link (/video?q=…) is not wiped before the field
  // seeds from it, and navigating between tabs with a ?q= does not re-write
  // the param.
  const [focused, setFocused] = useState(false);
  // Set by the first real change since a FRESH focus (a keystroke or the X
  // clear). The ?q= sync skips until this is set, so the seed's own debounce
  // (the field mirroring the tab's ?q=) never registers as a "clear". It is
  // reset only on a fresh focus (the input wasn't focused just before) — a
  // programmatic re-focus (the X's refocus, after its mousedown blur) keeps
  // the flag armed.
  const hasInteractedSinceFocus = useRef(false);
  const wasFocusedRef = useRef(false);
  // S10 (search stays open on a topic change): a category-open navigation (a
  // category tap / Enter / the "see all" CTA) should keep the dropdown open —
  // the operator wants to see the results as they search, not have the
  // dropdown collapse the moment the tab opens. The navigation it triggers
  // (a pathname change) would normally close the dropdown (the navigate →
  // close effect); this flag tells that effect this navigation was the
  // search's own, so it keeps the dropdown open instead. Set on the open,
  // consumed (reset) by the pathname-change effect.
  const categoryOpenRef = useRef(false);

  // S9: a navigation (a row tap, a category tap, back/forward) ends the
  // live-filter gesture — the field re-seeds from the new URL's ?q= (the seed
  // effect) and the sync stops re-applying the old query to the new location.
  // (A ?q= write does NOT change the pathname, so it does not trip this —
  // only a real navigation does.)
  useEffect(() => {
    hasInteractedSinceFocus.current = false;
  }, [pathname]);

  // S9: typing in the field, while a tab is open AND the field is focused
  // AND the user has actually interacted, live-filters the tab — the settled
  // debounced query is written to the destination's URL as ?q= (replace — no
  // history spam per keystroke). The destination's ?q= filter (client-side,
  // over the loaded pool) reacts to the URL change. A genuine clear (the
  // field is empty AND the debounce has settled to empty — NOT a pending
  // debounce after a keystroke) removes the ?q= (the tab un-filters). The X
  // clear removes the ?q= directly in `clearQuery` (robust to the mousedown
  // blur a real browser fires before the click).
  useEffect(() => {
    if (!openDestination || !focused || !hasInteractedSinceFocus.current) return;
    const target = debouncedQuery.trim();
    const params = new URLSearchParams(searchParams);
    if (target) {
      if (params.get('q') !== target) {
        params.set('q', target);
        setSearchParams(params, { replace: true });
      }
    } else if (!query.trim()) {
      // The field is genuinely empty (select-all + delete) — clear the ?q=.
      if (params.has('q')) {
        params.delete('q');
        setSearchParams(params, { replace: true });
      }
    }
    // else: a keystroke's debounce is still pending (query non-empty,
    // debouncedQuery empty) — wait for it to settle, don't touch the ?q=.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, query, openDestination, focused]);

  // The results mode (S8): the four flat destinations are the four search
  // categories — `people` (the default — S7: the search is people-first, the
  // front door is finding accounts) | `video` | `shorts` | `gossip` (Hot
  // Gossip, the ranked post board). S9: one tap OPENS that destination (the
  // tab) carrying the query; Enter / the CTA do the same.

  // S2/S8: the five search sections. null = loading, [] = loaded (empty),
  // [...] = loaded (has results). Per-section loading: the slowest read
  // never blocks the others.
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [groups, setGroups] = useState<GroupDirectoryEntry[] | null>(null);
  const [video, setVideo] = useState<PostRecord[] | null>(null);
  const [shorts, setShorts] = useState<ShortPost[] | null>(null);
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
      setMode('people');
      setPeople(null);
      setGroups(null);
      setVideo(null);
      setShorts(null);
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
  // the "type to search" idle state). S9: while a tab is open, the X also
  // clears the tab's ?q= DIRECTLY (the tab un-filters) — not via the
  // debounce sync, which a real browser's mousedown-blur (before the click)
  // would disarm. The field itself never disappears.
  const clearQuery = () => {
    hasInteractedSinceFocus.current = true;
    setQuery('');
    setDebouncedQuery('');
    if (openDestination) {
      const params = new URLSearchParams(searchParams);
      if (params.has('q')) {
        params.delete('q');
        setSearchParams(params, { replace: true });
      }
    }
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

  // The debounced query (the app's 400ms idiom) — S2's fan-out + S9's ?q=
  // sync both read this. Always tracks the field (the desktop field is always
  // visible), so the dropdown reopens onto the current query rather than a
  // stale one.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // S2/S8: fire the fan-out when the debounced query changes. All five reads
  // (people + groups + video + shorts + posts) fire together — the mode only
  // controls which sections are SHOWN, so a category flip is instant (no
  // re-skeleton) and each section renders independently as its read resolves
  // (per-section loading). The reads are cheap pool reads (50, filtered
  // client-side), so fetching all five is not a cost worth gating. A query
  // change resets all sections (stale results from a previous query must not
  // linger under a new one).
  const lastFannedQuery = useRef('');
  useEffect(() => {
    if (!open) return;
    if (lastFannedQuery.current === debouncedQuery) return;
    lastFannedQuery.current = debouncedQuery;
    setPeople(null);
    setGroups(null);
    setVideo(null);
    setShorts(null);
    setPosts(null);
    if (!debouncedQuery) return;
    let cancelled = false;
    searchPeople(debouncedQuery)
      .then((r) => { if (!cancelled) setPeople(r); })
      .catch(() => { if (!cancelled) setPeople([]); });
    searchGroups(debouncedQuery)
      .then((r) => { if (!cancelled) setGroups(r); })
      .catch(() => { if (!cancelled) setGroups([]); });
    searchVideo(debouncedQuery)
      .then((r) => { if (!cancelled) setVideo(r); })
      .catch(() => { if (!cancelled) setVideo([]); });
    searchShorts(debouncedQuery)
      .then((r) => { if (!cancelled) setShorts(r); })
      .catch(() => { if (!cancelled) setShorts([]); });
    searchPosts(debouncedQuery)
      .then((r) => { if (!cancelled) setPosts(r); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [debouncedQuery, open]);

  // Navigate → close the results UI (the state machine's fourth exit).
  // Desktop: just close the dropdown (the field stays, the query persists).
  // Mobile: full collapse (the full-screen view closes and resets).
  // S10: a navigation the search ITSELF triggered (a category tap / Enter /
  // the "see all" CTA — a topic change) keeps the dropdown open: the operator
  // wants to see the results as they search, not have it collapse the moment
  // the tab opens. The mode follows the new open tab (the mode-follows effect)
  // and the field re-seeds from the new URL's ?q= (the seed effect), so the
  // preview matches the tab now being filtered. A ?q= write does NOT change
  // the pathname, so it does not trip this — only a real navigation does.
  useEffect(() => {
    if (open) {
      if (categoryOpenRef.current) {
        categoryOpenRef.current = false;
        // Keep the dropdown open + refocus the field so it stays alive (a
        // real browser's mousedown on the category button blurred the field).
        if (variant === 'desktop') inputRef.current?.focus();
        return;
      }
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
      // S9: Enter opens the picked category's tab with the query (the same
      // as tapping the category) — the "see all" lands where the small
      // results came from. Works on both variants (the mobile full-screen
      // view collapses via the pathname-change effect).
      if (query.trim()) submitSearch();
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (variant === 'desktop') closeDropdown();
      else collapse();
    }
  };

  // S9: open a category's tab (the destination) carrying the query (?q=).
  // The four categories are the four nav tabs — People → /people (the
  // people/groups browser), Video → /video (the video wall), Shorts →
  // /shorts (the wall), Hot Gossip → /hot-gossip (the ranked post board).
  // The query is screen state the URL holds (the deep-link rule); each
  // destination's existing ?q= filter picks it up and filters live.
  const openCategory = useCallback((m: SearchMode) => {
    const q = query.trim();
    const dest = MODE_DESTINATION[m];
    // S10: this navigation is the search's own topic change — keep the
    // dropdown open (the operator wants to see the results as they search).
    // The pathname-change effect consumes + resets the flag.
    categoryOpenRef.current = true;
    if (q) {
      const params = new URLSearchParams();
      params.set('q', q);
      navigate(`${dest}?${params.toString()}`);
    } else {
      navigate(dest);
    }
  }, [query, navigate]);

  // The search submit (S9): Enter / the CTA open the picked category's tab
  // with the query — the same as tapping the category.
  const submitSearch = useCallback(() => {
    if (!query.trim()) return;
    openCategory(mode);
  }, [query, mode, openCategory]);

  const field = (sizeClass: string) => (
    <input
      ref={inputRef}
      data-testid="global-search-field"
      type="text"
      value={query}
      onChange={(e) => {
        // A real keystroke: arm the ?q= sync (the seed's own debounce must
        // not register as a "clear" of the tab's ?q=).
        hasInteractedSinceFocus.current = true;
        setQuery(e.target.value);
      }}
      onFocus={() => {
        // A fresh focus (the input wasn't focused just before) is not an
        // interaction — the tab's ?q= (the deep link) survives until the user
        // actually types or hits the X. A programmatic re-focus (the X's
        // refocus, after its mousedown blur) is NOT fresh — the armed flag
        // survives it.
        if (!wasFocusedRef.current) hasInteractedSinceFocus.current = false;
        wasFocusedRef.current = true;
        setFocused(true);
        expand();
      }}
      onBlur={() => {
        wasFocusedRef.current = false;
        setFocused(false);
      }}
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
  // mode-specific results. The mode toggle (People | Video | Shorts | Hot
  // Gossip) is the four flat destinations (S8) — the labels match the nav
  // exactly. S9: one tap OPENS that tab (navigates to the destination,
  // carrying the query); the active one is the open tab when a destination
  // is open (S7: People is the default when none is). It renders as soon as
  // there's a query (immediate, not debounced) so it's clickable while the
  // results are still loading. All five fan-out reads load together (the
  // mode only picks which sections are shown), so a flip is instant.
  const q = debouncedQuery;
  const allLoaded = (s: unknown) => s !== null;

  // The "open the tab" CTA label (S9: the CTA opens the picked category's
  // tab with the query — the "see all" lands where the small results came
  // from).
  const ctaLabel = MODE_LABEL[mode];

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
        {/* The mode toggle — the four flat destinations (S8): People
            (default, S7) | Video | Shorts | Hot Gossip. The labels match the
            nav exactly. S9: a tap OPENS that tab (navigates to the
            destination, carrying the query). Slim segmented control (the
            Facebook-style dropdown). It renders as soon as there's a query
            (immediate, not debounced) so it's clickable while the results
            are still loading. */}
        <div className="px-3 pt-2 pb-1">
          <div
            className="flex items-center gap-0.5 rounded-full bg-elevated p-0.5 max-w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Search results type"
            data-testid="global-search-mode-toggle"
          >
            {([
              ['people', 'People', Users],
              ['video', 'Video', Video],
              ['shorts', 'Shorts', Smartphone],
              ['gossip', 'Hot Gossip', Flame],
            ] as [SearchMode, string, typeof Users][]).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                data-testid={`global-search-mode-${m}`}
                onClick={() => openCategory(m)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors',
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

        {mode === 'people' ? (
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
        ) : mode === 'video' ? (
          <>
            {/* Video posts (the /video destination's render-time gate) */}
            {video === null ? (
              <SectionSkeleton label="Video" />
            ) : video.length > 0 ? (
              <SearchSection label="Video">
                {video.map((p) => (
                  <VideoRow key={p._id || p.created_at} post={p} />
                ))}
              </SearchSection>
            ) : (
              <div
                data-testid="global-search-no-results"
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No videos match &ldquo;{q}&rdquo;
              </div>
            )}
          </>
        ) : mode === 'shorts' ? (
          <>
            {/* Shorts (the /shorts destination — genuine 9:16, shorts.md) */}
            {shorts === null ? (
              <SectionSkeleton label="Shorts" />
            ) : shorts.length > 0 ? (
              <SearchSection label="Shorts">
                {shorts.map((s) => (
                  <ShortRow key={s.post._id || s.post.created_at} short={s} />
                ))}
              </SearchSection>
            ) : (
              <div
                data-testid="global-search-no-results"
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No shorts match &ldquo;{q}&rdquo;
              </div>
            )}
          </>
        ) : (
          <>
            {/* Hot Gossip posts (the ranked post board) */}
            {posts === null ? (
              <SectionSkeleton label="Hot Gossip" />
            ) : posts.length > 0 ? (
              <SearchSection label="Hot Gossip">
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
        )}

        {/* The CTA — S9: opens the picked category's TAB with the query
            (the "see all" lands where the small results came from). */}
        {(mode === 'people'
          ? allLoaded(people) || allLoaded(groups)
          : mode === 'video'
            ? allLoaded(video)
            : mode === 'shorts'
              ? allLoaded(shorts)
              : allLoaded(posts)) && (
          <button
            type="button"
            data-testid="global-search-open-explore"
            onClick={submitSearch}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-brand-300 hover:text-brand-400 hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Search className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            See all results for &ldquo;{q}&rdquo; in {ctaLabel}
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
            field lives in the desktop top bar (the 29.09.2026 pass moved it
            back from the sidebar — the sidebar search was a "traffic jam");
            the results dropdown anchors below it. S9: on a search
            destination the field is that tab's live filter (typing writes
            ?q= to the tab's URL). */}
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
