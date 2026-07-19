import React from 'react';

export interface LadderRung {
  id: number;
  title: string;
  description: string;
  threshold: string;
  current: number;
  target: number;
  unlocked: boolean;
  icon: string;
}

export const LADDER_RUNGS: LadderRung[] = [
  {
    id: 0,
    title: 'Memberships, Affiliate & Direct Deals',
    description: 'Start earning from day one — no audience minimum',
    threshold: 'Unlocked',
    current: 1,
    target: 1,
    unlocked: true,
    icon: 'dollar-sign',
  },
  {
    id: 1,
    title: 'Contextual Display Fill',
    description: 'Privacy-safe ad fill matched to your content (ethicalads-class)',
    threshold: '~1,000 sessions',
    current: 0,
    target: 1000,
    unlocked: false,
    icon: 'layout-grid',
  },
  {
    id: 2,
    title: 'Sponsor Marketplace Adapters',
    description: 'Paved, Kit, Beehiiv-class sponsor deals at 3% take',
    threshold: '~10,000 followers',
    current: 0,
    target: 10000,
    unlocked: false,
    icon: 'handshake',
  },
  {
    id: 3,
    title: 'Premium Programmatic',
    description: 'Raptive-class premium inventory (operator opt-in, contextual only)',
    threshold: '~25,000 followers',
    current: 0,
    target: 25000,
    unlocked: false,
    icon: 'trending-up',
  },
  {
    id: 4,
    title: 'Web10 Sponsor Marketplace',
    description: 'Cross-node inventory, nano-tier $20 promos, curation by architecture',
    threshold: 'M3 milestone',
    current: 0,
    target: 1,
    unlocked: false,
    icon: 'globe',
  },
];

export function formatNumber(n: number): string {
  if (n >= 1000) {
    const v = (n / 1000).toFixed(n >= 10000 ? 0 : 1)
    return v.replace(/\.0$/, '') + 'k'
  }
  return String(n)
}

export function progressPercent(current: number, target: number): number {
  if (target === 0) return 100;
  return Math.min(100, Math.round((current / target) * 100));
}