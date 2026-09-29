import { useState, useCallback } from 'react';
import { Link2, Loader2, Ban, EyeOff, User, FileText, Hash, AlertTriangle, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, errorMessage } from '@/components/shared/Toast';
import { readPostById } from '@/data/posts';
import type { PostRecord } from '@/data/types';
import { lookupUserProfile, type UserFace } from '@/data/profile';
import {
  parseWeb10Link,
  setUserAutoHidden,
  setUserBanned as setUserBannedApi,
  hidePostFromBoard,
  readUserPostsForModeration,
  type ParsedWeb10Link,
} from '@/data/moderation';

/**
 * The Link tab — paste a web10 permalink, pull up the post + the user, and act:
 * hide the specific post (board takedown) or hide the user (auto_hide_users —
 * their future Discover posts). This is the operator's "I got a link to a bad
 * post, let me deal with it" surface (the escort-ad case).
 *
 * The parser mirrors preview/server.mjs (the crawler-facing URL parser):
 *   /u/:username/p/:postId → post + author
 *   /u/:username            → the user (+ their posts)
 *   /groups/:groupId        → the group (no per-post action)
 */
export function LinkTab() {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedWeb10Link | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [post, setPost] = useState<PostRecord | null>(null);
  const [face, setFace] = useState<UserFace | null>(null);
  const [userPosts, setUserPosts] = useState<PostRecord[] | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const [hidingUser, setHidingUser] = useState(false);
  const [userHidden, setUserHidden] = useState(false);
  const [banningUser, setBanningUser] = useState(false);
  const [userBanned, setUserBanned] = useState(false);
  const [hidingPost, setHidingPost] = useState(false);
  const [postHidden, setPostHidden] = useState(false);

  const load = useCallback(async () => {
    const link = parseWeb10Link(input);
    setParsed(null);
    setPost(null);
    setFace(null);
    setUserPosts(null);
    setContentError(null);
    setPostHidden(false);
    setUserHidden(false);
    setUserBanned(false);

    if (!link) {
      setParseError('That doesn\u2019t look like a web10 link (e.g. https://…/u/username/p/post-id).');
      return;
    }
    setParseError(null);
    setParsed(link);
    setLoading(true);

    try {
      if (link.kind === 'post' && link.username && link.postId) {
        const [p, f] = await Promise.all([
          readPostById(link.postId),
          lookupUserProfile(link.username),
        ]);
        if (!p) {
          setContentError('Post not found (it may be private or deleted).');
        } else {
          setPost(p);
          setFace(f);
        }
      } else if (link.kind === 'profile' && link.username) {
        const f = await lookupUserProfile(link.username);
        setFace(f);
        const { posts } = await readUserPostsForModeration(link.username);
        setUserPosts(posts);
      }
      // group: nothing to pull up (no per-post action on a group link).
    } catch (e) {
      setContentError(errorMessage(e, 'Failed to load the link'));
    } finally {
      setLoading(false);
    }
  }, [input]);

  const targetUsername = parsed?.username;

  const toggleHideUser = async () => {
    if (!targetUsername) return;
    const hide = !userHidden;
    setHidingUser(true);
    try {
      await setUserAutoHidden(targetUsername, hide);
      setUserHidden(hide);
      toast.success(hide ? `Hiding @${targetUsername} from Discover` : `Restored @${targetUsername} to Discover`);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to update the hidden list'));
    } finally {
      setHidingUser(false);
    }
  };

  const toggleBanUser = async () => {
    if (!targetUsername) return;
    const ban = !userBanned;
    setBanningUser(true);
    try {
      await setUserBannedApi(targetUsername, ban);
      setUserBanned(ban);
      toast.success(ban ? `Banned @${targetUsername}` : `Unbanned @${targetUsername}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to update the ban list'));
    } finally {
      setBanningUser(false);
    }
  };

  const hidePost = async () => {
    if (!post?._id) return;
    setHidingPost(true);
    try {
      await hidePostFromBoard(post._id);
      setPostHidden(true);
      toast.success('Post hidden from Discover');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to hide the post'));
    } finally {
      setHidingPost(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="link-tab">
      <p className="text-xs text-muted-foreground">
        Paste a web10 post or profile link. It pulls up the post and the user so
        you can hide the post (this one) or the user (their future Discover posts).
      </p>

      {/* The paste field */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="https://…/u/username/p/post-id"
            aria-label="Paste a web10 link"
            className="pl-9 font-mono text-xs"
            data-testid="link-input"
          />
        </div>
        <Button onClick={load} disabled={loading || !input.trim()} data-testid="link-load">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : 'Load'}
        </Button>
      </div>

      {parseError && (
        <div className="rounded bg-danger-muted p-3 text-sm text-danger" data-testid="link-parse-error">
          {parseError}
        </div>
      )}

      {loading && (
        <div className="space-y-2" data-testid="link-loading">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {parsed && !loading && (
        <div className="space-y-3" data-testid="link-result">
          {/* The kind badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {parsed.kind === 'post' && <><FileText className="h-3.5 w-3.5" strokeWidth={1.75} /> Post link</>}
            {parsed.kind === 'profile' && <><User className="h-3.5 w-3.5" strokeWidth={1.75} /> Profile link</>}
            {parsed.kind === 'group' && <><Hash className="h-3.5 w-3.5" strokeWidth={1.75} /> Group link</>}
            <span className="font-mono truncate">{input.trim()}</span>
          </div>

          {contentError && (
            <div className="rounded bg-danger-muted p-3 text-sm text-danger" data-testid="link-content-error">
              {contentError}
            </div>
          )}

          {/* The post (post link) */}
          {post && (
            <div className="rounded-lg border border-border bg-card p-3" data-testid="link-post">
              <p className="text-sm text-foreground line-clamp-4 whitespace-pre-wrap">
                {post.text || <span className="text-muted-foreground italic">(media only)</span>}
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  variant={postHidden ? 'outline' : 'brand'}
                  size="sm"
                  disabled={hidingPost || postHidden}
                  onClick={hidePost}
                  data-testid="link-hide-post"
                >
                  {hidingPost ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <>
                      <EyeOff className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                      {postHidden ? 'Hidden' : 'Hide this post'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* The user (post or profile link) */}
          {targetUsername && (
            <div className="rounded-lg border border-border bg-card p-3" data-testid="link-user">
              <div className="flex items-center gap-3">
                {face?.avatar_url ? (
                  <img src={face.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" data-testid="link-user-avatar" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-elevated flex items-center justify-center text-sm font-medium text-muted-foreground">
                    {targetUsername.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{face?.display_name || targetUsername}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">@{targetUsername}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant={userHidden ? 'outline' : 'brand'}
                    size="sm"
                    disabled={hidingUser}
                    onClick={toggleHideUser}
                    data-testid="link-hide-user"
                  >
                    {hidingUser ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                    ) : userHidden ? (
                      <>
                        <EyeOff className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                        Hiding
                      </>
                    ) : (
                      <>
                        <Ban className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                        Hide user
                      </>
                    )}
                  </Button>
                  <Button
                    variant={userBanned ? 'outline' : 'destructive'}
                    size="sm"
                    disabled={banningUser}
                    onClick={toggleBanUser}
                    data-testid="link-ban-user"
                  >
                    {banningUser ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                    ) : userBanned ? (
                      <>
                        <UserX className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                        Unban
                      </>
                    ) : (
                      <>
                        <UserX className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                        Ban user
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Their recent posts (profile link) */}
              {parsed.kind === 'profile' && userPosts && (
                <div className="mt-3 border-t border-border pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Their recent posts</p>
                  {userPosts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No public posts to show.</p>
                  ) : (
                    userPosts.slice(0, 5).map((p) => (
                      <div key={p._id} className="rounded-md border border-border bg-elevated/40 px-3 py-2" data-testid={`link-user-post-${p._id}`}>
                        <p className="text-sm text-foreground line-clamp-2 whitespace-pre-wrap">
                          {p.text || <span className="text-muted-foreground italic">(media only)</span>}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Group link — no per-post action */}
          {parsed.kind === 'group' && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground" data-testid="link-group">
              Group links can&apos;t be moderated from here — open the group to manage
              its posts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
