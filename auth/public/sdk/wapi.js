//wapi can be double loaded. try locally first and if that fails, load from the cdn
if (typeof wapiInit === "undefined") {
  //makes a dictionary of cookies
  function cookieDict() {
    return document.cookie.split(";").reduce((res, c) => {
      const [key, val] = c.trim().split("=").map(decodeURIComponent);
      try {
        return Object.assign(res, { [key]: JSON.parse(val) });
      } catch (e) {
        return Object.assign(res, { [key]: val });
      }
    }, {});
  }

  //initializes the wapi library object
  function wapiInit(authUrl = "https://auth.web10.app", rtcOrigin = "rtc.web10.app", protocol = null) {
    const wapi = {};

    // get the default api protocol, which is required to match its auth portals protocol
    if (protocol) wapi.defaultAPIProtocol = protocol + ":";
    else wapi.defaultAPIProtocol = new URL(authUrl).protocol;

    //wapi variables
    wapi.childWindow = null;
    wapi.token = cookieDict()["token"];

    /************ 
     *** AUTH ***
     ************/

    //sets the api key in wapi and stores it in cookies
    wapi.setToken = function (token) {
      wapi.token = token;
      //set the cookie max age to 60 days (1 day padding from the true 61 day expiration)
      const age = 3600 * 24 * 60;
      document.cookie = `token=${wapi.token};Secure;path=/;max-age=${age};`;
    };
    //scrub the api keys from wapi and deletes it from cookies
    wapi.scrubToken = function () {
      document.cookie = "token=;max-age=-1;path=/;";
      wapi.token = null;
    };

    //opens up a child window for auth stuff
    wapi.openAuthPortal = () =>
      (wapi.childWindow = window.open(authUrl, "_blank"));

    //checks if wapi is currently signed in
    wapi.isSignedIn = () => wapi.token != null;
    //signs out wapi
    wapi.signOut = () => wapi.scrubToken();

    //listens for an oauth result from the child window
    wapi.authListen = function (setAuth) {
      window.addEventListener("message", function (e) {
        if (e.data.type === "auth") {
          wapi.setToken(e.data.token);
          if (setAuth != null) setAuth(wapi.isSignedIn());
        }
      });
    };

    wapi.readToken = function () {
      if (!wapi.token) return null;
      return JSON.parse(atob(wapi.token.split(".")[1]));
    };

    //get tiered tokens for strong web10 security
    wapi.getTieredToken = function (
      site,
      target,
      protocol = wapi.defaultAPIProtocol
    ) {
      return axios.post(
        `${protocol}//${wapi.readToken().provider}/web10token`,
        {
          username: wapi.readToken().username,
          password: null,
          token: wapi.token,
          site: site,
          target: target,
        }
      );
    };

    /**************
     **** CRUD ****
     **************/

    //patch instead of get so patch can have an HTTPS E2E encrypted body
    wapi.read = function (
      service,
      query = null,
      username = null,
      provider = null,
      protocol = wapi.defaultAPIProtocol
    ) {
      return wapi._W10CRUD(
        axios.patch,
        provider,
        username,
        service,
        query,
        null,
        protocol
      );
    };
    wapi.create = function (
      service,
      query = null,
      username = null,
      provider = null,
      protocol = wapi.defaultAPIProtocol
    ) {
      return wapi._W10CRUD(
        axios.post,
        provider,
        username,
        service,
        query,
        null,
        protocol
      );
    };
    wapi.update = function (
      service,
      query = null,
      update = null,
      username = null,
      provider = null,
      protocol = wapi.defaultAPIProtocol
    ) {
      return wapi._W10CRUD(
        axios.put,
        provider,
        username,
        service,
        query,
        update,
        protocol
      );
    };
    wapi.delete = function (
      service,
      query = null,
      username = null,
      provider = null,
      protocol = wapi.defaultAPIProtocol
    ) {
      //axios delete is implemented differently
      const deleteWrapper = (url, data) => axios.delete(url, { data: data });
      return wapi._W10CRUD(
        deleteWrapper,
        provider,
        username,
        service,
        query,
        null,
        protocol
      );
    };
    wapi._W10CRUD = function (
      HTTPRequestFunction,
      provider,
      username,
      service,
      query,
      update,
      protocol
    ) {

      if ((!username && !wapi.token) || username === "anon") {
        console.error("cant CRUD anon accounts");
        return;
      }
      if (!provider && !wapi.token) {
        console.error("web10 request without provider and token. need one.");
        return;
      }
      provider = provider ? provider : wapi.readToken().provider;
      username = username ? username : wapi.readToken().username;
      const t = {
        token: wapi.token,
        query: query,
        update: update,
      };
      const url = `${protocol}//${provider}/${username}/${service}`;
      return HTTPRequestFunction(url, t);
    };

    //SMRs
    wapi.SMROnReady = function (sirs, scrs) {
      window.addEventListener("message", function (e) {
        if (e.data["type"] === "SMRListen") {
          wapi.childWindow.postMessage(
            {
              type: "smr",
              sirs: sirs,
              scrs: scrs,
            },
            "*"
          );
        }
      });
    };

    wapi.SMRResponseListen = function (setStatus) {
      window.addEventListener("message", function (e) {
        if (e.data.type === "status") setStatus(e.data.status);
      });
    };


    /*************
     **** P2P ****
     *************/

    wapi.peer = null;

    wapi.peerID = function (provider, user, origin, label) {
      return `${provider} ${user} ${origin} ${label}`.replaceAll(".", "_")
    }

    // initializes the peer and listens for inbound connections
    wapi.inBound = {}
    wapi.initP2P = function (onInbound = null, label = "", secure = true) {
      const token = wapi.readToken();
      var id = wapi.peerID(token.provider, token.username, token.site, label)
      wapi.peer = new Peer(id, {
        host: rtcOrigin,
        secure: secure,
        port: secure ? 443 : 80,
        path: '/',
        token: `${wapi.token}~${label}`,
      })
      if (onInbound) {
        wapi.peer.on('connection', function (conn) {
          wapi.inBound[conn.peer] = conn;
          conn.on('data', (data) => onInbound(conn, data));
          conn.on('close', () => delete wapi.inBound[conn.peer])
        });
      }
    }

    // makes outbound connection IF it doesnt already exist
    // else returns the existing connection
    wapi.outBound = {}

    wapi.P2P = function (provider, username, origin, label) {
      if (!wapi.peer) console.error("not initialized")
      const id = wapi.peerID(provider, username, origin, label)
      var conn = null;
      if (!wapi.outBound[id]) {
        conn = wapi.peer.connect(id);
        wapi.outBound[conn.peer] = conn;
        conn.on('close',()=>delete wapi.outBound[conn.peer])
      } else {
        conn = wapi.outBound[id]
      }
      return conn
    }

    wapi.send = function (provider, username, origin, label, data) {
      const conn = wapi.P2P(provider, username, origin, label);
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

    wapi.checkout = function (seller, title, price, successUrl, cancelUrl) {
      return axios.post(
        `${wapi.defaultAPIProtocol}//${wapi.readToken().provider}/dev_pay`,
        {
          token: wapi.token,
          seller: seller,
          title: title,
          price: price,
          success_url: successUrl,
          cancel_url: cancelUrl
        }
      ).then((response) => {
        window.location.href = response.data;
      });
    };

    wapi.verifySubscription = function (seller, title) {
      return axios.patch(
        `${wapi.defaultAPIProtocol}//${wapi.readToken().provider}/dev_pay`,
        {
          token: wapi.token,
          seller: seller,
          title: title,
          price: null,
        }
      );
    };

    wapi.cancelSubscription = function (seller, title) {
      return axios.delete(
        `${wapi.defaultAPIProtocol}//${wapi.readToken().provider}/dev_pay`,
        {
          data: {
            token: wapi.token,
            seller: seller,
            title: title,
          },
        }
      );
    };

    //register the app
    //axios.post('https://api.web10.app/register_app', { "url": window.location.href.split('?')[0] })
    console.log("hello");
    axios.post('http://api.localhost/register_app', { "url": window.location.href.split('?')[0] })
      .then(function (response) {
        console.log(response)
      })
      .catch(console.log);

    //output the wapi object
    return wapi;
  }
}
