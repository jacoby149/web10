import { useEffect, useId, useRef, useState } from 'react'
import { navbarLensMap, supportsNavbarRefraction } from './navbarLens'

export default function NavbarGlass({ interior }: { interior: boolean }) {
  const id = `marketing-lens-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const layer = useRef<HTMLSpanElement>(null)
  const [map, setMap] = useState<string>()

  useEffect(() => {
    const nav = layer.current?.parentElement
    if (!interior || !nav || !supportsNavbarRefraction(navigator.userAgent) ||
        !CSS.supports('backdrop-filter', 'url("#lens")') || typeof ResizeObserver === 'undefined') return

    const reduced = window.matchMedia('(prefers-reduced-transparency: reduce)')
    const forced = window.matchMedia('(forced-colors: active)')
    const mobile = window.matchMedia('(width < 64rem)')
    const queries = [mobile, reduced, forced]
    let previousSize = ''
    const update = () => {
      const { width, height } = nav.getBoundingClientRect()
      const w = Math.round(width), h = Math.round(height)
      if (!mobile.matches || reduced.matches || forced.matches || w < 1 || h < 1 || w > 1024 || h > 600) {
        previousSize = ''
        setMap(undefined)
        return
      }
      const radius = parseFloat(getComputedStyle(nav).borderTopLeftRadius)
      const size = `${w}:${h}:${radius}`
      if (size === previousSize) return
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext('2d')
      if (!context) return
      context.putImageData(new ImageData(navbarLensMap(w, h, 10, radius), w, h), 0, 0)
      previousSize = size
      setMap(canvas.toDataURL())
    }
    const observer = new ResizeObserver(update)
    observer.observe(nav)
    queries.forEach(query => query.addEventListener('change', update))
    return () => {
      observer.disconnect()
      queries.forEach(query => query.removeEventListener('change', update))
    }
  }, [interior])

  return <>
    <span ref={layer} className="marketing-nav-bed" aria-hidden="true" />
    {interior && map && <>
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute h-0 w-0">
        <defs>
          <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="lens" />
            <feDisplacementMap in="SourceGraphic" in2="lens" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <span aria-hidden="true" data-testid="marketing-nav-refraction" className="marketing-nav-rim"
        style={{ backdropFilter: `url("#${id}")` }} />
    </>}
  </>
}
