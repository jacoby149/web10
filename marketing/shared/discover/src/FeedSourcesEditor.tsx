import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { ServerMixer } from './ServerMixer';
import { normalizeFeedSource, type FeedSource } from './sourceModels';
import { allocateServerFetches, type ServerAllocation } from './sourceAllocation';

export interface SourceEditorControl {
  scope: string; home: string; sources: FeedSource[]; approved: ReadonlySet<string>;
  ready: boolean; busy: boolean; error: string; canEdit: boolean; requiresApproval: boolean;
  save: (sources: FeedSource[], trustOrigin?: string, debounce?: boolean) => void;
  approve: (origin: string) => void; reload: () => void;
}

const button = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40';
export function FeedSourcesEditor({ control, allocations, errors = {}, onRetry, itemLabel, pageSize = 20 }: {
  control: SourceEditorControl;
  allocations?: ServerAllocation[];
  errors?: Record<string, string>;
  onRetry: () => void;
  itemLabel?: string;
  pageSize?: number;
}) {
  const [params, setParams] = useSearchParams();
  // Native range events can arrive before the router commits new props. Merge
  // consecutive fader edits, rather than rebuilding from the previous render.
  const latest = useRef({ scope: control.scope, observed: control.sources, sources: control.sources });
  if (latest.current.scope !== control.scope || latest.current.observed !== control.sources) {
    latest.current = { scope: control.scope, observed: control.sources, sources: control.sources };
  }
  const editing = params.get('editServers') === '1';
  const [input, setInput] = useState(''), [trusted, setTrusted] = useState(false), [validation, setValidation] = useState('');
  useEffect(() => { setInput(''); setTrusted(false); setValidation(''); }, [editing, control.scope]);
  const route = (edit: boolean, kind?: string, origin?: string) => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.delete('removeServer'); next.delete('approveServer');
    next.set('tune', '1');
    if (edit) next.set('editServers', '1'); else next.delete('editServers');
    if (kind && origin) next.set(kind, origin);
    return next;
  });
  const active = control.sources.map(row => ({ ...row, weight: control.approved.has(row.origin) ? row.weight : 0 }));
  const counts = allocations ?? allocateServerFetches(active.map((row, index) => `https://source-${index}.invalid`),
    Object.fromEntries(active.map((row, index) => [`https://source-${index}.invalid`, row.weight])), pageSize).map((row, index) => ({ ...row, origin: active[index].origin }));
  const servers = control.sources.map(row => ({ ...row, count: counts.find(item => item.origin === row.origin)?.count ?? 0 }));
  const pending = new Set(control.sources.filter(row => !control.approved.has(row.origin)).map(row => row.origin));
  const confirmRemove = control.sources.find(row => row.origin === params.get('removeServer'));
  const confirmApprove = control.sources.find(row => row.origin === params.get('approveServer'));
  const messages = { ...Object.fromEntries([...pending].map(origin => [origin, 'Approve connection in Edit servers'])), ...errors };
  const change = (origin: string, weight: number) => {
    if (!control.ready || !control.approved.has(origin)) return;
    if (control.requiresApproval && (params.has('mixCursor') || params.has('after'))) setParams(previous => {
      const next = new URLSearchParams(previous); next.delete('mixCursor'); next.delete('after'); return next;
    }, { replace: true });
    const next = latest.current.sources.map(row => row.origin === origin ? { ...row, weight } : row);
    latest.current.sources = next;
    control.save(next, undefined, true);
  };
  return <ServerMixer embedded servers={servers} onChange={change} editing={editing} itemLabel={itemLabel}
    disabledOrigins={!control.ready ? new Set(servers.map(row => row.origin)) : pending} messages={messages}
    onRemove={origin => route(true, 'removeServer', origin)}
    headerControl={<button type="button" className={button} aria-expanded={editing} onClick={() => route(!editing)}>{editing ? <Check className="h-3 w-3" /> : null}{editing ? 'Done' : 'Edit servers'}</button>}>
    {(control.error || validation) && <div role="alert" className="border-t border-border px-3 py-2 text-xs text-danger">{validation || control.error}<button className={button} type="button" onClick={() => { setValidation(''); control.reload(); }}>Retry settings</button></div>}
    {control.busy && <p role="status" className="px-3 py-1 font-mono text-[10px] text-muted-foreground">Saving or loading private server settings…</p>}
    {editing && <div data-testid="server-editor" className="space-y-2 border-t border-border bg-background/40 p-3">
      {confirmRemove && <div className="rounded-sm border border-border p-2 text-xs text-foreground">
        <p>Remove {confirmRemove.origin} from this feed? Your creator follows stay unchanged.</p>
        <button className={button} type="button" disabled={control.busy} onClick={() => {
          control.save(control.sources.filter(row => row.origin !== confirmRemove.origin));
          if (control.requiresApproval) route(true);
        }}>Confirm remove</button>
        <button className={button} type="button" onClick={() => route(true)}>Cancel</button>
      </div>}
      {confirmApprove && <div className="rounded-sm border border-border p-2 text-xs text-foreground">
        <p>Trust {confirmApprove.origin} with your current scoped web10 token? It will verify your home identity and enforce its own app grants and roles.</p>
        <button className={button} type="button" onClick={() => { control.approve(confirmApprove.origin); route(true); }}>Approve connection</button>
        <button className={button} type="button" onClick={() => route(true)}>Cancel</button>
      </div>}
      {[...pending].map(origin => <div key={origin} className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{new URL(origin).host}</span><button className={button} type="button" onClick={() => route(true, 'approveServer', origin)}>Review connection</button></div>)}
      <form onSubmit={event => {
        event.preventDefault();
        try {
          const origin = normalizeFeedSource(input.trim(), control.home);
          if (control.requiresApproval && !trusted) throw Error('Confirm that you trust this server.');
          if (control.sources.some(row => row.origin === origin)) throw Error('This server is already in your rack.');
          if (control.sources.length >= 32) throw Error('A rack supports at most 32 servers.');
          control.save([...control.sources, { origin, weight: 100 }], origin);
          setInput(''); setTrusted(false); setValidation('');
        } catch (error) { setValidation(error instanceof Error ? error.message : 'Invalid server.'); }
      }} className="space-y-2">
        <label className="block text-xs text-muted-foreground">Server API URL<input type="url" required value={input} onChange={event => setInput(event.target.value)} placeholder="https://api.creator.example" autoComplete="off" className="mt-1 min-h-11 w-full rounded-sm border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        {control.requiresApproval && <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={trusted} onChange={event => setTrusted(event.target.checked)} className="h-4 w-4 shrink-0 accent-brand" />I trust this exact server with my scoped token. Adding it does not change its permissions.</label>}
        {!control.requiresApproval && <p className="text-xs text-muted-foreground">Public visitor reads use no login credential. Sources are saved in this browser.</p>}
        <button type="submit" className={`${button} border border-border`} disabled={!control.ready || control.busy || !control.canEdit}><Plus className="h-3.5 w-3.5" />{control.requiresApproval ? 'Add & connect server' : 'Add public server'}</button>
      </form>
      {!!Object.keys(errors).length && <button type="button" className={button} onClick={onRetry}>Retry source reads</button>}
    </div>}
  </ServerMixer>;
}
