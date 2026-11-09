import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Globe, Loader2, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The shared playlist (saved collection) sheet: one compact dialog every
// surface uses to hand out a collection's canonical link. A public collection
// shares straight away; a private one says so up front and lets the owner flip
// it public before the link goes out — a private link is a 403 for the
// recipient, so the sheet never hides that. navigator.share where available,
// the clipboard elsewhere. Zero node surface (D60): a link is a read, not a
// write; the only write this sheet can trigger is the owner's visibility flip
// (the D58 `anyone` reader row, via the existing setCollectionVisibility seam).

interface Props {
  /** The collection's display name (the dialog's title + the share title). */
  name: string;
  /** The canonical URL to hand out (the route's own permalink). */
  url: string;
  /** The collection's current visibility (the private note only shows when private). */
  visibility: 'private' | 'public';
  /** Owner-only: whether the "Make public & share" action is offered. */
  canMakePublic: boolean;
  /** Flips the collection public; resolved before the link goes out. */
  onMakePublic?: () => Promise<void>;
  /** Fires after a successful native share or clipboard copy. */
  onShared?: (kind: 'shared' | 'copied') => void;
  onClose: () => void;
  /** Test-id prefix (surfaces keep their own ids: `saved-collection-*` / `music-*`). */
  testId?: string;
}

export default function ShareCollectionSheet({ name, url, visibility, canMakePublic, onMakePublic, onShared, onClose, testId = 'share-collection' }: Props) {
  const [busy, setBusy] = useState<'' | 'makePublic' | 'sharing'>('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);

  async function copy() {
    if (busy) return;
    setBusy('sharing');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setStatus('Link copied.');
      onShared?.('copied');
    } catch {
      setStatus('Could not copy the link. Try again.');
    } finally {
      setBusy('');
    }
  }

  // The primary path: the native share sheet where it exists (mobile), the
  // clipboard fallback everywhere else. A denied native share (the user backed
  // out of it) just re-focuses the sheet — it is not an error state.
  async function share() {
    if (busy) return;
    if (navigator.share) {
      setBusy('sharing');
      try {
        await navigator.share({ title: name, url });
        onShared?.('shared');
        onClose();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Could not share this link. Try again.');
      } finally {
        setBusy('');
      }
    } else {
      await copy();
    }
  }

  async function makePublicAndShare() {
    if (busy || !onMakePublic) return;
    setBusy('makePublic');
    setStatus('');
    try {
      await onMakePublic();
    } catch {
      setStatus('Could not make the playlist public. Try again.');
      setBusy('');
      return;
    }
    setBusy('sharing');
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
        onShared?.('shared');
        onClose();
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setStatus('Playlist is public — link copied.');
        onShared?.('copied');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Playlist is public — but the link could not be shared. Copy it instead.');
    } finally {
      setBusy('');
    }
  }

  const privateNote = visibility === 'private';
  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" data-testid={`${testId}-backdrop`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-sm" />
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`} className="relative w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl sm:p-5" data-testid={`${testId}-sheet`} data-replay-private={visibility !== 'public' ? '' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 id={`${testId}-title`} className="truncate text-base font-medium">Share “{name}”</h2>
          <p className="mt-1 text-xs text-muted-foreground">{privateNote ? 'This playlist is private — people with the link can’t open it yet.' : 'Anyone with the link can listen.'}</p></div>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Close share dialog" data-testid={`${testId}-close`} onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>
      <p className="mt-4 truncate rounded border border-border bg-elevated px-3 py-2 font-mono text-xs text-muted-foreground" data-testid={`${testId}-url`}>{url}</p>
      {status && <p role="status" className="mt-3 text-xs text-brand-300" data-testid={`${testId}-status`}>{status}</p>}
      <div className="mt-4 flex flex-col gap-2">
        {privateNote && canMakePublic && (
          <Button variant="brand" className="h-11 justify-center gap-2" disabled={!!busy} data-testid={`${testId}-make-public-share`} onClick={() => { void makePublicAndShare(); }}>
            {busy === 'makePublic' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Make public &amp; share
          </Button>
        )}
        <Button variant={privateNote && canMakePublic ? 'outline' : 'brand'} className="h-11 justify-center gap-2" disabled={!!busy} onClick={() => { void share(); }} data-testid={privateNote && canMakePublic ? `${testId}-copy-anyway` : `${testId}-share`}>
          {copied ? <Check className="h-4 w-4" /> : busy === 'sharing' ? <Loader2 className="h-4 w-4 animate-spin" /> : navigator.share ? <Share2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Link copied' : privateNote && canMakePublic ? 'Copy link anyway' : navigator.share ? 'Share link' : 'Copy link'}
        </Button>
      </div>
    </div>
  </div>, document.body);
}
