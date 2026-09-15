import { LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProfileViewMode = 'grid' | 'feed';

interface ProfileViewToggleProps {
  value: ProfileViewMode;
  onChange: (mode: ProfileViewMode) => void;
}

// The profile's posts-tab view lens (the "view lenses" idea, later.md —
// rendering only, never ranking): the same posts as an insta-shaped grid
// (the default) or a facebook-shaped feed of full cards (text + media +
// engagement). A segmented control, the app's toggle idiom.
export function ProfileViewToggle({ value, onChange }: ProfileViewToggleProps) {
  const options: Array<{ id: ProfileViewMode; label: string; icon: typeof LayoutGrid }> = [
    { id: 'grid', label: 'Grid', icon: LayoutGrid },
    { id: 'feed', label: 'Feed', icon: Rows3 },
  ];
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-elevated p-0.5"
      role="tablist"
      aria-label="Profile view"
      data-testid="profile-view-toggle"
    >
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          data-testid={`profile-view-${id}`}
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            value === id
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={2} />
          {label}
        </button>
      ))}
    </div>
  );
}
