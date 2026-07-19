import { LadderRung, formatNumber, progressPercent } from './studio-data';

interface LadderCardProps {
  rung: LadderRung;
  onClick?: () => void;
}

function IconFor(name: string) {
  const icons: Record<string, string> = {
    'dollar-sign': '$',
    'layout-grid': '⊞',
    'handshake': '🤝',
    'trending-up': '↑',
    'globe': '◉',
  };
  return icons[name] || '●';
}

export function LadderCard({ rung, onClick }: LadderCardProps) {
  const pct = rung.unlocked ? 100 : progressPercent(rung.current, rung.target);

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all ${
        rung.unlocked
          ? 'cursor-pointer hover:shadow-md hover:border-transparent'
          : 'opacity-60 cursor-not-allowed'
      }`}
      style={{
        borderColor: rung.unlocked ? 'var(--color-primary-500)' : 'var(--color-border)',
        backgroundColor: rung.unlocked
          ? 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-primary-50) 100%)'
          : 'var(--color-surface-2)',
      }}
      onClick={rung.unlocked ? onClick : undefined}
    >
      {rung.unlocked ? (
        <div
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm"
          style={{ backgroundColor: 'var(--color-success)' }}
        >
          ✓
        </div>
      ) : (
        <div
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: 'var(--color-neutral-300)', color: 'var(--color-neutral-600)' }}
        >
          🔒
        </div>
      )}

      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg"
          style={{
            backgroundColor: rung.unlocked
              ? 'var(--color-primary-100)'
              : 'var(--color-neutral-200)',
            color: rung.unlocked ? 'var(--color-primary-600)' : 'var(--color-neutral-500)',
          }}
        >
          {IconFor(rung.icon)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Rung {rung.id}
            </span>
            {rung.unlocked && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                UNLOCKED
              </span>
            )}
          </div>

          <h3 className="font-semibold mt-0.5" style={{ color: 'var(--color-text)' }}>
            {rung.title}
          </h3>

          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {rung.description}
          </p>

          {!rung.unlocked && (
            <div className="mt-3">
              <div className="flex justify-between items-center text-xs mb-1">
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {formatNumber(rung.current)} / {formatNumber(rung.target)} {rung.target > 1 ? 'sessions' : ''}
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>{rung.threshold}</span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--color-neutral-200)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: 'var(--color-primary-400)',
                  }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {pct < 100 ? `${100 - pct}% more to unlock ${rung.title}` : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}