// keep in sync with design.md — copied verbatim from
// marketing/web10-social/src/lib/utils.ts (the shadcn/ui idiom, D22/D23)
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
