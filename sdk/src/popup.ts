// Private sender registry shared by explicit login and standalone consent openers.
let authPopup: Window | null = null
let expectedOrigin: string | null = null

export function trackAuthPopup(popup: Window | null, url: string): void {
  authPopup = popup
  expectedOrigin = null
  try {
    if (popup) expectedOrigin = new URL(url, window.location?.href).origin
  } catch {
    // Invalid configured origins cannot authorize a handoff.
  }
}

export function isAuthPopupMessage(event: MessageEvent): boolean {
  // Do not test .closed: a genuine queued message can outlive its sender.
  return authPopup !== null && expectedOrigin !== null && expectedOrigin !== 'null' && event.source === authPopup && event.origin === expectedOrigin
}
