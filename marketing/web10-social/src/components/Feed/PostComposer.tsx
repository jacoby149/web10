import { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createPost, uploadMedia, readProfile, resolveMediaRefs } from '@/data';
import type { MediaRecord, ProfileRecord } from '@/data/types';
import {
  validateMedia,
  processImage,
  generateThumbnail,
  captureVideoPoster,
  getVideoInfo,
  validateVideoDuration,
} from '@/lib/mediaProcessing';
import type { ProcessingError as MediaProcessingError } from '@/lib/mediaProcessing';
import { Image, X, Send, Loader2, AlertTriangle, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

let nextMediaId = 0;

interface AttachedMedia {
  id: number;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  width: number;
  height: number;
  altText: string;
  processing: boolean;
  error?: MediaProcessingError;
}

function MediaTrayItem({
  item,
  index,
  count,
  onRemove,
  onAltTextChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  disabled,
}: {
  item: AttachedMedia;
  index: number;
  count: number;
  onRemove: () => void;
  onAltTextChange: (alt: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  disabled: boolean;
}) {
  const aspectRatio = item.width && item.height ? item.width / item.height : 1;
  const clampedRatio = Math.max(0.5, Math.min(2, aspectRatio));

  return (
    <div
      className="relative group flex-shrink-0"
      style={{ aspectRatio: clampedRatio, maxWidth: '33%' }}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {item.isVideo ? (
        <video
          src={item.previewUrl}
          className="w-full h-full object-cover rounded-lg ring-1 ring-border"
          preload="metadata"
          muted
          playsInline
        />
      ) : (
        <img
          src={item.previewUrl}
          alt={item.altText || `Media ${index + 1}`}
          className="w-full h-full object-cover rounded-lg ring-1 ring-border"
        />
      )}

      {item.processing && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
        </div>
      )}

      {item.error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-danger-muted/90 rounded-lg p-2">
          <AlertTriangle className="w-4 h-4 text-danger mb-1" />
          <span className="text-[0.6875rem] text-danger text-center leading-tight">{item.error.message}</span>
        </div>
      )}

      {item.isVideo && (
        <div className="absolute bottom-1.5 right-1.5 bg-background/80 rounded px-1 text-[0.625rem] font-mono tabular-nums text-foreground">
          {item.width}×{item.height}
        </div>
      )}

      {/* Always-visible remove button — 44px touch target */}
      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${item.isVideo ? 'video' : 'photo'}`}
        className="absolute -top-2 -right-2 flex items-center justify-center h-8 w-8 rounded-full bg-background border border-border shadow-md z-10 hover:bg-elevated transition-colors duration-150"
        style={{ minWidth: 44, minHeight: 44, padding: 0 }}
      >
        <X className="w-4 h-4" />
      </button>

      {/* Drag handle — visible on hover/focus, always touchable */}
      <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-foreground/60" />
      </div>

      {/* Alt text input — appears on hover/focus */}
      <div className="absolute bottom-0 inset-x-0 p-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
        <Input
          value={item.altText}
          onChange={(e) => onAltTextChange(e.target.value)}
          placeholder="Alt text…"
          disabled={disabled}
          className="h-7 text-[0.6875rem] bg-background/90 backdrop-blur-sm border-border/50 placeholder:text-muted-foreground/50"
          aria-label={`Alt text for ${item.isVideo ? 'video' : 'photo'} ${index + 1}`}
        />
      </div>
    </div>
  );
}

export default function PostComposer({ onPostCreated }: { onPostCreated?: () => void }) {
  const [text, setText] = useState('');
  const [mediaItems, setMediaItems] = useState<AttachedMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIdRef = useRef<number | null>(null);

  useEffect(() => {
    readProfile()
      .then(async (p) => {
        setProfile(p);
        if (p?.avatar_ref) {
          const [media] = await resolveMediaRefs([p.avatar_ref]);
          setAvatarUrl(media?.url);
        }
      })
      .catch(() => {});
  }, []);

  // Track all preview URLs for cleanup on unmount
  const previewUrlsRef = useRef(new Set<string>());
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const processAndAddFiles = useCallback(async (selected: FileList | File[]) => {
    const newFiles = Array.from(selected);
    if (!newFiles.length) return;

    const itemsToAdd: AttachedMedia[] = [];
    for (const file of newFiles) {
      const validationError = validateMedia(file);
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);

      if (validationError) {
        itemsToAdd.push({
          id: nextMediaId++,
          file,
          previewUrl,
          isVideo: file.type.startsWith('video/'),
          width: 0,
          height: 0,
          altText: '',
          processing: false,
          error: validationError,
        });
        continue;
      }

      const isVideo = file.type.startsWith('video/');

      itemsToAdd.push({
        id: nextMediaId++,
        file,
        previewUrl,
        isVideo,
        width: 0,
        height: 0,
        altText: '',
        processing: true,
      });

      // Process in background
      (async () => {
        try {
          if (isVideo) {
            const info = await getVideoInfo(file);
            const durationError = validateVideoDuration(info.duration);
            if (durationError) {
              setMediaItems((prev) =>
                prev.map((item) =>
                  item.file === file ? { ...item, processing: false, error: durationError } : item,
                ),
              );
              return;
            }
            setMediaItems((prev) =>
              prev.map((item) =>
                item.file === file
                  ? { ...item, width: info.width, height: info.height, processing: false }
                  : item,
              ),
            );
          } else {
            const processed = await processImage(file);
            const processedFile = new File([processed.blob], file.name, { type: processed.mimeType });
            const newPreviewUrl = URL.createObjectURL(processedFile);
            previewUrlsRef.current.delete(previewUrl);
            previewUrlsRef.current.add(newPreviewUrl);
            setMediaItems((prev) =>
              prev.map((item) =>
                item.file === file
                  ? {
                      ...item,
                      file: processedFile,
                      previewUrl: newPreviewUrl,
                      width: processed.width,
                      height: processed.height,
                      processing: false,
                    }
                  : item,
              ),
            );
          }
        } catch (e) {
          console.error('Media processing error:', e);
          setMediaItems((prev) =>
            prev.map((item) =>
              item.file === file
                ? {
                    ...item,
                    processing: false,
                    error: { field: 'type', message: 'Failed to process media. Try a different file.' },
                  }
                : item,
            ),
          );
        }
      })();
    }

    setMediaItems((prev) => [...prev, ...itemsToAdd]);
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) processAndAddFiles(e.target.files);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processAndAddFiles(e.dataTransfer.files);
  }

  function removeMedia(id: number) {
    const item = mediaItems.find((m) => m.id === id);
    if (item) {
      previewUrlsRef.current.delete(item.previewUrl);
    }
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
  }

  function updateAltText(id: number, alt: string) {
    setMediaItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, altText: alt } : item)),
    );
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    const item = mediaItems[index];
    if (item) dragIdRef.current = item.id;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, _index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleMediaDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const dragId = dragIdRef.current;
    if (dragId === null) return;
    setMediaItems((prev) => {
      const dragIdx = prev.findIndex((m) => m.id === dragId);
      if (dragIdx === -1 || dragIdx === dropIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    dragIdRef.current = null;
  }

  function handleDragEnd() {
    dragIdRef.current = null;
  }

  async function handleSubmit() {
    if (!text.trim() && !mediaItems.length) return;
    setError(null);

    // Check for items with errors
    const erroredItems = mediaItems.filter((item) => item.error);
    if (erroredItems.length) {
      setError('Fix the highlighted media issues before posting.');
      return;
    }

    setUploading(true);

    try {
      const mediaRecords: MediaRecord[] = [];

      for (const item of mediaItems) {
        let record: MediaRecord;

        if (item.isVideo) {
          // Capture poster frame
          const poster = await captureVideoPoster(item.file);
          const posterFile = new File([poster.blob], `poster-${Date.now()}.webp`, { type: poster.mimeType });

          // Get video info
          const info = await getVideoInfo(item.file);

          record = await uploadMedia({
            file: item.file,
            thumbnailFile: posterFile,
            width: info.width,
            height: info.height,
            durationSeconds: Math.round(info.duration * 100) / 100,
            altText: item.altText || undefined,
          });
        } else {
          // Generate thumbnail for images
          const thumb = await generateThumbnail(item.file);
          const thumbFile = new File([thumb.blob], `thumb-${Date.now()}.webp`, { type: thumb.mimeType });

          record = await uploadMedia({
            file: item.file,
            thumbnailFile: thumbFile,
            width: item.width,
            height: item.height,
            altText: item.altText || undefined,
          });
        }

        if (record._id) {
          mediaRecords.push(record);
        }
      }

      setPosting(true);
      await createPost({
        text: text.trim(),
        media_refs: mediaRecords.map((m) => m._id!).filter(Boolean),
        created_at: new Date().toISOString(),
      });

      mediaItems.forEach((item) => previewUrlsRef.current.delete(item.previewUrl));
      previewUrlsRef.current.clear();
      setText('');
      setMediaItems([]);
      onPostCreated?.();
    } catch (e) {
      console.error('Failed to create post:', e);
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setUploading(false);
      setPosting(false);
    }
  }

  const canPost = (text.trim() || mediaItems.length) && !uploading && !posting;
  const hasErroredMedia = mediaItems.some((item) => item.error);
  const initials = (profile?.display_name || '?').charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'px-4 py-4 border-b border-border transition-all duration-150 relative overflow-hidden',
        dragOver && 'bg-brand-muted/30',
        focused && 'border-b-brand/30',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      data-testid="post-composer"
    >
      {focused && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent"
          aria-hidden="true"
        />
      )}
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt="" />
          ) : (
            <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
              {initials}
            </AvatarFallback>
          )}
        </Avatar>

        <div className="flex-1 min-w-0">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="What's on your mind?"
            disabled={posting}
            className="resize-none min-h-[72px] bg-elevated border-0 text-foreground placeholder:text-muted-foreground text-[0.9375rem]"
          />

          {dragOver && (
            <div className="mt-2 rounded border-2 border-dashed border-brand text-center py-4 text-sm text-brand-300">
              Drop to attach
            </div>
          )}

          {mediaItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" data-testid="media-tray">
              {mediaItems.map((item, i) => (
                <MediaTrayItem
                  key={item.id}
                  item={item}
                  index={i}
                  count={mediaItems.length}
                  onRemove={() => removeMedia(item.id)}
                  onAltTextChange={(alt) => updateAltText(item.id, alt)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleMediaDrop}
                  onDragEnd={handleDragEnd}
                  disabled={posting || uploading}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-danger" role="alert" data-testid="composer-error">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:text-brand hover:bg-brand-muted/50 transition-colors duration-150"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || posting}
                aria-label="Attach media"
                data-testid="attach-media-button"
              >
                <Image className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              {uploading && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                  Uploading…
                </span>
              )}
              {hasErroredMedia && (
                <span className="flex items-center gap-1 text-xs text-danger">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {mediaItems.filter((i) => i.error).length} issue{mediaItems.filter((i) => i.error).length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <Button
              variant="brand"
              size="default"
              disabled={!canPost || hasErroredMedia}
              onClick={handleSubmit}
              data-testid="post-submit"
              className="gap-2 font-semibold min-w-24"
            >
              {posting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Posting…
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Post
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}