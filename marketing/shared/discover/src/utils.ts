import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class combiner (clsx + tailwind-merge) — the same idiom both apps use. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 1234 → 1.2k, 12000 → 12k, 999 → 999. The discover card's count format. */
export function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500', 'bg-red-500',
];

/** Deterministic avatar color from a username (the discover card's fallback). */
export function hashToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const FACE_GRADIENTS = [
  'bg-gradient-to-br from-rose-600 to-pink-900',
  'bg-gradient-to-br from-sky-600 to-indigo-900',
  'bg-gradient-to-br from-amber-600 to-orange-900',
  'bg-gradient-to-br from-emerald-600 to-teal-900',
  'bg-gradient-to-br from-violet-600 to-purple-900',
  'bg-gradient-to-br from-pink-600 to-rose-900',
  'bg-gradient-to-br from-indigo-600 to-violet-900',
  'bg-gradient-to-br from-orange-600 to-red-900',
  'bg-gradient-to-br from-teal-600 to-cyan-900',
  'bg-gradient-to-br from-red-600 to-rose-900',
];

/** Deterministic rich face gradient from an id (the person/group card fallback). */
export function hashToGradient(str: string): string {
  let hash = 0;
  for (let i = 0; str.length > i; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FACE_GRADIENTS[Math.abs(hash) % FACE_GRADIENTS.length];
}

/**
 * The v3 read serializes datetimes as naive 'YYYY-MM-DD HH:MM:SS[.ffffff]'
 * (str(datetime) of a UTC wall-clock). Browsers parse the space-separated form
 * as LOCAL time, which shifts recent posts into the future for west-of-UTC
 * clocks. Normalize the naive form to explicit UTC before parsing; ISO strings
 * (T / Z / offset) parse as-is.
 */
export function parseCreatedAt(dateStr: string): number {
  if (!dateStr) return Date.now();
  const t = dateStr.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(t)) {
    return new Date(`${t}Z`).getTime();
  }
  const ms = new Date(dateStr).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

/** "2h" / "4d" / "19h" — the discover card's relative-time format. */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = parseCreatedAt(dateStr);
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
