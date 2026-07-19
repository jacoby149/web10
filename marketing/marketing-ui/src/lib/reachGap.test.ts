import { describe, it, expect } from 'vitest'
import {
  deliveryPercent,
  formatFollowerCount,
  REACH_GAP_EXAMPLE,
  WEB10_DELIVERY_PERCENT,
} from './reachGap'

describe('deliveryPercent', () => {
  it('matches the 1M/300k reach-gap example from THE STORY (plan.txt)', () => {
    expect(deliveryPercent(REACH_GAP_EXAMPLE.shownElsewhere, REACH_GAP_EXAMPLE.followers)).toBe(30)
  })

  it('is 100 when every follower is shown the post', () => {
    expect(deliveryPercent(1_000_000, 1_000_000)).toBe(100)
  })

  it('never exceeds 100 even if shown > followers (bad data)', () => {
    expect(deliveryPercent(1_500_000, 1_000_000)).toBe(100)
  })

  it('is 0 when there are no followers, never divides by zero', () => {
    expect(deliveryPercent(0, 0)).toBe(0)
  })

  it('never goes negative', () => {
    expect(deliveryPercent(-5, 1000)).toBe(0)
  })
})

describe('formatFollowerCount', () => {
  it('groups thousands', () => {
    expect(formatFollowerCount(1_000_000)).toBe('1,000,000')
    expect(formatFollowerCount(300_000)).toBe('300,000')
  })

  it('rounds fractional counts', () => {
    expect(formatFollowerCount(999.6)).toBe('1,000')
  })
})

describe('WEB10_DELIVERY_PERCENT', () => {
  it('is the 100%-by-architecture claim (D20) — never adjust without a decisions.md entry', () => {
    expect(WEB10_DELIVERY_PERCENT).toBe(100)
  })
})
