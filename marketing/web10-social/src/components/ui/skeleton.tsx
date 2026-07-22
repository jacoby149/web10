import { cn } from '@/lib/utils';

// design.md §1/§7 — loading states are skeletons, not spinners. Shimmer
// gradient sweep at ~1.5s; content replaces it in place so nothing shifts.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded skeleton-shimmer', className)}
      {...props}
    />
  );
}

export { Skeleton };
