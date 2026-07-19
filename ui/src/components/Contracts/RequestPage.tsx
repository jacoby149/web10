import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import React from 'react';

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
      <div className="text-center py-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Pending Service Requests
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Apps requesting access to your data
        </p>
      </div>
      {allRequests.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <i className="fa fa-check-circle fa-2x mb-3 block"></i>
          No pending requests.
        </div>
      ) : (
        allRequests.map((req: any, idx: number) => {
          const type = pendingSIRs.find((s: any) => s.service === req.service) ? "new" : "change";
          return (
            <div key={idx} className="max-w-[800px] mx-auto mb-4" style={{ padding: '20px' }}>
              <div
                className="rounded-lg border overflow-hidden transition-shadow hover:shadow-md"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                }}
              >
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="font-medium">
                    {type === "new" ? "New Service" : "Service Change"}: {req.service}
                  </span>
                </div>
                <div className="p-4">
                  {req.cross_origins && (
                    <div className="mb-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--color-text-secondary)' }}>Websites/IPs:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {req.cross_origins.map((o: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
                            {o}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {req.whitelist && (
                    <div className="mt-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--color-text-secondary)' }}>Allowed:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {req.whitelist.map((w: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                            {w.anchor} [{w.allowed.join(", ")}]
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {req.blacklist && (
                    <div className="mt-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--color-text-secondary)' }}>Blocked:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {req.blacklist.map((b: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                            {b.anchor} [{b.denied.join(", ")}]
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
                  <button
                    onClick={() => handleApprove(req, type)}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-primary-600)' }}
                  >
                    Approve {type === "new" ? "Service" : "Change"}
                  </button>
                  <button
                    onClick={() => handleDeny(req)}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-danger)' }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
      <div className="text-center py-4">
        <button
          onClick={() => setMode(mode === "basic" ? "advanced" : "basic")}
          className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
        >
          {mode === "basic" ? (
            <>Show All Details <i className="fa fa-square-plus ml-1 font-weight-bold"></i></>
          ) : (
            <>Hide Details <i className="fa fa-square-minus ml-1 font-weight-bold"></i></>
          )}
        </button>
      </div>
    </>
  );
}

function RequestPage({ I }: { I: Record<string, any> }) {
  return (
    <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 p-6 overflow-auto">
          <Requests I={I} />
        </div>
      </div>
    </div>
  );
}

export default RequestPage;