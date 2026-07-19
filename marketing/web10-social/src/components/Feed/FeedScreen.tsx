import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readFeed,
  readProfile,
  readUserProfile,
  readMyPosts,
  resolveMediaRefs,
  countReactions,
  countComments,
  readComments,
  createComment,
  toggleReaction,
} from '@/data';
import { getWapi } from '@/data/wapi';
import type {
  InboxRecord,
  PostRecord,
  MediaRecord,
  FeedSort,
  ProfileRecord,
  CommentRecord,
} from '@/data/types';
import { Heart, MessageCircle, Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function MediaGrid({ mediaItems }: { mediaItems: MediaRecord[] }) {
  if (!mediaItems.length) return null;
  const count = mediaItems.length;
  return (
    <div
      className={cn(
        'grid gap-0.5 bg-background overflow-hidden',
        count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-3',
      )}
    >
      {mediaItems.slice(0, 6).map((m, i) => (
        <div
          key={m._id || i}
          className={cn('bg-elevated overflow-hidden', count === 1 ? 'aspect-[4/3]' : 'aspect-square')}
        >
          <img
            src={m.thumbnail_url || m.url}
            alt={m.alt_text || ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

interface CommentThreadProps {
  postId: string;
  isOpen: boolean;
  count: number;
  onCountChange: (n: number) => void;
}

function CommentThread({ postId, isOpen, onCountChange }: CommentThreadProps) {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    readComments(postId)
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch((e) => console.error('Failed to load comments:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, postId]);

  async function handleSend() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const created = await createComment({
        post_id: postId,
        text: draft.trim(),
        created_at: new Date().toISOString(),
      });
      const next = [...comments, created];
      setComments(next);
      onCountChange(next.length);
      setDraft('');
    } catch (e) {
      console.error('Failed to add comment:', e);
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="border-t border-border px-4 py-3 space-y-3" data-testid="comment-thread">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : comments.length ? (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c._id} className="text-sm leading-relaxed">
              <span className="font-medium text-foreground">{c.author_username || 'you'}</span>{' '}
              <span className="text-foreground">{c.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          data-testid="comment-input"
          disabled={sending}
          className="h-9"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          data-testid="comment-send"
          disabled={sending || !draft.trim()}
          aria-label="Send comment"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}

interface PostCardProps {
  post: PostRecord;
  authorName: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  reactionCount: number;
  commentCount: number;
  liked: boolean;
  timestamp: string;
  onToggleLike: () => void;
  onCommentCountChange: (n: number) => void;
}

function PostCard({
  post,
  authorName,
  authorAvatar,
  mediaItems,
  reactionCount,
  commentCount,
  liked,
  timestamp,
  onToggleLike,
  onCommentCountChange,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [localCount, setLocalCount] = useState(commentCount);

  return (
    <article
      data-testid="post-card"
      className="bg-card border-b border-border md:border md:rounded-lg md:mb-4 overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar className="h-9 w-9">
          {authorAvatar ? (
            <AvatarImage src={authorAvatar} alt={authorName} />
          ) : (
            <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
              {authorName.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <span className="font-medium text-sm text-foreground truncate">{authorName}</span>
          <span className="text-[0.8125rem] text-muted-foreground shrink-0">· {formatTimeAgo(timestamp)}</span>
        </div>
      </div>

      <MediaGrid mediaItems={mediaItems} />

      {post.text && (
        <p className="px-4 pt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {post.text}
        </p>
      )}

      {post.tags?.length ? (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {post.tags.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-elevated text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1 px-2 py-2">
        <button
          data-testid="like-button"
          aria-pressed={liked}
          onClick={onToggleLike}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-2 rounded min-h-10 text-sm transition-colors duration-150',
            liked ? 'text-danger' : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
          )}
        >
          <Heart className="w-[18px] h-[18px]" strokeWidth={1.75} fill={liked ? 'currentColor' : 'none'} />
          <span className="tabular-nums">{reactionCount || ''}</span>
        </button>
        <button
          data-testid="comment-button"
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((o) => !o)}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded min-h-10 text-sm text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150"
        >
          <MessageCircle className="w-[18px] h-[18px]" strokeWidth={1.75} />
          <span className="tabular-nums">{localCount || ''}</span>
        </button>
        {(post.origin || 'web10') !== 'web10' && (
          <span className="ml-auto mr-2 text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
            {post.origin}
          </span>
        )}
      </div>

      <CommentThread
        postId={post._id || ''}
        isOpen={commentsOpen}
        count={localCount}
        onCountChange={(n) => {
          setLocalCount(n);
          onCommentCountChange(n);
        }}
      />
    </article>
  );
}

function FeedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center" data-testid="feed-empty">
      <div className="w-16 h-16 rounded-2xl bg-brand-muted flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-brand-300" />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground mb-2">Your feed is empty</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Import your Instagram, Facebook, or YouTube to fill your feed with your existing posts and connections.
      </p>
      <Button variant="brand" data-testid="feed-import-cta" className="gap-2" onClick={() => window.open('/exporters', '_blank')}>
        Import your Instagram
      </Button>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-0 md:space-y-4 md:p-4" data-testid="feed-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card border-b border-border md:border md:rounded-lg overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="w-full aspect-[4/3] rounded-none" />
          <div className="px-4 py-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedScreen() {
  const [items, setItems] = useState<InboxRecord[]>([]);
  const [sort, setSort] = useState<FeedSort>('newest');
  const [loading, setLoading] = useState(true);
  const [postsMap, setPostsMap] = useState<Record<string, PostRecord>>({});
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord[]>>({});
  const [reactionMap, setReactionMap] = useState<Record<string, number>>({});
  const [commentMap, setCommentMap] = useState<Record<string, number>>({});
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [profileMap, setProfileMap] = useState<Record<string, ProfileRecord>>({});

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const feed = await readFeed(sort);
      setItems(feed);

      const token = getWapi().readToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const posts: Record<string, PostRecord> = {};
      const profiles: Record<string, ProfileRecord> = {};

      for (const item of feed) {
        if (item.post_body) {
          posts[item.post_id] = item.post_body as unknown as PostRecord;
        }
        const authorKey = `${item.author_username}@${item.author_provider}`;
        if (!profiles[authorKey]) {
          const profile =
            item.author_username === token.username
              ? await readProfile()
              : await readUserProfile(item.author_username, item.author_provider);
          profiles[authorKey] = profile || { display_name: item.author_username };
        }
      }

      const myPosts = await readMyPosts();
      for (const p of myPosts) {
        if (p._id) posts[p._id] = p;
      }

      const allMediaRefs = [...new Set(Object.values(posts).flatMap((p) => p.media_refs || []))];
      const mediaRecords = allMediaRefs.length ? await resolveMediaRefs(allMediaRefs) : [];
      const mMedia: Record<string, MediaRecord[]> = {};
      for (const p of Object.values(posts)) {
        if (p.media_refs?.length && p._id) {
          mMedia[p._id] = mediaRecords.filter((m) => p.media_refs?.includes(m._id || ''));
        }
      }

      const reactions: Record<string, number> = {};
      const comments: Record<string, number> = {};
      const liked: Record<string, boolean> = {};
      await Promise.all(
        feed.map(async (item) => {
          const [rc, cc] = await Promise.all([
            countReactions('posts', item.post_id),
            countComments(item.post_id),
          ]);
          reactions[item.post_id] = rc;
          comments[item.post_id] = cc;
        }),
      );

      setPostsMap(posts);
      setMediaMap(mMedia);
      setProfileMap(profiles);
      setReactionMap(reactions);
      setCommentMap(comments);
      setLikedMap(liked);
    } catch (e) {
      console.error('Failed to load feed:', e);
    }
    setLoading(false);
  }, [sort]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  async function handleToggleLike(postId: string) {
    const token = getWapi().readToken();
    if (!token) return;
    setLikedMap((prev) => ({ ...prev, [postId]: !prev[postId] }));
    setReactionMap((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + (likedMap[postId] ? -1 : 1) }));
    try {
      await toggleReaction('posts', postId, 'like', token.username, token.provider);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      // Roll back optimistic update on failure.
      setLikedMap((prev) => ({ ...prev, [postId]: !prev[postId] }));
      setReactionMap((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + (likedMap[postId] ? 1 : -1) }));
    }
  }

  if (loading) {
    return <FeedSkeleton />;
  }

  if (!items.length) {
    return <FeedEmptyState />;
  }

  return (
    <div className="md:max-w-xl md:mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
        <div className="flex items-center justify-between px-4 py-3 md:px-0">
          <h1 className="font-display text-lg font-bold text-foreground">Feed</h1>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as FeedSort)}
            data-testid="feed-sort"
            className="h-8 text-xs w-32 bg-elevated border-0 text-foreground"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_reacted">Most reacted</option>
          </Select>
        </div>
      </div>
      <div className="md:px-0">
        {items.map((item) => {
          const post = postsMap[item.post_id];
          if (!post) return null;
          const authorKey = `${item.author_username}@${item.author_provider}`;
          const profile = profileMap[authorKey];
          const mediaItems = mediaMap[item.post_id] || [];

          return (
            <PostCard
              key={item._id || item.post_id}
              post={post}
              authorName={profile?.display_name || item.author_username}
              authorAvatar={
                profile?.avatar_ref
                  ? mediaMap[item.post_id]?.find((m) => m._id === profile.avatar_ref)?.url
                  : undefined
              }
              mediaItems={mediaItems}
              reactionCount={reactionMap[item.post_id] || 0}
              commentCount={commentMap[item.post_id] || 0}
              liked={!!likedMap[item.post_id]}
              timestamp={post.created_at || item.delivered_at}
              onToggleLike={() => handleToggleLike(item.post_id)}
              onCommentCountChange={(n) =>
                setCommentMap((prev) => ({ ...prev, [item.post_id]: n }))
              }
            />
          );
        })}
      </div>
    </div>
  );
}
