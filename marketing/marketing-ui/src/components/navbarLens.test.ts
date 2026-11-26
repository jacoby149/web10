import { describe, expect, it } from 'vitest'
import { navbarLensMap, supportsNavbarRefraction } from './navbarLens'

describe('marketing navbar lens', () => {
  it('keeps the center neutral and bends the rim inward', () => {
    const width = 120, height = 64
    const map = navbarLensMap(width, height)
    const pixel = (x: number, y: number) => Array.from(map.slice((y * width + x) * 4, (y * width + x + 1) * 4))
    expect(pixel(60, 32)).toEqual([128, 128, 128, 255])
    expect(pixel(60, 0)[1]).toBeGreaterThan(128)
    expect(pixel(60, 63)[1]).toBeLessThan(128)
    expect(pixel(0, 32)[0]).toBeGreaterThan(128)
    expect(pixel(119, 32)[0]).toBeLessThan(128)
  })

  it('only enables the URL backdrop experiment for Chromium', () => {
    expect(supportsNavbarRefraction('Mozilla Chrome/145')).toBe(true)
    expect(supportsNavbarRefraction('Mozilla Chrome/145 Edg/145')).toBe(true)
    expect(supportsNavbarRefraction('Mozilla Safari/605')).toBe(false)
    expect(supportsNavbarRefraction('Mozilla CriOS/145 Safari/605')).toBe(false)
    expect(supportsNavbarRefraction('Mozilla Firefox/145')).toBe(false)
  })
})
