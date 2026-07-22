import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Heart, MessageCircle, Repeat2, Share2, Image as ImageIcon, Film, Music2, Zap } from 'lucide-react';

const TRENDING_POSTS: Array<{
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
}> = [
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
  {
    id: '4',
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
    id: '5',
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
];

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

function PostCard({ post }: { post: typeof TRENDING_POSTS[number] }) {
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
              <span className="text-muted-foreground">&#8226;</span>
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

        <div className="reveal flex flex-col gap-3 [animation-delay:160ms]">
          {TRENDING_POSTS.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}

export { FeedPreview };
