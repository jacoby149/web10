import React from 'react';
import web10AuthAdapterInit from './authAdapter'
import axios from 'axios'
import { config } from '../config';

// ── v3 API helpers (ClickHouse-backed service contracts + groups) ──────────

/**
 * Resolve the API origin from the decoded token or fall back to the configured
 * default. Mirrors authAdapter's *.localhost / *.dev.web10.app detection.
 */
function v3ApiOrigin(decoded: { provider?: string } | null): string {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
    const isDev = host.endsWith('.dev.web10.app');
    const provider = decoded?.provider || (isLocal ? 'api.localhost' : isDev ? 'api.dev.web10.app' : config.REACT_APP_DEFAULT_API);
    return `${window.location.protocol}//${provider}`;
}

/**
 * Call a v3 API endpoint. All v3 endpoints are POST with a JSON body that
 * carries the token + parameters. Mirrors api/app/v3/models/__init__.py Token.
 */
async function v3Post(action: string, body: Record<string, any>) {
    const decoded = (window.I?.v3?.readToken?.()) as { provider?: string } | null;
    const origin = v3ApiOrigin(decoded);
    const token = window.I?.v3?.state?.token;
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

    // Build the v3 client — all auth goes through ClickHouse (v3).
    const adapter = web10AuthAdapterInit();
    const v3 = adapter.v3;

    // Restore auth from the "token=" cookie on load. A dead (expired) token
    // must NOT present the authenticated view (B7: it used to land the user on
    // an empty "Your contracts" with no way to log in) — scrub it so routing
    // sends them to login. Same for a token from the wrong provider (prod token
    // on dev or vice versa) — the JWT provider must match this node. Runs once,
    // in the lazy initializer, not every render.
    const restoreAuth = (): boolean => {
        const t = v3.readToken?.();
        if (!t) return false;
        const expires = t.expires ? Date.parse(t.expires) : NaN;
        if (!Number.isNaN(expires) && expires < Date.now()) {
            v3.scrubToken?.();
            return false;
        }
        // Provider mismatch: a prod token on dev (or vice versa) is useless —
        // the API won't recognize it. Scrub so the user gets a login prompt.
        const host = window.location.hostname;
    const isDev = host === 'dev.web10.app' || host.endsWith('.dev.web10.app');
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
        const expectedProvider = isLocal ? 'api.localhost' : isDev ? 'api.dev.web10.app' : config.REACT_APP_DEFAULT_API;
        if (t.provider !== expectedProvider && !isLocal) {
            v3.scrubToken?.();
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
    // Pending contract requests — unified list of ACRs and GCRs.
    // One popup, one consent screen, both types together.
    // ACR: { allowed_origin, permissions } — app contract (what can this app do)
    // GCR: { app_origin, action, params } — group contract (who can see my content)
    [I.pendingContracts, I.setPendingContracts] = React.useState<any[]>([]);

    // v3 service contracts (ClickHouse-backed — simpler model: origin + service)
    [I.v3Contracts, I.setV3Contracts] = React.useState<any[]>([]);
    // v3 groups the user belongs to
    [I.v3Groups, I.setV3Groups] = React.useState<any[]>([]);
    // v3 groups the user manages (has management permissions)
    [I.v3ManagedGroups, I.setV3ManagedGroups] = React.useState<any[]>([]);
    // v3 pending invites (groups that invited this user)
    [I.v3Invites, I.setV3Invites] = React.useState<any[]>([]);

    I.v3 = v3;

    // Normalize contract requests into a unified list (app + group contracts).
    // contractListen delivers { contracts } where each CR is either:
    //   V3AppCR: { kind: 'app', app_origin, permissions }
    //   V3GroupCR: { kind: 'group', app_origin, action, name?, join_policy?, roles?, members?, group_id? }
    function normalizeContracts(cData: any, windowSource?: MessageEventSource | null) {
        const contracts: any[] = [];
        // Handle unified CR format: { contracts: [...] }
        if (Array.isArray(cData?.contracts)) {
            for (const cr of cData.contracts) {
                // Normalize old kind values ('acr'/'gcr') to new ('app'/'group')
                let kind = cr.kind;
                if (kind === 'acr') kind = 'app';
                if (kind === 'gcr') kind = 'group';
                if (!kind) kind = cr.permissions ? 'app' : 'group';

                const entry: any = {
                    kind,
                    app_origin: cr.app_origin || cr.allowed_origin || '',
                    _source: cr,
                    _windowSource: windowSource,
                };
                if (kind === 'app') {
                    entry.permissions = cr.permissions || {};
                } else {
                    // Group contract — typed fields, not a params bag
                    entry.action = cr.action || 'create_group';
                    entry.name = cr.name;
                    entry.join_policy = cr.join_policy;
                    entry.roles = cr.roles;
                    entry.members = cr.members;
                    entry.group_id = cr.group_id;
                    // Backward compat: if sender used old params bag, flatten it
                    if (cr.params) {
                        entry.name = entry.name || cr.params.name;
                        entry.join_policy = entry.join_policy || cr.params.join_policy;
                        entry.roles = entry.roles || cr.params.roles;
                        entry.members = entry.members || cr.params.members;
                        entry.group_id = entry.group_id || cr.params.group_id;
                    }
                    // Also keep a params bag for backward compat with ConsentView.summarizeGCR
                    entry.params = {
                        name: entry.name,
                        join_policy: entry.join_policy,
                        roles: entry.roles,
                        members: entry.members,
                        group_id: entry.group_id,
                    };
                }
                contracts.push(entry);
            }
            return contracts;
        }
        // Fallback: legacy SMR { sirs, scrs } format (app contract only)
        const allRequests = [
            ...(Array.isArray(cData?.sirs) ? cData.sirs : []),
            ...(Array.isArray(cData?.scrs) ? cData.scrs : []),
        ];
        for (const req of allRequests) {
            const origins = Array.isArray(req.cross_origins) ? req.cross_origins : [];
            if (origins.length === 0) {
                console.warn('CR: request with no cross_origins — skipped', req);
                continue;
            }
            const perms = whitelistToPermissions(req.whitelist || []);
            if (perms.length === 0) perms.push('readAll');
            const permissions: Record<string, string[]> = { [req.service]: perms };
            for (const origin of origins) {
                contracts.push({
                    kind: 'app',
                    app_origin: origin,
                    permissions,
                    _source: req,
                });
            }
        }
        return contracts;
    }

    // v3 contract listening — direct postMessage, no wapiAuth wrapper
    I.initAuthenticator = function () {
        if (typeof window === 'undefined') return;
        window.addEventListener('message', (e) => {
            // Contract requests are inherently cross-origin (app → auth UI).
            // Only reject obviously malicious sources (null origin from sandboxed iframe).
            if (!e.origin) return;
            if (e.data?.type === 'acr' || e.data?.type === 'contract') {
                I.setPendingContracts(normalizeContracts(e.data, e.source));
            }
            // Handshake — respond so the SDK knows we're listening
            if (e.data?.type === 'handshake' && e.source instanceof Window) {
                try {
                    e.source.postMessage({ type: 'handshake_ack' }, '*');
                } catch { /* cross-origin */ }
            }
        });
        // Signal readiness to opener, then request contracts
        if (window.opener) {
            try {
                window.opener.postMessage({ type: 'auth_ready' }, '*');
            } catch { /* opener may be cross-origin restricted */ }
            try {
                window.opener.postMessage({ type: 'ACRListen' }, '*');
            } catch { /* cross-origin */ }
        }
    }

    I.servicesLoad = function () {
        if (!I.auth) {
            I.setServices([]);
            return;
        }
        I.v3ContractsLoad();
        I.v3GroupsLoad();
        I.v3GroupsManagesLoad();

        I.v3.getProfile()
            .then((profile: any) => {
                I.setPhone(profile?.phone || "");
                if (profile?.phone_verified) I.setVerified(true);
            })
            .catch(console.error);
    }

    I.verificationChange = function (value) {
        if (value.length === 6) I.setVerified(true)
    }

    I.changePhoneNumber = function (password: string, newPhone: string) {
        I.setStatus("Changing phone number...");
        I.v3.changePhone(newPhone)
            .then(() => {
                I.setStatus("Successfully changed phone number. Reloading...");
                I.setVerified(false);
                setTimeout(() => I.servicesLoad(), 1000);
            })
            .catch((e) => {
                I.setStatus(e.message || String(e));
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
        const decoded = I.v3.readToken?.();
        if (!decoded) {
            I.setIsAdmin(false);
            return;
        }
        axios
            .post(`${window.location.protocol}//${decoded.provider}/am_admin`, { token: I.v3.state.token })
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
        I.v3.login(username, password, provider)
            .then(() => I.finishLogin())
            .catch((error: any) => {
                if (I.v3.isSignedIn()) I.finishLogin();
                else I.setStatus("Failed to Log In : " + (error.message || String(error)));
            });
    }

    I.logout = function () {
        I.v3.signOut();
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
        I.v3.setRecoveryPhone(phone)
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

    // Cleanup stale contracts where allowed_origin is not a URL.
    I.cleanupV3Contracts = function () {
        return v3Post('app-contracts/cleanup', {}).then(() => {
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

    // Delete a v3 group (requires deleteGroup permission).
    I.v3DeleteGroup = function (groupId: string) {
        return v3Post('groups/delete', { group_id: groupId });
    }

    // Block a user from seeing content in a v3 group.
    I.v3BlockUserInGroup = function (blockedKey: string, groupId: string) {
        return v3Post('groups/block', { blocked_key: blockedKey, group_id: groupId });
    }

    // Unblock a user in a v3 group.
    I.v3UnblockUserInGroup = function (blockedKey: string, groupId: string) {
        return v3Post('groups/unblock', { blocked_key: blockedKey, group_id: groupId });
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
        return v3Post('groups/sharing/set', { group_id: groupId, enabled });
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

    // Merge the permissions object from an app contract into an existing contract's
    // permissions (if any), then create the updated v3 contract.
    function applyACR(cr: any) {
        const origin = cr.app_origin;
        const newPerms: Record<string, string[]> = cr.permissions || {};

        const existing = (I.v3Contracts || []).find(
            (c: any) => c.allowed_origin === origin,
        );

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

        return I.addV3Contract(origin, perms)
            .then(() => {
                if (existing) {
                    return I.revokeV3Contract(origin).catch(() => {});
                }
            });
    }

    // Execute a group contract — the authenticator is the trusted party.
    function applyGCR(cr: any) {
        const action = cr.action || 'create_group';
        const decoded = I.wapi?.readToken?.();
        const username = decoded?.username || decoded?.sub || '';
        const provider = decoded?.provider || '';

        if (action === 'update_group') {
            const groupId = cr.group_id;
            if (!groupId) throw new Error('CR update_group: missing group_id');
            return I.v3UpdateGroup(groupId, {
                join_policy: cr.join_policy,
                roles: cr.roles,
            }).then(() => {
                I.v3GroupsLoad?.();
                I.v3GroupsManagesLoad?.();
            });
        }

        const name = cr.name || `group-${Date.now()}`;
        const groupId = `${provider}/groups/users/${username}/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

        const roles = cr.roles || [
            { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
            { name: 'member', services: ['posts', 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
        ];

        const members = cr.members || [{ member_key: username, role: 'owner' }];

        return I.v3CreateGroup(
            name,
            cr.join_policy || 'invite_only',
            roles,
            members
        ).then(() => {
            I.v3GroupsLoad?.();
            I.v3GroupsManagesLoad?.();
        });
    }

    // Send contract response back to the requesting app window
    function sendContractResponse(windowSource: MessageEventSource | null, status: string, errors?: string[]) {
        if (!windowSource) return;
        try {
            const target = '*';
            if (windowSource instanceof Window) {
                windowSource.postMessage({ type: 'contract_response', status, errors }, target);
            }
        } catch {
            // Window may have been closed
        }
    }

    // Approve a single contract (app or group).
    I.approveContract = function (contract: any) {
        const windowSource = contract._windowSource;

        if (contract.kind === 'group') {
            I.setStatus("Creating group...");
            applyGCR(contract)
                .then(() => {
                    I.setStatus("Group created!");
                    I.removePendingContract(contract);
                    sendContractResponse(windowSource, 'approved');
                    setTimeout(() => I.setStatus(null), 2000);
                })
                .catch((e) => {
                    I.setStatus("Failed to create group: " + (e.message || String(e)));
                    sendContractResponse(windowSource, 'error', [e.message || String(e)]);
                });
            return;
        }

        // App contract
        const origin = contract.app_origin;
        const alreadyGranted = I.hasV3Contract?.(origin);
        if (alreadyGranted) {
            I.removePendingContract(contract);
            sendContractResponse(windowSource, 'approved');
            return;
        }

        I.setStatus("Approving contract...");
        applyACR(contract)
            .then(() => {
                I.setStatus("Contract granted!");
                I.v3ContractsLoad?.();
                I.removePendingContract(contract);
                setTimeout(() => I.setStatus(null), 2000);
            })
            .catch((e) => I.setStatus("Failed to approve: " + (e.message || String(e))));
    }

    // Remove a single contract from the pending list (after approve or deny).
    I.removePendingContract = function (contract: any) {
        const source = contract._source;
        I.setPendingContracts((prev: any[]) => {
            if (source) {
                return prev.filter((c: any) => c._source !== source);
            }
            if (contract.kind === 'app') {
                return prev.filter((c: any) => c.app_origin !== contract.app_origin);
            }
            return prev.filter((c: any) => c.action !== contract.action || c.app_origin !== contract.app_origin);
        });
    }

    // Deny a contract — just remove it from the pending list.
    I.denyContract = function (contract: any) {
        const windowSource = contract._windowSource;
        I.removePendingContract(contract);
        sendContractResponse(windowSource, 'denied');
        I.setStatus("Request denied.");
    }

    // Approve every pending contract in one shot, then return to the app.
    I.approveAll = function () {
        if (!I.pendingContracts || I.pendingContracts.length === 0) { I.goToApp(); return; }
        I.setStatus("Approving all…");
        const ops: Promise<any>[] = I.pendingContracts.map((c: any) => {
            const winSource = c._windowSource;
            if (c.kind === 'group') {
                return applyGCR(c)
                    .then(() => sendContractResponse(winSource, 'approved'))
                    .catch((e: any) => sendContractResponse(winSource, 'error', [e.message || String(e)]));
            }
            return applyACR(c);
        });
        Promise.allSettled(ops)
            .then(() => {
                I.v3ContractsLoad?.();
                I.v3GroupsLoad?.();
                I.v3GroupsManagesLoad?.();
                I.setPendingContracts([]);
                I.setStatus(null);
                I.goToApp();
            })
            .catch((e: any) => I.setStatus("Failed to approve all: " + (e.message || String(e))));
    }

    // Legacy aliases — keep old names working for tests + existing callers
    I.pendingACRs = I.pendingContracts;
    I.setPendingACRs = I.setPendingContracts;
    I.approveACR = (c: any) => I.approveContract({ ...c, kind: c.kind || 'app' });
    I.denyACR = (c: any) => I.denyContract({ ...c, kind: c.kind || 'app' });
    I.removePendingACR = (c: any) => I.removePendingContract({ ...c, kind: c.kind || 'app' });

    // Return to the requesting app, logging it in. Send the current v3 token
    // directly to the opener — no tiered token needed for v3.
    I.goToApp = function () {
        const token = I.v3.state?.token;
        if (token && window.opener) {
            try {
                const referrer = document.referrer;
                const target = referrer ? new URL(referrer).origin : '*';
                I.setStatus("Connecting…");
                window.opener.postMessage({ type: 'auth', token }, target);
                window.close();
            } catch {
                I.setStatus("Failed to connect to app.");
            }
        } else if (window.opener) {
            window.close();
        }
    }

    I.sendToken = function () {
        I.goToApp();
    }

    // v4 features — not available in v3
    I.deleteService = function (_serviceName: string) {
        I.setStatus("Service deletion is a v4 feature.");
    }

    I.wipeServiceData = function (_serviceName: string) {
        I.setStatus("Data wiping is a v4 feature.");
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
        I.v3
            .signup(username, password, phone)
            .then(() =>
                I.login(provider, username, password)
            )
            .catch((error) =>
                I.setStatus("Failed to Sign Up : " + (error.message || String(error)))
            );
    }

    I.sendCode = function () {
        I.setStatus("Sending code...");
        I.v3
            .sendCode()
            .then(() => I.setStatus("Code sent!"))
            .catch(() => I.setStatus("Failed to send code."));
    }

    I.verifyCode = function (code: string) {
        I.setStatus("Verifying code...");
        I.v3
            .verifyPhone(code)
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
        I.v3
            .changePassword(currentPass, newPass)
            .then(() => {
                I.setStatus("Password changed!");
                setTimeout(() => I.setStatus(null), 2000);
            })
            .catch((e) => I.setStatus("Failed: " + (e.message || String(e))));
    }

    // v4 features — not available in v3
    I.getPlan = function () {
        I.setStatus("Plan management is a v4 feature.");
    }

    I.manageSpace = function () {
        I.setStatus("Space management is a v4 feature.");
    }

    I.manageCredits = function () {
        I.setStatus("Credits management is a v4 feature.");
    }

    I.manageSubscriptions = function () {
        I.setStatus("Subscription management is a v4 feature.");
    }

    I.manageBusiness = function () {
        I.setStatus("Business management is a v4 feature.");
    }

    I.businessLogin = function () {
        I.setStatus("Business login is a v4 feature.");
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
