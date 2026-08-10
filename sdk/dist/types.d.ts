/**
 * Core web10 protocol types.
 *
 * These types describe the data model, query/update shapes, tokens,
 * terms/contracts, and aggregate pipeline that the SDK talks to.
 */
/**
 * A web10 record is a document in a user's collection.
 * Every record has a `service` (string) and a `body` (arbitrary JSON).
 */
export interface Web10Record<TBody = Record<string, unknown>> {
    /** MongoDB ObjectId */
    _id?: string;
    /** Service name (e.g. "posts", "contacts", "services", "*") */
    service: string;
    /** Record payload */
    body: TBody;
    /** Server-injected: token's username */
    _author?: string;
    /** Server-injected: provider that minted the token */
    _source_node?: string;
    /** Server-injected: server time at storage */
    _created_at?: string;
}
/**
 * Query options for read operations.
 * Supports MongoDB-style operators: $sort, $skip, $limit, and
 * arbitrary field filters that get prefixed to `body.` by the API.
 */
export interface QueryOptions {
    /** Sort specification, e.g. `{ created_at: -1 }` */
    $sort?: Record<string, 1 | -1>;
    /** Number of records to skip */
    $skip?: number;
    /** Maximum number of records to return */
    $limit?: number;
    /** Additional field filters (prefixed to `body.` server-side) */
    [key: string]: unknown;
}
/**
 * Update specification for the update verb.
 * Supports MongoDB operators: $set, $unset, $inc, $push, $addToSet, $pull, $mul.
 * Field names are prefixed to `body.` server-side to protect top-level fields.
 */
export interface UpdateSpec {
    $set?: Record<string, unknown>;
    $unset?: Record<string, string>;
    $inc?: Record<string, number>;
    $push?: Record<string, unknown>;
    $addToSet?: Record<string, unknown>;
    $pull?: Record<string, unknown>;
    $mul?: Record<string, number>;
    $currentDate?: Record<string, boolean | {
        $type: string;
    }>;
}
/**
 * Decoded payload of a web10 JWT token.
 */
export interface TokenPayload {
    /** Username */
    username: string;
    /** App/site hostname */
    site: string;
    /** Target provider (for tiered tokens) */
    target?: string;
    /** Provider domain that minted this token (== the API host to address) */
    provider: string;
    /**
     * Expiration as an ISO-8601 timestamp. This is the claim the web10
     * server actually sets (`api/app/models/auth.py`); there is no numeric
     * `exp`. `isTokenExpired()` reads this.
     */
    expires?: string;
    /** Token type hint */
    type?: string;
}
/**
 * Options for creating a web10 client instance.
 */
export interface ClientOptions {
    /** URL of the web10 authenticator (e.g. "https://auth.web10.app") */
    authUrl?: string;
    /** API origin override (e.g. "https://api.web10.app") */
    apiOrigin?: string;
    /** List of app store URLs to register with */
    appStores?: string[];
    /** RTC server hostname (for P2P, used by the /rtc subpath) */
    rtcServer?: string;
}
/**
 * Runtime state of a web10 client.
 */
export interface ClientState {
    /** Resolved API protocol + host */
    apiOrigin: string;
    /** Authenticator URL */
    authUrl: string;
    /** Current JWT token (null when signed out) */
    token: string | null;
    /** RTC server hostname */
    rtcServer: string;
    /** App stores to register with */
    appStores: string[];
}
/**
 * A terms record defines what an app (identified by `site`) may do
 * on a given `service`. Lives in the `services` collection.
 */
export interface TermsRecord extends Web10Record {
    service: 'services';
    body: {
        /** Target service this term applies to */
        service: string;
        /** App/site granted access */
        site: string;
        /** Allowed actions */
        allowed?: string[];
        /** Whitelisted users (for shared access) */
        whitelist?: Array<{
            username: string;
            provider: string;
        }>;
        /** Blacklisted users */
        blacklist?: Array<{
            username: string;
            provider: string;
        }>;
        /** Allowed cross-origin hosts */
        cross_origins?: string[];
    };
}
/**
 * A Service-Info-Request (SIR) describes what access an app is requesting.
 * @deprecated Use ACR (App Contract Request) instead. SIR/SCR were v2 service-per-service
 * requests. v3 uses one contract per origin with per-service permissions.
 */
export interface SIR {
    /** Service to access */
    service: string;
    /** Actions requested */
    allowed?: string[];
}
/**
 * A Service-Change-Request (SCR) describes additive changes to an existing contract.
 * @deprecated Use ACR instead. The v3 model has no distinction between "new" and
 * "change" — both are an ACR that replaces the existing contract for that origin.
 */
export interface SCR {
    /** Service to modify */
    service: string;
    /** Actions to add */
    allowed?: string[];
}
/**
 * An App Contract Request (ACR) describes what permissions an app (origin) is requesting.
 * One ACR per origin. There is no distinction between a "first request" and a
 * "permission change" — both replace the existing contract for that origin.
 */
export interface ACR {
    /** The app origin requesting access */
    allowed_origin: string;
    /** Per-service permissions */
    permissions: Record<string, string[]>;
}
/**
 * A Group Contract Request (GCR) describes a group operation the app is requesting.
 */
export interface GCR {
    /** The app origin requesting the operation */
    app_origin: string;
    /** Operation: 'create_group', 'update_group', 'add_member', 'remove_member', 'invite_member', 'delete_group' */
    action: string;
    /** Operation parameters */
    params: Record<string, unknown>;
}
/**
 * Unified contract request — either an app contract (ACR) or group contract (GCR).
 * Used by contractListen / contractOnReady for the consent protocol.
 */
