import { useEffect, useId, useRef, useState } from 'react';
import { glassLensMap, supportsGlassRefraction } from './glassLens';

/** Decorative optical layers only. Buttons remain ordinary, undistorted DOM.
 * Canvas encodes a tiny lens-normal map; it never reads/copies the page. */
export default function DockGlass({ player = false }: { player?: boolean }) {
  const id = `dock-lens-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const layer = useRef<HTMLSpanElement>(null);
  const [map, setMap] = useState<string>();

  useEffect(() => {
    const dock = layer.current?.parentElement;
    if (!dock || !supportsGlassRefraction(navigator.userAgent) ||
        !CSS.supports('backdrop-filter', 'url("#lens")') || typeof ResizeObserver === 'undefined') return;
    let previousSize = '';
    const observer = new ResizeObserver(() => {
      const { width, height } = dock.getBoundingClientRect();
      const w = Math.round(width);
      const h = Math.round(height);
      // Hidden desktop/immersive dock has no map or allocation. Bound the
      // purely decorative allocation even on unusually wide embedded views.
      if (!w || !h || w > 1024 || h > 256) { previousSize = ''; setMap(undefined); return; }
      if (`${w}:${h}` === previousSize) return;
      previousSize = `${w}:${h}`;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      if (!context) return;
      const radius = player ? parseFloat(getComputedStyle(dock).borderTopLeftRadius) || 0 : Math.min(w, h) / 2;
      context.putImageData(new ImageData(glassLensMap(w, h, 10, radius), w, h), 0, 0);
      setMap(canvas.toDataURL());
      console.log('[navigation-glass] lens map resized', { width: w, height: h });
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [player]);

  return (
    <>
      <span ref={layer} aria-hidden="true" className="chrome-dock-bed" />
      {map && <>
        <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute h-0 w-0">
          <defs>
            <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="lens" />
              <feDisplacementMap in="SourceGraphic" in2="lens" scale="18" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
        <span aria-hidden="true" data-testid={player ? 'player-refraction' : 'dock-refraction'} className="chrome-dock-rim"
          style={{ backdropFilter: `url("#${id}")`, WebkitBackdropFilter: `url("#${id}")` }} />
      </>}
    </>
  );
}
