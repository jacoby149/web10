/** A compact crop of the original Social guitarist; the adjacent text names the app. */
export function SocialAppMark({ className }: { className: string }) {
  return <span className={`inline-flex shrink-0 ${className}`} aria-hidden="true" data-testid="social-app-mark">
    <img src="/social-guitar-mark-light.png" alt="" className="size-full object-contain dark:hidden" data-brand-variant="light" />
    <img src="/social-guitar-mark.png" alt="" className="hidden size-full object-contain dark:block" data-brand-variant="dark" />
  </span>;
}
