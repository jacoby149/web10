export function SocialWordmark({ className, accentClassName }: { className: string; accentClassName: string }) {
  return (
    <span data-testid="social-header-wordmark" className={`whitespace-nowrap font-display leading-none font-bold tracking-tight ${className}`}>
      web<span className={accentClassName}>10</span> <span>social</span>
    </span>
  );
}
