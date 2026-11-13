/** Media Session ownership for mounted feed audio/video; no persisted URLs or credentials. */
export function feedMediaSession(session: MediaSession | undefined) {
  let current: HTMLMediaElement | null = null;
  let retired = false;
  let unbind = () => {};
  function release() {
    unbind();
    unbind = () => {};
    current = null;
    retired = false;
  }
  function clear() {
    release();
    retired = true;
    if (session) { session.metadata = null; session.playbackState = 'none'; }
  }
  function activate(element: HTMLMediaElement) {
    const card = element.closest<HTMLElement>('[data-media-session-title]');
    if (!card || !session) return;
    release();
    current = element;
    console.log('[feed-media-session] ownership acquired', { kind: element.tagName.toLowerCase() });
    session.metadata = null;
    if (typeof MediaMetadata !== 'undefined') {
      const metadata: MediaMetadataInit = { title: card.dataset.mediaSessionTitle || 'Feed media', artist: card.dataset.mediaSessionArtist || '' };
      const art = element instanceof HTMLVideoElement ? element.poster : card.querySelector<HTMLImageElement>('[data-testid="audio-artwork"] img')?.src;
      if (art) metadata.artwork = [{ src: art }];
      session.metadata = new MediaMetadata(metadata);
    }
    const sync = () => {
      if (current !== element) return;
      session.playbackState = element.paused || element.ended ? 'paused' : 'playing';
    };
    const events = ['play', 'playing', 'pause', 'ended'];
    events.forEach(event => element.addEventListener(event, sync));
    // A scrolled-out/dismissed renderer must not leave system controls pointing
    // at a dead element, or silently resume a previously paused music track.
    const observer = new MutationObserver(() => { if (!element.isConnected) clear(); });
    observer.observe(document.body, { childList: true, subtree: true });
    unbind = () => { events.forEach(event => element.removeEventListener(event, sync)); observer.disconnect(); };
    sync();
  }
  function handle(action: MediaSessionAction, details: MediaSessionActionDetails): boolean {
    const element = current;
    if (!element) return retired;
    if (!element.isConnected) { clear(); return true; }
    console.log('[feed-media-session] system action', { action });
    if (action === 'play') {
      void element.play().catch(() => {
        if (current !== element) return;
        session!.playbackState = 'paused';
        console.warn('[feed-media-session] system play rejected');
      });
    } else if (action === 'pause') element.pause();
    else if (['seekto', 'seekbackward', 'seekforward'].includes(action)) {
      const time = action === 'seekto' ? details.seekTime : element.currentTime + (action === 'seekbackward' ? -1 : 1) * (details.seekOffset || 10);
      if (time !== undefined && Number.isFinite(time) && Number.isFinite(element.duration) && element.duration > 0) element.currentTime = Math.max(0, Math.min(time, element.duration));
    }
    // Next/previous never operate on the stale Music queue while a feed clip owns it.
    return true;
  }
  return { activate, handle, release, clear, owns: () => current !== null };
}
