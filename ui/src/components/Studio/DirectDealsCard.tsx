import React from 'react';

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

  const statusColors: Record<string, { bg: string; text: string }> = {
    published: { bg: 'var(--color-success-bg)', text: 'var(--color-success)' },
    draft: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning)' },
    completed: { bg: 'var(--color-info-bg)', text: 'var(--color-info)' },
  };

  return (
    <div
      className="rounded-xl border p-5 transition-all hover:shadow-md"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: 'var(--color-success-bg)' }}
          >
            🤝
          </div>
          <div>
            <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text)' }}>
              Direct Deals
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Operator-entered sponsor deals. Type it, publish it — curated by architecture.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}>
                Works at 100 followers
              </span>
              <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
                Curated, never programmatic
              </span>
            </div>
          </div>
        </div>

        <button
          className="px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ New Deal'}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 p-4 rounded-lg border space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Deal Title *</label>
            <input
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              placeholder="e.g. Sponsored: Acme Widget Review"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Sponsor</label>
              <input
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
                placeholder="Brand name"
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Amount</label>
              <input
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
                placeholder="e.g. $500"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Description</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              rows={2}
              placeholder="Deal details..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <button
            className="w-full px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary-600)' }}
            onClick={handlePublish}
            disabled={saving || !title.trim()}
          >
            {saving ? 'Publishing...' : 'Publish Deal'}
          </button>
        </div>
      )}

      {deals.length > 0 && (
        <div className="mt-4 space-y-2">
          {deals.map(deal => {
            const sc = statusColors[deal.status] || statusColors.published;
            return (
              <div
                key={deal.id}
                className="flex items-center justify-between p-3 rounded-lg border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{deal.title}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                      {deal.status}
                    </span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {deal.sponsor && <span>{deal.sponsor}</span>}
                    {deal.amount && <span>{deal.sponsor ? ' · ' : ''}{deal.amount}</span>}
                    <span>{[deal.sponsor, deal.amount].filter(Boolean).length ? ' · ' : ''}{new Date(deal.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  className="ml-2 px-2 py-1 text-xs rounded transition-colors hover:opacity-80"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => handleDelete(deal.id)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}