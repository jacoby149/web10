import * as React from 'react';
import { cn } from '@/lib/utils';

const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export { Select };