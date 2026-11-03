import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getV3Client } from '@/data/v3';
import { getDiscoverGroupId } from '@/data';

export function DiscoverAudience({ docId, authorAs, disabled, onBusyChange }: { docId: string; authorAs?: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [attached, setAttached] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setAttached(null);
    setError(false);
    console.info('[social] audience target read: started');
    Promise.resolve().then(() => getV3Client().documentAttachment(docId, getDiscoverGroupId(), { author_as: authorAs })).then((result) => {
      if (live) setAttached(result.attached);
      console.info('[social] audience target read: completed');
    }).catch(() => {
      if (live) setError(true);
      console.error('[social] audience target read: failed');
    });
    return () => { live = false; };
  }, [docId, authorAs, attempt]);

  async function change() {
    if (attached === null) return;
    setBusy(true);
    onBusyChange(true);
    setError(false);
    setSaved(false);
    console.info('[social] audience target mutation: started');
    try {
      const result = await getV3Client().documentAttachment(docId, getDiscoverGroupId(), { author_as: authorAs, attached: !attached });
      setAttached(result.attached);
      setSaved(true);
      window.dispatchEvent(new Event('post-created'));
      console.info('[social] audience target mutation: completed');
    } catch {
      setError(true);
      console.error('[social] audience target mutation: failed');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return <section className="rounded-lg border border-border bg-surface p-3 space-y-2" aria-label="Discover audience" data-testid="edit-discover-audience">
    <p className="text-sm font-medium">Discover audience</p>
    <p className="text-xs text-muted-foreground">Discover is public. Removing it does not make this post private. Other group audiences stay unchanged. This action saves separately from post content.</p>
    {attached === null && !error && <div className="h-11 rounded bg-muted animate-pulse" aria-label="Loading Discover audience" />}
    {attached !== null && <Button type="button" variant="outline" className="min-h-11" disabled={disabled || busy} onClick={change}>{busy ? 'Saving audience...' : attached ? 'Remove from Discover' : 'Add to Discover'}</Button>}
    {error && <div role="alert" className="text-xs text-danger">Audience could not be {attached === null ? 'loaded' : 'saved'}. {attached === null ? <Button type="button" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>Retry audience</Button> : 'Your post content has not been saved by this action. Try again.'}</div>}
    {saved && <p role="status" className="text-xs text-muted-foreground">Audience saved. Post content is saved separately.</p>}
  </section>;
}
