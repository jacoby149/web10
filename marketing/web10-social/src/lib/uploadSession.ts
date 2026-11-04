// Client lifecycle fence, never an authorization credential.
let generation = 0;
const active = new Set<AbortController>();

export function invalidateUploadSession() {
  generation++;
  for (const controller of active) controller.abort();
  active.clear();
  // Credential writes in the auth seam finish synchronously before observers
  // reread the cookie. Every event is a new generation, even for A→B→A.
  if (typeof window !== 'undefined') queueMicrotask(() => window.dispatchEvent(new Event('upload-session-changed')));
}

export function uploadAttempt() {
  const captured = generation;
  const controller = new AbortController();
  active.add(controller);
  return {
    signal: controller.signal,
    check() {
      if (captured !== generation || controller.signal.aborted) throw new DOMException('Upload attempt is no longer active', 'AbortError');
    },
    stop() { controller.abort(); active.delete(controller); },
    release() { active.delete(controller); },
  };
}
