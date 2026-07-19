import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STORAGE_KEY = 'web10_amazon_tag';

interface AmazonTagCardProps {
  I: Record<string, any>;
  onStatus: (msg: string) => void;
}

export function AmazonTagCard({ I, onStatus }: AmazonTagCardProps) {
  const [tag, setTag] = React.useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch { return ''; }
  });
  const [input, setInput] = React.useState(tag);
  const [salesCount] = React.useState(() => {
    try {
      return parseInt(localStorage.getItem('web10_amazon_sales') || '0', 10);
    } catch { return 0; }
  });
  const [lastSaleDate] = React.useState(() => {
    try {
      return localStorage.getItem('web10_amazon_last_sale') || '';
    } catch { return ''; }
  });
  const [saving, setSaving] = React.useState(false);

  const daysRemaining = React.useMemo(() => {
    if (!lastSaleDate) return 180;
    const last = new Date(lastSaleDate);
    const expiry = new Date(last.getTime() + 180 * 24 * 60 * 60 * 1000);
    const remaining = Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    return remaining;
  }, [lastSaleDate]);

  const salesStatusVariant = daysRemaining > 90 ? 'success' : daysRemaining > 30 ? 'warning' : 'danger';

  const handleSave = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      onStatus('Enter a valid Amazon Associates tag');
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
      setTag(trimmed);
      onStatus(`Amazon tag "${trimmed}" saved — links will auto-tag at render`);

      if (!I.isMock && I.wapi?.create) {
        try {
          await I.wapi.create('monetization', {
            service: 'monetization',
            type: 'amazon_tag',
            tag: trimmed,
            saved_at: new Date().toISOString(),
          });
        } catch { /* localStorage fallback is fine */ }
      }
    } catch {
      onStatus('Could not save tag locally');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTag('');
    setInput('');
    onStatus('Amazon tag removed');
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-5 transition-colors',
        tag ? 'border-success/50' : 'border-border hover:border-brand/50',
      )}
      data-testid="studio-amazon-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
          <Package className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium text-foreground">Amazon Associates</h3>
            {tag && <Badge variant="success">ACTIVE</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste your tag — every product link you post earns automatically at render time.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Affiliate disclosure auto</Badge>
            <Badge variant="outline">No cloaking</Badge>
            <Badge variant={salesStatusVariant} className="tabular-nums">
              {salesCount}/3 sales — {daysRemaining}d remaining
            </Badge>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {tag ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-md border border-border bg-elevated px-3 py-2 font-mono text-sm text-foreground">
              {tag}
            </div>
            <Button variant="outline" className="border-danger text-danger hover:bg-danger-muted hover:text-danger" onClick={handleRemove}>
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. mysite-20"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              aria-label="Amazon Associates tag"
            />
            <Button variant="brand" onClick={handleSave} disabled={saving || !input.trim()}>
              {saving ? 'Saving…' : 'Save Tag'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
