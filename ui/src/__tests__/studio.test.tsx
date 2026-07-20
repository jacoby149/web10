import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { formatNumber, progressPercent, LADDER_RUNGS } from '../components/Studio/studio-data'

// ── studio-data helpers ──

describe('studio-data helpers', () => {
  it('formatNumber formats small numbers as-is', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
  })

  it('formatNumber abbreviates thousands', () => {
    expect(formatNumber(1000)).toBe('1k')
    expect(formatNumber(2500)).toBe('2.5k')
    expect(formatNumber(10000)).toBe('10k')
    expect(formatNumber(25000)).toBe('25k')
  })

  it('progressPercent caps at 100', () => {
    expect(progressPercent(500, 1000)).toBe(50)
    expect(progressPercent(1000, 1000)).toBe(100)
    expect(progressPercent(1500, 1000)).toBe(100)
  })

  it('progressPercent handles zero target', () => {
    expect(progressPercent(0, 0)).toBe(100)
  })
})

describe('LADDER_RUNGS data', () => {
  it('has 5 rungs (0-4)', () => {
    expect(LADDER_RUNGS).toHaveLength(5)
  })

  it('rung 0 is unlocked', () => {
    expect(LADDER_RUNGS[0].unlocked).toBe(true)
  })

  it('rungs 1-4 are locked', () => {
    expect(LADDER_RUNGS.slice(1).every(r => !r.unlocked)).toBe(true)
  })

  it('rung 0 has threshold "Unlocked"', () => {
    expect(LADDER_RUNGS[0].threshold).toBe('Unlocked')
  })
})

// ── MembershipsCard ──

describe('MembershipsCard', () => {
  const mockI = {
    isMock: true,
    setStatus: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with "Enable Memberships" button', async () => {
    const { MembershipsCard } = await import('../components/Studio/MembershipsCard')
    render(<MembershipsCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText('Enable Memberships')).toBeTruthy()
  })

  it('renders membership description', async () => {
    const { MembershipsCard } = await import('../components/Studio/MembershipsCard')
    render(<MembershipsCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText(/Memberships & Tips/)).toBeTruthy()
  })

  it('shows ~97% payout chip', async () => {
    const { MembershipsCard } = await import('../components/Studio/MembershipsCard')
    render(<MembershipsCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText('~97% payout')).toBeTruthy()
  })

  it('enables memberships on click in mock mode', async () => {
    const { MembershipsCard } = await import('../components/Studio/MembershipsCard')
    const onStatus = vi.fn()
    render(<MembershipsCard I={mockI} onStatus={onStatus} />)
    fireEvent.click(screen.getByText('Enable Memberships'))
    expect(onStatus).toHaveBeenCalled()
    expect(screen.getByText('Memberships Active')).toBeTruthy()
  })
})

// ── AmazonTagCard ──

