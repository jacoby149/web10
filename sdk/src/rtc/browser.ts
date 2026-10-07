import { createRTC, setPeer } from './index'

// The same RTC implementation used by npm consumers, exposed for the demos.
Object.assign(window, { web10rtc: { createRTC, setPeer } })
