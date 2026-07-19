import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function Subscription({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(false);
  const [plan, setPlan] = React.useState("MB/mo. 0, Credits/mo. 0");
  const [util, setUtil] = React.useState("Storage Utilization: _ / 0 MB");

  React.useEffect(() => {
    if (I.isAuthenticated()) {
      I.getPlan()
        .then((response: any) => {
          const data = response.data;
          const [space, credit, used] = [
            parseFloat(data["space"]).toFixed(2),
            parseFloat(data["credits"]).toFixed(2),
            parseFloat(data["used_space"]).toFixed(4),
          ];
          setPlan(`MB/mo. ${space}, Credits/mo. ${credit}`);
          setUtil(`Storage Utilization: ${used} / ${space} MB`);
        })
        .catch(() => { });
    }
  }, [I.auth]);

  return (
    <Card className="overflow-hidden" data-testid="subscription-section">
      <button
        type="button"
        onClick={() => setHide(!hide)}
        aria-expanded={!hide}
        data-testid="subscription-toggle"
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium text-foreground">Subscription Details</span>
        {hide ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      {!hide && (
        <>
          <div className="p-4">
            <Input readOnly value={plan} className="mb-1 bg-elevated" data-testid="subscription-plan" />
            <p className="ml-0.5 font-mono text-xs text-muted-foreground">{util}</p>
          </div>
          <div className="flex gap-2 border-t border-border px-4 py-2.5">
            <Button variant="link" size="sm" className="px-0 text-brand-300" data-testid="subscription-manage-space" onClick={() => I.manageSpace()}>Space Plan</Button>
            <Button variant="link" size="sm" className="px-0 text-brand-300" data-testid="subscription-manage-credits" onClick={() => I.manageCredits()}>Credit Plan</Button>
            <Button variant="link" size="sm" className="px-0 text-brand-300" data-testid="subscription-manage-subscriptions" onClick={() => I.manageSubscriptions()}>Subscriptions</Button>
          </div>
        </>
      )}
    </Card>
  );
}

export default Subscription;