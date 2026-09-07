import React from 'react';
import mockRequests from '../mocks/mockRequests';
import mockServices from '../mocks/mockServices';
import { config } from '../config';

function useMockInterface() {
    const I = {} as Record<string, any>;

    I.config = config;

    [I.theme, I.setTheme] = React.useState("dark");
    [I.logo, I.setLogo] = React.useState(config.REACT_APP_LOGO_DARK);
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("contracts");
    [I.search, I.setSearch] = React.useState("");

    [I.services, I.setServices] = React.useState(mockServices);
    [I.requests, I.setRequests] = React.useState(mockRequests);
    [I.phone, I.setPhone] = React.useState("13472092325");

    [I.recoveryStep, I._setRecoveryStep] = React.useState("contact");
    [I.recoveryContact, I.setRecoveryContact] = React.useState("13472092325");
    [I.recoveryVerifyToken, I.setRecoveryVerifyToken] = React.useState("");
    [I.recoveryAccounts, I.setRecoveryAccounts] = React.useState<any[]>([]);

    [I.auth, I.setAuth] = React.useState(false);
    [I.isAdmin, I.setIsAdmin] = React.useState(true);
    [I.verified, I.setVerified] = React.useState(false);
    [I.status, I.setStatus] = React.useState<string | null>(null);
    [I.pendingACRs, I.setPendingACRs] = React.useState<any[]>([]);

    I.wapi = { signOut: () => { }, readToken: () => ({ username: 'creator', provider: 'api.localhost' }) };
    I.wapiAuth = {};

    I.verificationChange = function (value: string) {
        if (value.length === 6) I.setVerified(true)
    }

    I.changePhoneNumber = function () {
        I.setVerified(false)
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
        if (I.theme == "dark") {
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

    I.checkAdmin = function () {
        I.setIsAdmin(true);
    }

    I.isAuthenticated = function () {
        return I.auth
    }

    I.login = function () {
        I.setAuth(true);
        I.setMode("contracts");
    }

    I.logout = function () {
        I.setAuth(false);
        I.setMode("login");
    }

    I.setRecoveryStep = function (step: string) {
        I._setRecoveryStep(step);
    }

    I.recoverRequest = function (contact: string) {
        I.setRecoveryContact(contact);
        I.setRecoveryStep("code");
        I.setStatus("Code sent — check your phone.");
    }

    I.recoverVerify = function (_contact: string, _code: string) {
        I.setRecoveryVerifyToken("mock-verify-token");
        I.setRecoveryAccounts([{ username: "creator", email: "creator@example.com" }]);
        I.setRecoveryStep("pick");
        I.setStatus(null);
    }

    I.recoverComplete = function (_username: string, _newPassword?: string) {
        I.setAuth(true);
        I.setMode("contracts");
    }

    I.signup = function () {
        I.setAuth(true);
        I.setMode("contracts");
    }

    I.isVerified = function () {
        return I.verified;
    }

    I.hasRecoveryContact = function () {
        return !!(I.verified || (I.phone && I.phone.trim().length >= 7));
    }

    // Mirror the real interface: ACR-based pending list.
    I.approveACR = function (acr: any) {
        I.setStatus("Mock: ACR approved");
        I.removePendingACR(acr);
    }
    I.removePendingACR = function (acr: any) {
        I.setPendingACRs((prev: any[]) => prev.filter((a: any) => a !== acr));
    }
    I.denyACR = function (acr: any) {
        I.setStatus("Mock: ACR denied");
        I.removePendingACR(acr);
    }
    I.approveAll = function () {
        I.setPendingACRs([]);
        I.sendToken();
    }
    I.sendToken = function () { }
    I.deleteService = function () { I.setStatus("Mock: service deleted"); }
    I.wipeServiceData = function () { I.setStatus("Mock: data wiped"); }
    I.sendCode = function () { I.setStatus("Mock: code sent"); }
    I.verifyCode = function () { I.setVerified(true); I.setStatus("Mock: verified"); }
    I.changePassword = function () { I.setStatus("Mock: password changed"); }
    I.getPlan = function () { return Promise.resolve({ data: { space: 100, credits: 2, used_space: 87.24 } }); }
    I.manageSpace = function () { }
    I.manageCredits = function () { }
    I.manageSubscriptions = function () { }
    I.manageBusiness = function () { }
    I.businessLogin = function () { }
    I.initAuthenticator = function () { }
    I.servicesLoad = function () { }

    // Import (mock) — the "port your YouTube" pipeline. Simulates the
    // create → upload → start → poll flow without a node.
    I.importCreate = function (_platform: string, parts: { filename: string }[]) {
        return Promise.resolve({
            job_id: 'mock-job',
            platform: 'youtube',
            job: { phase: 'pending' },
            uploads: parts.map((p, i) => ({
                part_index: i,
                object_key: `imports/creator/mock-job/part-${String(i).padStart(3, '0')}`,
                upload_url: 'https://mock.minio/upload',
                fields: { key: `imports/creator/mock-job/part-${String(i).padStart(3, '0')}` },
            })),
        });
    };
    I.importStart = function (_jobId: string) {
        return Promise.resolve({ job_id: _jobId, status: 'queued' });
    };
    I.importStatus = function (_jobId: string) {
        return Promise.resolve({
            job_id: _jobId,
            job: { phase: 'complete', total_records: 42, written_records: 42, skipped_records: 0, errors: [], message: 'Import complete: 42 written, 0 skipped.' },
        });
    };

    return I;
}

export default useMockInterface;