import { useId, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { ServerAllocation } from './sourceAllocation';

/** A native horizontal control under a hardware face, like the rotary rack. */
function ChannelFader({ server, onChange, descriptionId, disabled, itemLabel }: {
  server: ServerAllocation;
  onChange: (origin: string, weight: number) => void;
  descriptionId: string;
  disabled?: boolean;
  itemLabel: string;
}) {
  const x = 10 + server.weight * 2.6;
  return <div className="group/fader relative h-11 min-w-0 rounded-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-surface">
    <svg viewBox="0 0 280 44" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none h-full w-full">
      {Array.from({ length: 21 }, (_, index) => <g key={index} className={index <= server.weight / 5 && server.weight > 0 ? 'stroke-brand-400/60' : 'stroke-border'}>
        <path d={`M ${10 + index * 13} ${index % 5 === 0 ? 7 : 10} V 13 M ${10 + index * 13} 31 V ${index % 5 === 0 ? 37 : 34}`} strokeWidth="1" />
      </g>)}
      <rect x="7" y="18" width="266" height="8" rx="3" className="fill-background stroke-border" />
      <path d="M 10 22 H 270" className="stroke-elevated" strokeWidth="2" />
      {server.weight > 0 && <path d={`M 10 22 H ${x}`} className="stroke-brand group-hover/fader:stroke-brand-400" strokeWidth="2" />}
    </svg>
    {/* The cap matches the rotary knobs: a matte, top-lit dark cap with a fine
        border and a lit indicator — not chrome. It sits outside the stretched
        SVG so it keeps its proportions at any rack width. */}
    <span aria-hidden="true" style={{ left: `${(x / 280) * 100}%`,
      background: 'linear-gradient(to bottom, var(--color-elevated), var(--color-surface) 55%, var(--color-background))' }}
      className="pointer-events-none absolute top-[7px] flex h-[30px] w-4 -translate-x-1/2 flex-col items-center justify-between rounded-[3px] border border-border py-1 shadow-[0_1px_3px_rgb(0_0_0/0.6)]">
      <span className="h-px w-2 bg-foreground/10" />
      <span className={`h-0.5 w-2.5 rounded-full ${server.weight ? 'bg-brand-300' : 'bg-muted-foreground'}`} />
      <span className="h-px w-2 bg-foreground/10" />
    </span>
    <input type="range" min="0" max="100" step="1" value={server.weight} disabled={disabled}
      aria-label={`Fetch weight for ${new URL(server.origin).host}`}
      aria-describedby={descriptionId}
      aria-valuetext={`${server.weight} relative weight; ${server.count} ${itemLabel} per page`}
      onChange={event => onChange(server.origin, Number(event.currentTarget.value))}
      className="absolute inset-0 m-0 h-11 w-full cursor-ew-resize appearance-none opacity-0" />
  </div>;
}

/** Controlled chassis only: the owner binds subscriptions, URL and actual reads. */
export function ServerMixer({ servers, onChange, headerControl, editing, onRemove, messages = {}, disabledOrigins, children, embedded, itemLabel = 'posts' }: {
  servers: readonly ServerAllocation[];
  onChange: (origin: string, weight: number) => void;
  headerControl?: ReactNode;
  editing?: boolean;
  onRemove?: (origin: string) => void;
  messages?: Record<string, string>;
  disabledOrigins?: ReadonlySet<string>;
  children?: ReactNode;
  embedded?: boolean;
  itemLabel?: string;
}) {
  const descriptionId = useId();
  return <section aria-label="Web10 server mixer" data-testid="server-mixer" className={`overflow-hidden border-border bg-surface ${embedded ? 'border-t' : 'rounded-lg border'}`}>
    <div className={`flex items-center justify-between gap-3 border-b border-border bg-elevated/60 px-3 ${headerControl ? 'min-h-11' : 'h-9'}`}>
      <h3 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />Server mixer
      </h3>
      <div className="flex items-center gap-2"><span className={`font-mono text-[10px] tabular-nums tracking-widest text-muted-foreground ${headerControl ? 'hidden sm:block' : ''}`}>{String(servers.length).padStart(2, '0')} CH / FETCH</span>{headerControl}</div>
    </div>
    {!servers.length && <p className="px-3 py-4 text-xs text-muted-foreground">Your subscribed servers will appear here.</p>}
    {servers.map((server, index) => <div key={server.origin} data-testid="server-mixer-row"
      className="grid grid-cols-[1.25rem_minmax(0,1fr)_3rem] items-center gap-x-2 border-b border-border/70 px-3 py-1 sm:grid-cols-[1.25rem_minmax(7rem,1fr)_minmax(0,1.8fr)_3rem] sm:gap-x-3">
      <span aria-hidden="true" className="row-span-2 font-mono text-[10px] tabular-nums text-muted-foreground/60 sm:row-span-1">{String(index + 1).padStart(2, '0')}</span>
      <div className="col-start-2 row-start-1 min-w-0 pt-1 sm:py-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className={`h-1 w-1 shrink-0 rounded-full ${server.weight ? 'bg-brand-400' : 'bg-muted-foreground/40'}`} />
          <span className="truncate font-mono text-[11px] font-medium text-foreground" title={server.origin}>{new URL(server.origin).host}</span>
        </div>
          <span className="block pl-2.5 font-mono text-[10px] tabular-nums text-muted-foreground">{messages[server.origin] || (server.weight === 0 ? 'Paused' : `${server.count} ${itemLabel} / page`)}</span>
      </div>
      <div className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1">
        <ChannelFader server={server} onChange={onChange} descriptionId={descriptionId} disabled={disabledOrigins?.has(server.origin)} itemLabel={itemLabel} />
      </div>
      <div className="col-start-3 row-span-2 row-start-1 sm:col-start-4 sm:row-span-1">
        <span aria-hidden="true" className={`block rounded-sm border border-border bg-background px-1 py-1.5 text-center font-mono text-sm tabular-nums leading-none ${server.weight ? 'text-brand-300' : 'text-muted-foreground'}`}>{String(server.weight).padStart(3, '0')}</span>
        {editing && onRemove && <button type="button" aria-label={`Remove ${new URL(server.origin).host}`} onClick={() => onRemove(server.origin)} className="flex h-11 w-full items-center justify-center rounded-sm text-muted-foreground hover:bg-elevated hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-3.5 w-3.5" /></button>}
      </div>
    </div>)}
    {children}
    <p id={descriptionId} className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Relative fetch weights · 0 mutes, never unfollows</p>
    {servers.length > 0 && servers.every(server => server.weight === 0) && <p role="status" className="border-t border-border px-3 py-2 text-xs text-muted-foreground">All servers are paused. Raise a fader to resume your feed.</p>}
  </section>;
}
