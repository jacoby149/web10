// Screenshot-harness mock of `@/data/p2p`.
// Aliased in place of the real data/p2p.ts by screenshots/vite.config.ts so the
// harness never opens a real WebRTC signaling connection (no backend, no
// network). P2P reports not-ready → the UI shows the offline state, which is
// deterministic for screenshots.
export interface P2PInboundConn {
  peer: string;
}

export function setPeer(_Peer: { new (id: string, opts: unknown): unknown }): void {}
export function isP2PReady(): boolean {
  return false;
}
export function onP2PInbound(
  _listener: (conn: P2PInboundConn, data: unknown) => void,
): () => void {
  return () => {};
}
export async function initP2P(): Promise<boolean> {
  return false;
}
export function sendP2P(
  _toProvider: string,
  _toUsername: string,
  _payload: unknown,
): boolean {
  return false;
}
export function peerIdFor(_provider: string, _username: string): string | null {
  return null;
}
export function getOnlinePeers(): ReadonlySet<string> {
  return new Set();
}
export function onPresenceChange(_listener: () => void): () => void {
  return () => {};
}
export function teardownP2P(): void {}
