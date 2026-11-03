import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { updatePost } from '@/data';

/**
 * The "mark as music" toggle in edit mode (music.md): a separate-save control
 * that adds or removes the `music` tag on an existing post. Like the Discover
 * audience control, it saves independently from post content — toggling writes
 * the tag via updatePost without touching title/text/media.
 *
 * A video CAN be music: this is the backfill affordance the music-flow spec
 * anticipated. The same `music` tag puts the post in the Music tab and the
 * author's profile Music section.
 */
export function MusicTagToggle({ docId, initialTags, authorAs, disabled, onBusyChange }: { docId: string; initialTags: string[]; authorAs?: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [isMusic, setIsMusic] = useState(initialTags.includes('music'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  async function toggle() {
    setBusy(true);
    onBusyChange(true);
    setError(false);
    setSaved(false);
    console.info('[social] music tag mutation: started', { docId, authorAs, target: !isMusic });
    try {
      const newTags = isMusic
        ? initialTags.filter((t) => t !== 'music')
        : [...new Set([...initialTags, 'music'])];
      await updatePost(docId, { tags: newTags.length ? newTags : undefined }, undefined, authorAs);
      setIsMusic(!isMusic);
      setSaved(true);
      window.dispatchEvent(new Event('post-created'));
      console.info('[social] music tag mutation: completed');
    } catch {
      setError(true);
      console.error('[social] music tag mutation: failed');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled || busy}
        onClick={toggle}
      >
        {busy ? 'Saving…' : isMusic ? 'Remove music tag' : 'Mark as music'}
      </Button>
      {error && <div role="alert" className="text-xs text-danger">Music tag could not be saved. Your post content has not been saved by this action. Try again.</div>}
      {saved && <p role="status" className="text-xs text-muted-foreground">Music tag saved. Post content is saved separately.</p>}
    </>
  );
}
