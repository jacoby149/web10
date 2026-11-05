import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { searchMentionPeople, type MentionPerson } from '@/data/mentionSearch';
import { cn } from '@/lib/utils';
import { ReliableImage } from '@web10/discover/image';

export interface MentionToken { from: number; to: number; query: string }

/** The token before the caret, not the last @ anywhere in the document. */
export function mentionToken(text: string, caret: number): MentionToken | null {
  const before = text.slice(0, caret);
  const match = /(^|[\s([{,;:!?])@([a-zA-Z0-9_-]{0,64})$/.exec(before);
  if (!match) return null;
  const suffix = /^[a-zA-Z0-9_-]*/.exec(text.slice(caret))![0];
  if (/^\.[a-zA-Z0-9]/.test(text.slice(caret + suffix.length))) return null;
  const from = caret - match[2].length - 1;
  // Plain comment inputs can carry markdown; do not suggest inside its code/link syntax.
  if ((before.match(/`/g)?.length || 0) % 2 || /\]\([^)]*$|\[[^\]]*$|https?:\/\/\S*$/.test(before)) return null;
  return { from, to: caret + suffix.length, query: match[2] + suffix };
}

export function useMentionAutocomplete(token: MentionToken | null, scope: string, choose: (person: MentionPerson, token: MentionToken) => void) {
  const id = useId();
  const [dismissed, setDismissed] = useState('');
  const key = token ? `${scope}:${token.from}:${token.to}:${token.query}` : '';
  const open = !!token && key !== dismissed;
  const [state, setState] = useState<{ key: string; people: MentionPerson[]; status: 'loading' | 'ready' | 'error' }>({ key: '', people: [], status: 'loading' });
  const [selected, setSelected] = useState(0);
  const [retry, setRetry] = useState(0);
  const close = useCallback(() => setDismissed(key), [key]);
  useEffect(() => {
    if (!key) setDismissed('');
  }, [key]);
  useEffect(() => {
    if (!open || !token) return;
    const controller = new AbortController();
    setState({ key, people: [], status: 'loading' }); setSelected(0);
    const timer = window.setTimeout(() => {
      const update = (people: MentionPerson[]) => { if (!controller.signal.aborted) setState({ key, people, status: 'ready' }); };
      void searchMentionPeople(token.query, controller.signal, update).then(update).catch(() => {
        if (!controller.signal.aborted) setState({ key, people: [], status: 'error' });
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, open, retry]);
  const people = state.key === key ? state.people : [];
  const status = state.key === key ? state.status : 'loading';
  const pick = (person: MentionPerson) => { if (!token) return; choose(person, token); close(); };
  const keyDown = (event: Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation' | 'nativeEvent'>) => {
    if (!open || event.nativeEvent?.isComposing) return false;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return true; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      setSelected(i => people.length ? (i + (event.key === 'ArrowDown' ? 1 : people.length - 1)) % people.length : 0);
      return true;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && people[selected]) {
      event.preventDefault(); event.stopPropagation(); pick(people[selected]); return true;
    }
    if (event.key === 'Enter' && status === 'error') { event.preventDefault(); event.stopPropagation(); setRetry(n => n + 1); return true; }
    // Enter while searching must not accidentally publish a half-typed tag.
    if (event.key === 'Enter' && status === 'loading') { event.preventDefault(); event.stopPropagation(); return true; }
    return false;
  };
  return { id, open, people, status, selected, keyDown, pick, close, retry: () => setRetry(n => n + 1) };
}

export type MentionController = ReturnType<typeof useMentionAutocomplete>;

export function MentionSuggestions({ controller: c, anchor, getRect }: { controller: MentionController; anchor: HTMLElement | null; getRect?: () => { top: number; bottom: number; left: number } }) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320, maxHeight: 240 });
  useLayoutEffect(() => {
    if (!c.open || !anchor) return;
    const place = () => {
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const height = viewport?.height || window.innerHeight;
      const width = viewport?.width || window.innerWidth;
      const box = getRect?.() || anchor.getBoundingClientRect();
      const menuWidth = Math.min(352, width - 24);
      const below = top + height - box.bottom - 12;
      const above = box.top - top - 12;
      const down = below >= Math.min(280, above);
      const maxHeight = Math.max(80, Math.min(320, down ? below : above));
      const menuHeight = Math.min(panel.current?.scrollHeight || 240, maxHeight);
      setPosition({ top: down ? box.bottom + 4 : Math.max(top + 8, box.top - menuHeight - 4), left: Math.max(12, Math.min(box.left, width - menuWidth - 12)), width: menuWidth, maxHeight });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place);
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) c.close(); };
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', outside);
    };
  }, [c.open, anchor, c.people.length, c.status, c.close, getRect]);
  useEffect(() => { panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [c.selected]);
  if (!c.open || !anchor) return null;
  return createPortal(<div ref={panel} style={position} data-mention-menu data-testid="mention-suggestions" className="fixed z-[200] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface shadow-xl" onPointerDown={event => event.stopPropagation()}>
    <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">Tag a person</div>
    <div id={c.id} role="listbox" aria-label="People to tag" aria-busy={c.status === 'loading'}>
      {c.status === 'loading' ? <div role="status" className="space-y-2 p-3"><span className="sr-only">Finding people</span>{[0, 1].map(n => <div key={n} className="h-10 animate-pulse rounded bg-elevated" />)}</div>
        : c.status === 'error' ? <div className="p-3 text-sm"><p role="status" className="text-muted-foreground">Couldn't find people. Your draft is safe.</p><button type="button" onMouseDown={e => e.preventDefault()} onClick={c.retry} className="mt-2 min-h-11 rounded px-3 text-brand-300 hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring">Try again</button></div>
          : !c.people.length ? <p role="status" className="p-3 text-sm text-muted-foreground">No matching people. Try another name or handle.</p>
            : c.people.map((person, i) => <button type="button" role="option" id={`${c.id}-${i}`} aria-selected={i === c.selected} key={person.username} onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={() => c.pick(person)} className={cn('flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', i === c.selected && 'bg-brand-muted/50')}>
              <MentionFace person={person} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{person.displayName}</span><span className="block truncate text-xs text-muted-foreground">@{person.username}</span></span>
            </button>)}
    </div>
    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">↑↓ to choose · Enter to tag · Esc to close</p>
  </div>, document.body);
}

function MentionFace({ person }: { person: MentionPerson }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.avatarUrl]);
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-muted text-sm font-medium text-brand-300">
    {person.avatarUrl && !failed ? <ReliableImage src={person.avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : person.displayName.charAt(0).toUpperCase()}
  </span>;
}
