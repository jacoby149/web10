import { useEffect, useRef, useState, type ComponentPropsWithRef } from 'react';
import { hasMediaRecovery, recoverMediaUrl } from './mediaRecovery';
import { mediaDiagnostic } from './ReliableImage';
import { useMediaPlaybackBudget } from './mediaVisibility';

/** Native/file paths only. HLS owns its loader and its own recovery machine. */
export function ReliableVideo(props: ComponentPropsWithRef<'video'>) {
  return <VideoOccurrence key={props.src || 'source-less'} {...props} />;
}

function VideoOccurrence({ src, ref: forwardedRef, onError, onPlay, onPause, onTimeUpdate, onRateChange, preload = 'none', ...props }: ComponentPropsWithRef<'video'>) {
  const video = useRef<HTMLVideoElement>(null);
  useMediaPlaybackBudget(video);
  const live = useRef(true);
  const pending = useRef(false);
  const attempts = useRef(0);
  const wanted = useRef(false);
  const position = useRef(0);
  const rate = useRef(1);
  const authorization = useRef<(() => boolean) | undefined>(undefined);
  const [url, setUrl] = useState(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; wanted.current = false; };
  }, []);
  const retry = async (manual = false) => {
    if (!src || pending.current || navigator.onLine === false) return false;
    pending.current = true;
    attempts.current++;
    if (manual && !hasMediaRecovery(url || src)) {
      setFailed(false); setUrl(src); pending.current = false;
      return true;
    }
    mediaDiagnostic('retry', 'video', attempts.current);
    try {
      const fresh = await recoverMediaUrl(url || src);
      if (!live.current) return false;
      if (!fresh.isCurrent()) throw new Error('Media reader changed');
      authorization.current = fresh.isCurrent;
      setFailed(false);
      setUrl(fresh.url);
      if (fresh.url === url) video.current?.load();
      return true;
    } catch {
      if (live.current) { setFailed(true); mediaDiagnostic('unavailable', 'video', attempts.current); }
      return false;
    } finally { pending.current = false; }
  };
  if (failed && !onError) return <span className={props.className} role="button" tabIndex={0} aria-label="Retry video"
    onClick={event => { event.stopPropagation(); wanted.current = true; void retry(true); }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); wanted.current = true; void retry(true); } }}>Video unavailable. Retry</span>;
  return <video {...props} src={url} preload={preload} ref={element => {
    video.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }}
    onPlay={event => {
      if (authorization.current && !authorization.current()) { wanted.current = false; event.currentTarget.pause(); return; }
      wanted.current = true; onPlay?.(event);
    }}
    onPause={event => { wanted.current = false; onPause?.(event); }}
    onTimeUpdate={event => { position.current = event.currentTarget.currentTime; onTimeUpdate?.(event); }}
    onRateChange={event => { rate.current = event.currentTarget.playbackRate; onRateChange?.(event); }}
    onLoadedMetadata={event => {
      if (authorization.current && !authorization.current()) { wanted.current = false; event.currentTarget.pause(); return; }
      if (attempts.current) {
        event.currentTarget.currentTime = position.current;
        event.currentTarget.playbackRate = rate.current;
        if (wanted.current) {
          const element = event.currentTarget;
          void element.play().then(() => { if (!live.current || !wanted.current || (authorization.current && !authorization.current())) element.pause(); }).catch(() => {});
        }
      }
      props.onLoadedMetadata?.(event);
    }}
    onError={event => {
      const element = event.currentTarget;
      mediaDiagnostic('unavailable', 'video', attempts.current, 0, element.error?.code);
      if (pending.current) return;
      if (attempts.current >= 1 || !hasMediaRecovery(url || src || '')) { setFailed(true); onError?.(event); return; }
      void retry().then(recovered => {
        if (!recovered && live.current) onError?.({ ...event, currentTarget: element, target: element });
      });
    }} />;
}
