import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Heart,
  MessageCircle,
  ArrowUp,
  ArrowDown,
  Flame,
  Clock,
  ClockArrowDown,
} from 'lucide-react';
import type { PostRecord, InboxRecord, MediaRecord, FeedSort, ProfileRecord } from '@/data';
import {
  readFeed,
  readPost,
  countReactions,
  countComments,
  resolveMediaRefs,
  readUserProfile,
} from '@/data';

export default function FeedScreen() {
  const [posts, setPosts] = useState<InboxRecord[]>([]);
  const [sort, setSort] = useState<FeedSort>('newest');
  const [loading, setLoading] = useState(true);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [postDetails, setPostDetails] = useState<Record<string, PostRecord>>({});
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, ProfileRecord>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const records = await readFeed(sort);
      setPosts(records);

      const postPromises = records.map((r) => readPost(r.post_id));
      const profilePromises = records.map((r) =>
        readUserProfile(r.author_username, r.author_provider),
      );

      const fetchedPosts = await Promise.allSettled(postPromises);
      const fetchedProfiles = await Promise.allSettled(profilePromises);

      const details: Record<string, PostRecord> = {};
      fetchedPosts.forEach((p, i) => {
        if (p.status === 'fulfilled' && p.value) {
          details[records[i].post_id] = p.value;
        }
      });
      setPostDetails(details);

      const profiles: Record<string, ProfileRecord> = {};
      fetchedProfiles.forEach((p, i) => {
        if (p.status === 'fulfilled' && p.value) {
          const key = `${records[i].author_username}@${records[i].author_provider}`;
          profiles[key] = p.value;
        }
      });
      setAuthorProfiles(profiles);

      // Load reaction and comment counts
      const counts: Record<string, number> = {};
      const comments: Record<string, number> = {};
      for (const r of records) {
        const [rc, cc] = await Promise.all([
          countReactions('posts', r.post_id),
          countComments(r.post_id),
        ]);
        counts[r.post_id] = rc;
        comments[r.post_id] = cc;
      }
      setReactionCounts(counts);
      setCommentCounts(comments);

      // Resolve media refs
      const allMedia: Record<string, MediaRecord> = {};
      for (const [_, post] of Object.entries(details)) {
        if (post.media_refs?.length) {
          const media = await resolveMediaRefs(post.media_refs);
          media.forEach((m) => {
            if (m._id) allMedia[m._id] = m;
          });
        }
      }
      setMediaMap(allMedia);
    } catch (e) {
      console.error('Failed to load feed:', e);
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const sortIcon = (s: FeedSort) => {
    switch (s) {
      case 'newest': return <Clock className="w-4 h-4" />;
      case 'oldest': return <ClockArrowDown className="w-4 h-4" />;
      case 'most_reacted': return <Flame className="w-4 h-4" />;
    }
  };

  const sortLabel = (s: FeedSort) => {
    switch (s) {
      case 'newest': return 'Newest first';
      case 'oldest': return 'Oldest first';
      case 'most_reacted': return 'Most reacted';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand rounded-full border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Loading your feed...</p>
        </div>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
          <Flame className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Your feed is empty</h2>
          <p className="text-muted-foreground text-sm max-w-xs mb-6">
            Follow creators to start seeing posts. Or import your Instagram to seed your feed with your existing life.
          </p>
          <Button variant="brand" size="lg" onClick={() => window.open('/exporters', '_blank')}>
            Import your Instagram
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <div className="flex items-center gap-2">
          {sortIcon(sort)}
          <Select value={sort} onChange={(e) => setSort(e.target.value as FeedSort)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_reacted">Most reacted</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {posts.map((item) => {
          const post = postDetails[item.post_id];
          const authorKey = `${item.author_username}@${item.author_provider}`;
          const profile = authorProfiles[authorKey];
          const displayName = profile?.display_name || item.author_username;
          const initials = displayName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
          const isExpanded = expandedPost === item.post_id;

          return (
            <article
              key={item._id || item.post_id}
              className="bg-card rounded-xl border overflow-hidden transition-shadow hover:shadow-lg hover:shadow-black/20"
            >
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar>
                    {profile?.avatar_ref && mediaMap[profile.avatar_ref] ? (
                      <AvatarImage src={mediaMap[profile.avatar_ref].url} alt={displayName} />
                    ) : (
                      <AvatarFallback className="bg-brand text-brand-foreground text-sm font-semibold">
                        {initials}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.author_username} · {new Date(item.delivered_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {post?.text && (
                  <p className={cn(
                    'text-sm leading-relaxed mb-3',
                    !isExpanded && 'line-clamp-3',
                  )}>
                    {post.text}
                  </p>
                )}

                {post?.media_refs?.length && (
                  <div className={cn(
                    'grid gap-2 mb-3',
                    post.media_refs.length === 1 ? 'grid-cols-1' :
                    post.media_refs.length === 2 ? 'grid-cols-2' :
                    post.media_refs.length === 3 ? 'grid-cols-2' :
                    'grid-cols-3',
                  )}>
                    {post.media_refs.map((ref) => {
                      const media = mediaMap[ref];
                      if (!media) return null;
                      return (
                        <div
                          key={ref}
                          className="aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer"
                          onClick={() => setExpandedPost(isExpanded ? null : item.post_id)}
                        >
                          <img
                            src={media.thumbnail_url || media.url}
                            alt={media.alt_text || ''}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {post?.tags?.length && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 pt-2 border-t">
                  <button
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm group"
                    onClick={() => setExpandedPost(isExpanded ? null : item.post_id)}
                  >
                    <Heart className="w-4 h-4 group-hover:text-red-500 transition-colors" />
                    <span>{reactionCounts[item.post_id] || 0}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
                    <MessageCircle className="w-4 h-4" />
                    <span>{commentCounts[item.post_id] || 0}</span>
                  </button>
                  {(post?.origin || 'web10') !== 'web10' && (
                    <span className="ml-auto text-xs text-muted-foreground uppercase tracking-wider">
                      {post.origin}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}