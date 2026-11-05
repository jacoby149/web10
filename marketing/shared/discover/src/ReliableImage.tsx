import { useEffect, useRef, useState, type ComponentPropsWithRef, type SyntheticEvent } from 'react';
import { ImageOff, RotateCcw } from 'lucide-react';
import { hasMediaRecovery, mediaExpiry, recoverMediaUrl } from './mediaRecovery';
import { cn } from './utils';

export function mediaDiagnostic(phase: 'start' | 'ready' | 'retry' | 'unavailable' | 'offline', kind: 'image' | 'video' | 'audio', attempt = 0, elapsedMs = 0, code?: number) {
  // Deliberately no URL, object key, identity, content or exception string.
  const part = typeof window === 'undefined' ? '' : window.location.pathname.split('/')[1];
  const surface = part === 'u' ? 'profile' : ['posts', 'feed', 'discover', 'people', 'video', 'music', 'shorts', 'saved', 'groups', 'watch', 'search', 'messages', 'notifications', 'monetization'].includes(part) ? part : 'other';
  console.log('[media-reliability]', { phase, kind, surface, attempt, elapsedMs: Math.round(elapsedMs), code: code && code >= 1 && code <= 4 ? code : undefined });
}

/** One image occurrence; replacing src creates a new generation/budget. */
export function ReliableImage(props: ComponentPropsWithRef<'img'>) {
  return <ImageOccurrence key={props.src || 'missing'} {...props} />;
}

function ImageOccurrence({ src, alt = '', className, loading = 'lazy', onError, onLoad, ref: forwardedRef, ...props }: ComponentPropsWithRef<'img'>) {
  const image = useRef<HTMLImageElement>(null);
  const live = useRef(true);
  const attempt = useRef(0);
  const pending = useRef(false);
  const demand = useRef(false);
  const start = useRef(performance.now());
  const [url, setUrl] = useState(src);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(loading === 'eager' || typeof IntersectionObserver === 'undefined');
  const current = useRef(url);
  current.current = url;
  const recoverRef = useRef<() => void>(() => {});

  const recover = async (event?: SyntheticEvent<HTMLImageElement>, manual = false) => {
    if (!src || pending.current || (!manual && attempt.current >= 1)) return;
    demand.current = true;
    if (navigator.onLine === false) { setFailed(true); mediaDiagnostic('offline', 'image'); return; }
    if (manual) attempt.current = 0;
    attempt.current++;
    pending.current = true;
    setBusy(true);
    if (manual && !hasMediaRecovery(current.current || src)) {
      // External/bundled URLs cannot be re-authorized here. A manual retry
      // may request the exact same URL, never manufacture a replacement grant.
      setFailed(false); setUrl(src); setRevision(value => value + 1);
      pending.current = false; setBusy(false); return;
    }
    mediaDiagnostic('retry', 'image', attempt.current);
    const element = event?.currentTarget;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        recoverMediaUrl(current.current || src),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Media recovery timed out')), 15_000); }),
      ]);
      if (!live.current) return;
      if (!result.isCurrent()) throw new Error('Media reader changed');
      setFailed(false);
      setUrl(result.url);
      setRevision(value => value + 1);
    } catch {
      if (!live.current) return;
      mediaDiagnostic('unavailable', 'image', attempt.current, performance.now() - start.current);
      setFailed(true);
      if (event && element) onError?.({ ...event, currentTarget: element, target: element });
    } finally { if (timeout) clearTimeout(timeout); pending.current = false; if (live.current) setBusy(false); }
  };
  recoverRef.current = () => { void recover(); };

  useEffect(() => {
    live.current = true;
    const el = image.current;
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.target === el) setVisible(entry.isIntersecting);
    }, { rootMargin: '128px' }) : undefined;
    if (el) observer?.observe(el);
    const online = () => { if (demand.current && attempt.current === 0) recoverRef.current(); };
    window.addEventListener('online', online);
    return () => { live.current = false; observer?.disconnect(); window.removeEventListener('online', online); };
  }, [revision, failed]);

  useEffect(() => {
    if (visible && url && mediaExpiry(url) <= Date.now() + 5000 && attempt.current === 0) recoverRef.current();
  }, [visible, url]);

  if (!src) return <span className={cn('inline-flex items-center justify-center bg-elevated text-muted-foreground', className)}
    style={props.style} role="img" aria-label={alt || 'Preview unavailable'}>
    <span className="px-2 text-xs" aria-hidden="true">Preview unavailable</span>
  </span>;
  if (failed) return <span className={cn('inline-flex cursor-pointer items-center justify-center bg-elevated text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    role="button" aria-label={alt ? `Retry image: ${alt}` : 'Retry image'} title="Image unavailable" data-media-state="unavailable"
    onClick={event => { event.preventDefault(); event.stopPropagation(); void recover(undefined, true); }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); void recover(undefined, true); } }}
    tabIndex={0} {...(props['data-testid' as keyof typeof props] ? { 'data-testid': props['data-testid' as keyof typeof props] } : {})}>
    <span className="flex max-w-full flex-col items-center gap-2 px-2 text-center text-xs" aria-hidden="true">
      <ImageOff className="h-5 w-5 shrink-0" strokeWidth={1.5} />
      <span>Image unavailable</span>
      <span className="inline-flex items-center gap-1 font-medium text-brand-300"><RotateCcw className="h-3 w-3" />Retry</span>
    </span>
  </span>;
  // Do not install already-expired signed URLs on off-screen lazy images.
  const deferred = !visible && url && mediaExpiry(url) <= Date.now() + 5000;
  return <img {...props} key={revision} ref={element => {
    image.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }} src={deferred ? undefined : url} alt={alt} className={className} loading={loading}
    style={{ ...props.style, ...(deferred || busy ? { visibility: 'hidden' } : {}) }} aria-busy={busy || !!deferred}
    onLoad={event => { mediaDiagnostic('ready', 'image', attempt.current, performance.now() - start.current); onLoad?.(event); }}
    onError={event => {
      if (pending.current) return;
      demand.current = true;
      if (attempt.current >= 1 || !hasMediaRecovery(url || src || '')) {
        mediaDiagnostic('unavailable', 'image', attempt.current, performance.now() - start.current);
        setFailed(true); onError?.(event);
      } else void recover(event);
    }} />;
}
