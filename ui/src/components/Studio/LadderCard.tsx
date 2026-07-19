import { DollarSign, LayoutGrid, Handshake, TrendingUp, Globe, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { type LadderRung, formatNumber, progressPercent } from './studio-data';

interface LadderCardProps {
  rung: LadderRung;
  onClick?: () => void;
}

const ICONS: Record<string, typeof DollarSign> = {
  'dollar-sign': DollarSign,
  'layout-grid': LayoutGrid,
  'handshake': Handshake,
  'trending-up': TrendingUp,
  'globe': Globe,
};

export function LadderCard({ rung, onClick }: LadderCardProps) {
  const pct = rung.unlocked ? 100 : progressPercent(rung.current, rung.target);
  const Icon = ICONS[rung.icon] ?? DollarSign;

  return (
    <div
      className={cn(
        'relative rounded border p-4 transition-colors',
        rung.unlocked
          ? 'border-brand/40 bg-brand-muted/20 cursor-pointer hover:border-brand/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'border-border bg-card opacity-70',
      )}
      onClick={rung.unlocked ? onClick : undefined}
      role={rung.unlocked && onClick ? 'button' : undefined}
      tabIndex={rung.unlocked && onClick ? 0 : undefined}
    >
      <div
        className={cn(
          'absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full',
          rung.unlocked ? 'bg-success text-white' : 'bg-elevated text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {rung.unlocked ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      </div>

      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded',
            rung.unlocked ? 'bg-brand-muted text-brand-300' : 'bg-elevated text-muted-foreground',
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rung {rung.id}
            </span>
            {rung.unlocked && <Badge variant="success">UNLOCKED</Badge>}
          </div>

          <h3 className="mt-0.5 font-medium text-foreground">{rung.title}</h3>

          <p className="mt-0.5 text-sm text-muted-foreground">{rung.description}</p>

          {!rung.unlocked && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                <span>
                  {formatNumber(rung.current)} / {formatNumber(rung.target)}
                  {rung.target > 1 ? ' sessions' : ''}
                </span>
                <span>{rung.threshold}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {pct < 100 && (
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {100 - pct}% more to unlock {rung.title}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
