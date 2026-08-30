import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdRecord } from '@/data';
import { cn } from '@/lib/utils';

/**
 * The ad block — renders a post's pinned ad (ads-dissemination.md, D55).
 *
 * The read serves the pinned ad inline on the post (`post.ad`, I3-checked);
 * this is the app's renderer for it: the creative (the ad's text), the offer
 * (partner + CTA → the link that pays), and the disclosure (the FTC line).
 * The disclosure is part of the object, not a UI option — it is always shown.
 *
 * The creative is data; the HTML is the app's (ads.md). v3 renders the ad's
 * text + offer + disclosure; the ad's media is a follow-up (same as the
 * Studio's media-upload follow-up).
 */
export function AdBlock({ ad, className }: { ad: AdRecord; className?: string }) {
  const { offer } = ad;
  const hasLink = !!offer?.link;

  return (
    <div
      className={cn('px-4 py-3 border-t border-border bg-elevated/40', className)}
      data-testid="ad-block"
    >
      <div className="flex items-center gap-1.5">
        <Megaphone className="w-3 h-3 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
        <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          {offer?.partner || 'Sponsored'}
        </span>
      </div>

      {ad.text && (
        <p className="mt-1.5 text-sm text-foreground leading-relaxed">{ad.text}</p>
      )}

      {hasLink && (
        <Button asChild variant="brand" size="sm" className="mt-2.5 min-w-24" data-testid="ad-cta">
          <a href={offer!.link} target="_blank" rel="noopener noreferrer">
            {offer!.cta || 'Learn more'}
          </a>
        </Button>
      )}

      {offer?.disclosure && (
        <p className="mt-2 text-[0.6875rem] text-muted-foreground" data-testid="ad-disclosure">
          {offer.disclosure}
        </p>
      )}
    </div>
  );
}
