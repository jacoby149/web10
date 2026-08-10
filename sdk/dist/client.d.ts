/**
 * The core web10 client.
 *
 * Provides typed CRUD operations, aggregate queries, token management,
 * auth flow helpers, contract management, and dev pay.
 *
 * @example
 * ```ts
 * import { createClient } from 'web10-npm'
 *
 * const w = createClient({ authUrl: 'https://auth.web10.app' })
 *
 * // Open auth popup and wait for login
 * await w.login()
 *
 * // Typed CRUD
 * const posts = await w.read<Post>('posts', { $sort: { created_at: -1 } })
 * const id = await w.create('posts', { text: 'hello web10' })
 * await w.update('posts', { _id }, { $set: { text: 'updated' } })
 * await w.delete('posts', { _id })
 *
 * // Aggregate
 * const stats = await w.aggregate('posts', [
 *   { $group: { _id: '$tag', count: { $sum: 1 } } },
 *   { $sort: { count: -1 } },
 * ])
 * ```
 */
import type { QueryOptions, UpdateSpec, Web10Record, Pipeline, ClientOptions, ClientState, ACR, ContractRequest, CheckoutParams, SubscriptionParams, CreateResponse, UpdateResponse, DeleteResponse, TokenResponse, TokenPayload, MediaUploadUrlParams, MediaUploadUrlResponse, MediaConfirmParams, MediaRecord } from './types';
/**
 * Create a web10 client instance.
 *
 * @param options - Configuration options
 * @returns A configured web10 client
 */
export declare function createClient(options?: ClientOptions): Web10Client;
/**
 * The web10 client interface.
 */
export interface Web10Client {
    state: ClientState;
    setToken(token: string): void;
    scrubToken(): void;
    readToken(): TokenPayload | null;
    isSignedIn(): boolean;
    signOut(): void;
    openAuthPortal(): Window | null;
    login(): Promise<void>;
    authListen(setAuth: (signedIn: boolean) => void): void;
    read<T = Record<string, unknown>>(service: string, query?: QueryOptions | null, username?: string | null, provider?: string | null): Promise<Web10Record<T>[]>;
    create<T = Record<string, unknown>>(service: string, body?: QueryOptions | null, username?: string | null, provider?: string | null): Promise<CreateResponse>;
    update(service: string, query: QueryOptions | null, update: UpdateSpec | null, username?: string | null, provider?: string | null): Promise<UpdateResponse>;
    deleteRecord(service: string, query?: QueryOptions | null, username?: string | null, provider?: string | null): Promise<DeleteResponse>;
    aggregate<T = Record<string, unknown>>(service: string, pipeline?: Pipeline, username?: string | null, provider?: string | null): Promise<T[]>;
    getTieredToken(site: string, target: string): Promise<TokenResponse>;
    contractOnReady(contracts: ContractRequest[]): void;
    contractResponseListen(setStatus: (status: string) => void): void;
    acrOnReady(acrs: ACR[]): void;
    acrResponseListen(setStatus: (status: string) => void): void;
    requestUploadUrl(params: MediaUploadUrlParams, username?: string | null, provider?: string | null): Promise<MediaUploadUrlResponse>;
    confirmUpload(params: MediaConfirmParams, username?: string | null, provider?: string | null): Promise<MediaRecord>;
    upload(file: Blob, meta?: {
        filename?: string;
        mimeType?: string;
        altText?: string;
        caption?: string;
        width?: number;
        height?: number;
        durationSeconds?: number;
        thumbnailUrl?: string;
    }, username?: string | null, provider?: string | null): Promise<MediaRecord>;
    getReadUrl(objectKey: string, opts?: {
        username?: string | null;
        provider?: string | null;
        force?: boolean;
    }): Promise<string>;
    checkout(params: CheckoutParams): Promise<void>;
    verifySubscription(params: SubscriptionParams): Promise<{
        active: boolean;
    }>;
    cancelSubscription(params: SubscriptionParams): Promise<{
        cancelled: boolean;
    }>;
}
//# sourceMappingURL=client.d.ts.map