import React from 'react';
// import mockContacts from '../mocks/MockContacts'
import mockPage from '../mocks/mockAppData';

function useMockInterface() {
    const I = {};

    I.config = {
        DEFAULT_API : "api.web10.app",
        VERIFY_REQUIRED : true,
        BETA_REQUIRED : true,
    };

    [I.theme,I.setTheme] = React.useState("dark");
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("appstore");
    [I.search, I.setSearch] = React.useState("");

    [I.apps,I.setApps] = React.useState(mockPage);
    [I.phone, I.setPhone] = React.useState("13472092325");

    [I.auth,I.setAuth] = React.useState(false);

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

    I.runSearch = function(){
        return;
    }

    I.isAuthenticated=function(){
        return I.auth
    }

    I.login=function(){
        I.setAuth(true);
        I.setMode("appstore");
    }

    I.logout=function(){
        I.setAuth(false);
        I.setMode("login");
    }

    I.recover=function(){
        I.setAuth(true);
        I.setMode("appstore");
    }

    I.signup=function(){
        I.setAuth(true);
        I.setMode("appstore");
    }


    return I;
}

export default useMockInterface;