import { Check } from 'lucide-react';
import { dataTypeLabel, permissionDescription, permissionGroups } from '@/lib/consentLanguage';

const OPERATION_ORDER = ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll'];

export default function PermissionSummary({ permissions, actor = 'you' }: { permissions: Record<string, string[]>; actor?: 'you' | 'they' }) {
  const groups = permissionGroups(permissions);
  if (!groups.length) return <p className="text-sm text-muted-foreground">No data permissions requested.</p>;
  return (
    <div className="space-y-4" data-testid="permission-summary">
      {groups.map(({ services, operations }) => (
        <section key={services.join('\0')} className="min-w-0">
          <h3 className="mb-2 break-words text-sm font-medium text-foreground first-letter:uppercase">
            {services.length === 1 ? dataTypeLabel(services[0]) : 'For these data types'}
          </h3>
          {services.length > 1 && (
            <ul className="mb-4 flex flex-wrap gap-1.5" aria-label="Data types">
              {services.map(service => <li key={service} className="max-w-full break-words rounded bg-elevated px-2 py-1 text-xs text-muted-foreground first-letter:uppercase">{dataTypeLabel(service)}</li>)}
            </ul>
          )}
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[...operations].sort((a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b)).map(operation => (
              <li key={operation} className="flex gap-2">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" strokeWidth={1.5} />
                <span className="min-w-0 break-words" data-testid="permission-action">
                  {permissionDescription(operation, services.length === 1 && services[0] !== '*' ? dataTypeLabel(services[0]) : 'data', actor)}
                </span>
              </li>
            ))}
            {!operations.length && <li>No permissions requested for this data type.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
