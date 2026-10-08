import { describe, it, expect } from 'vitest';
import {
  projectEarnings,
  commissionPerSale,
  effectiveConversion,
  formatProjection,
  DEFAULT_RATES,
  type ProjectionRates,
} from '../../data/ad-projection';
import type { AdProduct } from '../../data/types';

// The little projection (ads-october focus #3) — a static "100k impressions ~
// $30" line using assumed rates. The operator's example: a $30 item at 10%
// commission = $3/sale → 100k × 1% CTR × 1% conversion × $3 = $30.

const PRODUCT: AdProduct = {
  target: 'product',
  name: 'The good coffee grinder',
  price: 30,
  commission: 10,
  commission_is_percent: true,
};

describe('commissionPerSale', () => {
  it('a percent commission is price × (commission/100)', () => {
    expect(commissionPerSale(PRODUCT)).toBeCloseTo(3); // $30 × 10%
  });

  it('a flat commission is the value itself', () => {
    expect(commissionPerSale({ target: 'product', price: 30, commission: 5, commission_is_percent: false })).toBe(5);
  });

  it('a percent commission with no price is undefined', () => {
    expect(commissionPerSale({ target: 'product', commission: 10, commission_is_percent: true })).toBeUndefined();
  });

  it('no commission / zero commission is undefined', () => {
    expect(commissionPerSale({ target: 'product', price: 30 })).toBeUndefined();
    expect(commissionPerSale({ target: 'product', price: 30, commission: 0, commission_is_percent: true })).toBeUndefined();
  });

  it('no product is undefined', () => {
    expect(commissionPerSale(undefined)).toBeUndefined();
  });
});

describe('projectEarnings', () => {
  it('reproduces the operator\u2019s "$30" example (100k impressions)', () => {
    expect(projectEarnings(100_000, PRODUCT, DEFAULT_RATES)).toBeCloseTo(30);
  });

  it('scales linearly with impressions', () => {
    expect(projectEarnings(50_000, PRODUCT, DEFAULT_RATES)).toBeCloseTo(15);
    expect(projectEarnings(200_000, PRODUCT, DEFAULT_RATES)).toBeCloseTo(60);
  });

  it('is undefined when the ad has no computable commission', () => {
    expect(projectEarnings(100_000, { target: 'product', name: 'no price' }, DEFAULT_RATES)).toBeUndefined();
    expect(projectEarnings(100_000, undefined, DEFAULT_RATES)).toBeUndefined();
  });

  it('honors custom assumed rates', () => {
    const rates: ProjectionRates = { ctr: 0.02, conversion: 0.02 };
    // 100k × 2% = 2,000 clicks × 2% = 40 sales × $3 = $120.
    expect(projectEarnings(100_000, PRODUCT, rates)).toBeCloseTo(120);
  });
});

describe('effectiveConversion (the self-calibration, focus #4)', () => {
  it('uses the assumed rate when no calibration is set', () => {
    expect(effectiveConversion(PRODUCT, DEFAULT_RATES)).toBe(0.01);
  });

  it('the operator\u2019s calibration overrides the assumed rate', () => {
    expect(effectiveConversion({ ...PRODUCT, calibration: 20 }, DEFAULT_RATES)).toBe(0.2);
  });

  it('a calibration of 0 is a real 0 (not a falsy fallback)', () => {
    expect(effectiveConversion({ ...PRODUCT, calibration: 0 }, DEFAULT_RATES)).toBe(0);
  });
});

describe('formatProjection', () => {
  it('whole dollars above $100', () => {
    expect(formatProjection(1234)).toBe('$1,234');
  });
  it('one decimal between $1 and $100', () => {
    expect(formatProjection(30)).toBe('$30.0');
    expect(formatProjection(3.5)).toBe('$3.5');
  });
  it('two decimals below $1', () => {
    expect(formatProjection(0.42)).toBe('$0.42');
  });
  it('undefined is the em dash (no computable projection)', () => {
    expect(formatProjection(undefined)).toBe('—');
  });
});
