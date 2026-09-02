/**
 * Optional RTC/P2P module — `web10-npm/rtc`.
 *
 * This subpath export provides WebRTC peer-to-peer connectivity
 * using PeerJS. It is optional: the core SDK has zero dependencies.
 *
 * @example
 * ```ts
 * import { createClient } from 'web10-npm'
 * import { createRTC } from 'web10-npm/rtc'
 *
 * const w = createClient()
 * const rtc = createRTC(w)
 *
 * rtc.initP2P((conn, data) => {
 *   console.log('received:', data)
 * })
 *
 * rtc.send('api.web10.app', 'bob', 'myapp.com', '', { text: 'hello' })
 * ```
 */
import type { V3Client } from '../v3';
/**
 * Set the PeerJS constructor. Call this before initP2P if bundling manually.
 */
export declare function setPeer(Peer: {
    new (id: string, opts: PeerJSOptions): PeerInstance;
}): void;
/**
 * Create an RTC/P2P connector.
 *
 * @param wapi - A web10 client instance
 * @returns An RTC connector for P2P communication
 */
export declare function createRTC(wapi: V3Client): RTCConnector;
/**
 * RTC/P2P connector interface.
 */
export interface RTCConnector {
    /** Generate a peer ID */
    peerId(provider: string, user: string, origin: string, label?: string): string;
    /** Initialize P2P (resolves when the local peer is open) */
    initP2P(onInbound: ((conn: PeerConnection, data: unknown) => void) | null, label?: string, secure?: boolean): Promise<void>;
    /** Get or create an outbound connection */
    connect(provider: string, username: string, origin: string, label?: string): PeerConnection;
    /** Send data to a peer */
    send(provider: string, username: string, origin: string, label: string, data: unknown): {
        connected: boolean;
    };
}
interface PeerJSOptions {
    host: string;
    secure: boolean;
    port: number;
    path: string;
    token: string;
}
interface PeerConnection {
    peer: string;
    open: boolean;
    send(data: unknown): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
}
interface PeerInstance {
    id: string;
    open: boolean;
    on(event: string, handler: (...args: unknown[]) => void): void;
    connect(id: string): PeerConnection;
}
export {};
//# sourceMappingURL=index.d.ts.map