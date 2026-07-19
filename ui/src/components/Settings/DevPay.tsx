import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function DevPay({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  return (
    <Card className="overflow-hidden" data-testid="devpay-section">
      <button
        type="button"
        onClick={() => setHide(!hide)}
        aria-expanded={!hide}
        data-testid="devpay-toggle"
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium text-foreground">DevPay</span>
        {hide ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      {!hide && (
        <div className="flex gap-2 px-4 py-2.5">
          <Button variant="link" size="sm" className="px-0 text-brand-300" data-testid="devpay-connect-bank" onClick={() => I.manageBusiness()}>
            Connect To Bank
          </Button>
          <Button variant="link" size="sm" className="px-0 text-brand-300" data-testid="devpay-stats" onClick={() => I.businessLogin()}>
            DevPay Stats
          </Button>
        </div>
      )}
    </Card>
  );
}

export default DevPay;