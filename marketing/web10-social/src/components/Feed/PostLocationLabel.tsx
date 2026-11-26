import { MapPin } from 'lucide-react';
import type { PostLocation } from '@/data/types';
import { cn } from '@/lib/utils';

export function PostLocationLabel({ location, className }: { location?: PostLocation; className?: string }) {
  if (typeof location?.name !== 'string' || !location.name.trim()) return null;
  return (
    <span className={cn('flex min-w-0 items-center gap-1 text-xs text-muted-foreground', className)} data-testid="post-location-label">
      <MapPin className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{location.name}</span>
    </span>
  );
}
