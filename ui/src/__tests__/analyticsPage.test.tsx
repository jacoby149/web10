import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

import axios from 'axios'
import AnalyticsPage from '../components/Analytics/AnalyticsPage'

const mockI = {
  isAdmin: true,
  isMock: false,
  mode: 'analytics',
  setMode: () => {},
  isAuthenticated: () => true,
  logout: () => {},
  v3: {
    state: { token: 'admin-token' },
    readToken: () => ({ provider: 'api.localhost', username: 'admin' }),
  },
}

const SUMMARY = {
  days: 30,
  totals: { pageviews: 120, funnel: 34, errors: 5 },
  top_paths: [{ path: '/', count: 80 }, { path: '/trending', count: 40 }],
  top_referrers: [{ referrer: 'https://news.ycombinator.com', count: 12 }],
  funnel: [{ event: 'landing', count: 30 }, { event: 'docs_view', count: 20 }],
  top_errors: [{ message: 'TypeError: x', count: 5 }],
  timeseries: [
    { day: '2026-09-01', pageviews: 40 },
    { day: '2026-09-02', pageviews: 80 },
  ],
  node_ads: {
    impressions: 500,
    clicks: 25,
    ctr: 5,
    timeseries: [
      { day: '2026-09-01', impressions: 200, clicks: 10 },
      { day: '2026-09-02', impressions: 300, clicks: 15 },
    ],
  },
}

function mockLoad() {
  ;(axios.post as any).mockImplementation((url: string) => {
    if (String(url).includes('/admin/analytics')) return Promise.resolve({ data: SUMMARY })
    return Promise.resolve({ data: {} })
  })
}

describe('AnalyticsPage (D56 first-party usage)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the totals, top pages, referrers, funnel, and errors from /admin/analytics', async () => {
    mockLoad()
    render(<AnalyticsPage I={mockI as any} />)
    // totals
    await waitFor(() => expect(screen.getByTestId('analytics-stat-pageviews')).toBeInTheDocument())
    expect(screen.getByTestId('analytics-stat-pageviews')).toHaveTextContent('120')
    expect(screen.getByTestId('analytics-stat-funnel-events')).toHaveTextContent('34')
    expect(screen.getByTestId('analytics-stat-errors')).toHaveTextContent('5')
    // top pages
    expect(screen.getByTestId('analytics-top-paths')).toHaveTextContent('/')
    expect(screen.getByTestId('analytics-top-paths')).toHaveTextContent('/trending')
    // referrers (host extracted)
    expect(screen.getByTestId('analytics-referrers')).toHaveTextContent('news.ycombinator.com')
    // funnel
    expect(screen.getByTestId('analytics-funnel')).toHaveTextContent('landing')
    // errors
    expect(screen.getByTestId('analytics-errors')).toHaveTextContent('TypeError: x')
    // timeseries card renders (the line graph container)
    expect(screen.getByTestId('analytics-timeseries')).toBeInTheDocument()
    // node ads: impressions / clicks / CTR + the chart
    expect(screen.getByTestId('analytics-stat-impressions')).toHaveTextContent('500')
    expect(screen.getByTestId('analytics-stat-clicks')).toHaveTextContent('25')
    expect(screen.getByTestId('analytics-node-ads-timeseries')).toBeInTheDocument()
  })

  it('shows the node-ads placeholder when node_ads is null (D81 not built yet)', async () => {
    mockLoad()
    ;(axios.post as any).mockImplementation((url: string) => {
      if (String(url).includes('/admin/analytics')) return Promise.resolve({ data: { ...SUMMARY, node_ads: null } })
      return Promise.resolve({ data: {} })
    })
    render(<AnalyticsPage I={mockI as any} />)
    expect(await screen.findByTestId('analytics-node-ads-empty')).toBeInTheDocument()
  })

  it('sends the selected window (days) with the request', async () => {
    mockLoad()
    render(<AnalyticsPage I={mockI as any} />)
    await waitFor(() => expect(axios.post).toHaveBeenCalled())
    const lastCall = () => {
      const calls = (axios.post as any).mock.calls.filter((c: any[]) => String(c[0]).includes('/admin/analytics'))
      return calls[calls.length - 1]
    }
    expect(lastCall()[1]).toEqual({ token: 'admin-token', days: 30 })
    // switch to 7d → a new request with days: 7
    fireEvent.click(screen.getByTestId('analytics-days-7'))
    await waitFor(() => expect(lastCall()[1]).toEqual({ token: 'admin-token', days: 7 }))
  })

  it('shows the admin gate for a non-admin', async () => {
    render(<AnalyticsPage I={{ ...mockI, isAdmin: false } as any} />)
    expect(await screen.findByTestId('analytics-admins-only')).toBeInTheDocument()
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('shows an error state when the request fails', async () => {
    ;(axios.post as any).mockRejectedValue({ response: { data: { detail: 'nope' } } })
    render(<AnalyticsPage I={mockI as any} />)
    expect(await screen.findByTestId('analytics-error')).toHaveTextContent('nope')
  })
})
