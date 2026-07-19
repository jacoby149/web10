import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { readFeed, readProfile, readMyPosts, resolveMediaRefs } from '@/data';
import { getWapi } from '@/data/wapi';
import type { InboxRecord, PostRecord, MediaRecord, FeedSort, ProfileRecord } from '@/data/types';
import { Heart, MessageCircle, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
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

function PostCard({ post, authorName, authorAvatar, mediaItems, reactionCount }: {
  post: PostRecord;
  authorName: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  reactionCount: number;
}) {
  return (
    <div className="bg-card border-b border-border px-4 py-4">
      <div className="flex gap-3">
        <Avatar className="h-10 w-10">
          {authorAvatar ? (
            <AvatarImage src={authorAvatar} alt={authorName} />
          ) : (
            <AvatarFallback className="bg-brand/20 text-brand text-sm font-semibold">
              {authorName.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground truncate">{authorName}</span>
            <span className="text-xs text-muted-foreground">{formatTimeAgo(post.created_at)}</span>
          </div>
          {post.text && (
            <p className="mt-1 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
              {post.text}
            </p>
          )}
          {mediaItems.length > 0 && (
            <div className={cn(
              'mt-3 grid gap-2 rounded-xl overflow-hidden',
              mediaItems.length === 1 ? 'grid-cols-1' :
              mediaItems.length === 2 ? 'grid-cols-2' :
              mediaItems.length === 3 ? 'grid-cols-3' :
              'grid-cols-3',
            )}>
              {mediaItems.slice(0, 4).map((m, i) => (
                <div key={i} className="aspect-square bg-muted overflow-hidden">
                  <img
                    src={m.url}
                    alt={m.alt_text || ''}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-6">
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group">
              <Heart className="w-4 h-4 group-hover:text-red-500 transition-colors" />
              <span className="text-xs">{reactionCount || ''}</span>
            </button>
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group">
              <MessageCircle className="w-4 h-4 group-hover:text-blue-500 transition-colors" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-brand" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">Your feed is empty</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Import your Instagram, Facebook, or YouTube to fill your feed with your existing posts and connections.
      </p>
      <Button
        variant="brand"
        className="gap-2"
        onClick={() => window.open('/exporters', '_blank')}
      >
        Import your Instagram
      </Button>
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
  const [profileMap, setProfileMap] = useState<Record<string, ProfileRecord>>({});

  useEffect(() => {
    loadFeed();
  }, [sort]);

  async function loadFeed() {
    setLoading(true);
    try {
      const feed = await readFeed(sort);
      setItems(feed);

      const postIds = [...new Set(feed.map(f => f.post_id))];
      const token = getWapi().readToken();
      if (!token) return;

      const posts: Record<string, PostRecord> = {};
      const profiles: Record<string, ProfileRecord> = {};
      const allMediaRefs: string[] = [];

      for (const item of feed) {
        if (item.post_body) {
          posts[item.post_id] = item.post_body as PostRecord;
        }
        const authorKey = `${item.author_username}@${item.author_provider}`;
        if (!profiles[authorKey]) {
          const profile = await readProfile();
          if (item.author_username === token.username) {
            profiles[authorKey] = profile || {};
          } else {
            const userProfiles = await readProfile();
            profiles[authorKey] = userProfiles || { display_name: item.author_username };
          }
        }
      }

      const myPosts = await readMyPosts();
      for (const p of myPosts) {
        posts[p._id || ''] = p;
        if (p.media_refs) allMediaRefs.push(...p.media_refs);
      }

      for (const p of Object.values(posts)) {
        if (p.media_refs) allMediaRefs.push(...p.media_refs);
      }

      const uniqueRefs = [...new Set(allMediaRefs)];
      const mediaRecords = await resolveMediaRefs(uniqueRefs);
      const mMedia: Record<string, MediaRecord[]> = {};
      for (const p of Object.values(posts)) {
        if (p.media_refs) {
          mMedia[p._id || ''] = mediaRecords.filter(m => p.media_refs?.includes(m._id || ''));
        }
      }

      setPostsMap(posts);
      setMediaMap(mMedia);
      setProfileMap(profiles);
    } catch (e) {
      console.error('Failed to load feed:', e);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!items.length) {
    return <FeedEmptyState />;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-foreground">Feed</h1>
          <div className="flex items-center gap-2">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as FeedSort)}
              className="h-8 text-xs w-28 bg-secondary/50 border-0 text-foreground"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="most_reacted">Most Reacted</option>
            </Select>
          </div>
        </div>
      </div>
      <div>
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
              authorAvatar={profile?.avatar_ref}
              mediaItems={mediaItems}
              reactionCount={reactionMap[item.post_id] || 0}
            />
          );
        })}
      </div>
    </div>
  );
}