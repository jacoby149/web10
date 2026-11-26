/** Dark ink on light surfaces, white ink on dark. Never a black backing tile. */
export function ThemeMark({ className }: { className: string }) {
  return <span className={`inline-flex shrink-0 ${className}`} aria-hidden="true" data-testid="theme-key-mark">
    <img src="/keys-mark.png" alt="" className="hidden h-full w-full object-contain dark:block" data-brand-variant="white" />
    <img src="/keys-mark-dark.png" alt="" className="h-full w-full object-contain dark:hidden" data-brand-variant="dark" />
  </span>;
}

/** The ice-blue toolbar supplies its own background; Join uses the blue tile. */
export function SocialMark({ className, transparent = false }: { className: string; transparent?: boolean }) {
  return <img src={transparent ? '/social-conversation-pair.png' : '/social-conversation-pair-blue.png'} alt="" className={`${className} shrink-0 ${transparent ? '' : 'rounded-sm'} object-contain`} data-testid="social-header-mark" />;
}

/** The same bundled icon used by the manifest, for the in-app install prompt. */
export function SocialAppIcon() {
  return <img src="/logo192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg" />;
}
