import { useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { PostCard, SkeletonCard, fetchDiscoverFeed, mapDiscoveryToFeedPost, formatCount, parseCount } from '../components/FeedPreview';
import type { FeedPost } from '../components/FeedPreview';

function Trending() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const results = await fetchDiscoverFeed('trending', 20);
      setPosts(results.map(mapDiscoveryToFeedPost));
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleReaction = async (postId: string, type: 'like' | 'comment' | 'repost') => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const countKey = type === 'like' ? 'likes' : type === 'comment' ? 'comments' : 'reposts';
      const current = parseCount(p[countKey as 'likes' | 'comments' | 'reposts']);
      const newVal = current >= 0 ? current + 1 : 1;
      return { ...p, [countKey]: formatCount(newVal) };
    }));
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Zap className="h-6 w-6 text-brand-400" strokeWidth={1.5} />
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground">
            Trending
          </h1>
          <span className="text-sm text-muted-foreground">
            across the network
          </span>
        </div>
      </header>

      {/* Feed */}
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex flex-col gap-3">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
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
                : Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`empty-${i}`} />)
            }
          </div>
        </div>
      </main>
    </div>
  );
}

export default Trending;
