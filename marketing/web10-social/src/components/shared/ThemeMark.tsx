/** Dark ink on light surfaces, white ink on dark. Never a black backing tile. */
export function ThemeMark({ className }: { className: string }) {
  return <span className={`inline-flex shrink-0 ${className}`} aria-hidden="true" data-testid="theme-key-mark">
    <img src="/keys-mark.png" alt="" className="hidden h-full w-full object-contain dark:block" data-brand-variant="white" />
    <img src="/keys-mark-dark.png" alt="" className="h-full w-full object-contain dark:hidden" data-brand-variant="dark" />
  </span>;
}

/** The Social conversation mark uses the same transparent artwork in both themes. */
export function SocialMark({ className }: { className: string }) {
  return <img src="/social-conversation-pair.png" alt="" className={`${className} shrink-0 object-contain`} data-testid="social-conversation-mark" />;
}
