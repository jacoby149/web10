import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Pause, Music, BarChart3, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readMusicPage, readViewCounts, type MusicTrack } from '@/data';
import { readUserProfile, resolveMediaRefs } from '@/data';
import type { ProfileRecord } from '@/data';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { formatCount } from '@web10/discover';

const LOG = (...args: unknown[]) => console.log('[music]', ...args);

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The Music destination (music.md) — a wall of track cards.
 *
 * A music track is a `posts` doc on the discover group whose single media is
 * a real audio file (`audio/*`). The feed is a *view* over the discover group,
 * filtered to music — same model as Shorts (a 9:16 video) and Video (a
 * landscape video). No new collection, no new group.
 *
 * The wall: a responsive grid of square album-art tiles. Each tile shows the
 * track's cover (the media's `thumbnail_url`, or a default musical-note
 * fallback when absent), the title, the author, and the duration. Tapping a
 * tile plays the track inline (a sticky bottom player bar).
 */
export default function MusicScreen() {
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRecord>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [viewsMap, setViewsMap] = useState<Record<string, { impressions: number; reach: number }>>({});
  const [playingTrack, setPlayingTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});

  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';

  const loadTracks = useCallback(async (pageOffset: number, append: boolean) => {
    LOG('loadTracks — offset:', pageOffset, 'append:', append);
    const page = await readMusicPage(30, pageOffset);
    if (page.tracks.length) {
      const ids = page.tracks.map((t) => t.post._id).filter(Boolean) as string[];
      const usernames = [...new Set(page.tracks.map((t) => t.post.author_username).filter(Boolean))];
      const [views, profs] = await Promise.all([
        readViewCounts(ids).catch(() => ({})),
        Promise.all(
          usernames.map((u) =>
            readUserProfile(u).then((p) => (p ? [u, p] as const : null)).catch(() => null),
          ),
        ),
      ]);
      const profMap: Record<string, ProfileRecord> = {};
      for (const entry of profs) {
        if (entry) profMap[entry[0]] = entry[1];
      }
      setTracks((prev) => {
        const merged = append ? [...prev, ...page.tracks] : page.tracks;
        const seen = new Set<string>();
        return merged.filter((t) => {
          const id = t.post._id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      });
      setProfiles((prev) => ({ ...prev, ...profMap }));
      setViewsMap((prev) => ({ ...prev, ...views }));
    }
    setHasMore(page.hasMore);
    setOffset(pageOffset + page.tracks.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTracks(0, false);
  }, [loadTracks]);

  loadMoreRef.current = () => {
    if (hasMore && !loading) {
      loadTracks(offset, true);
    }
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, offset]);

  const playTrack = useCallback((track: MusicTrack) => {
    LOG('playTrack:', track.post._id, track.media.url);
    if (playingTrack?.post._id === track.post._id) {
      if (audioRef.current?.paused) {
        audioRef.current.play();
        setIsPlaying(true);
      } else {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
      return;
    }
    setPlayingTrack(track);
    setIsPlaying(true);
  }, [playingTrack]);

  useEffect(() => {
    if (!playingTrack) return;
    const audio = new Audio(playingTrack.media.url);
    audioRef.current = audio;
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    audio.play().catch((e) => LOG('play failed:', e));
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [playingTrack]);

  const filteredTracks = urlQuery
    ? tracks.filter((t) => {
        const q = urlQuery.toLowerCase();
        return (
          t.post.title?.toLowerCase().includes(q) ||
          t.post.text?.toLowerCase().includes(q) ||
          t.post.author_username?.toLowerCase().includes(q)
        );
      })
    : tracks;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="px-4 pt-4">
          {urlQuery && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-muted-foreground">Results for</span>
              <span className="text-sm font-medium text-foreground bg-elevated rounded-full px-2.5 py-0.5">
                {urlQuery}
              </span>
              <button
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete('q');
                  setSearchParams(params);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}

          {loading && tracks.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-elevated animate-pulse" />
              ))}
            </div>
          ) : filteredTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Music className="w-12 h-12 text-muted-foreground/30 mb-3" strokeWidth={1.25} />
              <p className="text-sm text-muted-foreground">
                {urlQuery ? 'No tracks match your search.' : 'No music yet. Be the first to share a track.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredTracks.map((track) => {
                const isCurrent = playingTrack?.post._id === track.post._id;
                const profile = profiles[track.post.author_username || ''];
                const views = viewsMap[track.post._id || ''];
                return (
                  <button
                    key={track.post._id}
                    onClick={() => playTrack(track)}
                    className={cn(
                      'group relative aspect-square rounded-lg overflow-hidden ring-1 transition-all duration-150 text-left',
                      isCurrent
                        ? 'ring-2 ring-brand shadow-lg shadow-brand/20'
                        : 'ring-border hover:ring-brand/40 hover:shadow-md',
                    )}
                    data-testid="music-track-card"
                  >
                    {track.media.thumbnail_url ? (
                      <img
                        src={track.media.thumbnail_url}
                        alt={track.post.title || 'Album art'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-brand-muted to-background flex items-center justify-center">
                        <Music className="w-10 h-10 text-brand-300/50" strokeWidth={1.5} />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />

                    <div className="absolute bottom-0 left-0 right-0 p-2.5">
                      <p className="text-[0.8125rem] font-medium text-foreground truncate">
                        {track.post.title || track.post.text?.slice(0, 40) || 'Untitled'}
                      </p>
                      <p className="text-[0.6875rem] text-muted-foreground truncate">
                        @{track.post.author_username}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-[0.625rem] tabular-nums text-muted-foreground">
                          {formatDuration(track.media.duration_seconds || 0)}
                        </span>
                        {views && (
                          <>
                            <span className="flex items-center gap-0.5 text-[0.625rem] text-muted-foreground">
                              <BarChart3 className="w-3 h-3" />
                              {formatCount(views.impressions)}
                            </span>
                            <span className="flex items-center gap-0.5 text-[0.625rem] text-muted-foreground">
                              <Users className="w-3 h-3" />
                              {formatCount(views.reach)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'absolute top-2 right-2 flex items-center justify-center h-8 w-8 rounded-full bg-background/90 shadow-md transition-all duration-150',
                        isCurrent && isPlaying
                          ? 'opacity-100 scale-100'
                          : 'opacity-0 group-hover:opacity-100 group-hover:scale-100',
                      )}
                    >
                      {isCurrent && isPlaying ? (
                        <Pause className="w-4 h-4 text-brand" strokeWidth={2} />
                      ) : (
                        <Play className="w-4 h-4 text-brand ml-0.5" strokeWidth={2} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
          {loading && tracks.length > 0 && (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {playingTrack && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-40 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3">
          <div className="flex items-center gap-3 max-w-4xl mx-auto">
            <button
              onClick={() => playTrack(playingTrack)}
              className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-brand text-background hover:bg-brand/90 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              data-testid="music-player-toggle"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" strokeWidth={2} />
              ) : (
                <Play className="w-5 h-5 ml-0.5" strokeWidth={2} />
              )}
            </button>

            <div className="flex-shrink-0 h-12 w-12 rounded overflow-hidden ring-1 ring-border">
              {playingTrack.media.thumbnail_url ? (
                <img
                  src={playingTrack.media.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-muted to-background flex items-center justify-center">
                  <Music className="w-5 h-5 text-brand-300/60" strokeWidth={1.5} />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {playingTrack.post.title || 'Untitled'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                @{playingTrack.post.author_username}
              </p>
            </div>

            <span className="font-mono text-xs tabular-nums text-muted-foreground flex-shrink-0">
              {formatDuration(playingTrack.media.duration_seconds || 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
