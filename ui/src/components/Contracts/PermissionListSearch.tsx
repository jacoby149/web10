import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function PermissionListSearch({ I, label }: { I: Record<string, any>; label: string }) {
  return (
    <div className="relative mb-4">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
      {/* Keep the existing automation hook even though search moved out of the top bar. */}
      <Input
        type="search"
        className="h-11 bg-card pl-9"
        placeholder={`${label}…`}
        aria-label={label}
        value={I.search ?? ''}
        onChange={(event) => I.runSearch(event.target.value)}
        data-testid="topbar-search"
      />
    </div>
  );
}
