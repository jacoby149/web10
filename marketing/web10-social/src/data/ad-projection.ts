// ── ad-projection.ts — the little projection (ads-october focus #3) ─────────
// A *static* projection: "100k impressions ~ $30 approximately." It uses
// ASSUMED rates (industry-average CTR + conversion), not measured ones — no
// impression measurement, no click tracking, no live data (the *live*
// projection is the next narrowing, gated on the D86 analytics engine).
//
// The math:
//   impressions × CTR × conversion × commission-per-sale
//
// The operator's own example: a $30 item at 10% commission = $3/sale.
//   100k × 1% CTR = 1,000 clicks × 1% conversion = 10 sales × $3 = $30.
// The defaults below reproduce that exactly, so "100k impressions ~ $30" is
// the out-of-the-box number for a $30/10% product.
//
// The self-calibration (focus #4): the operator sets their own click→purchase
// % from their own clicks + actuals. When `product.calibration` is present it
// OVERRIDES the assumed conversion — the projection stops being a guess and
// starts being theirs.
//
// App-owned, D60 — pure math over the ad's own product fields. No node surface.

import type { AdProduct } from './types';

export interface ProjectionRates {
  /** Assumed click-through rate (0–1). Default 1% (0.01). */
  ctr: number;
  /** Assumed click→purchase rate (0–1). Default 1% (0.01). */
  conversion: number;
}

/** The out-of-the-box assumed rates — reproduce the operator's "$30" example. */
export const DEFAULT_RATES: ProjectionRates = { ctr: 0.01, conversion: 0.01 };

/**
 * The commission earned per sale, from the ad's product fields. A percent
 * commission is `price × (commission/100)`; a flat commission is the value
 * itself. `undefined` when it can't be computed (no commission, or a percent
 * with no price).
 */
export function commissionPerSale(product?: AdProduct): number | undefined {
  if (!product || product.commission === undefined || product.commission === 0) return undefined;
  if (product.commission_is_percent) {
    if (product.price === undefined) return undefined;
    return product.price * (product.commission / 100);
  }
  return product.commission;
}

/**
 * The effective click→purchase rate: the operator's self-calibration
 * (`product.calibration`, a 0–100 %) when set, else the assumed rate.
 */
export function effectiveConversion(product?: AdProduct, rates: ProjectionRates = DEFAULT_RATES): number {
  if (product?.calibration !== undefined) return product.calibration / 100;
  return rates.conversion;
}

/**
 * Project the earnings for `impressions` of this ad. `undefined` when the ad
 * has no computable commission (a pure ad with no product economics).
 */
export function projectEarnings(
  impressions: number,
  product?: AdProduct,
  rates: ProjectionRates = DEFAULT_RATES,
): number | undefined {
  const cps = commissionPerSale(product);
  if (cps === undefined) return undefined;
  const clicks = impressions * rates.ctr;
  const sales = clicks * effectiveConversion(product, rates);
  return sales * cps;
}

/**
 * Format a projected dollar amount for the "100k impressions ~ $30" line.
 * Rounds to whole dollars above $100, one decimal between $1 and $100, two
 * below — a rough "this ad is worth more than that one" signal, not a forecast.
 */
export function formatProjection(usd: number | undefined): string {
  if (usd === undefined) return '—';
  if (usd >= 100) return `$${Math.round(usd).toLocaleString()}`;
  if (usd >= 1) return `$${usd.toFixed(1)}`;
  return `$${usd.toFixed(2)}`;
}
