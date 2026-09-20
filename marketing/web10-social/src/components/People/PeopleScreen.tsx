import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import DiscoverPeopleTab from '@/components/Discover/DiscoverPeopleTab';

const LOG = (...args: unknown[]) => console.log('[social:people]', ...args);

// ── The standalone People screen (/people) ───────────────────────────────────
// D2 (discover-reorg.md): the People browser now lives in the Discover subtab
// (DiscoverPeopleTab) — the paged, sortable, ?q=-filterable browser over the
// node's public directory (D0). This screen is a thin wrapper that keeps
// /people working (a "People" header + the shared browser). D4 retires the
// standalone tab: /people → /discover?tab=people (redirect), so this header is
// temporary chrome.

export default function PeopleScreen() {
  const [searchParams] = useSearchParams();
  // The active ?q= (shared with the Discover subtab) — passed to the browser.
  const query = useMemo(() => searchParams.get('q') || '', [searchParams]);
  LOG('PeopleScreen — query:', query || '(none)');

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="md:max-w-2xl md:mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
          <div className="flex items-center justify-between px-4 py-3 md:px-0 gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Users className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
              <h1 className="font-display text-lg font-bold text-foreground">People</h1>
            </div>
          </div>
        </div>

        {/* The shared People browser (sort + list + view more + ?q= + states) */}
        <DiscoverPeopleTab query={query} />
      </div>
    </div>
  );
}
