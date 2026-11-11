// Keep in sync with web10-social/components/Social/glassLens.ts (design.md §10).
// Capsule normals only — this does not capture page or credential pixels.
export function glassLensMap(width: number, height: number, rim = 10): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const radius = Math.min(width, height) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - width / 2;
      const dy = y + 0.5 - height / 2;
      const qx = Math.abs(dx) - (width / 2 - radius);
      const qy = Math.abs(dy) - (height / 2 - radius);
      const mx = Math.max(qx, 0);
      const my = Math.max(qy, 0);
      const length = Math.hypot(mx, my);
      const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
      const strength = Math.sin(Math.max(0, Math.min(1, (rim + distance) / rim)) * Math.PI / 2);
      const nx = length ? Math.sign(dx) * mx / length : 0;
      const ny = length ? Math.sign(dy) * my / length : 0;
      const offset = (y * width + x) * 4;
      pixels[offset] = Math.round(128 - nx * strength * 127);
      pixels[offset + 1] = Math.round(128 - ny * strength * 127);
      pixels[offset + 2] = 128;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

// Parsing URL filters does not imply rendering them. iOS browsers keep frost.
export function supportsGlassRefraction(userAgent: string): boolean {
  return /(?:Chrome|Chromium|Edg)\//.test(userAgent) && !/(?:Firefox|FxiOS|CriOS|EdgiOS)\//.test(userAgent);
}
