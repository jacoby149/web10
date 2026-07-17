import React from 'react';
import mockPage from '../mocks/mockAppData';
import mockRequests from '../mocks/mockRequests';
import mockServices from '../mocks/mockServices';
import { config } from '../config';

function useMockInterface() {
    const I = {} as Record<string, any>;

    I.config = config;

    [I.theme, I.setTheme] = React.useState("dark");
    [I.logo, I.setLogo] = React.useState(config.REACT_APP_LOGO_DARK);
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("appstore");
    [I.search, I.setSearch] = React.useState("");

    [I.services, I.setServices] = React.useState(mockServices);
    [I.requests, I.setRequests] = React.useState(mockRequests);
    [I.apps, I.setApps] = React.useState(mockPage);
    [I.phone, I.setPhone] = React.useState("13472092325");
    [I.appStoreStats, I.setAppStoreStats] = React.useState(
        {
            users: 52,
            apps: 22,
            hits: 4437,
            data: 2.45
        }
    );

    [I.auth, I.setAuth] = React.useState(false);
    [I.verified, I.setVerified] = React.useState(false);
    [I.status, I.setStatus] = React.useState<string | null>(null);
    [I.SMR, I.setSMR] = React.useState({ scrs: [], sirs: [] });

    I.wapi = { signOut: () => { } };
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

    I.runSearch = function () {
        return;
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
        I.setMode("appstore");
    }

    I.signup = function () {
        I.setAuth(true);
        I.setMode("contracts");
    }

    I.isVerified = function () {
        return I.verified;
    }

    I.changeTerms = function (service: any) {
        const newServices = I.services.map(
            (s: any) => {
                return s.service === service.service ? service : s
            }
        )
        I.setServices(newServices)
    }

    I.submitSIR = function () { I.setStatus("Mock: service created"); }
    I.purgeSMR = function () { I.setStatus("Mock: request denied"); }
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