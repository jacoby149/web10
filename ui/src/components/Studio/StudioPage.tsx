import React from 'react';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
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
    <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-6">

            {status && (
              <div className="mb-4 p-3 rounded-lg text-sm text-center font-medium animate-pulse" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
                {status}
              </div>
            )}

            <div className="mb-8">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Studio</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Monetization menu — unlock more revenue streams as your audience grows
              </p>
            </div>

            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
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
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Rung 0 — Available Now
              </h2>
              <div className="space-y-4">
                <MembershipsCard I={I} onStatus={onStatus} />
                <AmazonTagCard I={I} onStatus={onStatus} />
                <DirectDealsCard I={I} onStatus={onStatus} />
              </div>
            </div>

            <div className="mt-12 p-4 rounded-xl border text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Third-party networks stay optional fill, never the foundation.
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Zero-friction rule: every option is one button. Adapters do the paperwork.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudioPage;