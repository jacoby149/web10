import AppShell from '../shared/AppShell';
import React from 'react';
import { CircleCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Derive a readable origin label from the ACR's allowed_origin.
function originLabel(origin: string): string {
  try { return new URL(`https://${origin}`).hostname; } catch { return origin; }
}

function Requests({ I }: { I: Record<string, any> }) {
  const pendingACRs = I.pendingACRs || [];

  const handleApprove = (acr: any) => {
    I.approveACR(acr);
  };

  const handleDeny = (acr: any) => {
    I.denyACR(acr);
  };

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Pending requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apps requesting access to your data — review exactly what each one wants before you approve.
        </p>
      </div>
      {pendingACRs.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <CircleCheck className="mx-auto mb-3 h-8 w-8 text-success" strokeWidth={1.5} />
          No pending requests.
        </div>
      ) : (
        pendingACRs.map((acr: any, idx: number) => {
          const origin = acr.allowed_origin;
          const perms = acr.permissions || {};
          const services = Object.keys(perms);

          return (
            <div key={idx} className="mx-auto mb-4 max-w-[800px]">
              <div className="overflow-hidden rounded border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Badge variant="brand">
                    access request
                  </Badge>
                  <span className="font-medium text-foreground">{originLabel(origin)}</span>
                </div>
                <div className="p-4">
                  <div className="mb-2">
                    <span className="text-sm font-medium text-muted-foreground">Origin:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="default">{origin}</Badge>
                    </div>
                  </div>
                  {services.map((svc: string) => (
                    <div key={svc} className="mt-2">
                      <span className="text-sm font-medium text-muted-foreground">Permissions ({svc}):</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(perms[svc] || []).map((p: string, i: number) => (
                          <Badge key={i} variant="success">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t border-border px-4 py-3">
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => handleApprove(acr)}
                    data-testid={`request-approve-${idx}`}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeny(acr)}
                    data-testid={`request-deny-${idx}`}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

function RequestPage({ I }: { I: Record<string, any> }) {
  return (
    <AppShell I={I} maxWidth="max-w-4xl" testid="request-page">
      <Requests I={I} />
    </AppShell>
  );
}

export default RequestPage;