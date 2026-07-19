import { ChevronDown, ChevronRight } from 'lucide-react';
import { Websites, WhiteList, BlackList } from './ContractComponents';
import { Badge } from '@/components/ui/badge';

function RequestViewer({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
  return (
    <div className="mx-auto mb-4 max-w-[800px]">
      <div className="overflow-hidden rounded border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{contractI.data.service}</span>
            <Badge variant="brand">Pending request</Badge>
          </div>
          <button
            type="button"
            onClick={contractI.toggleHide}
            aria-label={contractI.hide ? 'Expand request details' : 'Collapse request details'}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="request-viewer-toggle"
          >
            {contractI.hide ? <ChevronRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronDown className="h-4 w-4" strokeWidth={1.5} />}
          </button>
        </div>
        {!contractI.hide && (
          <div className="p-4">
            <span className="text-sm font-medium text-muted-foreground">Websites/IPs:</span>
            <Websites contractI={contractI} />
            <WhiteList contractI={contractI} />
            <BlackList contractI={contractI} />
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestViewer;