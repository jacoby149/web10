import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide transition-all duration-150',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        brand: 'border-transparent bg-brand-muted text-brand-300',
        brand_glow: 'border border-brand/30 bg-brand-muted text-brand-300 shadow-sm shadow-brand/20',
        outline: 'border-border text-muted-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        danger: 'border-transparent bg-danger-muted text-danger',
        live: 'border border-success/40 bg-success/15 text-success animate-glow-pulse',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
