import React from 'react';
import web10AuthAdapterInit from './authAdapter'
import axios from 'axios'
import { config } from '../config';

function useInterface() {
    const I = {} as Record<string, any>;

    I.config = config;

    [I.theme, I.setTheme] = React.useState("dark");
    [I.logo,I.setLogo] = React.useState(config.REACT_APP_LOGO_DARK);
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("contracts");
    [I.search, I.setSearch] = React.useState("");

    [I.services, I.setServices] = React.useState([]);
    [I.requests, I.setRequests] = React.useState([]);
    [I.phone, I.setPhone] = React.useState("");

    [I.auth, I.setAuth] = React.useState(false);
    [I.verified, I.setVerified] = React.useState(false);
    [I.status, I.setStatus] = React.useState<string | null>(null);
    [I.SMR, I.setSMR] = React.useState({ scrs: [], sirs: [] });

    const adapter = web10AuthAdapterInit();
    I.wapi = adapter.wapi;
    I.wapiAuth = adapter.wapiAuth;

    // Restore auth from cookie on page load — wapi.token is populated from
    // the "token=" cookie by wapiInit at init time.
    const existingToken = I.wapi.readToken?.();
    if (existingToken) {
        I.setAuth(true);
    }

    I.initAuthenticator = function () {
        I.wapiAuth.SMRListen((inSMR) => {
            I.setSMR(inSMR);
        });
    }

    I.servicesLoad = function () {
        if (!I.auth) {
            I.setServices([]);
            return;
        }
        I.wapi
            .read("services")
            .then(function (response) {
                response.data.sort((a, b) => a["_id"].localeCompare(b["_id"]));
                const currServices = response.data.map((service: any) => service["service"]);
                const SIRS = I.SMR["sirs"]
                    .filter((service: any) => !currServices.includes(service["service"]) && service["service"] !== "*")
                    .map((service: any) => [service, "new"]);

                const updatedServices = response.data.map((service: any) => {
                    const curr = service["service"];
                    let serviceType: string | null = null;
                    const _SIRS = I.SMR["sirs"].map((s: any) => s["service"]);
                    if (curr === "*") serviceType = null;
                    else if (curr in I.SMR["scrs"]) serviceType = "change";
                    else if (_SIRS.includes(curr)) {
                        const currOrigins = service["cross_origins"];
                        const SIROrigins = I.SMR["sirs"].filter((s: any) => s["service"] === curr)[0]["cross_origins"];
                        if (SIROrigins.filter((s: string) => !new Set(currOrigins).has(s)).length > 0) serviceType = "change";
                    }
                    return [service, serviceType];
                });

                updatedServices.push.apply(updatedServices, SIRS);
                I.setServices(updatedServices.map(([s]: [any, any]) => s));

                const hasSMRs = SIRS.length > 0 || response.data.some((s: any) => s["service"] in I.SMR["scrs"]);
                if (hasSMRs && I._hasReferrer) {
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

    I.runSearch = function () {
        return;
    }

    I.isAuthenticated = function () {
        return I.auth
    }

    I.login = function (provider: string, username: string, password: string) {
        I.setStatus("Logging in...");
        I.wapiAuth.logIn(provider, username, password)
            .then(() => {
                I.setAuth(true);
                I.initAuthenticator();
                I.servicesLoad();
                I.setMode("contracts");
            })
            .catch((error) =>
                I.setStatus("Failed to Log In : " + (error.response?.data?.detail || String(error)))
            );
    }

    I.logout = function () {
        I.wapi.signOut();
        I.setAuth(false);
        I.setVerified(false);
        I.setServices([]);
        I.setRequests([]);
        I.setSMR({ scrs: [], sirs: [] });
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

    I.changeTerms = function (service: any) {
        const SCR = { PULL: true, $unset: {}, $set: {} };
        const starFields = ["_id", "hashed_password", "customer_id", "business_id", "service", "credit_limit", "space_limit"];
        for (const [key, value] of Object.entries(service)) {
            if (key === "_id" || key === "service" || starFields.includes(key)) continue;
            if (value === undefined || value === null) {
                SCR["$unset"][key] = "";
            } else {
                SCR["$set"][key] = value;
            }
        }
        I.setStatus("Saving service terms...");
        I.wapi
            .update("services", { service: service.service }, SCR)
            .then(() => {
                I.setStatus("Service terms saved!");
                const newServices = I.services.map((s: any) => s.service === service.service ? service : s);
                I.setServices(newServices);
                setTimeout(() => I.setStatus(null), 2000);
            })
            .catch((e) => I.setStatus("Failed to save: " + (e.response?.data?.detail || String(e))));
    }

    I.submitSIR = function (service: any) {
        I.setStatus("Creating service...");
        I.wapi
            .create("services", service)
            .then(() => {
                I.setStatus("Service created!");
                I.servicesLoad();
                I.setSMR({
                    scrs: I.SMR["scrs"],
                    sirs: I.SMR["sirs"].filter((sir: any) => sir["service"] !== service["service"]),
                });
                I.sendToken();
            })
            .catch((e) => I.setStatus("Failed to create: " + (e.response?.data?.detail || String(e))));
    }

    I.purgeSMR = function (service: any) {
        I.setSMR({
            scrs: I.SMR["scrs"],
            sirs: I.SMR["sirs"].filter((sir: any) => sir["service"] !== service["service"]),
        });
        I.setStatus("Request denied.");
        I.sendToken();
    }

    I.sendToken = function () {
        if (I.wapiAuth.oAuthToken) {
            I.wapiAuth.sendToken();
        }
    }

    I.deleteService = function (serviceName: string) {
        I.setStatus("Deleting service terms...");
        I.wapi
            .delete("services", { service: serviceName })
            .then(() => {
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
    const [, smrTick] = React.useState(0);

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
    }, [smrTick])

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

    const originalSetSMR = I.setSMR.bind(I);
    I.setSMR = function (val: any) {
        originalSetSMR(val);
        smrTick(n => n + 1);
    }

    return I;
}

export default useInterface;