import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import LinksPage from './Links'
import { API_ORIGIN, AUTH_ORIGIN, SOCIAL_ORIGIN } from '../lib/origins'

describe('Links', () => {
  it('keeps the node docs and product links without the retired marketing API', () => {
    render(<LinksPage />)

    expect(screen.queryByRole('link', { name: /Marketing API Docs/i })).not.toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      SOCIAL_ORIGIN.replace(/\/$/, ''),
      AUTH_ORIGIN.replace(/\/$/, ''),
      '/app-store',
      '/',
      `${API_ORIGIN.replace(/\/$/, '')}/docs`,
      '/docs',
    ])
    expect(links.some(link => link.getAttribute('href')?.includes('marketing-api.web10.app'))).toBe(false)
    expect(screen.getByRole('link', { name: /^API Docs / })).toHaveAttribute(
      'href', `${API_ORIGIN.replace(/\/$/, '')}/docs`,
    )
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
