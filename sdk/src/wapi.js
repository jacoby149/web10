import axios from 'axios'
import { Peer } from "peerjs";
import {wapiAuthInit} from './wapiAuth'

/**
 * [cookieDict helper function that gets web cookies as a dictionary.]
 * @return {[dictionary]} [the current website's cookies.]
 */
function cookieDict() {
  return window.document.cookie.split(";").reduce((res, c) => {
    const [key, val] = c.trim().split("=").map(decodeURIComponent);
    try {
      return Object.assign(res, { [key]: JSON.parse(val) });
    } catch (e) {
      return Object.assign(res, { [key]: val });
    }
  }, {});
}

/**
 * [wapiInit initializes the SDK for web10 apps.]
 * @param  {[string]} authUrl [The URL of the web10 authenticator to use]
 * @param  {[list]} appStores [optional list of appstore URLs to register the app with]
 * @param  {[string]} rtcServer [The URL of the web10 webRTC server to use for P2P connections.]
 * @return {[Object]} [Returns the web10 connector object]
 */
const wapiInit = function(authUrl = "https://auth.web10.app", appStores=["https://api.web10.app"], rtcServer = "rtc.web10.app") {
  

  /********************** 
   *** Initialization ***
   **********************/

  const wapi = {};
  // ** Note ** The API protocol matches the auth protocol. if https, https. if http, http.
  wapi.APIProtocol = new URL(authUrl).protocol;
  wapi.childWindow = null;
  wapi.token = cookieDict()["token"];

  /************ 
   *** AUTH ***
   ************/

  /**
    * [setToken sets the web10 connector's token to a given input JWT string.
    * It also stores the JWT as a token= cookie with a 60 day expiration. ]
    * @param  {[string]} token [A JWT token]
    */
  wapi.setToken = function (token) {
    wapi.token = token;
    //set the cookie max age to 60 days (1 day padding from the true 61 day expiration)
    const age = 3600 * 24 * 60;
    document.cookie = `token=${wapi.token};Secure;path=/;max-age=${age};`;
  };

  /**
    * [scrubToken deletes the current token from the web10 connector.
    * It also deletes the token= cookie if there is one. ]
    * @param  {[string]} token [A JWT token]
    */
  wapi.scrubToken = function () {
    document.cookie = "token=;max-age=-1;path=/;";
    wapi.token = null;
  };

  /**
    * [openAuthPortal opens up a web10 authenticator window.
    * stores the window as a child in the web10 connector for back and forth messaging. ]
    */  
  wapi.openAuthPortal = () => wapi.childWindow = window.open(authUrl, "_blank");

  /**
    * [isSignedIn checks if a web10 account is currently signed in with. ]
    */  
  wapi.isSignedIn = () => wapi.token != null;

  /**
    * [signOut signs out the current web10 account IF signed in. ]
    */  
  wapi.signOut = () => wapi.scrubToken();

  /**
    * [authListen inits an event listener for logging.
    * listens for a web10 authenticator child window to send a JWT auth token
    * when the JWT is sent, configure the web10 connector to be logged in.]
    * @param  {[function]} setAuth [A callback function that takes logged in [boolean] as an input.]
    */  
  wapi.authListen = setAuth => window.addEventListener("message", e => {
    if (e.data.type === "auth") {
      wapi.setToken(e.data.token || "");
      if (setAuth != null) setAuth(wapi.isSignedIn());
    }
  });

  /**
    * [readToken if logged in, returns the data portion of the JWT auth token. ]
    * @param  {[function]} setAuth [A callback function that takes logged in [boolean] as an input.]
    * @return {[Object]} [JWT auth token data]
    */  
  wapi.readToken = () => !wapi.token ? null : JSON.parse(atob(wapi.token.split(".")[1]));

  //get tiered tokens for strong web10 security
  wapi.getTieredToken = (site, target, protocol = wapi.APIProtocol) => axios
    .post(`${protocol}//${wapi.readToken().provider}/web10token`, {
      username: wapi.readToken().username,
      password: null,
      token: wapi.token,
      site,
      target
    });

  /**************
   **** CRUD ****
   **************/

  //patch instead of get so patch can have an HTTPS E2E encrypted body
  wapi.read = (service, query = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
  ._W10CRUD(axios.patch, provider, username, service, query, null, protocol);
  wapi.read = (service, query = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
    ._W10CRUD(axios.patch, provider, username, service, query, null, protocol);
  wapi.create = (service, query = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
    ._W10CRUD(axios.post, provider, username, service, query, null, protocol);
  wapi.update = (service, query = null, update = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
    ._W10CRUD(axios.put, provider, username, service, query, update, protocol);
  //axios delete is implemented differently
  wapi.delete = (service, query = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
    ._W10CRUD((url, data) => axios.delete(url, { data: data }), provider, username, service, query, null, protocol);

  wapi._W10CRUD = function (HTTPRequestFunction, provider, username, service, query, update, protocol) {
    if ((!username && !wapi.token) || username === "anon") return console.error("cant CRUD anon accounts");
    if (!provider && !wapi.token) return console.error("web10 request without provider and token. need one.");

    provider = provider || wapi.readToken().provider;
    username = username || wapi.readToken().username;
    return HTTPRequestFunction(`${protocol}//${provider}/${username}/${service}`, { token: wapi.token, query, update });
  };

  //SMRs
  wapi.SMROnReady = (sirs, scrs) => window
    .addEventListener("message", e => e.data["type"] === "SMRListen" && wapi.childWindow.postMessage({ type: "smr", sirs, scrs }, "*"));
  wapi.SMRResponseListen = setStatus => window
    .addEventListener("message", e => e.data.type === "status" && setStatus(e.data.status));

  /*************
   **** P2P ****
   *************/
  wapi.peer = null;

  wapi.peerID = (provider, user, origin, label) => `${provider} ${user} ${origin} ${label}`.replaceAll(".", "_");

  // initializes the peer and listens for inbound connections
  wapi.inBound = {}
  wapi.initP2P = function (onInbound = null, label = "", secure = true) {
    const thisWapi = this
    const token = thisWapi.readToken();
    var id = thisWapi.peerID(token.provider, token.username, token.site, label);
    thisWapi.peer = new Peer(id, {
      host: rtcServer,
      secure: secure,
      port: secure ? 443 : 80,
      path: '/',
      token: `${thisWapi.token}~${label}`,
    });
    if (onInbound) {
      thisWapi.peer.on('connection', function (conn) {
        thisWapi.inBound[conn.peer] = conn;
        conn.on('data', (data) => onInbound(conn, data));
        conn.on('close', () => delete thisWapi.inBound[conn.peer])
      });
    }
  }

  // makes outbound connection IF it doesnt already exist
  // else returns the existing connection
  wapi.outBound = {}

  wapi.P2P = function (provider, username, origin, label) {
    const thisWapi = this
    if (!thisWapi.peer) console.error("not initialized")
    const id = thisWapi.peerID(provider, username, origin, label)
    var conn = null;
    if (!thisWapi.outBound[id]) {
      conn = thisWapi.peer.connect(id);
      thisWapi.outBound[conn.peer] = conn;
      conn.on('close', () => delete thisWapi.outBound[conn.peer])
    } else conn = thisWapi.outBound[id]
    return conn
  }

  wapi.send = function (provider, username, origin, label, data) {
    const thisWapi = this
    const conn = thisWapi.P2P(provider, username, origin, label);
    if (conn.open) {
      conn.send(data);
      return { connected: true };
    }
    else {
      conn.on('open', () => conn.send(data))
      return { connected: false };
    }
  }


  /*************** 
   *** dev pay ***
   ***************/

  wapi.checkout = (seller, title, price, success_url, cancel_url) => axios
    .post(`${wapi.APIProtocol}//${wapi.readToken().provider}/dev_pay`, {
      token: wapi.token,
      seller: seller,
      title,
      price,
      success_url,
      cancel_url
    }).then(response => window.location.href = response.data);

  wapi.verifySubscription = (seller, title) => axios
    .patch(`${wapi.APIProtocol}//${wapi.readToken().provider}/dev_pay`, {
      token: wapi.token,
      seller,
      title,
      price: null,
    });

  wapi.cancelSubscription = (seller, title) => axios
    .delete(`${wapi.APIProtocol}//${wapi.readToken().provider}/dev_pay`, {
      data: { token: wapi.token, seller, title, }
    });

  //register with the appStores
  for (const [i, appStore] of appStores.entries()) {
    axios.post(appStore+"/register_app", { "url": window.location.href.split('?')[0] })
  }

  //output the wapi object
  return wapi;
}

//browserify window access
window.wapiInit = wapiInit;
window.wapiAuthInit = wapiAuthInit;
export {wapiInit,wapiAuthInit};