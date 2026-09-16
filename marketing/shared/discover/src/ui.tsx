import type {
  HTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';
import { cn } from './utils';

/**
 * Minimal presentational primitives for the shared discover card (D73).
 *
 * These are deliberately plain HTML + the shared design tokens (design.md §13)
 * — NO radix, NO class-variance-authority. Both consuming apps (web10-social +
 * marketing-ui) already define the same `@theme` token set, so the token
 * classes (`bg-elevated`, `text-foreground`, `bg-brand-muted`, …) resolve in
 * both. Owning them here (instead of copying an app's ui/ kit) keeps the
 * package dependency-light and the two apps from drifting on the primitives.
 */

// ── Badge ────────────────────────────────────────────────────────────────────

const BADGE_VARIANTS: Record<string, string> = {
  default: 'border-transparent bg-secondary text-secondary-foreground',
  brand: 'border-transparent bg-brand-muted text-brand-300',
  brand_glow: 'border border-brand/30 bg-brand-muted text-brand-300 shadow-sm shadow-brand/20',
  outline: 'border-border text-muted-foreground',
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/15 text-warning',
  danger: 'border-transparent bg-danger-muted text-danger',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof BADGE_VARIANTS;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide transition-all duration-150',
        BADGE_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

// ── IconBtn (the player's control buttons) ───────────────────────────────────

export interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
}

export function IconBtn({ className, children, ...props }: IconBtnProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md text-foreground transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {}

export function Avatar({ className, children, ...props }: AvatarProps) {
  return (
    <div
      className={cn('relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface AvatarFallbackProps extends HTMLAttributes<HTMLSpanElement> {}

export function AvatarFallback({ className, children, ...props }: AvatarFallbackProps) {
  return (
    <span
      className={cn('flex h-full w-full items-center justify-center text-sm font-semibold text-foreground', className)}
      {...props}
    >
      {children}
    </span>
  );
}

// ── Skeleton (shimmer) ───────────────────────────────────────────────────────

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-shimmer bg-gradient-to-r from-elevated via-muted to-elevated bg-[length:200%_100%]', className)}
      {...props}
    />
  );
}

// ── TextInput (the comment compose box) ──────────────────────────────────────

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

// ── Select (the player's speed/quality menus) ────────────────────────────────

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'rounded-sm border border-input bg-transparent px-2 py-1 text-xs text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
}