export type ContractRequest = ACR | GCR;
/**
 * Allowed aggregate pipeline stages.
 * The server validates and sandboxes the pipeline — it runs on body-only
 * docs scoped to the service, with a denylist of dangerous operators.
 */
export type PipelineStage = {
    $match: Record<string, unknown>;
} | {
    $project: Record<string, unknown>;
} | {
    $group: Record<string, unknown>;
} | {
    $sort: Record<string, 1 | -1>;
} | {
    $skip: number;
} | {
    $limit: number;
} | {
    $unwind: string | Record<string, unknown>;
} | {
    $addFields: Record<string, unknown>;
} | {
    $count: string;
} | {
    $facet: Array<{
        name: string;
        pipeline: PipelineStage[];
    }>;
} | {
    $bucket: Record<string, unknown>;
} | {
    $sample: {
        size: number;
    };
};
/**
 * An aggregation pipeline — an array of stages.
 */
export type Pipeline = PipelineStage[];
/**
 * Response from a create operation.
 */
export interface CreateResponse {
    /** MongoDB ObjectId of the created record */
    _id: string;
}
/**
 * Response from an update operation.
 */
export interface UpdateResponse {
    /** Number of documents matched */
    matchedCount: number;
    /** Number of documents modified */
    modifiedCount: number;
    /** The updated document (if available) */
    document?: Web10Record;
}
/**
 * Response from a delete operation.
 */
export interface DeleteResponse {
    /** Number of documents deleted */
    deletedCount: number;
}
/**
 * Response from a token mint/login.
 */
export interface TokenResponse {
    token: string;
}
/**
 * Response from a signup.
 */
export interface SignupResponse {
    ok: boolean;
    /** May include a token if auto-login is enabled */
    token?: string;
}
/**
 * Parameters for creating a Stripe checkout session.
 */
export interface CheckoutParams {
    /** Seller's web10 address */
    seller: string;
    /** Product title */
    title: string;
    /** Price in cents */
    price: number;
    /** Redirect URL on success */
    success_url: string;
    /** Redirect URL on cancellation */
    cancel_url: string;
}
/**
 * Parameters for verifying or cancelling a subscription.
 */
export interface SubscriptionParams {
    /** Seller's web10 address */
    seller: string;
    /** Product title */
    title: string;
}
/**
 * Parameters for login.
 */
export interface LoginParams {
    /** Provider domain */
    provider: string;
    /** Username */
    username: string;
    /** Password */
    password: string;
}
/**
 * Parameters for signup.
 */
export interface SignupParams {
    /** Provider domain */
    provider: string;
    /** Username */
    username: string;
    /** Password */
    password: string;
    /** Beta code (if required) */
    betacode?: string;
    /** Phone number (if required) */
    phone?: string;
}
/**
 * Plan info returned by getPlan.
 */
export interface PlanInfo {
    space?: number;
    credits?: number;
    plan?: string;
}
/**
 * Parameters for requesting a presigned upload (POST) URL.
 * Sent to `POST /{user}/upload`.
 */
export interface MediaUploadUrlParams {
    /** Object basename (the api derives a prefixed key from it) */
    filename: string;
    /** MIME type; also baked into the presigned POST policy */
    mimeType?: string;
    /** Size cap in bytes (server clamps to MAX_UPLOAD_SIZE) */
    sizeBytes?: number;
}
/**
 * Response from `POST /{user}/upload` — a presigned S3 POST policy.
 * The caller builds a `FormData` with `fields` plus the file and POSTs
 * it to `upload_url`.
 */
export interface MediaUploadUrlResponse {
    /** Presigned POST endpoint (the S3-compatible host) */
    upload_url: string;
    /** Form fields to include verbatim in the multipart upload */
    fields: Record<string, string>;
    /** Resolved object key — pass to `confirmUpload` / `getReadUrl` */
    object_key: string;
    /** Content-Type the presigned policy signed for */
    content_type: string;
}
/**
 * Metadata for confirming an upload + writing the media record.
 * Sent to `POST /{user}/upload/confirm`.
 */
export interface MediaConfirmParams {
    /** Public or presigned URL of the now-stored object */
    url: string;
    filename: string;
    mimeType?: string;
    sizeBytes?: number;
    /** Intrinsic dimensions, for image/video previews */
    width?: number;
    height?: number;
    /** Video/audio duration */
    durationSeconds?: number;
    /** Poster/thumbnail URL (derived client-side until A9 lands) */
    thumbnailUrl?: string;
    caption?: string;
    /** Accessibility text */
    altText?: string;
    /** Provenance label (e.g. "instagram", defaults to "web10") */
    origin?: string;
    /** Provenance id from the importer */
    originId?: string;
    /** Whether the blob is e2e-encrypted (private media) */
    encrypted?: boolean;
}
/**
 * A media metadata record in the owner's collection. Body shape of the
 * record `db.create_media_record` writes; mirrors `api/app/models/media.py`
 * `MetadataRecord`.
 */
export interface MediaRecord {
    _id?: string;
    url: string;
    filename: string;
    created_at: string;
    mime_type?: string;
    size_bytes?: number;
    width?: number;
    height?: number;
    duration_seconds?: number;
    thumbnail_url?: string;
    hls_manifest_url?: string;
    caption?: string;
    alt_text?: string;
    origin?: string;
    origin_id?: string;
    encrypted: boolean;
}
/**
 * Response from `POST /{user}/read` — a short-lived presigned GET URL.
 */
export interface MediaReadUrlResponse {
    /** Presigned GET URL for the object */
    read_url: string;
    /** Seconds until the URL expires (server-supplied) */
    expires_in: number;
}
//# sourceMappingURL=types.d.ts.map