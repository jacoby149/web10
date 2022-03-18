//Makes the wapiAuth library object
function wapiAuthInit () {
    const wapiAuth = {};

    //mints a second level token for the referrer site.
    wapiAuth.mintOAuthToken = function(){
        wapi.getTieredToken(document.referrer.slice(0,-1),wapi.readToken().provider).then(
            function (response) {
                wapiAuth.oAuthToken = response.data.token
            }
        )
        .catch(console.log);
    } 
    
    //initialize the oauth token   
    wapi.isSignedIn() ? wapiAuth.mintOAuthToken() : wapiAuth.oAuthToken = null;;
        
    //send the apikey back to the oauth requesting site
    wapiAuth.sendToken = 
        function() {
            window.opener.postMessage(
                {
                    "type":"auth",
                    "token":wapiAuth.oAuthToken, 
                }, 
                "*");
            window.close();
        }

    //log into an existing web10 account
    //get tokens for web10 auth, and a parent oauth application.
    wapiAuth.logIn =
        function(provider, username, password, setAuth, setStatus) {

            console.log(window.location.href)
            //web10 auth login
            axios.post(`${provider}/web10token`,
            {
                username: username,
                password: password, 
                token: null,
                site: window.location.host, 
                target: null,
            })
            .then(
                function (response) {
                    wapi.setToken(response.data.token);
                    setAuth(true); 
                    wapiAuth.mintOAuthToken();

                }
            )
            .catch((response) => setStatus(`log in failed ${response}`));
        }

    //sign up for a new web10 account
    wapiAuth.signUp = 
        function(provider, username, password) {
            axios.post(`http://${provider}/signup`, 
                {
                    username:username,
                    password:password
                })
                .then(console.log)
                .catch(console.log);
        }
    
    //change web10 username and password
    wapiAuth.changeUsername = function() {}
    wapiAuth.changePassword = function() {}

    //Listen for the SMR
    wapiAuth.SMRListen = function(setState){
        return;
    };

    //output the wapiAuth object
    return wapiAuth;
}

var wapiAuth=wapiAuthInit();