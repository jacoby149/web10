import React from 'react';

interface MembershipsCardProps {
  I: Record<string, any>;
  onStatus: (msg: string) => void;
}

export function MembershipsCard({ I, onStatus }: MembershipsCardProps) {
  const [enabled, setEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleEnable = async () => {
    if (enabled) {
      onStatus('Memberships already active — Stripe Connect configured');
      return;
    }
    setLoading(true);
    try {
      if (I.isMock) {
        setEnabled(true);
        onStatus('Memberships enabled — Stripe Connect rails active');
      } else {
        const token = I.wapi.token;
        const decoded = I.wapi.readToken();
        const provider = decoded.provider;
        const protocol = window.location.protocol;

        const resp = await fetch(
          `${protocol}//${provider}/payments/stripe/connect`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          if (data.redirect_url) {
            window.location.href = data.redirect_url;
            return;
          }
          setEnabled(true);
          onStatus('Memberships enabled — Stripe Connect configured');
        } else {
          onStatus('Stripe Connect not configured on this node yet');
        }
      }
    } catch (e: any) {
      onStatus(e.response?.data?.detail || 'Could not enable memberships');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-xl border p-5 transition-all hover:shadow-md hover:border-transparent"
      style={{
        borderColor: enabled ? 'var(--color-success)' : 'var(--color-primary-400)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: 'var(--color-primary-100)' }}
          >
            💎
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text)' }}>
                Memberships & Tips
              </h3>
              {enabled && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Let fans subscribe and tip you directly. ~97% payout via Stripe Connect.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}>
                ~97% payout
              </span>
              <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
                Minutes to first dollar
              </span>
              <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                Tiers & ranks
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        className="w-full mt-4 px-4 py-3 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: enabled ? 'var(--color-success)' : 'var(--color-primary-600)' }}
        onClick={handleEnable}
        disabled={loading}
      >
        {loading
          ? 'Connecting...'
          : enabled
            ? 'Memberships Active'
            : 'Enable Memberships'}
      </button>
    </div>
  );
}