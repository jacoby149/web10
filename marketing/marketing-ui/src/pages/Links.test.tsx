import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import LinksPage from './Links'
import { API_ORIGIN, AUTH_ORIGIN, SOCIAL_ORIGIN } from '../lib/origins'

it('puts Social first, keeps all six destinations, and groups the developer links', () => {
  render(<MemoryRouter initialEntries={['/links']}><LinksPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1, name: 'Explore web10' })).toBeInTheDocument()
  const apps = within(screen.getByRole('region', { name: 'Apps and information' })).getAllByRole('link')
  const developers = within(screen.getByRole('region', { name: 'For developers' })).getAllByRole('link')
  expect(apps.map(link => link.getAttribute('href'))).toEqual([SOCIAL_ORIGIN, '/app-store', AUTH_ORIGIN, '/'])
  expect(developers.map(link => link.getAttribute('href'))).toEqual(['/docs', `${API_ORIGIN.replace(/\/$/, '')}/docs`])
  expect(apps[0]).toHaveAccessibleName(/^Open web10 social/)
  expect(apps[2]).toHaveAccessibleName(/^web10 Hub.*app permissions/)
  expect(screen.queryByRole('link', { name: /Marketing API Docs/i })).not.toBeInTheDocument()
  for (const link of [...apps, ...developers]) expect(link).not.toHaveAttribute('target')
})
