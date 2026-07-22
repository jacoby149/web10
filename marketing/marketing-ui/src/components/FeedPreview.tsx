import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Heart, MessageCircle, Repeat2, Share2, Image as ImageIcon, Film, Music2, TrendingUp, Users, Zap } from 'lucide-react';

const TABS = [
  { id: 'for-you', label: 'For You', icon: TrendingUp },
  { id: 'following', label: 'Following', icon: Users },
  { id: 'trending', label: 'Trending', icon: Zap },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PLACEHOLDER_POSTS: Record<TabId, Array<{
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
}>> = {
  'for-you': [
    {
      id: '1',
      name: 'Sarah Chen',
      handle: '@sarahchen',
      initial: 'S',
      avatarColor: 'bg-rose-500',
      time: '2m',
      content: 'Just shipped the new studio dashboard. The monetization flow is finally here. This is what ownership looks like.',
      media: 'image',
      likes: '2.4k',
      comments: '186',
      reposts: '412',
    },
    {
      id: '2',
      name: 'Marcus Rivera',
      handle: '@marcusr',
      initial: 'M',
      avatarColor: 'bg-sky-500',
      time: '14m',
      content: 'Day 3 on web10 and every single one of my 40k followers saw my post. No algorithm, no shadow ban. Just... delivery. It\'s wild.',
      media: 'video',
      likes: '8.1k',
      comments: '523',
      reposts: '1.2k',
    },
    {
      id: '3',
      name: 'Aisha Patel',
      handle: '@aishap',
      initial: 'A',
      avatarColor: 'bg-amber-500',
      time: '1h',
      content: 'New track dropping tonight. First time I know 100% of my audience will actually hear about it.',
      media: 'music',
      likes: '5.7k',
      comments: '341',
      reposts: '892',
    },
  ],
  'following': [
    {
      id: '4',
      name: 'James Okonkwo',
      handle: '@jameso',
      initial: 'J',
      avatarColor: 'bg-emerald-500',
      time: '5m',
      content: 'Morning light in Lagos hits different. Shot this before heading to the studio.',
      media: 'image',
      likes: '1.1k',
      comments: '67',
      reposts: '89',
    },
    {
      id: '5',
      name: 'Yuki Tanaka',
      handle: '@yukit',
      initial: 'Y',
      avatarColor: 'bg-violet-500',
      time: '23m',
      content: 'The new composer interface is buttery. Writing a thread feels like it should — no friction between thought and publish.',
      media: 'image',
      likes: '3.3k',
      comments: '204',
      reposts: '567',
    },
    {
      id: '6',
      name: 'Elena Vasquez',
      handle: '@elenav',
      initial: 'E',
      avatarColor: 'bg-pink-500',
      time: '47m',
      content: 'Moved my newsletter audience here. They can actually see the posts now. The migration was painless, the delivery is instant.',
      likes: '4.2k',
      comments: '312',
      reposts: '743',
    },
  ],
  'trending': [
    {
      id: '7',
      name: 'David Kim',
      handle: '@davidk',
      initial: 'D',
      avatarColor: 'bg-indigo-500',
      time: '1h',
      content: 'Thread: Why I migrated 200k followers from three platforms to my web10 node in a weekend. (1/12)',
      media: 'image',
      likes: '24k',
      comments: '1.8k',
      reposts: '5.3k',
    },
    {
      id: '8',
      name: 'Priya Sharma',
      handle: '@priyas',
      initial: 'P',
      avatarColor: 'bg-orange-500',
      time: '2h',
      content: 'The first creator to earn $10k on web10 just hit the milestone. No platform cut, no algorithm penalty. Pure audience relationship.',
      media: 'video',
      likes: '18k',
      comments: '2.1k',
      reposts: '4.7k',
    },
    {
      id: '9',
      name: 'Leo Martinez',
      handle: '@leom',
      initial: 'L',
      avatarColor: 'bg-teal-500',
      time: '3h',
      content: 'Built a web10 lens that shows your posts as a podcast feed. The SDK makes this trivially easy. Anyone can build this now.',
      likes: '11k',
      comments: '892',
      reposts: '3.1k',
    },
  ],
};

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

function PostCard({ post }: { post: (typeof PLACEHOLDER_POSTS)['for-you'][number] }) {
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
              <span className="text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">{post.time}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{post.content}</p>
            {post.media && (
              <div className="mt-3">
                <MediaPlaceholder type={post.media} />
              </div>
            )}
            <div className="mt-3 flex items-center gap-6">
              <button className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-rose-400">
                <Heart className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs">{post.likes}</span>
              </button>
              <button className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-sky-400">
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs">{post.comments}</span>
              </button>
              <button className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-emerald-400">
                <Repeat2 className="h-4 w-4" strokeWidth={1.5} />
                <span className="text-xs">{post.reposts}</span>
              </button>
              <button className="group ml-auto text-muted-foreground transition-colors hover:text-brand-400">
                <Share2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function FeedPreview() {
  const [activeTab, setActiveTab] = useState<TabId>('for-you');

  return (
    <section className="border-b border-border bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center">
          <h2 className="reveal font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            See what's happening.
          </h2>
          <p className="reveal mt-4 text-muted-foreground [animation-delay:80ms]">
            A real-time feed, powered by your node. Every post, every follower, zero algorithm.
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
          {PLACEHOLDER_POSTS[activeTab].map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}

export { FeedPreview };