import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createPost, uploadMedia } from '@/data';
import type { MediaRecord } from '@/data/types';
import { Image, X, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PostComposer({ onPostCreated }: { onPostCreated?: () => void }) {
  const [text, setText] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;

    const newFiles = Array.from(selected);
    setFiles(prev => [...prev, ...newFiles]);

    for (const file of newFiles) {
      const url = URL.createObjectURL(file);
      setMediaPreview(prev => [...prev, url]);
    }
  }

  function removeMedia(index: number) {
    URL.revokeObjectURL(mediaPreview[index]);
    setMediaPreview(prev => prev.filter((_, i) => i !== index));
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!text.trim() && !files.length) return;
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
        media_refs: mediaRecords.map(m => m._id!).filter(Boolean),
        created_at: new Date().toISOString(),
      });

      setText('');
      setMediaPreview([]);
      setFiles([]);
      onPostCreated?.();
    } catch (e) {
      console.error('Failed to create post:', e);
    } finally {
      setUploading(false);
      setPosting(false);
    }
  }

  const canPost = text.trim() || files.length;

  return (
    <div className="px-4 py-4 border-b border-border">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's on your mind?"
        className="resize-none min-h-[80px] bg-secondary/30 border-0 text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
      />

      {mediaPreview.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {mediaPreview.map((url, i) => (
            <div key={i} className="relative group">
              <img
                src={url}
                alt={`Preview ${i + 1}`}
                className="w-20 h-20 rounded-lg object-cover"
              />
              <button
                onClick={() => removeMedia(i)}
                className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || posting}
          >
            <Image className="w-4 h-4" />
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
            <Loader2 className="w-4 h-4 animate-spin text-brand" />
          )}
        </div>
        <Button
          variant="brand"
          size="sm"
          disabled={!canPost || uploading || posting}
          onClick={handleSubmit}
          className="gap-2"
        >
          {posting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              Post
            </>
          )}
        </Button>
      </div>
    </div>
  );
}