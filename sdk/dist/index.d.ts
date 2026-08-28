/**
 * web10-npm — TypeScript SDK for the web10 protocol.
 *
 * V3 only: ClickHouse-backed API, groups as the primitive,
 * CRUD with groups, app contracts, media, app store.
 *
 * @module web10-npm
 */
export { createV3Client, type V3Client } from './v3';
export type { V3ClientOptions, V3Document, V3Group, V3GroupMember, V3InviteResponse, V3JoinRequest, V3ServiceContract, V3CR, V3AppCR, V3GroupCR, V3GroupRole, V3GroupMemberCR, V3User, V3LoginResponse, } from './v3';
export { cookieDict, readTokenCookie, setTokenCookie, scrubTokenCookie, decodeJwt, isTokenExpired, } from './token';
export { curateAds, type AdDisseminationSetting, type CurationState, type CuratableAd, type DisseminationMode, } from './curate';
export { Web10Error } from './http';
export type { TokenPayload } from './types';
//# sourceMappingURL=index.d.ts.map