import React from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, Flame, Globe, Users } from 'lucide-react';
import { Websites, WhiteList, BlackList } from './ContractComponents';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// A Mongo ObjectId's first 4 bytes are the creation unix time — surface it as
// a human "granted" date so a contract card carries some history, not just a
// name. Returns null for records without a real ObjectId (e.g. mock data).
function grantedDate(id?: string): string | null {
  if (!id || id.length < 8) return null;
  const secs = parseInt(id.substring(0, 8), 16);
  if (Number.isNaN(secs)) return null;
  const d = new Date(secs * 1000);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2015) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ContractViewer({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [wipeConfirm, setWipeConfirm] = React.useState("");
  const [showDelete, setShowDelete] = React.useState(false);
  const [showWipe, setShowWipe] = React.useState(false);
  const serviceName = contractI.data.service;

  if (serviceName === "*") return null;

  const sites: string[] = contractI.data.cross_origins || [];
  const grants = (contractI.data.whitelist || []).length;
  const sitesPreview =
    sites.length === 0
      ? 'No sites yet'
      : sites.slice(0, 2).join(', ') + (sites.length > 2 ? ` +${sites.length - 2} more` : '');
  const granted = grantedDate(contractI.data._id);

  return (
    <div className="mx-auto max-w-[800px]">
      <div className="mb-4 overflow-hidden rounded border border-border bg-card transition-colors hover:border-brand/40">
        <button
          type="button"
          onClick={contractI.toggleHide}
          aria-expanded={!contractI.hide}
          aria-label={contractI.hide ? `Expand ${serviceName} contract` : `Collapse ${serviceName} contract`}
          className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          data-testid="contract-viewer-toggle"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">{serviceName}</span>
              {grants > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-muted px-2 py-0.5 text-[11px] font-medium text-brand-300">
                  <Users className="h-3 w-3" strokeWidth={2} />
                  {grants} {grants === 1 ? 'grant' : 'grants'}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{sitesPreview}</span>
            </div>
          </div>
          <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
            {granted && <div>Granted {granted}</div>}
            <div className="tabular-nums">{sites.length} {sites.length === 1 ? 'site' : 'sites'}</div>
          </div>
          <span className="shrink-0 text-muted-foreground">
            {contractI.hide ? <ChevronRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronDown className="h-4 w-4" strokeWidth={1.5} />}
          </span>
        </button>
        {!contractI.hide && <div className="border-b border-border" />}
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