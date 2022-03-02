//makes a dictionary of cookies
function cookieDict() {
    return (
        document.cookie.split(';').reduce((res, c) => {
            const [key, val] = c.trim().split('=').map(decodeURIComponent)
            try {
                return Object.assign(res, { [key]: JSON.parse(val) })
            } catch (e) {
                return Object.assign(res, { [key]: val })
            }
        }, {})
    )
}   

function serviceChangeRequesterInit(authUrl){
    const serviceChangeRequester = {};

    //listens for the auth window to be ready, and sends the stored service change request 
    serviceChangeRequester.requestOnReady = function(servicesToGrant,servicesToRevoke = []) {
        window.addEventListener('message', 
            function(e) {
                if (e.data.type === "ready") {
                    window.opener.postMessage(
                        {
                            "type":"services",
                            "servicesToGrant": servicesToGrant,
                            "servicesToRevoke": servicesToRevoke 
                        }, 
                        "*");               
                }
            });
        }    

    //listens for an approval or denial of service request 
    serviceChangeRequester.serviceChangeListen = function(setStatus) {
        window.addEventListener('message', 
            function(e) {
                if (e.data.type === "status") setStatus(e.data.status)
            });
        }

    return serviceChangeRequester;
}

//initializes the wapi library object
function wapiInit(authUrl="http://auth.localhost") {
    const wapi = {};
    
    //wapi variables
    wapi.childWindow = null;
    wapi.token = cookieDict()["token"];

    //sets the api key in wapi and stores it in cookies
    wapi.setToken = 
        function(token) {
            wapi.token = token;
            console.log(wapi.token)
            //TODO make the token expire at the right time...
            //document.cookie = `token=${wapi.token};Secure;path=/`;
        }
    //scrub the api keys from wapi and deletes it from cookies
    wapi.scrubToken = 
        function(){
            document.cookie = "token=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;"
            wapi.token = null;
        }

    //opens up a child window for auth stuff
    wapi.openAuthPortal =  () => wapi.childWindow = window.open(authUrl, '_blank');

    //checks if wapi is currently signed in
    wapi.isSignedIn = () => (wapi.token != null);
    //signs out wapi
    wapi.signOut = () => wapi.scrubToken();

    //listens for an oauth result from the child window
    wapi.authListen = function(setAuth) {
        window.addEventListener('message', 
            function(e) {
                if (e.data.type === "auth") {
                    wapi.setToken(e.data.token);             
                    if (setAuth != null) setAuth(wapi.isSignedIn());
                }
            });
        }

    //add service requesting to wapi
    wapi.serviceChangeRequester = serviceChangeRequesterInit();

    wapi.readToken = function(){
        return JSON.parse(atob(wapi.token.split('.')[1]));;
    }

    //get tiered tokens for strong web10 security
    wapi.getTieredToken = function(site,target){
        return axios.post(`http://${wapi.readToken().provider}/web10token`,
        {
            username: wapi.readToken().username,
            password: null,
            token: wapi.token,
            site: site,
            target: target
        })
    }

    //CRUD functionality (patch instead of get (secure) since patch can have a body)
    wapi.get = function(service,username=null,provider=null,query=null){
        return wapi._W10CRUD(axios.patch,provider,username,service,query);
    }
    wapi.post = function(service,username=null,provider=null,query=null){
        return wapi._W10CRUD(axios.post,provider,username,service,query);
    }
    wapi.put = function(service,username=null,provider=null,query=null,value=null){
        return wapi._W10CRUD(axios.put,provider,username,service,query,value)
    }
    wapi.delete = function(service,username=null,provider=null,query=null){
        return wapi._W10CRUD(axios.delete,provider,username,service,query);
    }
    wapi._W10CRUD = function(HTTPRequestFunction,provider,username,service,query=null,value=null){
        if (!provider && !wapi.token){
            console.error("web10 request without provider or token");
            return;
        }
        provider = provider? provider : wapi.readToken().provider;
        username = username? username : wapi.readToken().username;
        const t = {
            token:wapi.token,
            query:query,
            value:value
        };
        console.log(provider," - ",username)
        console.log(t);
        return HTTPRequestFunction(`http://${provider}/${username}/${service}`,t)
    }
    

    //output the wapi object
    return wapi;
}

var wapi = wapiInit();