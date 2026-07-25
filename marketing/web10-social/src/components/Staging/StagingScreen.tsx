import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readStagingPosts,
  movePostToPublic,
  movePostToPrivate,
  deleteStagingPost,
  bulkMovePosts,
  bulkDeleteStagingPosts,
  groupByOrigin,
} from '@/data/staging';
import type { PostRecord, Origin } from '@/data/types';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Globe,
  Lock,
  Trash2,
  Check,
  Loader2,
  Image,
  MessageCircle,
  Video,
  FileText,
  ChevronDown,
  ChevronRight,
  Inbox,
} from 'lucide-react';

const ORIGIN_CONFIG: Record<string, { icon: React.ElementType; label: string; badgeVariant: 'brand' | 'outline' | 'success' | 'warning' | 'danger' }> = {
  instagram: { icon: Image, label: 'Instagram', badgeVariant: 'brand' },
  facebook: { icon: MessageCircle, label: 'Facebook', badgeVariant: 'outline' },
  youtube: { icon: Video, label: 'YouTube', badgeVariant: 'danger' },
  twitter: { icon: FileText, label: 'Twitter', badgeVariant: 'outline' },
  tiktok: { icon: FileText, label: 'TikTok', badgeVariant: 'outline' },
  other: { icon: FileText, label: 'Other', badgeVariant: 'outline' },
  native: { icon: FileText, label: 'Native', badgeVariant: 'outline' },
  web10: { icon: FileText, label: 'web10', badgeVariant: 'outline' },
};

function StagingSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return 'just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function truncateText(text: string, maxLen = 200): string {
  if (!text) return '';
  const stripped = text.replace(/<[^>]*>/g, '').trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped;
}

