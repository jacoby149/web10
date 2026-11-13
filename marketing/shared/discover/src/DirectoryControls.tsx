import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { FeedSourcesEditor, type SourceEditorControl } from './FeedSourcesEditor';
import type { ServerAllocation } from './sourceAllocation';
import type { DirectoryKind, DirectorySort } from './directoryMixer';
import { DirectorySortSelector } from './DirectorySortSelector';

export function directorySort(params: URLSearchParams, kind: DirectoryKind): DirectorySort {
  return params.get(kind === 'profiles' ? 'peopleSort' : 'groupSort') === 'newest' ? 'newest' : 'popular';
}

export function DirectoryControls({ kind, control, errors, allocations, onRetry, pageSize = 20 }: {
  kind: DirectoryKind; control: SourceEditorControl; errors?: Record<string, string>; allocations?: ServerAllocation[]; onRetry: () => void;
  pageSize?: number;
}) {
  const [params, setParams] = useSearchParams();
  const panelId = useId();
  const expanded = params.get('tune') === '1' || params.get('editServers') === '1';
  const button = 'min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return <div data-testid="directory-controls" className="space-y-3 py-3">
    <DirectorySortSelector kind={kind} value={directorySort(params, kind)} onChange={value => setParams(previous => {
      const next = new URLSearchParams(previous), key = kind === 'profiles' ? 'peopleSort' : 'groupSort';
      if (value === 'popular') next.delete(key); else next.set(key, value);
      return next;
    })} />
    {/* Match the other boards' Advanced disclosure, not a separate Servers CTA. */}
    <div className="mt-3 flex justify-start">
      <button type="button" data-testid="directory-advanced-toggle" aria-controls={panelId} aria-expanded={expanded}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => setParams(previous => {
        const next = new URLSearchParams(previous);
        if (expanded) { next.delete('tune'); next.delete('editServers'); next.delete('removeServer'); next.delete('approveServer'); }
        else next.set('tune', '1');
        return next;
      })}>
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        {expanded ? 'Hide controls' : 'Advanced'}
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </div>
    <div id={panelId} data-testid="directory-advanced-panel" aria-hidden={!expanded} className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="overflow-hidden" inert={!expanded}>
        <div className="overflow-hidden rounded-xl border border-border bg-surface"><FeedSourcesEditor control={control} errors={errors} allocations={allocations} onRetry={onRetry} itemLabel={kind === 'profiles' ? 'profiles' : 'groups'} pageSize={pageSize} /></div>
      </div>
    </div>
    {!!errors && !!Object.keys(errors).length && <div role="status" className="text-xs text-muted-foreground">Some servers could not be read. <button type="button" onClick={onRetry} className={button}>Retry source reads</button></div>}
  </div>;
}
