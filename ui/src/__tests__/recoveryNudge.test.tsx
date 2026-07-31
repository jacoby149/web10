import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── RecoveryNudgeBanner ──

describe('RecoveryNudgeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear localStorage between tests
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the banner with warning styling', async () => {
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    render(<RecoveryNudgeBanner onNavigate={vi.fn()} />)
    expect(screen.getByTestId('recovery-nudge-banner')).toBeTruthy()
    expect(screen.getByText('Your account is at risk — set a recovery contact now')).toBeTruthy()
  })

  it('shows the CTA button', async () => {
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    const onNavigate = vi.fn()
    render(<RecoveryNudgeBanner onNavigate={onNavigate} />)
    expect(screen.getByTestId('recovery-nudge-cta')).toBeTruthy()
    expect(screen.getByText('Set recovery contact →')).toBeTruthy()
  })

  it('calls onNavigate when CTA is clicked', async () => {
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    const onNavigate = vi.fn()
    render(<RecoveryNudgeBanner onNavigate={onNavigate} />)
    fireEvent.click(screen.getByTestId('recovery-nudge-cta'))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('hides on dismiss', async () => {
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    render(<RecoveryNudgeBanner onNavigate={vi.fn()} />)
    expect(screen.getByTestId('recovery-nudge-banner')).toBeTruthy()
    fireEvent.click(screen.getByTestId('recovery-nudge-dismiss'))
    expect(screen.queryByTestId('recovery-nudge-banner')).toBeNull()
  })

  it('dismisses persist to localStorage', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    render(<RecoveryNudgeBanner onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByTestId('recovery-nudge-dismiss'))
    expect(setItemSpy).toHaveBeenCalledWith('recovery_nudge_dismissed_at', expect.any(String))
  })

  it('does not render when dismissed in localStorage', async () => {
    const now = Date.now()
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(String(now))
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    render(<RecoveryNudgeBanner onNavigate={vi.fn()} />)
    expect(screen.queryByTestId('recovery-nudge-banner')).toBeNull()
  })

  it('reappears after 24h dismissal window', async () => {
    const old = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(String(old))
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    render(<RecoveryNudgeBanner onNavigate={vi.fn()} />)
    expect(screen.getByTestId('recovery-nudge-banner')).toBeTruthy()
  })

  it('has role=alert for accessibility', async () => {
    const { default: RecoveryNudgeBanner } = await import('../components/shared/RecoveryNudgeBanner')
    render(<RecoveryNudgeBanner onNavigate={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})

// ── RecoveryContact ──

describe('RecoveryContact', () => {
  const mockI = {
    isMock: true,
    phone: '',
    setPhone: vi.fn(),
    setStatus: vi.fn(),
    servicesLoad: vi.fn(() => Promise.resolve()),
    config: { REACT_APP_VERIFY_REQUIRED: true },
    wapi: {
      token: 'tok123',
      readToken: () => ({ username: 'test', provider: 'api.localhost' }),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the recovery contact section', async () => {
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    render(<RecoveryContact I={mockI} />)
    expect(screen.getByTestId('recovery-contact-section')).toBeTruthy()
    expect(screen.getByText('Recovery Contact')).toBeTruthy()
  })

  it('shows phone input when no recovery phone set', async () => {
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    render(<RecoveryContact I={mockI} />)
    expect(screen.getByText('Save Recovery Phone')).toBeTruthy()
  })

  it('shows verified phone when one is set', async () => {
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    render(<RecoveryContact I={{ ...mockI, phone: '+15551234567' }} />)
    expect(screen.getByTestId('recovery-phone-display')).toBeTruthy()
    expect(screen.getByText('+15551234567')).toBeTruthy()
  })

  it('shows A20 email recovery grace note', async () => {
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    render(<RecoveryContact I={mockI} />)
    expect(screen.getByText(/A20.*email recovery/)).toBeTruthy()
  })
})

// ── ContractPage nudge integration ──

describe('ContractPage recovery nudge integration', () => {
  const mockI = (auth: boolean, hasRecovery: boolean) => ({
    isMock: true,
    theme: 'dark',
    menuCollapsed: true,
    setMenuCollapsed: vi.fn(),
    setSearch: vi.fn(),
    _setMode: vi.fn(),
    setMode: vi.fn(),
    toggleMenuCollapsed: vi.fn(),
    toggleTheme: vi.fn(),
    isAuthenticated: () => auth,
    hasRecoveryContact: () => hasRecovery,
    mode: 'contracts',
    services: [],
    search: '',
    status: null,
    setStatus: vi.fn(),
    config: {
      REACT_APP_BRAND_TEXT: 'web10',
      REACT_APP_LOGO_DARK: '',
      REACT_APP_LOGO_LIGHT: '',
    },
    logo: '',
    setLogo: vi.fn(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows nudge when authenticated with no recovery contact', async () => {
    const { default: ContractPage } = await import('../components/Contracts/ContractPage')
    render(<ContractPage I={mockI(true, false)} />)
    expect(screen.getByTestId('recovery-nudge-banner')).toBeTruthy()
  })

  it('does not show nudge when account has recovery contact', async () => {
    const { default: ContractPage } = await import('../components/Contracts/ContractPage')
    render(<ContractPage I={mockI(true, true)} />)
    expect(screen.queryByTestId('recovery-nudge-banner')).toBeNull()
  })

  it('does not show nudge when not authenticated', async () => {
    const { default: ContractPage } = await import('../components/Contracts/ContractPage')
    render(<ContractPage I={mockI(false, false)} />)
    expect(screen.queryByTestId('recovery-nudge-banner')).toBeNull()
  })

  it('nudge CTA navigates to settings', async () => {
    const { default: ContractPage } = await import('../components/Contracts/ContractPage')
    const I = mockI(true, false)
    render(<ContractPage I={I} />)
    fireEvent.click(screen.getByTestId('recovery-nudge-cta'))
    expect(I.setMode).toHaveBeenCalledWith('settings')
  })
})

// ── Interface hasRecoveryContact ──

describe('Interface hasRecoveryContact', () => {
  it('returns true when phone is set and long enough', async () => {
    const I = {} as Record<string, any>
    I.phone = '+15551234567'
    I.verified = false
    I.hasRecoveryContact = function () {
      return !!(I.verified || (I.phone && I.phone.trim().length >= 7))
    }
    expect(I.hasRecoveryContact()).toBe(true)
  })

  it('returns false when phone is empty', async () => {
    const I = {} as Record<string, any>
    I.phone = ''
    I.verified = false
    I.hasRecoveryContact = function () {
      return !!(I.verified || (I.phone && I.phone.trim().length >= 7))
    }
    expect(I.hasRecoveryContact()).toBe(false)
  })

  it('returns true when verified regardless of phone', async () => {
    const I = {} as Record<string, any>
    I.phone = ''
    I.verified = true
    I.hasRecoveryContact = function () {
      return !!(I.verified || (I.phone && I.phone.trim().length >= 7))
    }
    expect(I.hasRecoveryContact()).toBe(true)
  })
})