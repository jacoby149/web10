// keep in sync with design.md — not yet in web10-social's reference kit;
// built in the same idiom. Pulse at ~1.5s per design.md §7; honors
// prefers-reduced-motion (see index.css .animate-pulse override).
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-elevated', className)}
      {...props}
    />
  );
}

export { Skeleton };
