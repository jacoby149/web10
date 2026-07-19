import { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createPost, uploadMedia, readProfile, resolveMediaRefs } from '@/data';
import type { MediaRecord, ProfileRecord } from '@/data/types';
import { Image, X, Send, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PostComposer({ onPostCreated }: { onPostCreated?: () => void }) {
  const [text, setText] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function addFiles(selected: FileList | File[]) {
    const newFiles = Array.from(selected);
    if (!newFiles.length) return;
    setFiles((prev) => [...prev, ...newFiles]);
    for (const file of newFiles) {
      setMediaPreview((prev) => [...prev, URL.createObjectURL(file)]);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function removeMedia(index: number) {
    URL.revokeObjectURL(mediaPreview[index]);
    setMediaPreview((prev) => prev.filter((_, i) => i !== index));
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!text.trim() && !files.length) return;
    setError(null);
    setUploading(true);

    try {
      const mediaRecords: MediaRecord[] = [];
      for (const file of files) {
        const record = await uploadMedia({ file });
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

      mediaPreview.forEach((url) => URL.revokeObjectURL(url));
      setText('');
      setMediaPreview([]);
      setFiles([]);
      onPostCreated?.();
    } catch (e) {
      console.error('Failed to create post:', e);
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setUploading(false);
      setPosting(false);
    }
  }

  const canPost = (text.trim() || files.length) && !uploading && !posting;
  const initials = (profile?.display_name || '?').charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'px-4 py-4 border-b border-border transition-colors duration-150',
        dragOver && 'bg-brand-muted/30',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      data-testid="post-composer"
    >
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
            placeholder="What's on your mind?"
            disabled={posting}
            className="resize-none min-h-[72px] bg-elevated border-0 text-foreground placeholder:text-muted-foreground text-[0.9375rem]"
          />

          {dragOver && (
            <div className="mt-2 rounded border-2 border-dashed border-brand text-center py-4 text-sm text-brand-300">
              Drop to attach
            </div>
          )}

          {mediaPreview.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {mediaPreview.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt={`Preview ${i + 1}`} className="w-20 h-20 rounded object-cover" />
                  <button
                    onClick={() => removeMedia(i)}
                    aria-label="Remove attachment"
                    disabled={posting || uploading}
                    className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-6 w-6 rounded-full bg-background border border-border opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
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
                className="h-10 w-10 text-muted-foreground hover:text-brand"
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
                accept="image/*,video/*"
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
            </div>
            <Button
              variant="brand"
              size="default"
              disabled={!canPost}
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
