/**
 * web10 v3 client — calls the ClickHouse-backed v3 API.
 *
 * Unlike the v2 client (PATCH/POST/PUT/DELETE per collection), the v3 API
 * uses a unified POST pattern: every endpoint is `POST /v3/<action>` with
 * a single JSON body that carries the token + all parameters.
 *
 * @example
 * ```ts
 * import { createV3Client } from 'web10-npm'
 *
 * const w = createV3Client({ apiOrigin: 'https://api.web10.app' })
 *
 * // Auth
 * await w.login('alice', 'password')
 *
 * // CRUD with groups
 * const doc = await w.create('posts', { text: 'hello' }, { groups: ['{provider}/groups/web10/discover'] })
 * const posts = await w.read('posts', { groups: ['me'] })
 *
 * // The flexible read — a ClickHouse SELECT over your services (read-only)
 * const { rows } = await w.query('SELECT p.doc_id, count() AS n FROM posts p JOIN reactions r ON r.ref_value = p.doc_id GROUP BY p.doc_id ORDER BY n DESC LIMIT 20')
 *
 * // Service contracts
 * await w.addServiceContract('my-app', 'https://my-app.example.com')
 * const contracts = await w.listServiceContracts()
 *
 * // Groups
 * await w.createGroup('my-community', 'open', roles, [{ member_key: 'alice', role: 'owner' }])
 * const groups = await w.getMyGroups()
 * ```
 */
import type { TokenPayload } from './types';
export interface V3ClientOptions {
    /** API origin (e.g. "https://api.web10.app" or "http://api.localhost") */
    apiOrigin?: string;
    /** Pre-set token (optional, for server-side or pre-auth scenarios) */
    token?: string | null;
    /** RTC server hostname (for P2P via web10-npm/rtc) */
    rtcServer?: string;
}
export interface V3AdPreference {
    mode: 'none' | 'pinned';
    target?: string;
}
export interface PowerMeanSort {
    recency?: number;
    likes?: number;
    comments?: number;
    half_life_ms?: number;
    character?: number;
}
export interface V3Document {
    doc_id: string;
    author_key: string;
    collection_name: string;
    body: Record<string, unknown>;
    ref_value?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
    groups?: string[];
    ad_mode?: string;
    ad_target?: string;
    ad?: V3Document;
    node_ad?: V3Document;
}
export interface V3Group {
    group_id: string;
    join_policy: string;
    my_role: string;
    member_count: number;
    roles?: Record<string, unknown>[];
    /** The D53 "blasting" flag — whether the group is listed in the public directory.
     *  Returned by `/manages` + `/get`; optional for forward-compat (older nodes). */
    discoverable?: boolean;
    /** The D78 group label set — the platform stores/matches them (`has(tags, …)`);
     *  the app decides what they mean (e.g. `web10-social-group`). Optional for
     *  forward-compat (older nodes predate the column). */
    tags?: string[];
}
export interface V3ResolvedMedia {
    doc_id?: string;
    object_key?: string | null;
    mime_type?: string | null;
    filename?: string | null;
    size_bytes?: number | null;
    read_url?: string | null;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
    thumbnail_url?: string | null;
    alt_text?: string | null;
    transcoding_settings?: Record<string, unknown>;
}
export interface V3Thumbnail {
    url: string;
    alt?: string | null;
    is_video: boolean;
    width?: number | null;
    height?: number | null;
    mime_type?: string | null;
}
/**
 * Pick the best thumbnail from a list of resolved media refs (KB:
 * media/thumbnailing.md). **Pure** — no I/O, no schema knowledge; it runs on
 * the resolved media the app already has from a doc read. Selection, in order:
 * the first item that is an image (its `read_url`), else a video's poster
 * (`thumbnail_url`), else `null`. A video with no poster yet falls through to
 * the next item.
 *
 * The **fallback is not here.** "No picture → author avatar → brand mark" is an
 * *app* decision (the social app knows what an author's avatar is; a marketplace
 * does not). The primitive returns `null` and lets the app decide — that split
 * is what keeps it universal (D60).
 */
export declare function pickThumbnail(resolvedMedia: V3ResolvedMedia[]): V3Thumbnail | null;
export interface V3GroupMember {
    group_id?: string;
    member_key: string;
    role: string;
    joined_at?: string;
    status?: string;
}
export interface V3InviteResponse {
    group_id: string;
    invited_key: string;
    status: string;
}
export interface V3JoinRequest {
    requester_key: string;
    status: string;
    requested_at: string;
}
export interface V3ServiceContract {
    allowed_origin: string;
    permissions: Record<string, string[]>;
}
export interface V3QueryResult {
    rows: Record<string, unknown>[];
    count: number;
}
export interface V3PrepareFace {
    /** The column holding the (JOINed) face body, e.g. `profile_body`. */
    bodyField: string;
    /** The field in it that is a media ref, e.g. `avatar_ref`. */
    mediaField: string;
    /** The author to scope the presign to (default: the row's `author_key`). */
    authorColumn?: string;
    /** The row field to set with the presigned URL (default: `avatar_url`). */
    urlField?: string;
}
export interface V3Prepare {
    /** Presign `body.media_refs` (author-scoped) + mint per-reader HLS sigs. */
    media?: boolean;
    /** Attach the pinned ad (`ad_mode`/`ad_target`) + the node ad. */
    ads?: boolean;
    /** Resolve the author's face media (e.g. the JOINed profile's avatar). */
    face?: V3PrepareFace;
}
export interface V3FeedPost {
    doc_id: string;
    author_key: string;
    body: Record<string, unknown>;
    tags?: string[];
    created_at: string;
    ref_value?: string;
    ad_mode?: string;
    ad_target?: string;
    likes: number;
    comments: number;
    score: number;
    ad?: V3Document;
    node_ad?: V3Document;
    profile?: Record<string, unknown>;
    avatar_url?: string | null;
}
export interface V3GroupRole {
    name: string;
    permissions: Record<string, string[]>;
}
export interface V3GroupMemberCR {
    member_key: string;
    role: string;
}
export interface V3AppCR {
    kind: 'app';
    /** Website origin requesting access */
    app_origin: string;
    /** Per-service permissions */
    permissions: Record<string, string[]>;
}
export interface V3GroupCR {
    kind: 'group';
    /** Website origin making the request */
    app_origin: string;
    /** Operation: create_group, update_group, join_group, etc. */
    action: string;
    /** Group name (create_group) */
    name?: string;
    /** Join policy: open, request, invite_only */
    join_policy?: string;
    /** Roles with service-specific permissions */
    roles?: V3GroupRole[];
    /** Initial members */
    members?: V3GroupMemberCR[];
    /** Existing group ID (update_group) */
    group_id?: string;
}
export type V3CR = V3AppCR | V3GroupCR;
export interface V3User {
    username: string;
    phone?: string;
    email?: string;
    phone_verified?: boolean;
    email_verified?: boolean;
}
export interface V3LoginResponse {
    token: string;
}
export interface V3DirectoryUser {
    username: string;
    follower_count: number;
    profile: Record<string, unknown>;
}
export interface V3PeoplePage {
    users: V3DirectoryUser[];
    limit: number;
    offset: number;
}
/** Overall verdict. `inconclusive` = a check couldn't run (store unreadable)
 *  and nothing is decisively wrong — the client takes no action, retries later. */
export type AccessStatus = 'ok' | 'degraded' | 'invalid' | 'inconclusive';
/** Token state. `missing` = no token (not signed in). `expired` = the custom
 *  `expires` claim is in the past. `invalid` = bad signature / malformed / anon. */
export type AccessTokenState = 'valid' | 'expired' | 'invalid' | 'missing';
/** User state. Only checkable with a valid token; `unknown` otherwise or when
 *  the users store is unreadable. */
export type AccessUserState = 'exists' | 'not_found' | 'unknown';
/** Contract state. `not_checked` = the app declared no services (health
 *  probe) — excluded from the verdict. `partial` = some declared services
 *  granted, `missing_services` names the rest. */
export type AccessContractState = 'granted' | 'partial' | 'missing' | 'unknown' | 'not_checked';
/** Ordered recovery actions the client should execute. `reauth` = re-derive
 *  the session through the rooted authenticator (fresh token + contract).
 *  `signout` = terminal (a deleted account can't be re-authed) — clear the
 *  session and show login. Generic by design (D60): no app-specific actions
 *  (e.g. the social app's followers-group heal is the app's own job). */
