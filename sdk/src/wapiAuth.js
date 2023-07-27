import axios from 'axios';

/**
  * Initializes the web10 Authenticator Connector. 
  * For elevated privelege web10 authenticator websites.
  * For example, used in the creation of https://auth.web10.app
  * @param  {Object} wapi [A web10 connector]
  * @returns  {Object} [A web10 Authenticator connector]
  */
const wapiAuthInit = function(wapi) {
  const wapiAuth = {};

  /**
    * Mints a second level token for the referrer site.
    * Stores it in wapiAuth's oAuthToken.
    */
  wapiAuth.mintOAuthToken = function () {
    const referrerURL = new URL(document.referrer);
    wapi
      .getTieredToken(referrerURL.hostname, wapi.readToken().provider)
      .then(function (response) {
        wapiAuth.oAuthToken = response.data.token;
      })
  };

  /**
    * Initialize the oauth token
    */
  wapi.isSignedIn() && document.referrer ? wapiAuth.mintOAuthToken() : (wapiAuth.oAuthToken = null);

  /**
    * Sends the web10 API JWT auth token back to the oauth requesting site .
    * Specifically, the token stored in oAuthToken.
    * Then, closes the authenticator window.
    */
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

  /**
    * Logs into the authenticator using web10 username and password.
    * @param  {Object} provider [web10 provider]
    * @param  {Object} username [web10 username]
    * @param  {Object} password [web10 password]
    * @returns  {Promise} [The web10 auth token]
    */
  wapiAuth.logIn = function (provider, username, password) {
    return axios
      .post(`${wapi.defaultAPIProtocol}//${provider}/web10token`, {
        username: username,
        password: password,
        token: null,
        site: window.location.hostname,
        target: null,
      })
      .then(function (response) {
        wapi.setToken(response.data.token);
        wapiAuth.mintOAuthToken();
      })
  };

  /**
    * Signs up for web10 into the authenticator using web10 username and password.
    * @param  {string} provider [web10 provider]
    * @param  {string} username [web10 username]
    * @param  {string} password [web10 password]
    * @param  {string} betacode [web10 password]
    * @param  {string} phone [web10 password]
    * @returns  {Promise} [The web10 auth token]
    */
  wapiAuth.signUp = function (provider, username, password, betacode, phone) {
    return axios
      .post(`${wapi.defaultAPIProtocol}//${provider}/signup`, {
        username: username,
        password: password,
        betacode:betacode,
        phone: phone,
      })
  };

  /**
    * Checks if there is a parent window. 
    * If there is, listen for SMRs 
    * If there is, pass the SMR to the given callback function.
    * @param  {function} setState [A callback function]
    */
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

    /**
    * Gets your web10 provider if logged in with the web10 connector.
    * @returns  {string} [The URL of the logged in web10 provider.]
    */
  const api = ()=> `${wapi.defaultAPIProtocol}//${wapi.readToken()["provider"]}`;


  /**
    * Lets a logged in web10 user change their password.
    * @param  {string} pass [User's current password, must be correct to change.]
    * @param  {string} newPass [The password to change to.]
    * @returns  {Promise} [Success or failure of password change]
    */
  wapiAuth.changePass = function(pass,newPass){
    return axios.post(`${api()}/change_pass`,{username:wapi.readToken()["username"],password:pass,new_pass:newPass})
  }

  /**
    * Lets a logged in web10 user change their acct. phone number.
    * @param  {string} pass [User's current password, must be correct to change.]
    * @param  {string} newPhone [The phone number to change to.]
    * @returns  {Promise} [Success or failure of number change]
    */
  wapiAuth.changePhone= function(pass,newPhone){
    console.log("in : ",pass,newPhone)
    return axios.post(`${api()}/change_phone`,{username:wapi.readToken()["username"],password:pass,phone:newPhone})
  }


  //twilio functionality
  
  /**
    * Sends a verification code to the logged in web10 user's phone number.
    */
  wapiAuth.sendCode = function(){
    return axios.post(`${api()}/send_code`,{token:wapi.token})
  }

  /**
    * Let's a web10 user verfiy a verification code.
    */
  wapiAuth.verifyCode = function(code){
    return axios.post(`${api()}/verify_code`,{token:wapi.token,query:{code:code}})
  }

  //stripe functionality

  /**
    * Returns a stripe link to manage a consumer space subscription
    */
  wapiAuth.manageSpace = function(){
    return axios.post(`${api()}/manage_space`,{token:wapi.token})
  }

  /**
    * Returns a stripe link to manage a consumer web10 credit subscription
    */
  wapiAuth.manageCredits = function(){
    return axios.post(`${api()}/manage_credits`,{token:wapi.token})
  }

  /**
    * Returns a stripe link to manage a consumer web10 business subscriptions.
    */
  wapiAuth.manageBusiness = function(){
    return axios.post(`${api()}/manage_business`,{token:wapi.token})
  }

  /**
    * Returns a stripe link to manage a consumer web10 credit and space subscription
    */
  wapiAuth.manageSubscriptions = function(){
    return axios.post(`${api()}/manage_subscriptions`,{token:wapi.token})
  }

  /**
    * Returns a stripe link for businesses to manage their information and billing.
    */
  wapiAuth.businessLogin = function(){
    return axios.post(`${api()}/business_login`,{token:wapi.token})
  }

  /**
    * Returns a web10 accts. space and credit in their current web10 acct.
    */
  wapiAuth.getPlan = function(){
    return axios.post(`${api()}/get_plan`,{token:wapi.token})
  }

  /**
    * Returns the web10 authenticator connector.
    */
  return wapiAuth;
}

export {wapiAuthInit};