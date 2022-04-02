//wapi can be double loaded. try locally first and if that fails, load from the cdn
if (typeof wapiAuthInit==='undefined'){


//Makes the wapiAuth library object
function wapiAuthInit(wapi) {
  const wapiAuth = {};

  //mints a second level token for the referrer site.
  wapiAuth.mintOAuthToken = function () {
    const referrerURL = new URL(document.referrer);
    wapi
      .getTieredToken(referrerURL.hostname, wapi.readToken().provider)
      .then(function (response) {
        wapiAuth.oAuthToken = response.data.token;
      })
  };

  //initialize the oauth token
  wapi.isSignedIn() && document.referrer ? wapiAuth.mintOAuthToken() : (wapiAuth.oAuthToken = null);

  //send the apikey back to the oauth requesting site
  wapiAuth.sendToken = function () {
    window.opener.postMessage(
      {
        type: "auth",
        token: wapiAuth.oAuthToken,
      },
      "*"
    );
    window.close();
  };

  //log into an existing web10 account
  //get tokens for web10 auth, and a parent oauth application.
  wapiAuth.logIn = function (provider, username, password, setAuth, setStatus) {
    //web10 auth login
    axios
      .post(`${wapi.defaultAPIProtocol}//${provider}/web10token`, {
        username: username,
        password: password,
        token: null,
        site: window.location.hostname,
        target: null,
      })
      .then(function (response) {
        wapi.setToken(response.data.token);
        setAuth(true);
        wapiAuth.mintOAuthToken();
      })
      .catch((error) => setStatus(`Log in failed : ${error.response.data.detail}`));
  };

  //sign up for a new web10 account
  wapiAuth.signUp = function (provider, username, password, phone) {
    return axios
      .post(`${wapi.defaultAPIProtocol}//${provider}/signup`, {
        username: username,
        password: password,
        phone: phone,
      })
  };

  //change web10 username and password
  wapiAuth.changeUsername = function () {};
  wapiAuth.changePassword = function () {};

  //If there is a referrer, listen for the SMR and use it to set a web10 auth app state
  wapiAuth.SMRListen = function (setState) {
    if (window.opener) {
      window.addEventListener("message", function (e) {
        if (e.data.type === "smr") setState(e.data);
      });
      //Notify SMR requester that the auth app is ready.
      window.opener.postMessage(
        {
          type: "SMRListen",
        },
        "*"
      );
    }
  };

  const api = ()=> `${wapi.defaultAPIProtocol}//${wapi.readToken()["provider"]}`;


  //change functionality
  wapiAuth.changePass = function(pass,newPass){
    return axios.post(`${api()}/change_pass`,{username:wapi.readToken()["username"],password:pass,new_pass:newPass})
  }

  wapiAuth.changePhone= function(pass,newPhone){
    console.log("in : ",pass,newPhone)
    return axios.post(`${api()}/change_phone`,{username:wapi.readToken()["username"],password:pass,phone:newPhone})
  }


  //twilio functionality
  wapiAuth.sendCode = function(){
    axios.post(`${api()}/send_code`,{token:wapi.token})
  }
  wapiAuth.verifyCode = function(code){
    return axios.post(`${api()}/verify_code`,{token:wapi.token,query:{code:code}})
  }

  //stripe functionality
  wapiAuth.manage_space = function(subscription=false){
    return axios.post(`${api()}/manage_space`,{token:wapi.token})
  }
  wapiAuth.manage_credits = function(subscription=false){
    return axios.post(`${api()}/manage_credits`,{token:wapi.token})
  }
  wapiAuth.purchase_credits = function(subscription=false){
    return axios.post(`${api()}/purchase_credits`,{token:wapi.token})
  }

  //output the wapiAuth object
  return wapiAuth;
}
}