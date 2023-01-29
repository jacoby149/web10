import React from 'react';
// import mockContacts from '../mocks/MockContacts'
import web10AuthAdapterInit from './authAdapter';
import axios from 'axios'

function useInterface() {
    const I = {};

    I.config = {
        DEFAULT_API: "api.web10.app",
        VERIFY_REQUIRED: true,
        BETA_REQUIRED: true,
    };

    [I.theme, I.setTheme] = React.useState("dark");
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("appstore");
    [I.search, I.setSearch] = React.useState("");

    [I.services, I.setServices] = React.useState([]);
    [I.requests, I.setRequests] = React.useState([]);
    [I.appStoreStats, I.setAppStoreStats] = React.useState(
        {
            users: 0,
            apps: 0,
            hits: 0,
            data: 0
        }
    );
    [I.apps, I.setApps] = React.useState([]);
    [I.phone, I.setPhone] = React.useState("13472092325");

    [I.auth, I.setAuth] = React.useState(false);
    [I.verified, I.setVerified] = React.useState(false);

    I.authAdapter = web10AuthAdapterInit();

    I.initAppStore = function () {
        //initialize the app store
        //upon login, initialize the services??? TBD
        return axios.post("https://api.web10.app/stats")
            .then((response) => {
                // handle the stats
                console.log(response.data)
                const apps = response.data.apps
                const stats = {
                    users: response.data.users.toLocaleString("en-US"),
                    hits: apps.map((app) => app["visits"]).reduce((a, b) => a + b, 0).toLocaleString("en-US"),
                    apps: response.data.apps.length.toLocaleString("en-US"),
                    data: (response.data.storage / (1024 * 1024)).toFixed(2).toLocaleString("en-US")
                }
                I.setAppStoreStats(stats);
                return apps;
            })
            .then((apps) => {
                apps.map((app) => {
                    console.log(app.url)
                })
            })
            .catch((error) => console.log(error));
    }

    I.initAuthenticator = function () {
        // ok
        return
    }

    I.verificationChange = function (value) {
        if (value.length === 6) I.setVerified(true)
    }

    I.changePhoneNumber = function () {
        I.setVerified(false)
    }

    I.setMode = function (mode) {
        I.setMenuCollapsed(true);
        I.setSearch("")
        I._setMode(mode);
    }

    I.toggleMenuCollapsed = function () {
        I.setMenuCollapsed(!I.menuCollapsed)
    }

    I.toggleTheme = function () {
        I.theme == "dark" ? I.setTheme("light") : I.setTheme("dark")
    }

    I.runSearch = function () {
        return;
    }

    I.isAuthenticated = function () {
        return I.auth
    }

    I.login = function (provider, username, password) {
        I.wapiAuth.logIn(
            provider,
            username,
            password,
        ).then(() => {
            I.setAuth(true);
            I.setMode("appstore");
        }).catch((error) =>
            I.setStatus(
                "Failed to Log In : " + error.response.data.detail
            )
        );
    }

    I.logout = function () {
        I.setAuth(false);
        I.setMode("login");
    }

    I.recover = function () {
        I.setAuth(true);
        I.setMode("appstore");
    }

    I.isVerified = function () {
        return I.verified;
    }

    I.changeTerms = function (service) {

        const newServices = I.services.map(
            (s) => {
                return s.service === service.service ? service : s
            }
        )
        I.setServices(newServices)
    }

    I.signup = function (provider, username, password, retype, betacode, phone) {
        if (password !== retype) {
            I.setStatus("Failed to Sign Up : Passwords do not match.");
            return;
        }
        else if (username === "" || password === "") {
            I.setStatus("Failed to Sign Up : Must not leave username or password blank");
            return
        }
        else if (phone.length < 7) {
            I.setStatus("Must Enter Phone Number")
        }
        I.setStatus("Signing Up ...");
        I.wapiAuth
            .signUp(provider, username, password, betacode, phone)
            .then(() =>
                I.logIn(
                    provider,
                    username,
                    password,
                )
                // TODO add a .then, that sets the status + changes the mode. 
                // because I modified this to return a promise.
            )
            .catch((error) =>
                I.setStatus(
                    "Failed to Sign Up : " + error.response.data.detail
                )
            );
    }
    React.useEffect(() => {
        I.initAppStore();
    },[])
    return I;
}

export default useInterface;