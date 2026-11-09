import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import startup from '../../public/theme-init.js?raw'
import html from '../../index.html?raw'
import { createThemeStore, getThemeStore, THEME_KEY } from './theme'
import { createAppearanceStore } from '../../../shared/appearance/store'
import Appearance from '../pages/Appearance'
import BrandLogo from '../components/BrandLogo'

let dark = false
let listeners: Set<() => void>
let stores: ReturnType<typeof createThemeStore>[]
const device = (value: boolean) => { dark = value; listeners.forEach(listener => listener()) }
const store = () => { const next = createThemeStore(); stores.push(next); return next }
beforeEach(() => {
  dark = false
  listeners = new Set()
  stores = []
  localStorage.clear()
  document.head.innerHTML = '<meta name="theme-color" content="initial">'
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return dark },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }))
})
afterEach(() => { cleanup(); stores.forEach(next => next.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('marketing appearance', () => {
  it.each([null, 'system', 'light', 'dark', 'invalid'])('resolves %s before React, identically to the shared runtime', saved => {
    for (const preference of [false, true]) {
      dark = preference
      if (saved === null) localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, saved)
      window.eval(startup)
      const expected = saved === 'light' || saved === 'dark' ? saved : dark ? 'dark' : 'light'
      expect(document.documentElement.dataset.theme).toBe(expected)
      expect(document.documentElement.style.colorScheme).toBe(expected)
      expect(store().getSnapshot().resolved).toBe(expected)
      expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', expected === 'dark' ? '#09090b' : '#fafafa')
    }
  })

  it('blocks startup in the head and defaults to the device without an account', () => {
    expect(html).toContain('<script src="/theme-init.js"></script>')
    expect(html.indexOf('src="/theme-init.js"')).toBeLessThan(html.indexOf('</head>'))
    const next = store()
    device(true)
    expect(next.getSnapshot()).toMatchObject({ preference: 'system', resolved: 'dark' })
    next.setPreference('light')
    device(false); device(true)
    expect(next.getSnapshot().resolved).toBe('light')
    next.setPreference('system')
    expect(next.getSnapshot().resolved).toBe('dark')
  })

  it('keeps marketing and social choices independent, even on the same origin', () => {
    localStorage.setItem('web10-social:theme', 'dark')
    const marketing = store()
    expect(marketing.getSnapshot().preference).toBe('system')
    marketing.setPreference('light')
    const social = createAppearanceStore('web10-social:theme')
    stores.push(social)
    expect(social.getSnapshot().resolved).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('honors another tab, removal and clear, and ignores unrelated writes', () => {
    const next = store()
    const change = (key: string | null, value: string | null) => {
      if (key === null) localStorage.clear()
      else if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
      window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }))
    }
    change(THEME_KEY, 'dark')
    expect(next.getSnapshot().resolved).toBe('dark')
    change('other', 'light')
    expect(next.getSnapshot().resolved).toBe('dark')
    change(THEME_KEY, null)
    expect(next.getSnapshot().preference).toBe('system')
    change(THEME_KEY, 'dark'); change(null, null)
    expect(next.getSnapshot().preference).toBe('system')
  })

  it('keeps switching usable when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => window.eval(startup)).not.toThrow()
    const next = store()
    next.setPreference('dark')
    expect(next.getSnapshot()).toEqual({ preference: 'dark', resolved: 'dark', persistent: false })
  })

  it('provides paired transparent artwork, with no backing tile or runtime filter', () => {
    const { container } = render(<BrandLogo className="h-7" />)
    expect(screen.getByRole('img', { name: 'web10' })).toBeInTheDocument()
    expect(container.querySelector('[data-brand-variant="white"]')).toHaveAttribute('src', '/brand/logo-lockup.png')
    expect(container.querySelector('[data-brand-variant="dark"]')).toHaveAttribute('src', '/brand/logo-lockup-dark.png')
    expect(container.innerHTML).not.toMatch(/bg-brand-tile|filter:/)
  })

  it('offers native labelled radios, live status and a visible persistence warning', () => {
    stores.push(getThemeStore())
    render(<Appearance />)
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    act(() => device(true))
    expect(screen.getByRole('status')).toHaveTextContent('Dark mode')
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('alert')).toHaveTextContent('may not be remembered')
  })
})
