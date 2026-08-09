import React from 'react';
import web10AuthAdapterInit from './authAdapter'
import axios from 'axios'
import { config } from '../config';

// ── v3 API helpers (ClickHouse-backed service contracts + groups) ──────────

/**
 * Resolve the API origin from the decoded token or fall back to the configured
 * default. Mirrors authAdapter's *.localhost detection so local dev points at
 * api.localhost and prod points at api.web10.app.
 */
function v3ApiOrigin(decoded: { provider?: string } | null): string {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
    const provider = decoded?.provider || (isLocal ? 'api.localhost' : config.REACT_APP_DEFAULT_API);
    return `${window.location.protocol}//${provider}`;
}

/**
 * Call a v3 API endpoint. All v3 endpoints are POST with a JSON body that
 * carries the token + parameters. Mirrors api/app/v3/models/__init__.py Token.
 */
async function v3Post(action: string, body: Record<string, any>) {
    const decoded = (window.I?.wapi?.readToken?.()) as { provider?: string } | null;
    const origin = v3ApiOrigin(decoded);
    const token = window.I?.wapi?.token;
    if (!token) throw new Error('No token available for v3 API');
    const res = await fetch(`${origin}/v3/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, token }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`v3 ${action} failed: ${res.status} ${text}`);
    }
    return res.json();
}

function useInterface() {
    const I = {} as Record<string, any>;

    I.config = config;

    // Build the SDK adapter first so auth state can be SEEDED from the token
    // cookie via a lazy useState initializer. Setting auth mid-render (the
    // previous approach) is a render-phase update that infinite-looped once a
    // valid token existed. web10AuthAdapterInit calls no hooks, so running it
    // before the useState calls keeps hook order stable.
    const adapter = web10AuthAdapterInit();

    // Restore auth from the "token=" cookie on load. A dead (expired) token
    // must NOT present the authenticated view (B7: it used to land the user on
    // an empty "Your contracts" with no way to log in) — scrub it so routing
    // sends them to login. Runs once, in the lazy initializer, not every render.
    const restoreAuth = (): boolean => {
        const t = adapter.wapi.readToken?.();
        if (!t) return false;
        const expires = t.expires ? Date.parse(t.expires) : NaN;
        if (!Number.isNaN(expires) && expires < Date.now()) {
            adapter.wapi.scrubToken?.();
            return false;
        }
        return true;
    };

    [I.theme, I.setTheme] = React.useState("dark");
    [I.logo,I.setLogo] = React.useState(config.REACT_APP_LOGO_DARK);
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("contracts");
    [I.search, I.setSearch] = React.useState("");

    [I.services, I.setServices] = React.useState([]);
    [I.requests, I.setRequests] = React.useState([]);
    [I.phone, I.setPhone] = React.useState("");

    [I.auth, I.setAuth] = React.useState(restoreAuth);
    [I.isAdmin, I.setIsAdmin] = React.useState(false);
    [I.verified, I.setVerified] = React.useState(false);
    [I.status, I.setStatus] = React.useState<string | null>(null);
    // Pending app contract requests (ACRs). Unified list — no distinction
    // between "new" and "change". Each ACR is { allowed_origin, permissions }.
    // Legacy SMRListen still delivers { sirs, scrs } which we normalize here.
    [I.pendingACRs, I.setPendingACRs] = React.useState<any[]>([]);

    // v3 service contracts (ClickHouse-backed — simpler model: origin + service)
    [I.v3Contracts, I.setV3Contracts] = React.useState<any[]>([]);
    // v3 groups the user belongs to
    [I.v3Groups, I.setV3Groups] = React.useState<any[]>([]);
    // v3 groups the user manages (has management permissions)
    [I.v3ManagedGroups, I.setV3ManagedGroups] = React.useState<any[]>([]);
    // v3 pending invites (groups that invited this user)
    [I.v3Invites, I.setV3Invites] = React.useState<any[]>([]);

    I.wapi = adapter.wapi;
    I.wapiAuth = adapter.wapiAuth;

    // Normalize legacy SMR { sirs, scrs } into a unified ACR list.
    // Each SIR/SCR becomes one ACR per origin (origin + permissions from whitelist).
    function normalizeSMRtoACRs(smr: any): any[] {
        const acrs: any[] = [];
        const allRequests = [
            ...(Array.isArray(smr?.sirs) ? smr.sirs : []),
            ...(Array.isArray(smr?.scrs) ? smr.scrs : []),
        ];
        for (const req of allRequests) {
            const origins = Array.isArray(req.cross_origins) ? req.cross_origins : [];
            if (origins.length === 0) {
                console.warn('ACR: request with no cross_origins — skipped', req);
                continue;
            }
            const perms = whitelistToPermissions(req.whitelist || []);
            // Default to readAll if no permissions derived
            if (perms.length === 0) perms.push('readAll');
            const permissions: Record<string, string[]> = { [req.service]: perms };
            for (const origin of origins) {
                acrs.push({
                    allowed_origin: origin,
                    permissions,
                    _source: req, // keep reference to the original SIR/SCR for removal
                });
            }
        }
        return acrs;
    }

    I.initAuthenticator = function () {
        I.wapiAuth.SMRListen((inSMR) => {
            I.setPendingACRs(normalizeSMRtoACRs(inSMR));
        });
    }

    I.servicesLoad = function () {
        if (!I.auth) {
            I.setServices([]);
            return;
        }
        // Load v3 contracts and groups in parallel — they're independent of
        // the MongoDB services load and don't block it.
        I.v3ContractsLoad();
        I.v3GroupsLoad();
        I.v3GroupsManagesLoad();

        I.wapi
            .read("services")
            .then(function (response) {
                response.data.sort((a, b) => a["_id"].localeCompare(b["_id"]));
                // The star record carries the account phone — read it back
                // from the server (never a local echo) so the recovery phone
                // survives a hard refresh (B9 bite a-fix).
                const star = response.data.find((s: any) => s["service"] === "*");
                I.setPhone(star?.phone_number || "");

                // Keep legacy services list for backward compat with v2 apps.
                // No longer drives the UI — ACRs do.
                I.setServices(response.data);

                // If there are pending ACRs and we came from an app, show requests.
                if (I.pendingACRs.length > 0 && I._hasReferrer) {
                    I.setMode("requests");
                }
            })
            .catch(console.error);
    }

    I.verificationChange = function (value) {
        if (value.length === 6) I.setVerified(true)
    }

    I.changePhoneNumber = function (password: string, newPhone: string) {
        I.setStatus("Changing phone number...");
        I.wapiAuth
            .changePhone(password, newPhone)
            .then(() => {
                I.setStatus("Successfully changed phone number. Reloading...");
                I.setVerified(false);
                setTimeout(() => I.servicesLoad(), 1000);
            })
            .catch((e) => {
                I.setStatus(e.response ? String(e.response.data.detail) : String(e));
            });
    }

    I.setMode = function (mode: string) {
        I.setMenuCollapsed(true);
        I.setSearch("")
        I._setMode(mode);
    }

    I.toggleMenuCollapsed = function () {
        I.setMenuCollapsed(!I.menuCollapsed)
    }

    I.toggleTheme = function () {
        if(I.theme == "dark") {
            I.setTheme("light")
            I.setLogo(I.config.REACT_APP_LOGO_LIGHT)
        }
        else {
            I.setTheme("dark")
            I.setLogo(I.config.REACT_APP_LOGO_DARK)
        }
    }

    I.runSearch = function (value: string) {
        I.setSearch(value ?? "");
    }

    I.isAuthenticated = function () {
        return I.auth
    }

    // Ask the node whether THIS account is an admin, to show/hide Node Config.
    I.checkAdmin = function () {
        const decoded = I.wapi.readToken?.();
        if (!decoded) {
            I.setIsAdmin(false);
            return;
        }
        axios
            .post(`${window.location.protocol}//${decoded.provider}/am_admin`, { token: I.wapi.token })
            .then((r: any) => I.setIsAdmin(!!r.data?.admin))
            .catch(() => I.setIsAdmin(false));
    }

    I.finishLogin = function () {
        I.setAuth(true);
        I.checkAdmin();
        I.initAuthenticator();
        I.servicesLoad();
        I.setStatus(null);
        I.setMode("contracts");
    }

    I.login = function (provider: string, username: string, password: string) {
        I.setStatus("Logging in...");
        I.wapiAuth.logIn(provider, username, password)
            .then(() => I.finishLogin())
            .catch((error: any) => {
                // The published SDK's logIn mints a second-level token for the
                // referring app inside its own .then; with no parent app (no
                // document.referrer) that throws, rejecting logIn even though
                // the auth token cookie was already set. If we're actually
                // signed in, complete the login rather than show a false error.
                if (I.wapi.isSignedIn?.()) I.finishLogin();
                else I.setStatus("Failed to Log In : " + (error.response?.data?.detail || String(error)));
            });
    }

    I.logout = function () {
        I.wapi.signOut();
        I.setAuth(false);
        I.setVerified(false);
        I.setServices([]);
        I.setRequests([]);
        I.setPendingACRs([]);
        I.setV3Contracts([]);
        I.setV3Groups([]);
        I.setV3ManagedGroups([]);
        I.setV3Invites([]);
        I.setMode("login");
    }

    I.recover = function (provider: string, phone: string) {
        axios.post(`${window.location.protocol}//${provider}/recovery_prompt`, { phone_number: phone })
            .then(() => I.setStatus("Recovery code sent!"))
            .catch(() => I.setStatus("Failed to send recovery code."));
    }

    I.isVerified = function () {
        return I.verified;
    }

    // True when the account has at least one recovery channel (phone verified
    // or email verified). Used by the recovery nudge banner to decide whether
    // to show. Email is not yet implemented (A20 bite b), so today only phone
    // + verified matters.
    I.hasRecoveryContact = function () {
        return !!(I.verified || (I.phone && I.phone.trim().length >= 7));
    }

    // ── v3 App contracts (per-app with per-service permissions) ──────────────

    // Load app contracts from the ClickHouse-backed API.
    I.v3ContractsLoad = function () {
        if (!I.auth) {
            I.setV3Contracts([]);
            return;
        }
        v3Post('app-contracts/list', {})
            .then((contracts: any[]) => {
                I.setV3Contracts(contracts || []);
            })
            .catch((e) => {
                console.warn('v3 app-contracts/list failed:', e);
                I.setV3Contracts([]);
            });
    }

    // Add an app contract (one per app, with per-service permissions).
    I.addV3Contract = function (allowedOrigin: string, permissions: Record<string, string[]>) {
        return v3Post('app-contracts/add', {
            allowed_origin: allowedOrigin,
            permissions,
        }).then(() => {
            I.v3ContractsLoad();
        });
    }

    // Revoke an app contract (by origin) or all contracts.
    I.revokeV3Contract = function (allowedOrigin?: string) {
        return v3Post('app-contracts/revoke', {
            ...(allowedOrigin && { allowed_origin: allowedOrigin }),
        }).then(() => {
            I.v3ContractsLoad();
        });
    }

    // Check if an app contract exists for a given origin.
    I.hasV3Contract = function (allowedOrigin: string): boolean {
        return (I.v3Contracts || []).some(
            (c: any) => c.allowed_origin === allowedOrigin,
        );
    }

    // ── v3 Groups ──────────────────────────────────────────────────────

    // Load the groups the user belongs to (v3).
    I.v3GroupsLoad = function () {
        if (!I.auth) {
            I.setV3Groups([]);
            return;
        }
        v3Post('groups/list', {})
            .then((groups: any[]) => {
                I.setV3Groups(groups || []);
            })
            .catch((e) => {
                console.warn('v3 groups/list failed:', e);
                I.setV3Groups([]);
            });
    }

    // Load groups where the user has management permissions.
    I.v3GroupsManagesLoad = async function () {
        if (!I.auth) {
            I.setV3ManagedGroups([]);
            return [];
        }
        try {
            const groups = await v3Post('groups/manages', {});
            I.setV3ManagedGroups(groups || []);
            return groups || [];
        } catch (e) {
            console.warn('v3 groups/manages failed:', e);
            I.setV3ManagedGroups([]);
            return [];
        }
    }

    // Create a new group.
    I.v3CreateGroup = function (name: string, joinPolicy: string, roles: Record<string, unknown>[], members: { member_key: string; role?: string }[]) {
        return v3Post('groups/create', { name, join_policy: joinPolicy, roles, members });
    }

    // Join a v3 group (open or request policy).
    I.v3JoinGroup = function (groupId: string) {
        return v3Post('groups/join', { group_id: groupId });
    }

    // Leave a v3 group.
    I.v3LeaveGroup = function (groupId: string) {
        return v3Post('groups/leave', { group_id: groupId });
    }

    // Block a user from seeing content in a v3 group.
    I.v3BlockUserInGroup = function (blockedKey: string, groupId: string) {
        return v3Post('block-in-group', { blocked_key: blockedKey, group_id: groupId });
    }

    // Unblock a user in a v3 group.
    I.v3UnblockUserInGroup = function (blockedKey: string, groupId: string) {
        return v3Post('unblock-in-group', { blocked_key: blockedKey, group_id: groupId });
    }

    // Get detailed info for a single group.
    I.v3GetGroup = function (groupId: string) {
        return v3Post('groups/get', { group_id: groupId });
    }

    // Get all members of a group.
    I.v3GetGroupMembers = function (groupId: string) {
        return v3Post('groups/members/list', { group_id: groupId });
    }

    // Add a member to a group with a specific role.
    I.v3AddGroupMember = function (groupId: string, memberKey: string, role: string) {
        return v3Post('groups/members/add', { group_id: groupId, member_key: memberKey, role });
    }

    // Remove a member from a group.
    I.v3RemoveGroupMember = function (groupId: string, memberKey: string) {
        return v3Post('groups/members/remove', { group_id: groupId, member_key: memberKey });
    }

    // Invite a user to a group (they receive an invite with the offered role).
    I.v3InviteMember = function (groupId: string, memberKey: string, role: string) {
        return v3Post('groups/invite', { group_id: groupId, member_key: memberKey, role });
    }

    // Accept an invite to a group.
    I.v3AcceptInvite = function (groupId: string) {
        return v3Post('groups/accept-invite', { group_id: groupId });
    }

    // Decline an invite to a group.
    I.v3DeclineInvite = function (groupId: string) {
        return v3Post('groups/decline-invite', { group_id: groupId });
    }

    // Update group settings (join policy, roles).
    I.v3UpdateGroup = function (groupId: string, opts?: { join_policy?: string; roles?: Record<string, unknown>[] }) {
        const payload: Record<string, any> = { group_id: groupId };
        if (opts?.join_policy) payload.join_policy = opts.join_policy;
        if (opts?.roles) payload.roles = opts.roles;
        return v3Post('groups/update', payload);
    }

    // Toggle sharing for a group (pause sharing without leaving).
    I.v3SetSharing = function (groupId: string, enabled: boolean) {
        return v3Post('sharing/set', { group_id: groupId, enabled });
    }

    // Block a user entirely (user-wide blacklist).
    I.v3BlockUser = function (blockedKey: string) {
        return v3Post('block', { blocked_key: blockedKey });
    }

    // Unblock a user (user-wide).
    I.v3UnblockUser = function (blockedKey: string) {
        return v3Post('unblock', { blocked_key: blockedKey });
    }

    // Derive v3 permissions from a whitelist.
    // Whitelist entries are { username, provider, <action>: true } — extract
    // the action keys (read, create, update, delete, etc.) and map them to
    // v3 permission names (readAll, create, updateOwn, deleteOwn, ...).
    function whitelistToPermissions(entries: any[]): string[] {
        const actionSet = new Set<string>();
        (Array.isArray(entries) ? entries : []).forEach((e: any) => {
            if (!e || typeof e !== 'object') return;
            const meta = new Set(['username', 'provider', 'anchor', 'allowed', 'denied']);
            Object.keys(e).forEach((k) => {
                if (!meta.has(k) && e[k] === true) actionSet.add(k);
            });
        });
        const map: Record<string, string> = {
            read: 'readAll',
            create: 'create',
            update: 'updateOwn',
            updateAll: 'updateAll',
            delete: 'deleteOwn',
            deleteAll: 'deleteAll',
            hide: 'hideAll',
            manageRoles: 'manageRoles',
            assignRoles: 'assignRoles',
            revokeRoles: 'revokeRoles',
        };
        const perms: string[] = [];
        actionSet.forEach((a) => {
            const mapped = map[a];
            if (mapped && !perms.includes(mapped)) perms.push(mapped);
        });
        if (perms.length === 0 && actionSet.size > 0) perms.push('readAll');
        return perms;
    }

    // Merge the permissions object from an ACR into an existing contract's
    // permissions (if any), then create the updated v3 contract.
    // Create FIRST, then revoke — if the revoke fails the new contract is
    // already in place (no data loss). The old row lingers until the
    // ReplacingMergeTree background merge compacts it.
    function applyACR(acr: any) {
        const origin = acr.allowed_origin;
        const newPerms: Record<string, string[]> = acr.permissions || {};

        const existing = (I.v3Contracts || []).find(
            (c: any) => c.allowed_origin === origin,
        );

        // Merge permissions: new perms override existing for shared services
        const mergedPerms: Record<string, string[]> = {};
        if (existing) {
            const existingPerms: Record<string, string[]> = existing.permissions || {};
            for (const [svc, ops] of Object.entries(existingPerms)) {
                if (!newPerms[svc]) mergedPerms[svc] = ops;
            }
        }
        for (const [svc, ops] of Object.entries(newPerms)) {
            mergedPerms[svc] = ops;
        }

        const perms = existing ? mergedPerms : newPerms;

        // Create first — if this fails, the old contract is untouched.
        return I.addV3Contract(origin, perms)
            .then(() => {
                // Revoke old contract only after the new one is confirmed.
                // If this fails, the new contract is already in place.
                if (existing) {
                    return I.revokeV3Contract(origin).catch(() => {
                        // Old row will be compacted by ReplacingMergeTree.
                    });
                }
            });
    }

    // Approve a single ACR (one origin). No distinction between "new" and
    // "change" — both replace the existing contract for that origin.
    I.approveACR = function (acr: any) {
        const origin = acr.allowed_origin;
        const label = (() => {
            try { return new URL(`https://${origin}`).hostname; } catch { return origin; }
        })();

        const alreadyGranted = I.hasV3Contract?.(origin);
        if (alreadyGranted) {
            I.removePendingACR(acr);
            return;
        }

        I.setStatus("Approving contract...");
        applyACR(acr)
            .then(() => {
                I.setStatus("Contract granted!");
                I.v3ContractsLoad?.();
                I.removePendingACR(acr);
                setTimeout(() => I.setStatus(null), 2000);
            })
            .catch((e) => I.setStatus("Failed to approve: " + (e.response?.data?.detail || String(e))));
    }

    // Remove a single ACR from the pending list (after approve or deny).
    I.removePendingACR = function (acr: any) {
        const source = acr._source;
        I.setPendingACRs((prev: any[]) => {
            if (source) {
                return prev.filter((a: any) => a._source !== source);
            }
            return prev.filter((a: any) => a.allowed_origin !== acr.allowed_origin);
        });
    }

    // Deny an ACR — just remove it from the pending list.
    I.denyACR = function (acr: any) {
        I.removePendingACR(acr);
        I.setStatus("Request denied.");
    }

    // Approve every pending ACR in one shot, then return to the app.
    I.approveAll = function () {
        if (I.pendingACRs.length === 0) { I.goToApp(); return; }
        I.setStatus("Approving all…");
        const ops: Promise<any>[] = I.pendingACRs.map((acr: any) => applyACR(acr));
        Promise.allSettled(ops)
            .then(() => {
                I.v3ContractsLoad?.();
                I.setPendingACRs([]);
                I.setStatus(null);
                I.goToApp();
            })
            .catch((e: any) => I.setStatus("Failed to approve all: " + (e.response?.data?.detail || String(e))));
    }

    // Return to the requesting app, logging it in. Mint a FRESH scoped token
    // for the referrer right here rather than trusting wapiAuth.oAuthToken to
    // already be set (it's minted async at load/login and often wasn't ready,
    // so the app never received a token). Approving nothing still logs the app
    // in — it just has no data grants (withheld).
    I.goToApp = function () {
        const decoded = I.wapi.readToken?.();
        let host: string | null = null;
        try { host = document.referrer ? new URL(document.referrer).hostname : null; } catch { host = null; }
        if (decoded && host && I.wapi.getTieredToken) {
            I.setStatus("Connecting…");
            I.wapi.getTieredToken(host, decoded.provider)
                .then((r: any) => { I.wapiAuth.oAuthToken = r.data.token; I.sendToken(); })
                .catch(() => I.sendToken());
        } else {
            I.sendToken();
        }
    }

    I.sendToken = function () {
        if (I.wapiAuth.oAuthToken && I.wapiAuth.sendToken) {
            I.wapiAuth.sendToken();
        } else if (window.opener) {
            window.close();
        }
    }

    I.deleteService = function (serviceName: string) {
        I.setStatus("Deleting service terms...");
        I.wapi
            .delete("services", { service: serviceName })
            .then(() => {
                // TODO: in the per-app contract model, deleting a service should
                // remove it from the app's permissions, not revoke the whole contract.
                // For now, just delete the v2 terms record.
                I.setStatus("Service deleted!");
                setTimeout(() => I.servicesLoad(), 1000);
            })
            .catch((e) => I.setStatus("Failed to delete: " + (e.response?.data?.detail || String(e))));
    }

    I.wipeServiceData = function (serviceName: string) {
        I.setStatus("Wiping all service data...");
        I.wapi
            .delete(serviceName, {})
            .then(() => {
                I.setStatus("Data wiped!");
                setTimeout(() => I.servicesLoad(), 1000);
            })
            .catch((e) => I.setStatus("Failed to wipe: " + (e.response?.data?.detail || String(e))));
    }

    I.signup = function (provider: string, username: string, password: string, retype: string, betacode: string, phone: string) {
        if (password !== retype) {
            I.setStatus("Failed to Sign Up : Passwords do not match.");
            return;
        }
        else if (username === "" || password === "") {
            I.setStatus("Failed to Sign Up : Must not leave username or password blank");
            return;
        }
        else if (phone.length < 7) {
            I.setStatus("Must Enter Phone Number");
            return;
        }
        I.setStatus("Signing Up ...");
        I.wapiAuth
            .signUp(provider, username, password, betacode, phone)
            .then(() =>
                I.login(provider, username, password)
            )
            .catch((error) =>
                I.setStatus("Failed to Sign Up : " + (error.response?.data?.detail || String(error)))
            );
    }

    I.sendCode = function () {
        I.setStatus("Sending code...");
        I.wapiAuth
            .sendCode()
            .then(() => I.setStatus("Code sent!"))
            .catch(() => I.setStatus("Failed to send code."));
    }

    I.verifyCode = function (code: string) {
        I.setStatus("Verifying code...");
        I.wapiAuth
            .verifyCode(code)
            .then(() => {
                I.setVerified(true);
                I.setStatus("Phone verified! Reloading...");
                setTimeout(() => {
                    I.servicesLoad();
                    I.setStatus(null);
                }, 1000);
            })
            .catch(() => I.setStatus("Wrong code."));
    }

    I.changePassword = function (currentPass: string, newPass: string, retypeNewPass: string) {
        if (newPass !== retypeNewPass) {
            I.setStatus("Passwords do not match.");
            return;
        }
        I.setStatus("Changing password...");
        I.wapiAuth
            .changePass(currentPass, newPass)
            .then(() => {
                I.setStatus("Password changed!");
                setTimeout(() => I.setStatus(null), 2000);
            })
            .catch((e) => I.setStatus("Failed: " + (e.response?.data?.detail || String(e))));
    }

    I.getPlan = function () {
        return I.wapiAuth.getPlan();
    }

    I.manageSpace = function () {
        I.wapiAuth.manageSpace().then((response: any) => { window.location.href = response.data; });
    }

    I.manageCredits = function () {
        I.wapiAuth.manageCredits().then((response: any) => { window.location.href = response.data; });
    }

    I.manageSubscriptions = function () {
        I.wapiAuth.manageSubscriptions().then((response: any) => { window.location.href = response.data; });
    }

    I.manageBusiness = function () {
        I.wapiAuth.manageBusiness().then((response: any) => { window.location.href = response.data; });
    }

    I.businessLogin = function () {
        I.wapiAuth.businessLogin().then((response: any) => { window.location.href = response.data; });
    }

    const [, authTick] = React.useState(0);
    const [, acrTick] = React.useState(0);

    React.useEffect(() => {
        if (I.auth) {
            I.initAuthenticator();
            I.servicesLoad();
        }
    }, [authTick])

    React.useEffect(() => {
        if (I.auth) {
            I.servicesLoad();
        }
    }, [acrTick])

    React.useEffect(() => {
        const referrer = window.document.referrer;
        if (referrer) {
            try {
                if (new URL(referrer).origin !== window.location.origin) {
                    I._hasReferrer = true;
                }
            } catch { }
        }
    }, [])

    const originalSetAuth = I.setAuth.bind(I);
    I.setAuth = function (val: boolean) {
        originalSetAuth(val);
        authTick(n => n + 1);
    }

    const originalSetPendingACRs = I.setPendingACRs.bind(I);
    I.setPendingACRs = function (val: any) {
        originalSetPendingACRs(val);
        acrTick(n => n + 1);
    }

    return I;
}

export default useInterface;