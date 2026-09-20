import { Users } from 'lucide-react';

interface DiscoverPeopleTabProps {
  /** The active search query (?q=), held by the Discover shell. D2 wires the
   *  real People browser's ?q= filter to this. */
  q?: string;
}

/**
 * The Discover People subtab — a designed placeholder until D2 lands the real
 * People browser (paged, sortable, ?q= filter). A story-beat empty state, not
 * a gray void (design.md §1): it sets the expectation for what this surface
 * becomes. D2 replaces this with the browser; the shell's ?q= pass-through
 * (the `q` prop) is the seam it plugs into.
 */
export function DiscoverPeopleTab({ q }: DiscoverPeopleTabProps) {
  const query = q?.trim() || '';
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center"
      data-testid="discover-people-tab"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
        <Users className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div>
        <h2 className="font-display text-base font-semibold text-foreground" data-testid="discover-people-tab-title">
          {query ? `No people match “${query}”` : 'No people to show yet'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {query ? 'Try a different search.' : 'People you can follow will appear here.'}
        </p>
      </div>
    </div>
  );
}
