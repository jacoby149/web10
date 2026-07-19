import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import MobileNav from '../shared/MobileNav';
import React from 'react';
import { CircleCheck, SquarePlus, SquareMinus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function Requests({ I }: { I: Record<string, any> }) {
  const [mode, setMode] = React.useState("basic");
  const pendingSIRs = I.SMR?.sirs || [];
  const pendingSCRs = I.SMR?.scrs || [];
  const allRequests = [...pendingSIRs, ...pendingSCRs];

  const handleApprove = (service: any, type: string) => {
    if (type === "new") {
      I.submitSIR(service);
    } else {
      I.changeTerms(service);
    }
  };

  const handleDeny = (service: any) => {
    I.purgeSMR(service);
  };

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Pending requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apps requesting access to your data — review exactly what each one wants before you approve.
        </p>
      </div>
      {allRequests.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <CircleCheck className="mx-auto mb-3 h-8 w-8 text-success" strokeWidth={1.5} />
          No pending requests.
        </div>
      ) : (
        allRequests.map((req: any, idx: number) => {
          const type = pendingSIRs.find((s: any) => s.service === req.service) ? "new" : "change";
          return (
            <div key={idx} className="mx-auto mb-4 max-w-[800px]">
              <div className="overflow-hidden rounded border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Badge variant={type === "new" ? "brand" : "warning"}>
                    {type === "new" ? "New service" : "Service change"}
                  </Badge>
                  <span className="font-medium text-foreground">{req.service}</span>
                </div>
                <div className="p-4">
                  {req.cross_origins && (
                    <div className="mb-2">
                      <span className="text-sm font-medium text-muted-foreground">Websites/IPs:</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {req.cross_origins.map((o: string, i: number) => (
                          <Badge key={i} variant="default">{o}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {req.whitelist && (
                    <div className="mt-2">
                      <span className="text-sm font-medium text-muted-foreground">Allowed:</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {req.whitelist.map((w: any, i: number) => (
                          <Badge key={i} variant="success">
                            {w.anchor} [{w.allowed.join(", ")}]
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {req.blacklist && (
                    <div className="mt-2">
                      <span className="text-sm font-medium text-muted-foreground">Blocked:</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {req.blacklist.map((b: any, i: number) => (
                          <Badge key={i} variant="danger">
                            {b.anchor} [{b.denied.join(", ")}]
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 border-t border-border px-4 py-3">
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => handleApprove(req, type)}
                    data-testid={`request-approve-${idx}`}
                  >
                    Approve {type === "new" ? "service" : "change"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeny(req)}
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
      <div className="py-4 text-center">
        <Button
          variant="outline"
          onClick={() => setMode(mode === "basic" ? "advanced" : "basic")}
          data-testid="request-toggle-details"
        >
          {mode === "basic" ? (
            <>Show all details <SquarePlus className="ml-1.5 h-4 w-4" strokeWidth={1.5} /></>
          ) : (
            <>Hide details <SquareMinus className="ml-1.5 h-4 w-4" strokeWidth={1.5} /></>
          )}
        </Button>
      </div>
    </>
  );
}

function RequestPage({ I }: { I: Record<string, any> }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 overflow-auto pb-16 md:pb-0">
          <div className="mx-auto max-w-4xl p-4 sm:p-6" data-testid="request-page">
            <Requests I={I} />
          </div>
        </div>
      </div>
      <MobileNav I={I} />
    </div>
  );
}

export default RequestPage;