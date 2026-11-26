/** Same artwork/alpha in two exported colors; CSS follows the pre-paint theme. */
export default function BrandLogo({ className = '' }: { className?: string }) {
  return <span role="img" aria-label="web10" className={`inline-flex shrink-0 ${className}`} data-testid="brand-logo">
    <img src="/brand/logo-lockup.png" alt="" aria-hidden="true" className="hidden h-full w-auto dark:block" data-brand-variant="white" />
    <img src="/brand/logo-lockup-dark.png" alt="" aria-hidden="true" className="h-full w-auto dark:hidden" data-brand-variant="dark" />
  </span>
}
