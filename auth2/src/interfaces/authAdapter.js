import { wapiInit, wapiAuthInit } from 'web10-npm';

function web10AuthAdapterInit() {
    const local = window.location.protocol === "http:";
    const wapi = local ?
        wapiInit("http://auth.localhost", ["http://api.localhost"],"rtc.localhost") :
        wapiInit("https://auth.web10.app",["https://api.web10.app"],"rtc.web10.app");
    const wapiAuth = wapiAuthInit(wapi);
    //read app store entries, 
    //CRUD services.
    //Log in
    //Sign up
}

export default web10AuthAdapterInit;