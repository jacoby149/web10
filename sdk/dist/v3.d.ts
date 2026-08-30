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
 * const doc = await w.create('posts', { text: 'hello' }, { groups: ['web10.app/groups/web10/discover'] })
 * const posts = await w.read('posts', { groups: ['me'] })
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
}
export interface V3Group {
    group_id: string;
    join_policy: string;
    my_role: string;
    member_count: number;
    roles?: Record<string, unknown>[];
}
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
export interface V3GroupRole {
    name: string;
    services: string[];
    permissions: string[];
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
    }): Promise<V3Document>;
    read(collection: string, opts: {
        groups: string[];
        limit?: number;
        offset?: number;
    }): Promise<V3Document[]>;
    readById(docId: string, collection: string): Promise<V3Document>;
    update(docId: string, body: Record<string, unknown>, opts?: {
        groups?: string[];
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
    }[]): Promise<{
        group_id: string;
    }>;
    getGroup(groupId: string): Promise<V3Group>;
    getMyGroups(): Promise<V3Group[]>;
    getGroupsManages(): Promise<V3Group[]>;
    updateGroup(groupId: string, opts?: {
        join_policy?: string;
        roles?: Record<string, unknown>[];
    }): Promise<V3Group>;
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