import React from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, Flame } from 'lucide-react';
import { Websites, WhiteList, BlackList } from './ContractComponents';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function ContractViewer({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [wipeConfirm, setWipeConfirm] = React.useState("");
  const [showDelete, setShowDelete] = React.useState(false);
  const [showWipe, setShowWipe] = React.useState(false);
  const serviceName = contractI.data.service;

  if (serviceName === "*") return null;

  return (
    <div className="mx-auto max-w-[800px]">
      <div className="mb-4 overflow-hidden rounded border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-medium text-foreground">{serviceName}</span>
          <button
            type="button"
            onClick={contractI.toggleHide}
            aria-label={contractI.hide ? 'Expand contract details' : 'Collapse contract details'}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="contract-viewer-toggle"
          >
            {contractI.hide ? <ChevronRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronDown className="h-4 w-4" strokeWidth={1.5} />}
          </button>
        </div>
        {!contractI.hide && (
          <>
            <div className="p-4">
              <span className="text-sm font-medium text-muted-foreground">Websites/IPs:</span>
              <Websites contractI={contractI} />
              <WhiteList contractI={contractI} />
              <BlackList contractI={contractI} />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-brand-300 hover:text-brand-300"
                onClick={() => contractI.edit()}
                data-testid="contract-change-terms"
              >
                <Pencil className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                Change terms
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={() => setShowDelete(!showDelete)}
                data-testid="contract-delete-toggle"
              >
                <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                Delete terms
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={() => setShowWipe(!showWipe)}
                data-testid="contract-wipe-toggle"
              >
                <Flame className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                Wipe data
              </Button>
            </div>
          </>
        )}
      </div>
      {showDelete && (
        <div className="mb-4 overflow-hidden rounded border border-danger bg-card">
          <div className="p-4">
            <p className="font-medium text-danger">Delete service terms record</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This removes the <strong className="text-foreground">{serviceName}</strong> service's
              access terms — the app loses whatever this record granted it. Type the service name
              to confirm:
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={serviceName}
              className="mt-2 w-[220px]"
              aria-label="Type the service name to confirm deletion"
              data-testid="contract-delete-confirm-input"
            />
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              data-testid="contract-delete-submit"
              onClick={() => {
                if (deleteConfirm === serviceName) {
                  I.deleteService(serviceName);
                  setShowDelete(false);
                } else {
                  I.setStatus("Type the service name to confirm deletion");
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
      {showWipe && (
        <div className="mb-4 overflow-hidden rounded border border-danger bg-card">
          <div className="p-4">
            <p className="font-medium text-danger">Wipe all service data</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This permanently deletes every record stored under the{' '}
              <strong className="text-foreground">{serviceName}</strong> service — not just the
              contract, the data itself. Type the service name to confirm:
            </p>
            <Input
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
              placeholder={serviceName}
              className="mt-2 w-[220px]"
              aria-label="Type the service name to confirm wipe"
              data-testid="contract-wipe-confirm-input"
            />
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              data-testid="contract-wipe-submit"
              onClick={() => {
                if (wipeConfirm === serviceName) {
                  I.wipeServiceData(serviceName);
                  setShowWipe(false);
                } else {
                  I.setStatus("Type the service name to confirm wipe");
                }
              }}
            >
              Wipe
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContractViewer;