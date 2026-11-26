import { AUTH_ORIGIN, SOCIAL_ORIGIN } from './origins'

export const SOCIAL_CATALOG_ICON = '/brand/social-catalog.png'

export function catalogIconFor(url: string): string | undefined {
  try {
    const app = new URL(url)
    const isFirstParty = [SOCIAL_ORIGIN, AUTH_ORIGIN].some(origin => {
      const canonical = new URL(origin)
      return app.origin === canonical.origin && app.pathname === canonical.pathname
    })
    return isFirstParty ? SOCIAL_CATALOG_ICON : undefined
  } catch { return undefined }
}
