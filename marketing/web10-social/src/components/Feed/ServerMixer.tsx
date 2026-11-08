import type { ServerAllocation } from '@/lib/serverMixer';

/** Controlled hardware-style mixer. The owner binds URL/settings and actual
 * per-node fetches; this component never invents servers or sends credentials.
 */
export function ServerMixer({ servers, onChange }: {
  servers: readonly ServerAllocation[];
  onChange: (origin: string, weight: number) => void;
}) {
  return <section aria-label="Web10 server mixer" data-testid="server-mixer" className="rounded-xl border border-border bg-surface p-4">
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="text-sm font-semibold text-foreground">Server mixer</h3>
      <span className="text-xs text-muted-foreground">Fetch balance</span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">Choose how much to fetch from each subscribed server. Zero pauses a server, not your follows.</p>
    {!servers.length && <p className="mt-4 text-sm text-muted-foreground">Your subscribed servers will appear here.</p>}
    <div className="mt-4 space-y-4">
      {servers.map(({ origin, weight, count }) => <div key={origin} data-testid="server-mixer-row" className="rounded-lg border border-border bg-elevated p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="truncate font-mono text-xs text-foreground" title={origin}>{new URL(origin).host}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{weight === 0 ? 'Paused' : `${count} posts / page`}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-muted-foreground" aria-hidden="true">0</span>
          <input type="range" min="0" max="100" step="1" value={weight}
            aria-label={`Fetch weight for ${new URL(origin).host}`}
            aria-valuetext={`${weight} relative weight; ${count} posts per page`}
            onChange={(event) => onChange(origin, Number(event.currentTarget.value))}
            className="h-11 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-elevated [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-brand-300 [&::-webkit-slider-thumb]:bg-brand [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-brand-300 [&::-moz-range-thumb]:bg-brand" />
          <span className="text-xs text-muted-foreground" aria-hidden="true">100</span>
          <span aria-hidden="true" className="w-8 text-right font-mono text-xs tabular-nums text-brand-300">{weight}</span>
        </div>
      </div>)}
    </div>
    {servers.length > 0 && servers.every(server => server.weight === 0) && <p role="status" className="mt-4 text-sm text-muted-foreground">All servers are paused. Raise a fader to resume your feed.</p>}
  </section>;
}
