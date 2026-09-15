/**
 * web10-npm — TypeScript SDK for the web10 protocol.
 *
 * V3 only: ClickHouse-backed API, groups as the primitive,
 * CRUD with groups, app contracts, media, app store.
 *
 * @module web10-npm
 */
export { createV3Client, pickThumbnail, type V3Client } from './v3';
export type { V3ClientOptions, V3AdPreference, PowerMeanSort, V3Document, V3QueryResult, V3Prepare, V3PrepareFace, V3FeedPost, V3Group, V3GroupMember, V3InviteResponse, V3JoinRequest, V3ServiceContract, V3CR, V3AppCR, V3GroupCR, V3GroupRole, V3GroupMemberCR, V3User, V3LoginResponse, V3ResolvedMedia, V3Thumbnail, AccessVerdict, VerifyAccessOptions, AccessStatus, AccessTokenState, AccessUserState, AccessContractState, AccessAction, } from './v3';
export { cookieDict, readTokenCookie, setTokenCookie, scrubTokenCookie, decodeJwt, isTokenExpired, } from './token';
export { Web10Error, extractDetail } from './http';
export type { TokenPayload } from './types';
//# sourceMappingURL=index.d.ts.map