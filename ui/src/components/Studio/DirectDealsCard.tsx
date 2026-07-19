import React from 'react';
import { Handshake, X as XIcon } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STORAGE_KEY = 'web10_direct_deals';

interface DirectDeal {
  id: string;
  title: string;
  description: string;
  sponsor: string;
  amount: string;
  status: 'draft' | 'published' | 'completed';
  created_at: string;
}

interface DirectDealsCardProps {
  I: Record<string, any>;
  onStatus: (msg: string) => void;
}

const STATUS_VARIANT: Record<DirectDeal['status'], BadgeProps['variant']> = {
  published: 'success',
  draft: 'warning',
  completed: 'brand',
};

export function DirectDealsCard({ I, onStatus }: DirectDealsCardProps) {
  const [deals, setDeals] = React.useState<DirectDeal[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  });
  const [showForm, setShowForm] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [sponsor, setSponsor] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handlePublish = async () => {
    if (!title.trim()) {
      onStatus('Deal title is required');
      return;
    }
    setSaving(true);
    const deal: DirectDeal = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: title.trim(),
      description: description.trim(),
      sponsor: sponsor.trim(),
      amount: amount.trim(),
      status: 'published',
      created_at: new Date().toISOString(),
    };
    const updated = [deal, ...deals];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setDeals(updated);
      setShowForm(false);
      setTitle('');
      setDescription('');
      setSponsor('');
      setAmount('');
      onStatus(`Deal "${deal.title}" published`);

      if (!I.isMock && I.wapi?.create) {
        try {
          await I.wapi.create('ads', {
            service: 'ads',
            type: 'direct_deal',
            ...deal,
          });
        } catch { /* localStorage fallback is fine */ }
      }
    } catch {
      onStatus('Could not save deal locally');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    const updated = deals.filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setDeals(updated);
    onStatus('Deal removed');
  };

  return (
    <div className="rounded border border-border bg-card p-5 transition-colors hover:border-brand/50" data-testid="studio-direct-deals-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
            <Handshake className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="font-display text-lg font-medium text-foreground">Direct Deals</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Operator-entered sponsor deals. Type it, publish it — curated by architecture.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">Works at 100 followers</Badge>
              <Badge variant="outline">Curated, never programmatic</Badge>
            </div>
          </div>
        </div>

        <Button variant="brand" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Deal'}
        </Button>
      </div>

      {showForm && (
        <div className="mt-4 space-y-3 rounded-sm border border-border bg-elevated p-4">
          <div>
            <Label htmlFor="deal-title">Deal Title *</Label>
            <Input
              id="deal-title"
              className="mt-1"
              placeholder="e.g. Sponsored: Acme Widget Review"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="deal-sponsor">Sponsor</Label>
              <Input
                id="deal-sponsor"
                className="mt-1"
                placeholder="Brand name"
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="deal-amount">Amount</Label>
              <Input
                id="deal-amount"
                className="mt-1 tabular-nums"
                placeholder="e.g. $500"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="deal-description">Description</Label>
            <textarea
              id="deal-description"
              className="mt-1 flex w-full resize-none rounded-sm border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={2}
              placeholder="Deal details..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <Button variant="brand" className="w-full" onClick={handlePublish} disabled={saving || !title.trim()}>
            {saving ? 'Publishing…' : 'Publish Deal'}
          </Button>
        </div>
      )}

      {deals.length > 0 && (
        <div className="mt-4 space-y-2">
          {deals.map(deal => (
            <div
              key={deal.id}
              className="flex items-center justify-between rounded-sm border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{deal.title}</span>
                  <Badge variant={STATUS_VARIANT[deal.status] ?? 'success'}>{deal.status}</Badge>
                </div>
                <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {deal.sponsor && <span>{deal.sponsor}</span>}
                  {deal.amount && <span>{deal.sponsor ? ' · ' : ''}{deal.amount}</span>}
                  <span>{[deal.sponsor, deal.amount].filter(Boolean).length ? ' · ' : ''}{new Date(deal.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                className="ml-2 rounded p-1 text-muted-foreground transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => handleDelete(deal.id)}
                aria-label={`Remove deal ${deal.title}`}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
