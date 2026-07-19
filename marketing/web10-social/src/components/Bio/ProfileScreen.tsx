import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { readProfile, saveProfile, readMyPosts, resolveMediaRefs, uploadMedia } from '@/data';
import type { ProfileRecord, PostRecord, MediaRecord } from '@/data/types';
import { User, MapPin, Globe, Link, Camera, Edit3, Check, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

function ProfileEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-brand" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">Your profile is empty</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Import your Instagram to fill your profile with your existing posts, followers, and media.
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

export default function ProfileScreen() {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ProfileRecord>>({});
  const [activeTab, setActiveTab] = useState<'posts' | 'media'>('posts');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [p, postsData] = await Promise.all([
        readProfile(),
        readMyPosts(),
      ]);
      setProfile(p);
      setDraft(p || {});
      setPosts(postsData || []);

      const allRefs = (postsData || []).flatMap(post => post.media_refs || []);
      if (allRefs.length) {
        const media = await resolveMediaRefs(allRefs);
        const map: Record<string, MediaRecord> = {};
        media.forEach(m => { if (m._id) map[m._id] = m; });
        setMediaMap(map);
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    }
    setLoading(false);
  }

  async function handleSave() {
    try {
      const saved = await saveProfile(draft);
      setProfile(saved);
      setEditing(false);
    } catch (e) {
      console.error('Failed to save profile:', e);
    }
  }

  const mediaPosts = posts.filter(p => p.media_refs?.length);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile && !posts.length) {
    return <ProfileEmptyState />;
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-6">
          <div className="relative group">
            <Avatar className="h-24 w-24">
              {profile?.avatar_ref && mediaMap[profile.avatar_ref] ? (
                <AvatarImage src={mediaMap[profile.avatar_ref].url} alt={profile.display_name || ''} />
              ) : (
                <AvatarFallback className="bg-brand/20 text-brand text-2xl font-bold">
                  {profile?.display_name?.charAt(0)?.toUpperCase() || '?'}
                </AvatarFallback>
              )}
            </Avatar>
            <button
              className="absolute bottom-0 right-0 p-1.5 rounded-full bg-background border border-border shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const media = await uploadMedia({ file });
                  setDraft({ ...draft, avatar_ref: media._id || '' });
                };
                input.click();
              }}
            >
              <Camera className="w-3.5 h-3.5 text-foreground" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex flex-col gap-3">
                <Input
                  value={draft.display_name || ''}
                  onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                  placeholder="Display name"
                  className="bg-secondary/50 border-0 text-foreground h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleSave}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditing(false); setDraft(profile || {}); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-foreground truncate">
                  {profile?.display_name || 'Your Name'}
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditing(true)}
                >
                  <Edit3 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Bio section */}
        <div className="mt-4">
          {editing ? (
            <div className="flex flex-col gap-3">
              <Textarea
                value={draft.bio || ''}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                placeholder="Bio"
                className="bg-secondary/50 border-0 text-foreground text-sm min-h-[60px] resize-none"
              />
              <Input
                value={draft.website || ''}
                onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                placeholder="Website"
                className="bg-secondary/50 border-0 text-foreground h-8 text-sm"
              />
              <Input
                value={draft.location || ''}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="Location"
                className="bg-secondary/50 border-0 text-foreground h-8 text-sm"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              {profile?.bio && (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
              )}
              {profile?.location && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{profile.location}</span>
                </div>
              )}
              {profile?.website && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {profile.website.startsWith('http') ? <Globe className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                  <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    {profile.website}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 flex gap-6">
          <div className="text-center">
            <span className="font-bold text-foreground text-lg block">{posts.length}</span>
            <span className="text-xs text-muted-foreground">Posts</span>
          </div>
          <div className="text-center">
            <span className="font-bold text-foreground text-lg block">{mediaPosts.length}</span>
            <span className="text-xs text-muted-foreground">Media</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          className={cn(
            'flex-1 py-3 text-sm font-medium text-center transition-colors',
            activeTab === 'posts' ? 'text-foreground border-b-2 border-brand' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('posts')}
        >
          Posts
        </button>
        <button
          className={cn(
            'flex-1 py-3 text-sm font-medium text-center transition-colors',
            activeTab === 'media' ? 'text-foreground border-b-2 border-brand' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('media')}
        >
          Media
        </button>
      </div>

      {/* Grid */}
      <div className="p-1">
        {activeTab === 'posts' ? (
          posts.length ? (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((post) => {
                const firstMedia = post.media_refs?.[0] ? mediaMap[post.media_refs[0]] : null;
                return (
                  <div
                    key={post._id}
                    className="aspect-square bg-muted overflow-hidden cursor-pointer relative group"
                  >
                    {firstMedia ? (
                      <img
                        src={firstMedia.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : post.text ? (
                      <div className="w-full h-full p-3 flex items-start">
                        <p className="text-xs text-muted-foreground line-clamp-6">{post.text}</p>
                      </div>
                    ) : null}
                    {post.media_refs?.length > 1 && (
                      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                        {post.media_refs.length}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">No posts yet</p>
            </div>
          )
        ) : (
          mediaPosts.length ? (
            <div className="grid grid-cols-3 gap-1">
              {mediaPosts.flatMap(post =>
                (post.media_refs || []).map(ref => {
                  const media = mediaMap[ref];
                  if (!media) return null;
                  return (
                    <div key={ref} className="aspect-square bg-muted overflow-hidden">
                      <img
                        src={media.url}
                        alt={media.alt_text || ''}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">No media yet</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}