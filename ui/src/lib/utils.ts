// keep in sync with design.md — copied verbatim from
// marketing/web10-social/src/lib/utils.ts (D22: verbatim copies with a
// sync header beat a premature shared package).
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