export type AccessAction = 'reauth' | 'signout';
export interface AccessVerdict {
    status: AccessStatus;
    token: AccessTokenState;
    user: AccessUserState;
    contract: {
        state: AccessContractState;
        missing_services: string[];
    };
    actions: AccessAction[];
    /** Who we verified (only when the token is valid). */
    username: string | null;
    provider: string | null;
}
export interface VerifyAccessOptions {
    /** The services the calling app needs (it declares its own — the signal is
     *  platform-level, the policy is per-app). Omit for a health probe. */
    services?: string[];
    /** The operations each service must grant to count as "granted" (all must
     *  be permitted). Defaults to ["readAll"]. */
    operations?: string[];
}
/**
 * Create a v3 client instance.
 */
export declare function createV3Client(options?: V3ClientOptions): V3Client;
/**
 * The v3 client interface.
 */
export interface V3Client {
    state: {
        apiOrigin: string;
        token: string | null;
        rtcServer: string;
    };
    setToken(token: string): void;
    scrubToken(): void;
    readToken(): TokenPayload | null;
    isSignedIn(): boolean;
    signOut(): void;
    login(username: string, password: string, site?: string): Promise<V3LoginResponse>;
    signup(username: string, password: string, phone?: string, email?: string): Promise<V3User>;
    getProfile(): Promise<V3User>;
    verifyAccess(options?: VerifyAccessOptions): Promise<AccessVerdict>;
    changePassword(currentPassword: string, newPassword: string): Promise<{
        status: string;
    }>;
    changePhone(phone: string): Promise<{
        phone: string;
    }>;
    setEmail(email: string): Promise<{
        email: string;
    }>;
    verifyPhone(code: string): Promise<{
        phone_verified: boolean;
    }>;
    verifyEmail(code: string): Promise<{
        email_verified: boolean;
    }>;
    sendCode(): Promise<{
        sent: boolean;
    }>;
    setRecoveryPhone(phone: string): Promise<{
        phone_number: string;
    }>;
    create(collection: string, body: Record<string, unknown>, opts?: {
        groups?: string[];
        ad_preference?: V3AdPreference;
        ref_value?: string;
    }): Promise<V3Document>;
    read(collection: string, opts: {
        groups: string[];
        limit?: number;
        offset?: number;
        ref?: string | string[];
        sort?: PowerMeanSort;
        tags?: string[];
        cursor?: string;
        order?: "asc" | "desc";
    }): Promise<V3Document[]>;
    readRefCounts(collection: string, opts: {
        groups: string[];
        ref: string | string[];
    }): Promise<Record<string, number>>;
    readById(docId: string, collection: string): Promise<V3Document>;
    query(sql: string, opts?: {
        groups?: string[];
        prepare?: V3Prepare;
        withGroupMeta?: boolean;
    }): Promise<V3QueryResult>;
    listPeopleDirectory(opts?: {
        limit?: number;
        offset?: number;
    }): Promise<V3PeoplePage>;
    update(docId: string, body: Record<string, unknown>, opts?: {
        groups?: string[];
        ad_preference?: V3AdPreference;
    }): Promise<V3Document>;
    delete(docId: string): Promise<{
        doc_id: string;
        status: string;
    }>;
    addAppContract(allowedOrigin: string, permissions: Record<string, string[]>): Promise<V3ServiceContract>;
    listAppContracts(): Promise<V3ServiceContract[]>;
    revokeAppContract(allowedOrigin?: string): Promise<{
        status: string;
    }>;
    contractRequest(contracts: V3CR[], authOrigin: string, callback?: (response: {
        status: string;
        errors?: string[];
    }) => void): void;
    contractOnReady(contracts: V3CR[], callback?: (response: {
        status: string;
        errors?: string[];
    }) => void): void;
    createGroup(name: string, joinPolicy: string, roles: Record<string, unknown>[], members: {
        member_key: string;
        role?: string;
    }[], opts?: {
        discoverable?: boolean;
        tags?: string[];
    }): Promise<{
        group_id: string;
    }>;
    getGroup(groupId: string): Promise<V3Group>;
    getMyGroups(opts?: {
        tags?: string[];
    }): Promise<V3Group[]>;
    getGroupsManages(): Promise<V3Group[]>;
    updateGroup(groupId: string, opts?: {
        join_policy?: string;
        roles?: Record<string, unknown>[];
        discoverable?: boolean;
        tags?: string[];
    }): Promise<V3Group>;
    deleteGroup(groupId: string): Promise<{
        group_id: string;
        status: string;
    }>;
    joinGroup(groupId: string): Promise<V3GroupMember | {
        group_id: string;
        status: string;
    }>;
    requestJoin(groupId: string): Promise<{
        group_id: string;
        status: string;
    }>;
    leaveGroup(groupId: string): Promise<V3GroupMember>;
    getGroupMembers(groupId: string): Promise<V3GroupMember[]>;
    addGroupMember(groupId: string, memberKey: string, role: string): Promise<V3GroupMember>;
    removeGroupMember(groupId: string, memberKey: string): Promise<V3GroupMember>;
    inviteMember(groupId: string, memberKey: string, role: string): Promise<V3InviteResponse>;
    acceptInvite(groupId: string): Promise<V3GroupMember>;
    declineInvite(groupId: string): Promise<{
        group_id: string;
        status: string;
    }>;
    getJoinRequests(groupId: string): Promise<V3JoinRequest[]>;
    approveJoinRequest(groupId: string, requesterKey: string): Promise<{
        group_id: string;
        requester_key: string;
        status: string;
    }>;
    denyJoinRequest(groupId: string, requesterKey: string): Promise<{
        group_id: string;
        requester_key: string;
        status: string;
    }>;
    blockUser(blockedKey: string): Promise<{
        user_key: string;
        blocked_key: string;
    }>;
    unblockUser(blockedKey: string): Promise<{
        user_key: string;
        blocked_key: string;
    }>;
    blockUserInGroup(blockedKey: string, groupId: string): Promise<{
        user_key: string;
        group_id: string;
        blocked_key: string;
    }>;
    unblockUserInGroup(blockedKey: string, groupId: string): Promise<{
        user_key: string;
        group_id: string;
        blocked_key: string;
    }>;
    setSharing(groupId: string, enabled: boolean): Promise<{
        user_key: string;
        group_id: string;
        sharing_enabled: boolean;
    }>;
    requestMediaUploadUrl(params: {
        filename: string;
        mimeType?: string;
        sizeBytes?: number;
    }): Promise<{
        upload_url: string;
        fields: Record<string, string>;
        object_key: string;
        content_type: string;
    }>;
    getMediaReadUrl(objectKey: string): Promise<{
        read_url: string;
        expires_in: number;
    }>;
    confirmMediaUpload(metadata: Record<string, unknown>): Promise<V3Document>;
    listMedia(opts?: {
        limit?: number;
        offset?: number;
        doc_ids?: string[];
    }): Promise<V3Document[]>;
    deleteMedia(docId: string): Promise<{
        doc_id: string;
        status: string;
    }>;
    /** Generic thumbnail (KB: media/thumbnailing.md) — the doc's own picture,
     *  access-checked (I3). `null` when the doc has no usable media; the app
     *  decides the fallback. */
    getThumbnail(docId: string): Promise<{
        thumbnail: V3Thumbnail | null;
    }>;
    getNodeStats(): Promise<{
        users: number;
        documents: number;
        groups: number;
    }>;
    registerApp(app: {
        url: string;
        name?: string;
        description?: string;
        icon_url?: string;
        screenshots?: unknown[];
    }): Promise<{
        url: string;
        review_state: string;
    }>;
    getApps(): Promise<{
        url: string;
        name: string;
        description: string;
        icon_url: string;
        screenshots: unknown[];
        review_state: string;
        metadata_version: number;
    }[]>;
    rateApp(appId: string, rating: number): Promise<{
        author: string;
        target_app_id: string;
        rating: number;
    }>;
    getAppRatings(appId: string): Promise<{
        author: string;
        rating: number;
        provider: string;
        created_at: string;
    }[]>;
    contractOnReady(contracts: V3CR[], callback?: (response: {
        status: string;
        errors?: string[];
    }) => void): void;
}
//# sourceMappingURL=v3.d.ts.map