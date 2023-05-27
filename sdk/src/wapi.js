import axios from 'axios'
import { Peer } from "peerjs";
import {wapiAuthInit} from './wapiAuth'

/**
 * Helper function that gets web cookies as a dictionary.
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
 * Initializes the SDK for web10 apps
 * @param  {string} [authUrl] [The URL of the web10 authenticator to use]
 * @param  {string[]} [appStores] [optional list of appstore URLs to register the app with]
 * @param  {string} [rtcServer] [The URL of the web10 webRTC server to use for P2P connections.]
 * @return {Object} [Returns the web10 connector]
 * @example
 *
 *     const wapi = wapiInit("https://auth.web10.app")
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
    * Sets the web10 connector's token to a given input JWT string.
    * It also stores the JWT as a token= cookie with a 60 day expiration.
    * @param  {string} token [A JWT token]
    */
  wapi.setToken = function (token) {
    wapi.token = token;
    //set the cookie max age to 60 days (1 day padding from the true 61 day expiration)
    const age = 3600 * 24 * 60;
    document.cookie = `token=${wapi.token};Secure;path=/;max-age=${age};`;
  };

  /**
    * Deletes the current token from the web10 connector.
    * It also deletes the token= cookie if there is one.
    * @param  {string} token [A JWT token]
    */
  wapi.scrubToken = function () {
    document.cookie = "token=;max-age=-1;path=/;";
    wapi.token = null;
  };

  /**
    * Opens up a web10 authenticator window.
    * Stores the window as a child in the web10 connector for back and forth messaging.
    */  
  wapi.openAuthPortal = () => wapi.childWindow = window.open(authUrl, "_blank");

  /**
    * Checks if a web10 account is currently signed in with.S
    */  
  wapi.isSignedIn = () => wapi.token != null;

  /**
    * Signs out the current web10 account IF signed in.
    */  
  wapi.signOut = () => wapi.scrubToken();

  /**
    * Inits an event listener for logging in
    * listens for a web10 authenticator child window to send a JWT auth token
    * when the JWT is sent, configure the web10 connector to be logged in.
    * @param  {function} setAuth [A callback function that takes logged in [boolean] as an input.]
    */  
  wapi.authListen = setAuth => window.addEventListener("message", e => {
    if (e.data.type === "auth") {
      wapi.setToken(e.data.token || "");
      if (setAuth != null) setAuth(wapi.isSignedIn());
    }
  });

  /**
    * If logged in, returns the data portion of the JWT auth token.
    * @param  {function} setAuth [A callback function that takes logged in [boolean] as an input.]
    * @return {Object} [JWT auth token data]
    */  
  wapi.readToken = () => !wapi.token ? null : JSON.parse(atob(wapi.token.split(".")[1]));

  /**
    * Gets an JWT token with reduced priveleges.
    * Used to communicate accross web10 servers. Used so a malicous web10 server can't spoof
    * Your identity in cross server communication.
    * @param  {string} site [The URL of the website the token is approved for.]
    * @param  {string} target [The URL of the target foreign web10 server.]
    * @param  {string} [protocol] [http: or the default https:]
    * @return {Promise} [The JWT token.]
    */  
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

  // **NOTE ** read uses patch instead of get so there can be an HTTPS E2E encrypted body
  
  /**
    * Reads data from a web10 service. Able to fetch the data in pages.
    * @param  {string} service [The name of the web10 user approved service.]
    * @param  {Object} [query] [The query to the service.]
    * @param  {string} [username] [The web10 username, defaults to yours.]
    * @param  {string} [provider] [The web10 provider domain, defaults to yours.]
    * @param  {string} [protocol] [the protocol, :http or the default :https]
    * @return {[Object]} [An axios promise with web10 read data.]
    */  
  wapi.read = (service, query = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
  ._W10CRUD(axios.patch, provider, username, service, query, null, protocol);

  /**
    * Creates a new data entry on a web10 service.
    * @param  {string} service [The name of the web10 user approved service.]
    * @param  {Object} [query] [The query to the service.]
    * @param  {string} [username] [The web10 username, defaults to yours.]
    * @param  {string} [provider] [The web10 provider domain, defaults to yours.]
    * @param  {string} [protocol] [the protocol, :http or the default :https]
    * @return {Promise} [MongoDB id of created data on success.]
    */  
  wapi.create = (service, query = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
    ._W10CRUD(axios.post, provider, username, service, query, null, protocol);

  /**
    * Updates data on a web10 service. It does a MongoDB update_one.
    * @param  {string} service [The name of the web10 user approved service.]
    * @param  {Object} [query] [The query to the service.]
    * @param  {Object} [update] [The update to the service.]
    * @param  {string} [username] [The web10 username, defaults to yours.]
    * @param  {string} [provider] [The web10 provider domain, defaults to yours.]
    * @param  {string} [protocol] [the protocol, :http or the default :https]
    * @return {Promise} [A promise holding metadata on the results of the update.]
    */  
  wapi.update = (service, query = null, update = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
    ._W10CRUD(axios.put, provider, username, service, query, update, protocol);
  
  /**
    * Deletes data on a web10 service.
    * @param  {string} service [The name of the web10 user approved service.]
    * @param  {Object} [query] [The query to the service.]
    * @param  {string} [username] [The web10 username, defaults to yours.]
    * @param  {string} [provider] [The web10 provider domain, defaults to yours.]
    * @param  {string} [protocol] [the protocol, :http or the default :https]
    * @return {Promise} [success status]
    */    
  wapi.delete = (service, query = null, username = null, provider = null, protocol = wapi.APIProtocol) => wapi
    ._W10CRUD((url, data) => axios.delete(url, { data: data }), provider, username, service, query, null, protocol);
  
  /**
  * A helper function for the web10 CRUD functionality.
  * @param  {function} HTTPRequestFunction [The request function to use.]
  * @param  {string} provider [The web10 provider]
  * @param  {string} username [The web10 username]
  * @param  {string} service [The web10 service to CRUD]
  * @param  {Object} query [The query to the service.]
  * @param  {Object} update [The update to the service, if updating.]
  * @param  {string} protocol [the protocol, :http or :https]
  * @return {Promise} [The response from the web10 API call.]
  */    
  wapi._W10CRUD = function (HTTPRequestFunction, provider, username, service, query, update, protocol) {
    if ((!username && !wapi.token) || username === "anon") return console.error("cant CRUD anon accounts");
    if (!provider && !wapi.token) return console.error("web10 request without provider and token. need one.");

    provider = provider || wapi.readToken().provider;
    username = username || wapi.readToken().username;
    return HTTPRequestFunction(`${protocol}//${provider}/${username}/${service}`, { token: wapi.token, query, update });
  };

  /**************
   **** SMRs ****
   **************/

    /**
      * Adds a listener for if the child window is ready to recieve an SMR.
      * When the child window is ready, the function sends an SMR to the child window.
      * @param  {Object} sirs [For adding contracts for the first time]
      * @param  {Object} scrs [For making additive changes to contracts]
      * @param  {Object} sxrs [TBD For making subtractive changes to contracts]
      */    
   wapi.SMROnReady = (sirs, scrs) => window
    .addEventListener("message", e => e.data["type"] === "SMRListen" && wapi.childWindow.postMessage({ type: "smr", sirs, scrs }, "*"));

  /**
    * Adds a listener for user interaction with web10 contracts in the child window.
    * @param  {function} setStatus [A callback function ]
    */    
  wapi.SMRResponseListen = setStatus => window
    .addEventListener("message", e => e.data.type === "status" && setStatus(e.data.status));

  /*************
   **** P2P ****
   *************/
 
  wapi.peer = null;
  wapi.outBound = {}
  wapi.inBound = {}

  /**
    * Returns the web10 peer ID.
    * @param  {string} provider [ web10 webRTC provider ]
    * @param  {string} user [ web10 username ]
    * @param  {string} origin [ web10 provider URL ]
    * @param  {string} label [ label added by app developer. ]
  */    
  wapi.peerID = (provider, user, origin, label) => `${provider} ${user} ${origin} ${label}`.replaceAll(".", "_");

  /**
    * Initializes the peer and listens for inbound connections
    * @param  {string} [onInbound] [ A callback function for when P2P inbound data comes. ]
    * @param  {string} [label] [ Can be added to give 1 web10 user multiple peer IDs.]
    * @param  {boolean} [secure] [ Whether HTTPS is required or not. ]
  */    
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

  
  /**
    * Makes an outbound P2P connection IF the connection doesnt already exist.
    * Otherwise, just returns the existing connection.
    * @param  {string} provider [ web10 provider. ]
    * @param  {string} username [ web10 username]
    * @param  {boolean} origin [ web10 app URL]
    * @param  {boolean} label [ Can be added to give 1 web10 user multiple peer IDs.]
  */    
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

  /**
    * Send data over web10 P2P to another peer.
    * @param  {string} provider [ other's web10 provider. ]
    * @param  {string} username [ other's web10 username ] 
    * @param  {boolean} origin [ web10 app URL ]
    * @param  {boolean} label [ other's label ]
    * @param  {object} data [ data to send the other peer ]
  */    
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

  /**
    * Open a stripe checkout window for a web10 app product.
    * @param  {string} seller [ web10 address of seller ]
    * @param  {string} title [ title of the item to sell ] 
    * @param  {boolean} price [ the price of the item ]
    * @param  {boolean} success_url [ URL to redirect to on success. ]
    * @param  {object} cancel_url [ URL to redirect to on cancellation. ]
  */     
  wapi.checkout = (seller, title, price, success_url, cancel_url) => axios
    .post(`${wapi.APIProtocol}//${wapi.readToken().provider}/dev_pay`, {
      token: wapi.token,
      seller: seller,
      title,
      price,
      success_url,
      cancel_url
    }).then(response => window.location.href = response.data);

  /**
    * verify a web10 product subscription
    * @param  {string} seller [ The vendor's web10 address. ]
    * @param  {string} title [ The name of the seller's product. ] 
    * @returns  {Promise} [ The response ]
  */    
  wapi.verifySubscription = (seller, title) => axios
    .patch(`${wapi.APIProtocol}//${wapi.readToken().provider}/dev_pay`, {
      token: wapi.token,
      seller,
      title,
      price: null,
    });

  /**
    * cancel a web10 product subscription
    * @param  {string} seller [ The vendor's web10 address. ]
    * @param  {string} title [ The name of the seller's product. ] 
    * @returns  {Promise} [ The response ]
  */    
  wapi.cancelSubscription = (seller, title) => axios
    .delete(`${wapi.APIProtocol}//${wapi.readToken().provider}/dev_pay`, {
      data: { token: wapi.token, seller, title, }
    });

  /**
    * On web10 connector load, register the web10 app with all input appStores.
  */    
  for (const [i, appStore] of appStores.entries()) {
    axios.post(appStore+"/register_app", { "url": window.location.href.split('?')[0] })
  }

  /**
    * Return the web10 connector.
  */    
  return wapi;
}

//browserify window access
window.wapiInit = wapiInit;
window.wapiAuthInit = wapiAuthInit;
export {wapiInit,wapiAuthInit};