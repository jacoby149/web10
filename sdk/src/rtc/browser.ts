import { createRTC, setPeer } from './index'

// Keep the vanilla-JS demos' global API separate from the optional ESM exports.
declare global {
  interface Window {
    web10rtc: { createRTC: typeof createRTC; setPeer: typeof setPeer }
  }
}

window.web10rtc = { createRTC, setPeer }