function StagingItem({
  post,
  onPublished,
  onDeleted,
}: {
  post: PostRecord;
  onPublished: () => void;
  onDeleted: () => void;
}) {
  const [action, setAction] = useState<'idle' | 'publishing' | 'privating' | 'deleting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const origin = post.origin || 'native';
  const config = ORIGIN_CONFIG[origin] || ORIGIN_CONFIG.native;
  const OriginIcon = config.icon;

  const handlePublish = async () => {
    setAction('publishing');
    setError(null);
    try {
      await movePostToPublic(post);
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish');
    }
    setAction('idle');
  };

  const handlePrivate = async () => {
    setAction('privating');
    setError(null);
    try {
      await movePostToPrivate(post);
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to keep private');
    }
    setAction('idle');
  };

  const handleDelete = async () => {
    setAction('deleting');
    setError(null);
    try {
      await deleteStagingPost(post._id!);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
    setAction('idle');
  };

  const isBusy = action !== 'idle';

  return (
    <Card
      data-testid="staging-item"
      className="group border-border/60 bg-surface hover:border-border transition-all duration-150 hover:shadow-md hover:shadow-brand/5"
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="flex items-center gap-1.5">
                <OriginIcon className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
                <Badge variant={config.badgeVariant}>{config.label}</Badge>
              </span>
              <span className="text-xs text-muted-foreground">{formatTime(post.created_at)}</span>
              {post.tags?.length ? (
                <div className="flex gap-1">
                  {post.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline">#{tag}</Badge>
                  ))}
                </div>
              ) : null}
            </div>
            {post.text && (
              <p className="text-sm text-foreground leading-relaxed line-clamp-3">
                {truncateText(post.text)}
              </p>
            )}
            {post.media_refs?.length ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-brand/40" />
                {post.media_refs.length} media attachment{post.media_refs.length > 1 ? 's' : ''}
              </div>
            ) : null}
          </div>
          <div className={cn(
            'flex items-center gap-1 shrink-0',
            isBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            'transition-opacity duration-150',
          )}>
            <Button
              variant="brand"
              size="sm"
              data-testid="staging-publish-public"
              disabled={isBusy}
              onClick={handlePublish}
              className="gap-1.5 h-8"
              aria-label="Publish publicly"
            >
              {action === 'publishing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
              Public
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="staging-keep-private"
              disabled={isBusy}
              onClick={handlePrivate}
              className="gap-1.5 h-8"
              aria-label="Keep private"
            >
              {action === 'privating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Private
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="staging-delete"
              disabled={isBusy}
              onClick={handleDelete}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-danger"
              aria-label="Delete"
            >
              {action === 'deleting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {error && (
          <div className="mt-2 text-xs text-danger" role="alert">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}

function OriginGroup({
  origin,
  posts,
  onPublished,
  onDeleted,
}: {
  origin: Origin | 'native';
  posts: PostRecord[];
  onPublished: () => void;
  onDeleted: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'idle' | 'publishing' | 'privating' | 'deleting'>('idle');
  const config = ORIGIN_CONFIG[origin] || ORIGIN_CONFIG.native;
  const OriginIcon = config.icon;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === posts.length ? new Set() : new Set(posts.map((p) => p._id || '')),
    );
  }, [posts]);

  const handleBulkPublish = async () => {
    setBulkAction('publishing');
    try {
      await bulkMovePosts(posts.filter((p) => selected.has(p._id || '')), 'public');
      onPublished();
    } catch (e) {
      console.error('Bulk publish failed:', e);
    }
    setBulkAction('idle');
  };

  const handleBulkPrivate = async () => {
    setBulkAction('privating');
    try {
      await bulkMovePosts(posts.filter((p) => selected.has(p._id || '')), 'private');
      onPublished();
    } catch (e) {
      console.error('Bulk private failed:', e);
    }
    setBulkAction('idle');
  };

  const handleBulkDelete = async () => {
    setBulkAction('deleting');
    try {
      await bulkDeleteStagingPosts([...selected]);
      onPublished();
    } catch (e) {
      console.error('Bulk delete failed:', e);
    }
    setBulkAction('idle');
  };

  const hasSelection = selected.size > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          data-testid="staging-origin-header"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-brand-300 transition-colors duration-150"
        >
          <ChevronDown className={cn('w-4 h-4 transition-transform duration-150', collapsed && '-rotate-90')} />
          <OriginIcon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          <span>{config.label}</span>
          <Badge variant="outline">{posts.length}</Badge>
        </button>
        {hasSelection && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="brand"
              size="sm"
              disabled={bulkAction !== 'idle'}
              onClick={handleBulkPublish}
              className="h-7 text-xs gap-1"
            >
              {bulkAction === 'publishing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
              Publish ({selected.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkAction !== 'idle'}
              onClick={handleBulkPrivate}
              className="h-7 text-xs gap-1"
            >
              {bulkAction === 'privating' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
              Private
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkAction !== 'idle'}
              onClick={handleBulkDelete}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-danger"
            >
              {bulkAction === 'deleting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </Button>
          </div>
        )}
      </div>
      {!collapsed && (
        <>
          {posts.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
              >
                {selected.size === posts.length ? <Check className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                {selected.size === posts.length ? 'Deselect all' : 'Select all'}
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post._id} className="flex items-start gap-2">
                <button
                  onClick={() => toggleSelect(post._id || '')}
                  className={cn(
                    'mt-1.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all duration-150',
                    selected.has(post._id || '')
                      ? 'bg-brand border-brand text-brand-foreground'
                      : 'border-border hover:border-brand/50',
                  )}
                  aria-label={selected.has(post._id || '') ? 'Deselect' : 'Select'}
                >
                  {selected.has(post._id || '') && <Check className="w-3 h-3" />}
                </button>
                <div className="flex-1">
                  <StagingItem post={post} onPublished={onPublished} onDeleted={onDeleted} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function StagingScreen() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readStagingPosts();
      setPosts(data);
    } catch (e) {
      console.error('Failed to load staging posts:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts, refreshKey]);

  const handleAction = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const groups = groupByOrigin(posts);
  const originOrder: (Origin | 'native')[] = ['instagram', 'facebook', 'youtube', 'twitter', 'tiktok', 'other', 'native'];

  if (loading) return <StagingSkeleton />;

  if (posts.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-elevated border border-border flex items-center justify-center">
            <Inbox className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-display text-lg font-medium text-foreground mb-1">Nothing to review</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Imported posts appear here for review before they go public.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/feed')}
            className="gap-1.5 mt-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to feed
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Review imports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {posts.length} post{posts.length > 1 ? 's' : ''} awaiting triage
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {originOrder
          .filter((o) => groups.has(o))
          .map((origin) => (
            <OriginGroup
              key={String(origin)}
              origin={origin}
              posts={groups.get(origin)!}
              onPublished={handleAction}
              onDeleted={handleAction}
            />
          ))}
      </div>
    </div>
  );
}