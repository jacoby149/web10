import { Search, Users } from 'lucide-react';

// D1 (discover-reorg.md): the Discover/People subtab — a DESIGNED PLACEHOLDER
// until D2 lands the real People browser (the People cards + the three sorts +
// pagination + the ?q= filter + the "It's quiet here" state). The shell
// (DiscoverScreen) owns ?tab= and ?q= and hands the query down as a prop —
// the subtab has NO search field of its own (search is the top bar, S1/S2).
// D2 replaces the body of this file; the prop contract stays.

interface DiscoverPeopleTabProps {
  /** The active query from ?q= (set by the top bar's "see more people"). */
  query: string;
}

export default function DiscoverPeopleTab({ query }: DiscoverPeopleTabProps) {
  const q = query.trim();
  return (
    <div
      data-testid="discover-people-tab"
      className="flex flex-col items-center justify-center px-8 py-16 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
        <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">People</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Browse the people on your node and find who to follow.
      </p>
      {q && (
        <span
          data-testid="discover-people-tab-query"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-muted/40 px-3 py-1 text-xs text-brand-300"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          {q}
        </span>
      )}
    </div>
  );
}
