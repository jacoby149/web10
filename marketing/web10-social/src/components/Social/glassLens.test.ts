import { describe, expect, it } from 'vitest';
import { glassLensMap, supportsGlassRefraction } from './glassLens';

describe('capsule lens map', () => {
  const width = 350;
  const height = 70;
  const pixels = glassLensMap(width, height);
  const at = (x: number, y: number) => [...pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
  it('keeps the center neutral and every alpha opaque', () => {
    expect(at(175, 35)).toEqual([128, 128, 128, 255]);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });
  it('bends only near the rim with opposite normals on opposite edges', () => {
    expect(at(175, 0)[0]).toBe(128);
    expect(at(175, 0)[1]).toBeGreaterThan(245);
    expect(at(175, 69)[1]).toBeLessThan(10);
    expect(at(175, 20)).toEqual([128, 128, 128, 255]);
    expect(at(0, 35)[0]).toBeGreaterThan(245);
    expect(at(349, 35)[0]).toBeLessThan(10);
  });
  it('curves both channels at the rounded corners', () => {
    const corner = at(10, 10);
    expect(corner[0]).toBeGreaterThan(128);
    expect(corner[1]).toBeGreaterThan(128);
    expect(at(339, 59)[0] + corner[0]).toBe(256);
    expect(at(339, 59)[1] + corner[1]).toBe(256);
  });
});

describe('experimental refraction engine gate', () => {
  it.each(['Mozilla Chrome/144 Safari/537', 'Mozilla Chromium/144', 'Mozilla Chrome/144 Edg/144'])('enables tested Chromium family: %s', ua => {
    expect(supportsGlassRefraction(ua)).toBe(true);
  });
  it.each(['Mozilla Version/19 Safari/605', 'Mozilla Firefox/144', 'Mozilla CriOS/144 Safari/605', 'Mozilla EdgiOS/144', 'Mozilla FxiOS/144', ''])('keeps fallback on unverified engines: %s', ua => {
    expect(supportsGlassRefraction(ua)).toBe(false);
  });
});
