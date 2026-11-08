import { useCallback, useEffect, useRef, useState } from 'react';
import { createFeedSourceStore, feedSourceScope, homeFeedOrigin, type FeedSource } from '@/data/feedSources';
import { getV3Client, readTokenCookie } from '@/data/v3';
import { rememberSourceApproval, sourceApprovalKey, sourceApproved } from '@/data/feedSourceApprovals';

export function useFeedSources() {
  const client = getV3Client(), scope = feedSourceScope(), home = homeFeedOrigin();
  const credential = client.state?.token ?? readTokenCookie();
  const [revision, refresh] = useState(0);
  const [state, setState] = useState({ scope, sources: [{ origin: home, weight: 100 }] as FeedSource[], ready: !credential,
    busy: false, error: '', key: '', approved: new Set<string>([home]) });
  const generation = useRef(0), sequence = useRef(0), queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approvalIntents = useRef(new Set<string>());
  const live = useCallback(() => getV3Client() === client && feedSourceScope() === scope, [scope, client]);
  useEffect(() => {
    const request = ++generation.current;
    sequence.current++;
    approvalIntents.current.clear();
    if (timer.current) clearTimeout(timer.current);
    const current = () => generation.current === request && live();
    setState({ scope, sources: [{ origin: home, weight: 100 }], ready: !credential, busy: !!credential,
      error: '', key: '', approved: new Set([home]) });
    if (credential) void (async () => {
      try {
        const store = createFeedSourceStore(current);
        const sources = await store.read(), key = await sourceApprovalKey(credential);
        store.current();
        if (current()) setState({ scope, sources, key, ready: true, busy: false, error: '',
          approved: new Set([home, ...sources.filter(row => sourceApproved(key, row.origin)).map(row => row.origin)]) });
      } catch {
        console.warn('[feed-sources] load failed; keeping source dispatch closed');
        if (current()) setState(s => ({ ...s, busy: false, error: 'Could not load private server settings. Retry before editing.', ready: false }));
      }
    })();
    return () => { generation.current++; if (timer.current) clearTimeout(timer.current); };
  }, [scope, home, credential, live, revision]);

  const visible = state.scope === scope ? state : { ...state, sources: [], approved: new Set<string>(), ready: false, error: '', busy: true };
  const callbackGeneration = generation.current, callbackSequence = sequence.current;
  const save = (next: FeedSource[], trustOrigin?: string, debounce = false) => {
    if (!live() || generation.current !== callbackGeneration || sequence.current !== callbackSequence ||
      !visible.ready || !credential) return;
    const request = ++sequence.current, owner = generation.current;
    const store = createFeedSourceStore(() => owner === generation.current && live());
    const removed = visible.sources.filter(row => !next.some(item => item.origin === row.origin));
    if (trustOrigin) approvalIntents.current.add(trustOrigin);
    for (const row of removed) { rememberSourceApproval(visible.key, row.origin, false); approvalIntents.current.delete(row.origin); }
    setState(s => ({ ...s, sources: next, busy: true, error: '', approved: new Set([...s.approved].filter(origin => next.some(row => row.origin === origin))) }));
    if (timer.current) clearTimeout(timer.current);
    const dispatch = () => {
      queue.current = queue.current.catch(() => {}).then(async () => {
        try {
          if (owner !== generation.current || !live()) return;
          const sources = await store.write(next);
          if (owner !== generation.current || !live() || request !== sequence.current) return;
          const approved = sources.filter(row => approvalIntents.current.has(row.origin)).map(row => row.origin);
          for (const origin of approved) rememberSourceApproval(visible.key, origin, true);
          approvalIntents.current.clear();
          setState(s => ({ ...s, sources, busy: false, approved: new Set([...s.approved, ...approved]) }));
        } catch {
          console.warn('[feed-sources] save failed; no replacement catalog created');
          if (owner === generation.current && live() && request === sequence.current) setState(s => ({ ...s, busy: false, error: 'Server settings were not saved. Retry to reload the stored list.' }));
        }
      });
    };
    if (debounce) timer.current = setTimeout(dispatch, 350); else dispatch();
  };
  const approve = (origin: string) => {
    if (!live() || generation.current !== callbackGeneration || sequence.current !== callbackSequence ||
      !visible.ready || !visible.key || !visible.sources.some(row => row.origin === origin)) return;
    rememberSourceApproval(visible.key, origin, true);
    setState(s => ({ ...s, approved: new Set([...s.approved, origin]) }));
  };
  return { ...visible, home, credential, scope, save, approve, reload: () => refresh(n => n + 1), live };
}
