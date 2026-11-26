import * as React from 'react';
import { BookOpen, ChevronDown, ExternalLink, Sparkles, Store } from 'lucide-react';
import { WEB10_HOME, WEB10_DOCS, WEB10_APP_STORE } from '@/lib/links';
import { cn } from '@/lib/utils';

// The ecosystem destinations that lived in the removed desktop sidebar
// (the 26.11.2026 Hub refresh kept the top bar but dropped them):
// "What is web10", "App Store" and "Docs". They now open from this "More"
// menu on the ice-blue header instead — same destinations, same external
// links, one menu, no second navigation surface.
export const ECOSYSTEM = [
  { label: 'What is web10', icon: Sparkles, href: WEB10_HOME },
  { label: 'App Store', icon: Store, href: WEB10_APP_STORE },
  { label: 'Docs', icon: BookOpen, href: WEB10_DOCS },
] as const;

function MoreMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const item =
    'flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        data-testid="topbar-more"
        className="flex items-center gap-1 rounded-full border border-hub-ink/20 bg-hub-tint py-1.5 pl-3.5 pr-2 transition-colors hover:bg-hub-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hub-ink"
      >
        <span className="text-sm font-medium text-hub-ink">More</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-hub-ink transition-transform', open && 'rotate-180')} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="More"
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
          data-testid="topbar-more-menu"
        >
          {ECOSYSTEM.map(({ label, icon: ItemIcon, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn(item, 'text-foreground hover:bg-elevated')}
              data-testid={`more-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <ItemIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="flex-1 truncate">{label}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
            </a>
          ))}
          {/* The sidebar footer credit moved with the destinations it sat under. */}
          <div className="mt-1 border-t border-border px-2.5 pb-1.5 pt-2">
            <p className="font-mono text-xs leading-relaxed text-muted-foreground">
              Invented by{' '}
              <a
                href="https://jacobhoffman.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Jacob Hoffman
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default MoreMenu;
