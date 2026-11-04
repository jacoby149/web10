import { useState } from 'react';
import { Disc3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MusicArtwork({ url, alt = '', className }: { url?: string; alt?: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return <span className={cn('flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-brand-muted via-elevated to-background', className)}>
    {url && url !== failedUrl ? <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => {
      console.log('[music-artwork] image unavailable; showing fallback');
      setFailedUrl(url);
    }} /> : <Disc3 data-testid="music-artwork-fallback" className="h-1/3 w-1/3 text-brand-300/60" strokeWidth={1} />}
  </span>;
}
