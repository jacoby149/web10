import { useEffect, useState, type RefObject } from 'react';
import { claimMediaPlayback, releaseMediaPlayback } from './mediaRecovery';

export function useMediaPlaybackBudget(ref: RefObject<HTMLMediaElement | null>) {
  useEffect(() => {
    let element = ref.current;
    const onPlay = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement)) return;
      if (target === ref.current) { element = target; if (!claimMediaPlayback(target)) target.pause(); }
      else if (!target.muted && target.volume > 0) claimMediaPlayback(target);
    };
    document.addEventListener('play', onPlay, true);
    return () => { document.removeEventListener('play', onPlay, true); releaseMediaPlayback(element); };
  }, [ref]);
}

/** No speculative transport until a real viewport observation, where supported. */
export function useMediaVisibility(ref: RefObject<HTMLElement | null>, generation?: unknown) {
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [foreground, setForeground] = useState(!document.hidden && navigator.onLine !== false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const update = () => setForeground(!document.hidden && navigator.onLine !== false && !connection?.saveData);
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    connection?.addEventListener('change', update);
    const element = ref.current;
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.target === element) setVisible(entry.isIntersecting);
    }) : undefined;
    if (element) observer?.observe(element);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      connection?.removeEventListener('change', update);
    };
  }, [ref, generation]);
  return visible && foreground;
}
