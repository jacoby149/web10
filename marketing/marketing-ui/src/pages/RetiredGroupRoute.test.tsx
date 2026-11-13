import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import appSource from '../App.tsx?raw'

vi.mock('../components/Navbar', () => ({ default: () => null }))
vi.mock('../components/DeployStatus', () => ({ default: () => null }))
vi.mock('../components/GitHubStarsContext', () => ({ StarsProvider: ({ children }: { children: React.ReactNode }) => children }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('removes the unsurfaced group-detail route without adding a redirect or group reads', () => {
  expect(appSource).not.toContain('path="/groups/:id"')
  expect(appSource).not.toContain('GroupDetail')
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  render(<MemoryRouter initialEntries={['/groups/api.example%2Fgroups%2Fusers%2Falice%2Fjazz']}><App /></MemoryRouter>)
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('No routes matched location'))
  expect(fetcher).not.toHaveBeenCalled()
  expect(screen.queryByRole('link', { name: 'Continue to web10 social' })).toBeNull()
  expect(screen.queryByTestId('group-detail-posts')).toBeNull()
})
