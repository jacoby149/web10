import { describe, it, expect } from 'vitest'

import { config } from '../config'

describe('config', () => {
  it('has expected default values', () => {
    expect(config.REACT_APP_DEFAULT_API).toBe('api.web10.app')
    expect(config.REACT_APP_BETA_REQUIRED).toBe(false)
    expect(config.REACT_APP_VERIFY_REQUIRED).toBe(true)
    expect(config.REACT_APP_PAY_REQUIRED).toBe(false)
    expect(config.REACT_APP_BRAND_TEXT).toBe('app store')
  })

  it('has logo paths', () => {
    expect(config.REACT_APP_LOGO_DARK).toBe('/YourOrgsLogo/key_white.png')
    expect(config.REACT_APP_LOGO_LIGHT).toBe('/YourOrgsLogo/key_black.png')
  })

  it('is a plain object with expected keys', () => {
    const expectedKeys = [
      'REACT_APP_DEFAULT_API',
      'REACT_APP_BETA_REQUIRED',
      'REACT_APP_VERIFY_REQUIRED',
      'REACT_APP_PAY_REQUIRED',
      'REACT_APP_LOGO_DARK',
      'REACT_APP_LOGO_LIGHT',
      'REACT_APP_BRAND_TEXT',
    ]
    for (const key of expectedKeys) {
      expect(config).toHaveProperty(key)
    }
  })
})
