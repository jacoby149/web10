/** A capsule's surface normals, not captured page pixels. Neutral RG means
 * zero displacement; only the inner rim bends the live backdrop. SVG filters
 * must use sRGB so byte 128 is the neutral point. */
export function glassLensMap(width: number, height: number, rim = 10, cornerRadius = Math.min(width, height) / 2): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const radius = Math.max(0, Math.min(cornerRadius, Math.min(width, height) / 2));
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
      // Sample inward at the rim. Outward sampling clips the backdrop input
      // and makes a dark fringe instead of refracting actual content.
      pixels[offset] = Math.round(128 - nx * strength * 127);
      pixels[offset + 1] = Math.round(128 - ny * strength * 127);
      pixels[offset + 2] = 128;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/** URL backdrop filters parse on engines that don't actually render them.
 * Restrict the experiment to Chromium; CSS-only frosted fallback elsewhere.
 * This is a visual capability hint, never an authority/security decision. */
export function supportsGlassRefraction(userAgent: string): boolean {
  return /(?:Chrome|Chromium|Edg)\//.test(userAgent) && !/(?:Firefox|FxiOS|CriOS|EdgiOS)\//.test(userAgent);
}
