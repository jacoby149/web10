import { useSyncExternalStore } from 'react';

// One loaded-app video choice. No storage, account, URL or Music coupling.
let muted = false;
const listeners = new Set<() => void>();
export const getVideoMuted = () => muted;
export function setVideoMuted(value: boolean | ((current: boolean) => boolean)) {
  const next = typeof value === 'function' ? value(muted) : value;
  if (next === muted) return;
  muted = next;
  console.log('[video-sound] mute choice changed', { muted });
  [...listeners].forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useVideoSound() {
  return [useSyncExternalStore(subscribe, getVideoMuted, () => false), setVideoMuted] as const;
}
