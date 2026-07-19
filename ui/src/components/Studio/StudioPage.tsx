import React from 'react';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import MobileNav from '../shared/MobileNav';
import { MembershipsCard } from './MembershipsCard';
import { AmazonTagCard } from './AmazonTagCard';
import { DirectDealsCard } from './DirectDealsCard';
import { LadderCard } from './LadderCard';
import { LADDER_RUNGS } from './studio-data';

function StudioPage({ I }: { I: Record<string, any> }) {
  const [status, setStatus] = React.useState<string | null>(null);

  const onStatus = (msg: string) => {
    setStatus(msg);
    if (I.setStatus) I.setStatus(msg);
    setTimeout(() => setStatus(null), 4000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 overflow-auto pb-16 md:pb-0">
          <div className="mx-auto max-w-4xl p-4 sm:p-6" data-testid="studio-page">

            {status && (
              <div
                role="status"
                className="mb-4 rounded bg-brand-muted px-3 py-2.5 text-center text-sm font-medium text-brand-300"
              >
                {status}
              </div>
            )}

            <div className="mb-8">
              <h1 className="font-display text-2xl font-bold text-foreground">Studio</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Monetization menu — unlock more revenue streams as your audience grows
              </p>
            </div>

            <div className="mb-8">
              <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Monetization Ladder
              </h2>
              <div className="space-y-3">
                {LADDER_RUNGS.map(rung => (
                  <LadderCard
                    key={rung.id}
                    rung={rung}
                    onClick={rung.id === 0 ? undefined : undefined}
                  />
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rung 0 — Available Now
              </h2>
              <div className="space-y-4">
                <MembershipsCard I={I} onStatus={onStatus} />
                <AmazonTagCard I={I} onStatus={onStatus} />
                <DirectDealsCard I={I} onStatus={onStatus} />
              </div>
            </div>

            <div className="mt-12 rounded border border-border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Third-party networks stay optional fill, never the foundation.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Zero-friction rule: every option is one button. Adapters do the paperwork.
              </p>
            </div>
          </div>
        </div>
      </div>
      <MobileNav I={I} />
    </div>
  );
}

export default StudioPage;