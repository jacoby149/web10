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

  it('the mobile bottom bar wears the frosted material', () => {
    render(<AppShell I={mockI}>{'content'}</AppShell>)
    glassy(screen.getByTestId('mobile-nav'))
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
    const reduced = css.match(/@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\n\}/)
    expect(reduced).not.toBeNull()
    expect(reduced![0]).toContain('background: var(--color-surface);')
    expect(reduced![0]).toContain('backdrop-filter: none;')
    const forced = css.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/)
    expect(forced).not.toBeNull()
    expect(forced![0]).toContain('background: Canvas;')
    expect(forced![0]).toContain('border-color: CanvasText;')
  })
})
