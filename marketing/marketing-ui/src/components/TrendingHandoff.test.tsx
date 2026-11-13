import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import Navbar from './Navbar'
import Join from '../pages/Join'
import { SOCIAL_ORIGIN } from '../lib/origins'

vi.mock('../lib/analytics', () => ({ trackFunnel: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('links desktop and mobile Trending directly to social in the same tab', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stargazers_count: 0 }) }))
  await act(async () => { render(<MemoryRouter><Navbar /></MemoryRouter>) })
  fireEvent.click(screen.getByRole('button', { name: 'Open menu', exact: true }))
  const links = screen.getAllByRole('link', { name: 'Trending', exact: true })
  expect(links).toHaveLength(2)
  for (const link of links) {
    expect(link).toHaveAttribute('href', `${SOCIAL_ORIGIN.replace(/\/$/, '')}/feed`)
    expect(link).not.toHaveAttribute('target')
  }
  expect(screen.getByRole('link', { name: 'Search', exact: true })).toHaveAttribute('href', `${SOCIAL_ORIGIN.replace(/\/$/, '')}/search`)
})

it('links the Join footer directly to the same public social feed', () => {
  render(<Join />)
  const link = screen.getByRole('link', { name: 'Trending', exact: true })
  expect(link).toHaveAttribute('href', `${SOCIAL_ORIGIN.replace(/\/$/, '')}/feed`)
  expect(link).not.toHaveAttribute('target')
})
