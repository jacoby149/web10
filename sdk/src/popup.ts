// Shared by browser helpers and the ESM client's popup fallback.
const popups = new WeakMap<Window, string>()

export function trustPopup(popup: Window, authOrigin: string): void {
  popups.set(popup, new URL(authOrigin).origin)
}

export function trustedPopupMessage(event: MessageEvent, popup?: Window): boolean {
  const source = event.source as Window | null
  return !!source && (!popup || source === popup) &&
    popups.get(source) === event.origin
}

export function popupOrigin(popup: Window): string | undefined {
  return popups.get(popup)
}
