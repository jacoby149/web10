import { Hash } from 'lucide-react';

interface DiscoverGroupsTabProps {
  /** The active search query (?q=), held by the Discover shell. D3 wires the
   *  real Groups browser's ?q= filter to this. */
  q?: string;
}

/**
 * The Discover Groups subtab — a designed placeholder until D3 lands the real
 * Groups browser (the D53 directory, paged, ?tag=, ?q= filter). A story-beat
 * empty state, not a gray void (design.md §1): it sets the expectation for
 * what this surface becomes. D3 replaces this with the browser; the shell's
 * ?q= pass-through (the `q` prop) is the seam it plugs into.
 */
export function DiscoverGroupsTab({ q }: DiscoverGroupsTabProps) {
  const query = q?.trim() || '';
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center"
      data-testid="discover-groups-tab"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
        <Hash className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div>
        <h2 className="font-display text-base font-semibold text-foreground" data-testid="discover-groups-tab-title">
          {query ? `No groups match “${query}”` : 'No groups to show yet'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {query ? 'Try a different search.' : 'Groups you can join will appear here.'}
        </p>
      </div>
    </div>
  );
}
