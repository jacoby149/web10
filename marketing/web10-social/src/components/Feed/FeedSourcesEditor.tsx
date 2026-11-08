import { FeedSourcesEditor as SharedEditor } from '@web10/discover/source-controls';
import type { ServerAllocation } from '@/lib/serverMixer';
import type { useFeedSources } from './useFeedSources';
export function FeedSourcesEditor({ control, ...props }: {
  control: ReturnType<typeof useFeedSources>; allocations?: ServerAllocation[];
  errors?: Record<string, string>; onRetry: () => void;
}) {
  return <SharedEditor {...props} control={{ scope: control.scope, home: control.home, sources: control.sources,
    approved: control.approved, ready: control.ready, busy: control.busy, error: control.error,
    canEdit: !!control.credential, requiresApproval: true, save: control.save, approve: control.approve, reload: control.reload }} />;
}
