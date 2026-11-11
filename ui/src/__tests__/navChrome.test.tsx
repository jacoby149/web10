import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import AppShell from '../components/shared/AppShell'

// The console's authenticated interface surface, just enough for the chrome:
// AppShell renders SideBar + TopBar + MobileNav, and TopBar's account menu
// needs a username + mode setters.
const mockI = {
  isAuthenticated: () => true,
  isAdmin: true,
  mode: 'contracts',
  setMode: vi.fn(),
  logout: vi.fn(),
  search: '',
  runSearch: vi.fn(),
  v3: { readToken: () => ({ username: 'creator', provider: 'api.localhost' }) },
}

// The frosted material must fully REPLACE the old opaque surface: the class
// is present and the superseded Tailwind surface/border utilities are gone
// (leaving both would fight over the same properties).
function glassy(el: Element | null) {
  expect(el, 'expected chrome element').not.toBeNull()
  expect(el!.classList.contains('chrome-glass')).toBe(true)
  expect(el!.classList.contains('bg-surface')).toBe(false)
  expect(el!.classList.contains('border-border')).toBe(false)
}

describe('console navigation chrome (the social navigation-glass material, design.md §10)', () => {
  it('the desktop top bar wears the frosted material', () => {
    const { container } = render(<AppShell I={mockI}>{'content'}</AppShell>)
    glassy(container.querySelector('header'))
  })

  it('the desktop sidebar wears the frosted material', () => {
    render(<AppShell I={mockI}>{'content'}</AppShell>)
    glassy(screen.getByTestId('sidebar'))
  })

  it('the mobile dock is the floating frosted pill with the refraction layers', () => {
    render(<AppShell I={mockI}>{'content'}</AppShell>)
    const dock = screen.getByTestId('mobile-nav')
    glassy(dock)
    // the pill geometry (floating, inset, rounded) + the refraction layers
    expect(dock.classList.contains('chrome-floating')).toBe(true)
    expect(dock.classList.contains('chrome-mobile-dock')).toBe(true)
    expect(dock.classList.contains('inset-x-3')).toBe(true)
    expect(dock.querySelector('.chrome-dock-bed')).not.toBeNull()
    // the rim is engine-gated (Chromium-only, DockGlass's capability check):
    // in jsdom (a non-Chromium UA) the decorative displacement layer is absent
    // and the CSS-only frost remains
    expect(dock.querySelector('[data-testid="dock-refraction"]')).toBeNull()
    // the items are the selected-state pills, and the active one says so
    const items = Array.from(dock.querySelectorAll('button'))
    expect(items.every((b) => b.classList.contains('chrome-nav-item'))).toBe(true)
    expect(items.filter((b) => b.getAttribute('aria-current') === 'page')).toHaveLength(1)
  })

  it('the account menu floats as frosted chrome', () => {
    render(<AppShell I={mockI}>{'content'}</AppShell>)
    fireEvent.click(screen.getByTestId('topbar-account'))
    const menu = screen.getByRole('menu')
    expect(menu.classList.contains('chrome-glass')).toBe(true)
    expect(menu.classList.contains('chrome-floating')).toBe(true)
    expect(menu.classList.contains('bg-popover')).toBe(false)
  })

  it('the signed-out console still wears the frosted material on the bars', () => {
    const signedOut = { ...mockI, isAuthenticated: () => false }
    const { container } = render(<AppShell I={signedOut}>{'content'}</AppShell>)
    glassy(container.querySelector('header'))
    glassy(screen.getByTestId('sidebar'))
    // the mobile bottom bar is auth-only — it must not render signed out
    expect(screen.queryByTestId('mobile-nav')).toBeNull()
  })
})

describe('chrome material fallbacks (index.css)', () => {
  // Read from the package root: vitest runs with cwd = ui/ (the js.yml job
  // uses working-directory: ui), so a vite ?raw import or import.meta.url
  // would hit the transformed/aliased module, not the stylesheet on disk.
  const css = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

  it('derives the material from the active palette, opaque by default', () => {
    expect(css).toContain('--chrome-tint: color-mix(in srgb, var(--color-surface) 86%, transparent)')
    expect(css).toContain('.chrome-glass {\n  background-color: var(--color-surface);')
  })

  it('blurs only where an engine supports backdrop-filter', () => {
    expect(css).toContain('@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))')
    expect(css).toContain('backdrop-filter: blur(24px) saturate(140%)')
  })

  it('stays opaque under reduced transparency and forced colors', () => {
    const reduced = css.match(/@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\n\}/g)
    // the material block: the glass + the dock bed + the rim fallbacks
    const reducedBlock = (reduced ?? []).join('')
    expect(reducedBlock).toContain('background: var(--color-surface);')
    expect(reducedBlock).toContain('backdrop-filter: none;')
    expect(reducedBlock).toContain('.chrome-dock-rim { display: none; }')
    expect(reducedBlock).toContain('clip-path: none;')
    const forced = css.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/g)
    const forcedBlock = (forced ?? []).join('')
    expect(forcedBlock).toContain('background: Canvas;')
    expect(forcedBlock).toContain('border-color: CanvasText;')
    expect(forcedBlock).toContain('.chrome-dock-rim { display: none; }')
    expect(forcedBlock).toContain('.chrome-mobile-dock::after { display: none; }')
  })

  it('the dock paints its outline above the optical layers and reserves its bed', () => {
    // the persistent-ring correction (5.17.1): ::after carries the border +
    // shadow, never into the rim's backdrop input
    expect(css).toContain('.chrome-mobile-dock::after {')
    expect(css).toContain('border: 1px solid var(--chrome-edge);')
    expect(css).toContain('box-shadow: inset 0 1px 0 var(--chrome-highlight), 0 8px 32px var(--chrome-shadow);')
    // the rim samples the live page through a masked 8px ring; the bed clips
    // to the inner capsule so no square frost corners show
    expect(css).toContain('.chrome-dock-rim {')
    expect(css).toContain('mask-composite: exclude;')
    expect(css).toContain('clip-path: inset(8px round var(--radius-full));')
    // scrolling content clears the floating dock's bed (+ safe area)
    expect(css).toContain('--chrome-dock-clearance: calc(4.5rem + var(--chrome-dock-bottom));')
    expect(css).toContain('.chrome-content-clearance { padding-bottom: calc(var(--chrome-dock-clearance) + 1rem); }')
    // the selected pill state is aria-current, not a per-item class
    expect(css).toContain('.chrome-nav-item[aria-current="page"], .chrome-nav-item[aria-expanded="true"]')
  })
})
