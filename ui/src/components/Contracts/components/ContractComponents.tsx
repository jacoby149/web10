import { Trash2, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Permission tags — design.md §4: semantic colors mean things, so the
// destructive "delete" scope is the only one on the `danger` badge;
// create/read/update read as brand/neutral/warning, never decorative.
const TAG_VARIANT: Record<string, 'brand' | 'default' | 'warning' | 'danger'> = {
  create: 'brand',
  read: 'default',
  update: 'warning',
  delete: 'danger',
};

function Tag({ text }: { text: string }) {
  return <Badge variant={TAG_VARIANT[text] ?? 'default'} className="mb-1 mr-1">{text}</Badge>;
}

function Websites({ contractI }: { contractI: Record<string, any> }) {
  const sites: string[] = contractI.data.cross_origins;
  if (sites.length === 0) return null;
  return (
    <div className="ml-1 mt-1.5 flex flex-wrap gap-1.5">
      {sites.map((site, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
        >
          <Globe className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
          {site}
          {contractI.mode !== "view" && (
            <button
              type="button"
              onClick={() => contractI.deleteSite(i)}
              aria-label={`Remove ${site}`}
              className="ml-0.5 rounded-full text-muted-foreground transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`site-remove-${i}`}
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function PermissionList({
  contractI,
  title,
  entries,
  onDelete,
  testIdPrefix,
}: {
  contractI: Record<string, any>;
  title: string;
  entries: any[];
  onDelete: (i: number) => void;
  testIdPrefix: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1.5">
        {entries.map((p: any, i: number) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-sm bg-elevated px-2.5 py-1.5">
            <span className="mr-1 text-sm text-muted-foreground">
              {p.provider}/{p.username}
            </span>
            {p.create && <Tag text="create" />}
            {p.read && <Tag text="read" />}
            {p.update && <Tag text="update" />}
            {p.delete && <Tag text="delete" />}
            {contractI.mode !== "view" && (
              <button
                type="button"
                onClick={() => onDelete(i)}
                aria-label={`Remove ${p.provider}/${p.username}`}
                className="ml-auto rounded text-muted-foreground transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`${testIdPrefix}-remove-${i}`}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BlackList({ contractI }: { contractI: Record<string, any> }) {
  return (
    <PermissionList
      contractI={contractI}
      title="Blocked users"
      entries={contractI.data.blacklist}
      onDelete={(i) => contractI.deleteBlackListEntry(i)}
      testIdPrefix="blacklist"
    />
  );
}

function WhiteList({ contractI }: { contractI: Record<string, any> }) {
  return (
    <PermissionList
      contractI={contractI}
      title="Allowed users"
      entries={contractI.data.whitelist}
      onDelete={(i) => contractI.deleteWhiteListEntry(i)}
      testIdPrefix="whitelist"
    />
  );
}

export { Websites, BlackList, WhiteList };