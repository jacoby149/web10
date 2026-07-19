import { Menu, Moon, Settings as GearIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// design.md §8: Lucide only — this used to render `fa fa-*` classes with
// no FontAwesome ever loaded (invisible icons).
const ICONS: Record<string, LucideIcon> = {
  bars: Menu,
  moon: Moon,
  gear: GearIcon,
};

interface IconProps {
  children: string;
  onClick?: () => void;
  className?: string;
  label?: string;
}

function Icon({ children, onClick, className = "", label }: IconProps) {
  const Glyph = ICONS[children] ?? Menu;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? children}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        onClick ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
    >
      <Glyph className="h-5 w-5" strokeWidth={1.5} />
    </button>
  );
}

export { Icon };
