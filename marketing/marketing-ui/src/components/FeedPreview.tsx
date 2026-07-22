import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, MessageCircle, Repeat2, Share2, Image as ImageIcon, Film, Music2, TrendingUp, Users, Zap } from 'lucide-react';

const TABS = [
  { id: 'for-you', label: 'For You', icon: TrendingUp, sort: 'trending' as const },
  { id: 'following', label: 'Following', icon: Users, sort: 'recent' as const },
  { id: 'trending', label: 'Trending', icon: Zap, sort: 'trending' as const },
] as const;

type TabId = (typeof TABS)[number]['id'];

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'https://api.web10.app';

interface DiscoveryPost {
  author: string;
  service: string;
  post_id: string;
  body_text: string;
  tags: string[];
  created_at: string;
  engagement: {
    likes: number;
    comments: number;
    reposts: number;
  };
  engagement_score: number;
}

interface FeedPost {
  id: string;
  name: string;
  handle: string;
  initial: string;
  avatarColor: string;
  time: string;
  content: string;
  media?: 'image' | 'video' | 'music';
  likes: string;
  comments: string;
  reposts: string;
}

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500', 'bg-red-500',
];

function hashToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function parseCount(s: string): number {
  const num = parseFloat(s);
  if (isNaN(num)) return -1;
  if (s.includes('k')) return Math.round(num * 1000);
  return num;
}

function mapDiscoveryToFeedPost(d: DiscoveryPost): FeedPost {
  const name = d.author.replace(/[-_]/g, ' ');
  const tags = d.tags || [];
  return {
    id: d.post_id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    handle: `@${d.author}`,
    initial: d.author.charAt(0).toUpperCase(),
    avatarColor: hashToColor(d.author),
    time: timeAgo(d.created_at),
    content: d.body_text || '',
    media: tags.includes('video') ? 'video' : tags.includes('image') ? 'image' : tags.includes('music') ? 'music' : undefined,
    likes: formatCount(d.engagement.likes),
    comments: formatCount(d.engagement.comments),
    reposts: formatCount(d.engagement.reposts),
  };
}

function MediaPlaceholder({ type }: { type: 'image' | 'video' | 'music' }) {
  if (type === 'video') {
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-elevated">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm">
            <Film className="h-5 w-5 text-foreground/60" />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
      </div>
    );
  }
  if (type === 'music') {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-elevated p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand-muted">
          <Music2 className="h-5 w-5 text-brand-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-2 w-24 rounded-full bg-muted-foreground/30" />
          <div className="mt-2 h-1 w-full rounded-full bg-muted-foreground/20">
            <div className="h-full w-2/5 rounded-full bg-brand" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="aspect-[4/3] w-full overflow-hidden bg-elevated">
      <div className="flex h-full w-full items-center justify-center">
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      </div>
    </div>
  );
}

function PostCard({
  post,
  onLike,
  onComment,
  onRepost,
}: {
  post: FeedPost;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onRepost: (postId: string) => void;
}) {
  return (
    <Card className="bg-surface">
      <div className="p-4">
        <div className="flex gap-3">
          <Avatar className={post.avatarColor}>
            <AvatarFallback className="text-foreground">{post.initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">{post.name}</span>
              <span className="text-sm text-muted-foreground">{post.handle}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{post.time}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{post.content}</p>
            {post.media && (
              <div className="mt-3">
                <MediaPlaceholder type={post.media} />
              </div>
            )}
            <div className="mt-3 flex items-center gap-6">
              <button
                onClick={() => onLike(post.id)}
                className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-rose-400"
                aria-label={`Like, ${post.likes} likes`}
              >
                <Heart className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs">{post.likes}</span>
              </button>
              <button
                onClick={() => onComment(post.id)}
                className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-sky-400"
                aria-label={`Comment, ${post.comments} comments`}
              >
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs">{post.comments}</span>
              </button>
              <button
                onClick={() => onRepost(post.id)}
                className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-emerald-400"
                aria-label={`Repost, ${post.reposts} reposts`}
              >
                <Repeat2 className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs">{post.reposts}</span>
              </button>
              <button className="group ml-auto text-muted-foreground transition-colors hover:text-brand-400" aria-label="Share">
                <Share2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="bg-surface">
      <div className="p-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-8" />
            </div>
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-3/4" />
            <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg">
              <Skeleton className="h-full w-full" />
            </div>
            <div className="mt-3 flex gap-6">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

async function fetchDiscoverFeed(sort: 'recent' | 'trending', limit = 6): Promise<DiscoveryPost[]> {
  const resp = await fetch(`${API_ORIGIN}/discover/posts`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { sort, limit } }),
  });
  if (!resp.ok) return [];
  return resp.json();
}

async function createPublicEntry(schemaId: string, target: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const resp = await fetch(`${API_ORIGIN}/public/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { schema_id: schemaId, target, payload } }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function fetchReactionSchemaId(): Promise<string | null> {
  try {
    const resp = await fetch(`${API_ORIGIN}/schemas/reaction`, { method: 'PATCH' });
    if (resp.ok) {
      const schema = await resp.json();
      return schema._id || null;
    }
  } catch {
    // Schema registry unreachable
  }
  return null;
}

function FeedPreview() {
  const [activeTab, setActiveTab] = useState<TabId>('for-you');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactionSchemaId, setReactionSchemaId] = useState<string | null>(null);

  const tabConfig = TABS.find(t => t.id === activeTab)!;

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const results = await fetchDiscoverFeed(tabConfig.sort, 6);
      if (results.length > 0) {
        setPosts(results.map(mapDiscoveryToFeedPost));
      } else {
        setPosts([]);
      }
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [tabConfig.sort]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    fetchReactionSchemaId().then(id => setReactionSchemaId(id));
  }, []);

  const handleReaction = async (postId: string, type: 'like' | 'comment' | 'repost') => {
    if (!reactionSchemaId) return;
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const countKey = type === 'like' ? 'likes' : type === 'comment' ? 'comments' : 'reposts';
      const current = parseCount(p[countKey as 'likes' | 'comments' | 'reposts']);
      const newVal = current >= 0 ? current + 1 : 1;
      return { ...p, [countKey]: formatCount(newVal) };
    }));
    await createPublicEntry(reactionSchemaId, `post:${postId}`, { type, target: postId });
  };

  return (
    <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-5 w-5 text-brand-400" strokeWidth={1.5} />
            <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
              Trending
            </h2>
          </div>
          <p className="reveal mt-4 text-muted-foreground [animation-delay:80ms]">
            What's moving right now across the network.
          </p>
        </div>

        <div className="reveal mb-6 [animation-delay:160ms]">
          <div className="flex border-b border-border">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="reveal flex flex-col gap-3 [animation-delay:240ms]">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            : posts.length > 0
              ? posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={(id) => handleReaction(id, 'like')}
                    onComment={(id) => handleReaction(id, 'comment')}
                    onRepost={(id) => handleReaction(id, 'repost')}
                  />
                ))
              : Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`empty-${i}`} />)
          }
        </div>
      </div>
    </section>
  );
}

export { FeedPreview, PostCard, SkeletonCard, fetchDiscoverFeed, mapDiscoveryToFeedPost, formatCount, parseCount, type FeedPost, type DiscoveryPost };
