import { AUTH_ORIGIN, SOCIAL_ORIGIN } from './origins'

export const SOCIAL_CATALOG_ICON = '/brand/social-guitar-192.png'
export const HUB_CATALOG_ICON = '/brand/icon-192.png'

export function catalogIconFor(url: string): string | undefined {
  try {
    const app = new URL(url)
    const matches = (origin: string) => {
      const canonical = new URL(origin)
      return app.origin === canonical.origin && app.pathname === canonical.pathname
    }
    if (matches(SOCIAL_ORIGIN)) return SOCIAL_CATALOG_ICON
    if (matches(AUTH_ORIGIN)) return HUB_CATALOG_ICON
  } catch { return undefined }
}
