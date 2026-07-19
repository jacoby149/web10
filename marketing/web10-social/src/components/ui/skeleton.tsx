import { cn } from '@/lib/utils';

// design.md §1/§7 — loading states are skeletons, not spinners. Pulses at
// ~1.5s; content replaces it in place so nothing shifts.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded bg-elevated', className)}
      style={{ animationDuration: '1.5s' }}
      {...props}
    />
  );
}

export { Skeleton };
