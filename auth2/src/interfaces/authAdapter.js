import { wapiInit, wapiAuthInit } from 'web10-npm';

function web10AuthAdapterInit() {
    const local = true
    const wapi = local ?
        wapiInit("http://auth.localhost", "rtc.localhost") :
        wapiInit("https://auth.web10.app", "rtc.web10.app");
    const wapiAuth = wapiAuthInit(wapi);
    //read app store entries, 
    //CRUD services.
    //Log in
    //Sign up
}