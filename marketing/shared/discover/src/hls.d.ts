// hls.js 1.7.3 (vendored at /hls.min.js in each consuming app — no CDN dep).
// The script attaches its class to window.Hls. This is a minimal structural
// type for the API surface the player uses (isSupported / loadSource /
// attachMedia / on / destroy) — not the full hls.js type surface.
//
// Version pin: 1.7.3 is the minimum that plays the node's HLS cleanly on
// desktop (MSE). 1.5.x bound initPTS per-track, which let the audio and video
// tracks get negative/mismatched timestamps → choppy audio in hls.js while
// native HLS (mobile Safari) tolerated it. Fixed in 1.6.18; 1.7.x adds
// smoother audio handling.
//
// The consuming app loads the vendored script (web10-social + marketing-ui
// both ship public/hls.min.js + a <script src="/hls.min.js"> tag).

export interface HlsLevel {
  height: number;
  width: number;
  bitrate: number;
}

export interface HlsErrorData {
  type: string;
  details: string;
  fatal: boolean;
}

export type HlsEventType = 'manifestParsed' | 'levelSwitched' | 'error';

export interface HlsInstance {
  loadSource(url: string): void;
  attachMedia(media: HTMLVideoElement): void;
  destroy(): void;
  on(event: HlsEventType, listener: (event: string, data: any) => void): void;
  off(event: HlsEventType, listener: (event: string, data: any) => void): void;
  levels: HlsLevel[];
  currentLevel: number;
  /** Whether hls.js is actively loading segments (a paused-then-level-switched
    *  player can leave this disengaged → the switch stalls; startLoad re-arms). */
  autoStartLoad: boolean;
  startLoad(startPosition?: number): void;
}

export interface HlsStatic {
  new (): HlsInstance;
  isSupported(): boolean;
  Events: {
    MANIFEST_PARSED: HlsEventType;
    LEVEL_SWITCHED: HlsEventType;
    ERROR: HlsEventType;
  };
}

declare global {
  interface Window {
    Hls?: HlsStatic;
  }
}
