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

    [I.auth, I.setAuth] = React.useState(false);
    [I.isAdmin, I.setIsAdmin] = React.useState(true);
    [I.verified, I.setVerified] = React.useState(false);
    [I.status, I.setStatus] = React.useState<string | null>(null);
    [I.SMR, I.setSMR] = React.useState({ scrs: [], sirs: [] });

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

    I.recover = function () {
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

    // Mirror the real interface: only hand the token back once ALL pending
    // requests (SIRs + SCRs) are resolved (see Interface.tsx).
    I.resolveRequest = function (nextSMR: any) {
        I.setSMR(nextSMR);
        const remaining = (nextSMR.sirs?.length || 0) + (nextSMR.scrs?.length || 0);
        if (remaining === 0) I.sendToken();
    }

    I.changeTerms = function (service: any) {
        const newServices = I.services.map(
            (s: any) => (s.service === service.service ? service : s)
        )
        I.setServices(newServices)
        I.resolveRequest({
            scrs: (I.SMR["scrs"] || []).filter((s: any) => s["service"] !== service["service"]),
            sirs: I.SMR["sirs"],
        })
    }

    I.submitSIR = function (service: any) {
        I.setStatus("Mock: service created");
        I.resolveRequest({
            scrs: I.SMR["scrs"],
            sirs: (I.SMR["sirs"] || []).filter((s: any) => s["service"] !== service["service"]),
        })
    }
    I.purgeSMR = function (service: any) {
        I.setStatus("Mock: request denied");
        I.resolveRequest({
            scrs: (I.SMR["scrs"] || []).filter((s: any) => s["service"] !== service["service"]),
            sirs: (I.SMR["sirs"] || []).filter((s: any) => s["service"] !== service["service"]),
        })
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

    return I;
}

export default useMockInterface;