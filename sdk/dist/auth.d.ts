/**
 * Authenticator connector — for the web10 auth app (e.g. auth.web10.app).
 *
 * Wraps the popup/OAuth dance into promise-based flows. Used by the
 * authenticator UI to manage login, signup, token minting, contracts, and
 * account management endpoints.
 *
 * @example
 * ```ts
 * import { createClient } from 'web10-npm'
 * import { createAuthConnector } from 'web10-npm/auth'
 *
 * const w = createClient({ authUrl: 'https://auth.web10.app' })
 * const auth = createAuthConnector(w)
 *
 * // Login
 * await auth.logIn({ provider: 'api.web10.app', username: 'alice', password: 'secret' })
 *
 * // Mint a tiered token for the referrer
 * const tieredToken = await auth.mintOAuthToken()
 *
 * // Send it back to the opener
 * auth.sendToken()
 * ```
 */
import type { LoginParams, SignupParams, PlanInfo } from './types';
import type { Web10Client } from './client';
/**
 * Create an authenticator connector.
 *
 * @param wapi - A web10 client instance
 * @returns An auth connector with login, signup, and token management
 */
export declare function createAuthConnector(wapi: Web10Client): AuthConnector;
/**
 * Authenticator connector interface.
 */
export interface AuthConnector {
    /** The minted OAuth token for the referrer app */
    readonly oAuthToken: string | null;
    /** Mint a tiered token for the referrer site */
    mintOAuthToken(): Promise<string | null>;
    /** Send the OAuth token back to the opener and close the window */
    sendToken(): void;
    /** Log in with username/password */
    logIn(params: LoginParams): Promise<void>;
    /** Sign up a new account */
    signUp(params: SignupParams): Promise<void>;
    /** Listen for contract messages (app + group) from the opener */
    contractListen(setState: (data: unknown) => void): void;
    /** Listen for ACR messages from the opener */
    acrListen(setState: (data: unknown) => void): void;
    /** Change account password */
    changePassword(currentPassword: string, newPassword: string): Promise<void>;
    /** Change account phone number */
    changePhone(password: string, phone: string): Promise<void>;
    /** Send a verification code to the user's phone */
    sendCode(): Promise<void>;
    /** Verify a code */
    verifyCode(code: string): Promise<void>;
    /** Get Stripe management URL for space */
    manageSpace(): Promise<{
        url: string;
    }>;
    /** Get Stripe management URL for credits */
    manageCredits(): Promise<{
        url: string;
    }>;
    /** Get Stripe management URL for business */
    manageBusiness(): Promise<{
        url: string;
    }>;
    /** Get Stripe management URL for all subscriptions */
    manageSubscriptions(): Promise<{
        url: string;
    }>;
    /** Get business login URL */
    businessLogin(): Promise<{
        url: string;
    }>;
    /** Get current plan info */
    getPlan(): Promise<PlanInfo>;
}
//# sourceMappingURL=auth.d.ts.map