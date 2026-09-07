// hls.js (vendored at /hls.min.js — the same file the media demo ships,
// no CDN dep). The script attaches its class to window.Hls. This is a
// minimal structural type for the API surface the feed player uses
// (isSupported / loadSource / attachMedia / on / levels / currentLevel /
// destroy) — not the full hls.js type surface.

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
