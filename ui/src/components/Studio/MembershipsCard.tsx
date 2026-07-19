import React from 'react';
import { Gem } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
      className={cn(
        'rounded border bg-card p-5 transition-colors',
        enabled ? 'border-success/50' : 'border-border hover:border-brand/50',
      )}
      data-testid="studio-memberships-card"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-brand-muted text-brand-300">
            <Gem className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-medium text-foreground">
                Memberships &amp; Tips
              </h3>
              {enabled && <Badge variant="success">ACTIVE</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Let fans subscribe and tip you directly. Stripe Connect handles payout.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="success" className="tabular-nums">~97% payout</Badge>
              <Badge variant="outline">Minutes to first dollar</Badge>
              <Badge variant="outline">Tiers &amp; ranks</Badge>
            </div>
          </div>
        </div>
      </div>

      <Button
        variant={enabled ? 'default' : 'brand'}
        className={cn('mt-4 w-full', enabled && 'bg-success text-white hover:bg-success/90')}
        onClick={handleEnable}
        disabled={loading}
        data-testid="studio-memberships-enable"
      >
        {loading ? 'Connecting…' : enabled ? 'Memberships Active' : 'Enable Memberships'}
      </Button>
    </div>
  );
}
