import React from 'react';

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
  const [salesCount, setSalesCount] = React.useState(() => {
    try {
      return parseInt(localStorage.getItem('web10_amazon_sales') || '0', 10);
    } catch { return 0; }
  });
  const [lastSaleDate, setLastSaleDate] = React.useState(() => {
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

  const salesStatusColor = daysRemaining > 90 ? 'var(--color-success)' : daysRemaining > 30 ? 'var(--color-warning)' : 'var(--color-danger)';
  const salesStatusBg = daysRemaining > 90 ? 'var(--color-success-bg)' : daysRemaining > 30 ? 'var(--color-warning-bg)' : 'var(--color-danger-bg)';

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
      className="rounded-xl border p-5 transition-all hover:shadow-md"
      style={{
        borderColor: tag ? 'var(--color-success)' : 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
          style={{ backgroundColor: 'var(--color-warning-bg)' }}
        >
          📦
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text)' }}>
              Amazon Associates
            </h3>
            {tag && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                ACTIVE
              </span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Paste your tag — every product link you post earns automatically at render time.
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
              Affiliate disclosure auto
            </span>
            <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
              No cloaking
            </span>
            <span
              className="text-xs px-2 py-1 rounded-md font-medium"
              style={{ backgroundColor: salesStatusBg, color: salesStatusColor }}
            >
              {salesCount}/3 sales — {daysRemaining}d remaining
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {tag ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg text-sm font-mono" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-border)', border: '1px solid var(--color-border)' }}>
              {tag}
            </div>
            <button
              className="px-3 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
              onClick={handleRemove}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              placeholder="e.g. mysite-20"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <button
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary-600)' }}
              onClick={handleSave}
              disabled={saving || !input.trim()}
            >
              {saving ? 'Saving...' : 'Save Tag'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}