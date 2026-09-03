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

// ── Affiliate programs (the bootcamp shortlist) ─────────────────────────────
//
// The creator-facing ramp: the programs worth joining, and the sign-up page
// for each. This is a MAP, not a contract — commission rates and cookie
// windows shift, so the copy says "confirm on the program's page." The card
// (AffiliateProgramsCard) is the "point people toward the programs" surface
// in the Studio; the full guide is
// knowledge/knowledge-base/web10-v3/social/monetization-bootcamp.md.

export interface AffiliateProgram {
  name: string;
  niche: string;
  commission: string;
  why: string;
  signupUrl: string;
}

export const AFFILIATE_PROGRAMS: AffiliateProgram[] = [
  {
    name: 'Amazon Associates',
    niche: 'Universal e-commerce',
    commission: '1–10% per sale',
    why: 'The catalog is everything. Lowest bar to start — the tag is the whole setup.',
    signupUrl: 'https://affiliate-program.amazon.com/',
  },
  {
    name: 'Walmart Creator',
    niche: 'Retail, grocery, electronics',
    commission: 'Up to 4% per sale',
    why: 'Physical-retail trust, strong conversion on everyday items.',
    signupUrl: 'https://www.walmart.com/creator',
  },
  {
    name: 'Target Partners',
    niche: 'Lifestyle, apparel, home',
    commission: 'Up to 8% per sale',
    why: '7-day cookie (vs Amazon’s 24h) — more credit for the click.',
    signupUrl: 'https://partners.target.com/',
  },
  {
    name: 'eBay Partner Network',
    niche: 'Used, vintage, refurbished',
    commission: '1–4% per sale',
    why: 'Inventory you can’t buy elsewhere — great for a “finds” niche.',
    signupUrl: 'https://www.ebaypartners.com/',
  },
  {
    name: 'TikTok Shop Affiliate',
    niche: 'Viral, social-first products',
    commission: '10–30%+ (volatile)',
    why: 'Native in-app checkout; the highest ceiling, the least stable.',
    signupUrl: 'https://www.tiktok.com/affiliate',
  },
  {
    name: 'Shopify Affiliate',
    niche: 'E-commerce software, business tools',
    commission: 'Up to 200% of monthly plan',
    why: 'High-value flat payouts for business / creator-economy traffic.',
    signupUrl: 'https://www.shopify.com/affiliate',
  },
  {
    name: 'Fiverr Affiliates',
    niche: 'Freelance, digital services',
    commission: '$15–$150 CPA',
    why: 'Dozens of service categories; fits a “how I run my business” angle.',
    signupUrl: 'https://www.fiverr.com/affiliates',
  },
  {
    name: 'Semrush Affiliate',
    niche: 'SEO, marketing, SaaS',
    commission: '$200/sale + $10/trial',
    why: '120-day cookie; high-intent digital traffic converts.',
    signupUrl: 'https://www.semrush.com/affiliate-program/',
  },
  {
    name: 'HubSpot Affiliate',
    niche: 'B2B software, CRM',
    commission: '30% recurring for 1 year',
    why: 'Sticky software = predictable recurring payouts.',
    signupUrl: 'https://www.hubspot.com/affiliates',
  },
];