import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Send } from 'lucide-react';
import { readComments, createComment } from '@/data';
import type { CommentRecord } from '@/data/types';

interface CommentThreadProps {
  postId: string;
  isOpen: boolean;
  count: number;
  onCountChange: (n: number) => void;
  postAuthor?: string;
  postService?: string;
}

export function CommentThread({ postId, isOpen, onCountChange, postAuthor, postService }: CommentThreadProps) {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    readComments(postId)
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch((e) => console.error('Failed to load comments:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, postId]);

  async function handleSend() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const created = await createComment({
        post_id: postId,
        text: draft.trim(),
        created_at: new Date().toISOString(),
      }, postAuthor, postService);
      const next = [...comments, created];
      setComments(next);
      onCountChange(next.length);
      setDraft('');
    } catch (e) {
      console.error('Failed to add comment:', e);
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="border-t border-border px-4 py-3 space-y-3" data-testid="comment-thread">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : comments.length ? (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c._id} className="text-sm leading-relaxed">
              <span className="font-medium text-brand-300">{c.author_username || 'you'}</span>{' '}
              <span className="text-foreground">{c.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          data-testid="comment-input"
          disabled={sending}
          className="h-9"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          data-testid="comment-send"
          disabled={sending || !draft.trim()}
          aria-label="Send comment"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}