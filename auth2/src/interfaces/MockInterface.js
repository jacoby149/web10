import React from 'react';
// import mockContacts from '../mocks/MockContacts'

function useMockInterface() {
    const I = {};

    [I.theme,I.setTheme] = React.useState("dark");
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("login");
    [I.search, I.setSearch] = React.useState("");

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

    return I;
}

export default useMockInterface;