describe('AmazonTagCard', () => {
  const mockI = {
    isMock: true,
    setStatus: vi.fn(),
    wapi: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders with Amazon title', async () => {
    const { AmazonTagCard } = await import('../components/Studio/AmazonTagCard')
    render(<AmazonTagCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText(/Amazon Associates/)).toBeTruthy()
  })

  it('renders compliance chips', async () => {
    const { AmazonTagCard } = await import('../components/Studio/AmazonTagCard')
    render(<AmazonTagCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText(/Affiliate disclosure auto/)).toBeTruthy()
    expect(screen.getByText(/No cloaking/)).toBeTruthy()
  })

  it('shows tag input and save button', async () => {
    const { AmazonTagCard } = await import('../components/Studio/AmazonTagCard')
    render(<AmazonTagCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. mysite-20')).toBeTruthy()
    expect(screen.getByText('Save Tag')).toBeTruthy()
  })

  it('saves tag on Enter key', async () => {
    const { AmazonTagCard } = await import('../components/Studio/AmazonTagCard')
    const onStatus = vi.fn()
    render(<AmazonTagCard I={mockI} onStatus={onStatus} />)
    const input = screen.getByPlaceholderText('e.g. mysite-20')
    fireEvent.change(input, { target: { value: 'mytag-20' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(onStatus).toHaveBeenCalled()
  })
})

// ── DirectDealsCard ──

describe('DirectDealsCard', () => {
  const mockI = {
    isMock: true,
    setStatus: vi.fn(),
    wapi: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('[]')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders with Direct Deals title', async () => {
    const { DirectDealsCard } = await import('../components/Studio/DirectDealsCard')
    render(<DirectDealsCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText(/Direct Deals/)).toBeTruthy()
  })

  it('shows "+ New Deal" button', async () => {
    const { DirectDealsCard } = await import('../components/Studio/DirectDealsCard')
    render(<DirectDealsCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText('+ New Deal')).toBeTruthy()
  })

  it('opens form on "+ New Deal" click', async () => {
    const { DirectDealsCard } = await import('../components/Studio/DirectDealsCard')
    render(<DirectDealsCard I={mockI} onStatus={vi.fn()} />)
    fireEvent.click(screen.getByText('+ New Deal'))
    expect(screen.getByPlaceholderText(/Sponsored/)).toBeTruthy()
  })

  it('shows deal title input in form', async () => {
    const { DirectDealsCard } = await import('../components/Studio/DirectDealsCard')
    render(<DirectDealsCard I={mockI} onStatus={vi.fn()} />)
    fireEvent.click(screen.getByText('+ New Deal'))
    expect(screen.getByPlaceholderText('e.g. Sponsored: Acme Widget Review')).toBeTruthy()
  })

  it('shows sponsor and amount fields', async () => {
    const { DirectDealsCard } = await import('../components/Studio/DirectDealsCard')
    render(<DirectDealsCard I={mockI} onStatus={vi.fn()} />)
    fireEvent.click(screen.getByText('+ New Deal'))
    expect(screen.getByPlaceholderText('Brand name')).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. $500')).toBeTruthy()
  })

  it('shows "works at 100 followers" chip', async () => {
    const { DirectDealsCard } = await import('../components/Studio/DirectDealsCard')
    render(<DirectDealsCard I={mockI} onStatus={vi.fn()} />)
    expect(screen.getByText(/Works at 100 followers/)).toBeTruthy()
  })
})

// ── LadderCard ──

describe('LadderCard', () => {
  it('renders unlocked rung with checkmark', async () => {
    const { LadderCard } = await import('../components/Studio/LadderCard')
    const rung = {
      id: 0,
      title: 'Test Rung',
      description: 'Test description',
      threshold: 'Unlocked',
      current: 1,
      target: 1,
      unlocked: true,
      icon: 'dollar-sign',
    }
    render(<LadderCard rung={rung} />)
    expect(screen.getByText('Test Rung')).toBeTruthy()
    expect(screen.getByText('UNLOCKED')).toBeTruthy()
  })

  it('renders locked rung with progress bar', async () => {
    const { LadderCard } = await import('../components/Studio/LadderCard')
    const rung = {
      id: 1,
      title: 'Locked Rung',
      description: 'Locked description',
      threshold: '~1,000 sessions',
      current: 500,
      target: 1000,
      unlocked: false,
      icon: 'layout-grid',
    }
    render(<LadderCard rung={rung} />)
    expect(screen.getByText('Locked Rung')).toBeTruthy()
    expect(screen.getByText(/50% more to unlock/)).toBeTruthy()
  })

  it('shows rung label', async () => {
    const { LadderCard } = await import('../components/Studio/LadderCard')
    const rung = {
      id: 2,
      title: 'Sponsor Rung',
      description: 'Desc',
      threshold: '~10,000',
      current: 0,
      target: 10000,
      unlocked: false,
      icon: 'handshake',
    }
    render(<LadderCard rung={rung} />)
    expect(screen.getByText('Sponsor Rung')).toBeTruthy()
  })
})

// ── StudioPage ──

describe('StudioPage', () => {
  const mockI = {
    isMock: true,
    theme: 'dark',
    menuCollapsed: true,
    setMenuCollapsed: vi.fn(),
    setSearch: vi.fn(),
    _setMode: vi.fn(),
    setMode: vi.fn(),
    toggleMenuCollapsed: vi.fn(),
    toggleTheme: vi.fn(),
    isAuthenticated: () => true,
    setStatus: vi.fn(),
    mode: 'studio',
    config: {
      REACT_APP_BRAND_TEXT: 'web10',
      REACT_APP_LOGO_DARK: '',
      REACT_APP_LOGO_LIGHT: '',
    },
    logo: '',
    setLogo: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders studio heading', async () => {
    const { default: StudioPage } = await import('../components/Studio/StudioPage')
    render(<StudioPage I={mockI} />)
    // heading specifically — the sidebar also renders a "Studio" nav label
    expect(screen.getByRole('heading', { name: 'Studio' })).toBeTruthy()
  })

  it('renders monetization ladder section', async () => {
    const { default: StudioPage } = await import('../components/Studio/StudioPage')
    render(<StudioPage I={mockI} />)
    expect(screen.getByText(/Monetization Ladder/)).toBeTruthy()
  })

  it('renders rung 0 section', async () => {
    const { default: StudioPage } = await import('../components/Studio/StudioPage')
    render(<StudioPage I={mockI} />)
    expect(screen.getByText(/Rung 0 — Available Now/)).toBeTruthy()
  })

  it('renders all three rung-0 cards', async () => {
    const { default: StudioPage } = await import('../components/Studio/StudioPage')
    render(<StudioPage I={mockI} />)
    expect(screen.getByText(/Memberships & Tips/)).toBeTruthy()
    expect(screen.getByText(/Amazon Associates/)).toBeTruthy()
    expect(screen.getAllByText(/Direct Deals/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders zero-friction footer', async () => {
    const { default: StudioPage } = await import('../components/Studio/StudioPage')
    render(<StudioPage I={mockI} />)
    expect(screen.getByText(/Zero-friction rule/)).toBeTruthy()
  })
})