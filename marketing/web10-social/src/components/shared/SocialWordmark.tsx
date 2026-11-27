import { SOCIAL_SIGNATURE_PATH, SOCIAL_SIGNATURE_VIEW_BOX } from '@/lib/socialSignature';

export function SocialWordmark({ className, accentClassName }: { className: string; accentClassName: string }) {
  return (
    <span data-testid="social-header-wordmark" className={`inline-flex items-center gap-1 whitespace-nowrap font-display leading-none font-bold tracking-tight ${className}`}>
      <span>web<span className={accentClassName}>10</span></span>
      <span className="sr-only"> Social</span>
      <svg aria-hidden="true" data-testid="social-wordmark-signature" width="216.31" height="64.5" viewBox={SOCIAL_SIGNATURE_VIEW_BOX} className="h-[.9em] w-auto shrink-0 fill-current">
        <path d={SOCIAL_SIGNATURE_PATH} />
      </svg>
    </span>
  );
}
