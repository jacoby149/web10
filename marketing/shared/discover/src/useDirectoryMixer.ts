import { useEffect, useRef, useState } from 'react';
import { createDirectoryReader, sortDirectory, type DirectoryKind, type DirectorySort, type DirectoryRead, type DirectoryRows } from './directoryMixer';
import type { FeedSource } from './sourceModels';
import type { ServerAllocation } from './sourceAllocation';

/** Identity/source/sort generations own their results, including retained callbacks. */
export function useDirectoryMixer(options: { enabled: boolean; sources: FeedSource[]; home: string; credential: string | null; scope: string;
  kind: DirectoryKind; sort: DirectorySort; pageSize?: number; homeRead?: DirectoryRead; isCurrent: () => boolean }) {
  const key = JSON.stringify([options.enabled, options.sources, options.home, options.credential, options.scope, options.kind, options.sort, options.pageSize]);
  const liveKey = useRef(key); liveKey.current = key;
  const [state, setState] = useState<DirectoryRows & { key: string; loading: boolean; hasMore: boolean; errors: Record<string, string>; allocations?: ServerAllocation[] }>({ key, people: [], groups: [], loading: options.enabled, hasMore: false, errors: {} });
  const loadRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let live = true, pending = false;
    const current = () => live && liveKey.current === key && options.isCurrent();
    setState({ key, people: [], groups: [], loading: options.enabled, hasMore: false, errors: {} });
    if (!options.enabled) { loadRef.current = () => undefined; return; }
    const reader = createDirectoryReader({ ...options, isCurrent: current });
    const load = async () => {
      if (pending || !current()) return;
      pending = true;
      setState(previous => ({ ...previous, loading: true }));
      try {
        const result = await reader.next(options.pageSize);
        if (!current()) return;
        setState(previous => {
          const unique = <T extends { source_key?: string }>(rows: T[]) => [...new Map(rows.map(row => [row.source_key, row])).values()];
          return { ...result, key, loading: false,
            people: sortDirectory(unique([...previous.people, ...result.people]), options.sort, row => row.followers_count),
            groups: sortDirectory(unique([...previous.groups, ...result.groups]), options.sort, row => row.member_count) };
        });
      } catch { if (current()) setState(previous => ({ ...previous, loading: false, errors: { ...previous.errors, [options.home]: 'Directory read failed. Retry source reads.' } })); }
      finally { pending = false; }
    };
    loadRef.current = () => { void load(); };
    void load();
    return () => { live = false; reader.dispose(); loadRef.current = () => undefined; };
    // The serialized key captures the complete read scope, not transient control objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ...(state.key === key ? state : { people: [], groups: [], loading: options.enabled, errors: {}, hasMore: false, allocations: undefined }), loadMore: () => loadRef.current(), retry: () => loadRef.current() };
}
