import { useState } from 'react';
import { X, User } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A tab in the Manage sheet. The shell renders the nav; each section is a
 * ReactNode provided by its own bite (Profile / Settings / Members / Roles).
 * A section that hasn't landed yet renders the "coming soon" placeholder.
 */
export interface ManageSection {
  id: string;
  label: string;
  icon: typeof User;
  content: React.ReactNode;
}

const COMING_SOON = (
  <div className="flex flex-col items-center justify-center py-10 px-6 text-center" data-testid="manage-section-placeholder">
    <p className="text-sm font-medium text-foreground">Coming soon</p>
    <p className="mt-1 text-xs text-muted-foreground">This section is on the way.</p>
  </div>
);

/**
 * The "Manage group" sheet — the in-app management surface for a group the
 * current user owns or moderates. A bottom sheet (the `CreateGroupSheet` /
 * `VideoEditorSheet` idiom) with a tab nav that mounts one section per
 * concern. The shell is this bite; the sections are the parallel bites that
 * drop their content in via the `sections` prop.
 */
export default function ManageGroupSheet({
  open,
  onClose,
  groupId,
  groupName,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  sections: ManageSection[];
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');

  const activeSection = sections.find((s) => s.id === active) ?? sections[0];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Manage group"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg border-t border-border bg-card shadow-[0_-8px_30px_rgb(0,0,0,0.35)] sm:rounded-lg sm:border"
        data-testid="manage-group-sheet"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-foreground">Manage group</h3>
            <p className="truncate text-xs text-muted-foreground" data-testid="manage-group-name">
              {groupName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="manage-group-close"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border px-2 py-2" data-testid="manage-group-tabs" role="tablist">
          {sections.map(({ id, label, icon: Icon }) => {
            const isActive = id === activeSection?.id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(id)}
                data-testid={`manage-tab-${id}`}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'bg-brand-muted/60 text-brand-300' : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Active section body — each section is self-contained and owns its
            own save (the authenticator's dialog pattern). The header X + the
            backdrop close the sheet. */}
        <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="manage-group-body">
          {activeSection ? activeSection.content : COMING_SOON}
        </div>
      </div>
    </div>
  );
}
