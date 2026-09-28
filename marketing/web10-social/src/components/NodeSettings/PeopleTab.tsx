import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Loader2, Ban, EyeOff, ChevronDown, AlertTriangle, RefreshCw, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, errorMessage } from '@/components/shared/Toast';
import {
  fetchPeoplePage,
  filterPeople,
  type PersonCard,
} from '@/data';
import {
  readUserPostsForModeration,
  setUserAutoHidden,
  hidePostFromBoard,
} from '@/data/moderation';
import type { PostRecord } from '@/data/types';

const PAGE_SIZE = 20;

/**
 * The People tab — the operator's "find a person to ban, see their posts."
 * Builds on the D0 people directory (the same read the Discover People browser
 * uses): search the node's people, open one to see their posts, and hide the
 * user (auto_hide_users — their future posts auto-hidden from Discover) or
 * hide a specific post (board takedown).
 */
export function PeopleTab() {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());
  const [hidingUser, setHidingUser] = useState<string | null>(null);

  // The selected person (the "see their posts" expansion).
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPosts, setSelectedPosts] = useState<PostRecord[] | null>(null);
  const [selectedFace, setSelectedFace] = useState<{ display_name?: string; avatar_url?: string } | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [hidingPost, setHidingPost] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPeoplePage({ limit: PAGE_SIZE, offset: 0 });
      setPeople(page.people);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load people'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => filterPeople(people, query), [people, query]);

  const isHidden = (username: string) => hiddenUsers.has(username);

  const toggleHideUser = async (username: string) => {
    const hide = !isHidden(username);
    setHidingUser(username);
    try {
      const next = await setUserAutoHidden(username, hide);
      setHiddenUsers(new Set(next));
      toast.success(hide ? `Hiding @${username} from Discover` : `Restored @${username} to Discover`);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to update the hidden list'));
    } finally {
      setHidingUser(null);
    }
  };

  const selectPerson = async (username: string) => {
    if (selected === username) {
      setSelected(null);
      setSelectedPosts(null);
      setSelectedFace(null);
      return;
    }
    setSelected(username);
    setSelectedPosts(null);
    setSelectedFace(null);
    setPostsError(null);
    setPostsLoading(true);
    try {
      const { posts, face } = await readUserPostsForModeration(username);
      setSelectedPosts(posts);
      setSelectedFace({ display_name: face?.display_name, avatar_url: face?.avatar_url });
    } catch (e) {
      setPostsError(errorMessage(e, 'Failed to load their posts'));
    } finally {
      setPostsLoading(false);
    }
  };

  const hidePost = async (docId: string) => {
    setHidingPost(docId);
    try {
      await hidePostFromBoard(docId);
      // Drop the post from the visible list (it's now hidden from the board).
      setSelectedPosts((prev) => (prev ? prev.filter((p) => p._id !== docId) : prev));
      toast.success('Post hidden from Discover');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to hide the post'));
    } finally {
      setHidingPost(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="people-tab">
      <p className="text-xs text-muted-foreground">
        Search the node&apos;s people, open one to see their posts, and hide a user
        (their future Discover posts) or a specific post.
      </p>

      {/* The search field */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="pl-9"
          data-testid="people-search-input"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="people-search-clear"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* The list */}
      {loading ? (
        <div className="space-y-2" data-testid="people-loading">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center" data-testid="people-error">
          <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={load} data-testid="people-retry">
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground" data-testid="people-empty">
          {query ? 'No people match your search.' : 'It\u2019s quiet here.'}
        </p>
      ) : (
        <div className="space-y-2" data-testid="people-list">
          {filtered.map((person) => {
            const open = selected === person.username;
            return (
              <div
                key={person.username}
                className="rounded-lg border border-border bg-card overflow-hidden"
                data-testid={`person-row-${person.username}`}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {person.avatar_url ? (
                    <img
                      src={person.avatar_url}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover shrink-0"
                      data-testid={`person-avatar-${person.username}`}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-elevated flex items-center justify-center text-sm font-medium text-muted-foreground shrink-0">
                      {person.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {person.display_name || person.username}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      @{person.username} · {person.followers_count} followers
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectPerson(person.username)}
                    aria-label={`View ${person.username}'s posts`}
                    aria-expanded={open}
                    className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
                    data-testid={`person-view-${person.username}`}
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} strokeWidth={1.75} />
                  </button>
                  <Button
                    variant={isHidden(person.username) ? 'outline' : 'brand'}
                    size="sm"
                    disabled={hidingUser === person.username}
                    onClick={() => toggleHideUser(person.username)}
                    data-testid={`person-hide-${person.username}`}
                  >
                    {hidingUser === person.username ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                    ) : isHidden(person.username) ? (
                      <>
                        <EyeOff className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                        Hiding
                      </>
                    ) : (
                      <>
                        <Ban className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                        Hide
                      </>
                    )}
                  </Button>
                </div>

                {/* The expansion — their posts */}
                {open && (
                  <div className="border-t border-border bg-elevated/40 px-3 py-3" data-testid={`person-posts-${person.username}`}>
                    {postsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : postsError ? (
                      <p className="text-xs text-danger" data-testid="person-posts-error">{postsError}</p>
                    ) : selectedPosts && selectedPosts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No public posts to show.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedPosts?.map((post) => (
                          <div
                            key={post._id}
                            className="rounded-md border border-border bg-card px-3 py-2"
                            data-testid={`person-post-${post._id}`}
                          >
                            <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">
                              {post.text || <span className="text-muted-foreground italic">(media only)</span>}
                            </p>
                            {post._id && (
                              <div className="mt-2 flex justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={hidingPost === post._id}
                                  onClick={() => hidePost(post._id!)}
                                  data-testid={`person-post-hide-${post._id}`}
                                >
                                  {hidingPost === post._id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                                  ) : (
                                    <>
                                      <EyeOff className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                                      Hide post
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
