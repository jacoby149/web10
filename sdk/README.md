# web10 DOCS | SDKs

<a href ="https://web10.app">web10 Home</a>

<a href ="https://auth.web10.app">web10 auth portal</a>

<a href ="https://api.web10.app/docs">web10 API page</a>



## Getting Started



### SDK Installation (npm)

In your node application, run the following command.

```shell
npm -i web10-npm
```

Then, in your application you can import the package at the top.

```js
import {wapiInit} from 'web10-npm'
```



### SDK Installation (CDN Link)

wapi.js is the javascript file containing the web10 developers SDK. <br>the file can be found at : https://unpkg.com/web10-npm/dist/wapi.js

```html
<!-- Installing using CDN -->
<script src="https://unpkg.com/web10-npm/dist/wapi.js"></script>
```



### SDK Initialization (JS)

in order to use the web10 SDK, the main SDK object needs to be initialized by the developer. 

| function          | description                                                  |
| ----------------- | ------------------------------------------------------------ |
| wapiInit(authUrl) | returns a wapi object registered to handle web10 authentication at the auth portal of the given authUrl. |

```javascript
//initialize a wapi object registered for auth with auth.web10.app
const wapi = wapiInit("https://auth.web10.app")
```



## Authentication



### SDK Functions

once the wapi object is initialized, it provides a variety of functionalities for managing authentication and credentials.

| function                         | description                                                  |
| -------------------------------- | ------------------------------------------------------------ |
| wapi.isSignedIn()                | returns a boolean : whether the app is signed in.            |
| wapi.signOut()                   | signs the app out.                                           |
| wapi.openAuthPortal()            | opens the registered web10 auth portal.                      |
| wapi.authListen(setAuth)         | listens for the auth portal to send a login token, and triggers the inputted callback function [setAuth] |
| wapi.readToken()                 | reads the data fields of the web10token stored in the wapi object. if wapi isn't logged in and the token is null, wapi.readToken() returns null. |
| wapi.getTieredToken(site,target) | mints a token for a given site and web10server using the token stored in wapi. returns an axios promise with  response data being the token[as JWT string] on success. |



### Anonymous Users

When not logged into web10 on a website with the wapi.js sdk, you can still utilize the web10 CRUD functionality. The api will register you as the 'anon' user [a user with the name **anon**].



### Hello World Demo

Below is an example of some html and javascript utilizing all of the above SDK functions to handle login for a simple hello world app. <a href="/demos/hello">**Demo Link**</a>

```html
<html>
	<!-- index.html -->
    <head>
        <link rel="shortcut icon" href="#">
        <meta name="viewport" content="width=device-width" />
    </head>
    <body>
        <button id="authButton">
            log in
        </button>
        <p id="message">
            app not started
        </p>
    </body>
    <!-- Installing using CDN -->
    <script src="https://unpkg.com/web10-npm/dist/wapi.js" ></script>
    <script src="script.js"></script>
</html>
```

```javascript
/* script.js */

//initialize a wapi object registered for auth with auth.web10.app
const wapi = wapiInit("https://auth.web10.app")

// make the auth portal open when the log in button is pressed 
authButton.onclick = wapi.openAuthPortal

// callback function that initializes the app on web10 login
function initApp(){
    // make the logout button handle logouts properly on login
    authButton.innerHTML = "log out";
    authButton.onclick = () => {
        wapi.signOut();
        window.location.reload();
    }
    // simple hello world app, saying hello to the user
    const t = wapi.readToken()
	message.innerHTML = `hello ${t["provider"]}/${t["username"]},<br>`    
}

// either initialize the app if logged in, wait for authentication to do so.
if (wapi.isSignedIn()) initApp()
else wapi.authListen(initApp)
```



## Services



a web10 service is a managed MongoDB collection provided by a web10 provider<br>

web10.app services are hosted at : 

[api.web10.app/{user}/{service}]: https://api.web10.app/docs



### User Consent

> users start new web10 services by accepting SIRs [service initialization requests]
>
> users accept or deny changes to terms of service through SCRs [service change requests] 
>
> > users can change their terms of service in the web10 authentication portal at any time. 



### SDK Functions

| function                                            | description                                                  |
| --------------------------------------------------- | ------------------------------------------------------------ |
| wapi.SMROnReady(sirs,scrs)                          | adds an event listener that waits for the authentication service to send a ready signal. when the authentication service is ready, wapi sends a service modification request [SMR]. an SMR consists of list of service initialization requests [SIRs] and a list of service change requests [SCRs] |
| wapi.create(service,query,username,provider)        | Runs a MongoDB create on the web10 service at provider/{username}/{service}, and returns the result as an axios promise. |
| wapi.read(service,query,username,provider)          | Runs a MongoDB read on the web10 service at provider/{username}/{service}, and returns the result as an axios promise. |
| wapi.update(service,query,update,username,provider) | Runs a MongoDB update on the web10 service at provider/{username}/{service}, and returns the result as an axios promise. *update has an extra special parameter PULL:true that mongo updates don't have, that pulls null array values instead of leaving them. PULL has unspecified behavior on documents holding numerically keyed dictionaries.* |
| wapi.delete(service,query,username,provider)        | Runs a MongoDB delete on the web10 service at provider/{username}/{service}, and returns the result as an axios promise. |



### Service Terms

Users have a service term record for each active service they actively host with web10.  

| field         | description                                                  |
| ------------- | ------------------------------------------------------------ |
| service       | the name of the web10 service                                |
| cross_origins | websites that users are allowed to make web10 requests to the service from. |
| whitelist     | a list of users allowed to access the service                |
| blacklist     | a list of users not allowed to access the service. Overrides user listings on the whitelist. |

```json
{
    service : the name of the service 
    cross_origins : [website1, website2 website3] [regex for exact matching allowed]
    whitelist : [
        {
            user: the name of a web10 user [regex for exact matching allowed]
            provider : the name of a web10 provider [regex for exact matching allowed]
            create : true or false
            read : true or false
            update : true or false
            delete : true or false
            all : true or false
        }, ... 
	]
	blacklist : [ same as whitelist entries ...]
}
```



### Subservices (Coming soon)

Subservices are developer definable services within a service. There properties are :  

1. They can have only stricter rules than the services they are within. 
2. The rules can never restrict access from the user who owns the service. 
3. Developers do not need to get user consent to make subservices



### Note App Demo

Below is an example of some html and javascript utilizing all of the above user owned service management functionality to make a basic notes app. <a href="/demos/notes">**Demo Link**</a>

```html
<html>
<!-- index.html -->
<head>
    <link rel="shortcut icon" href="#">
    <meta name="viewport" content="width=device-width" />
</head>
<body>
    <button id="authButton">
        log in
    </button>
    <p id="message">
        app not started
    </p>
    <div>
        <textarea id="curr" placeholder="write a note here"></textarea>
        <button onclick="createNote(curr.value)">create note</button>
    </div>
    <div id="noteview"></div>
</body>
<script src="https://unpkg.com/web10-npm/dist/wapi.js"></script>
<script src="script.js"></script>
</html>
```

```javascript
/* script.js */

//conventient failure messages
const Fs = ([cF, rF, uF, dF] = ["create", "read", "update", "delete"].map(
  (op) => `failed to ${op} note[s]`
));

/* wapi setup */
const wapi = wapiInit("https://auth.web10.app");
const sirs = [
  {
    service: "web10-docs-note-demo",
    cross_origins: ["docs.web10.app", "localhost", "docs.localhost"],
  },
];
wapi.SMROnReady(sirs, []);
authButton.onclick = wapi.openAuthPortal;

function initApp() {
  authButton.innerHTML = "log out";
  authButton.onclick = () => {
    wapi.signOut();
    window.location.reload();
  };
  const t = wapi.readToken();
  message.innerHTML = `hello ${t["provider"]}/${t["username"]},<br>`;
  readNotes();
}

if (wapi.isSignedIn()) initApp();
else wapi.authListen(initApp);

/* CRUD Calls */
function readNotes() {
  wapi
    .read("web10-docs-note-demo", {})
    .then((response) => displayNotes(response.data))
    .catch((error) => (message.innerHTML = `${rF} : ${error.response.data.detail}`));
}
function createNote(note) {
  wapi
    .create("web10-docs-note-demo", { note: note, date: String(new Date()) })
    .then(() => {
      readNotes();
      curr.value = "";
    })
    .catch(
      (error) => (message.innerHTML = `${cF} : ${error.response.data.detail}`)
    );
}
function updateNote(id) {
  const entry = String(document.getElementById(id).value);
  wapi
    .update("web10-docs-note-demo", { _id: id }, { $set: { note: entry } })
    .then(readNotes)
    .catch(
      (error) => (message.innerHTML = `${uF} : ${error.response.data.detail}`)
    );
}
function deleteNote(id) {
  wapi
    .delete("web10-docs-note-demo", { _id: id })
    .then(readNotes)
    .catch(
      (error) => (message.innerHTML = `${dF} : ${error.response.data.detail}`)
    );
}

/* display */
function displayNotes(data) {
  function contain(note) {
    return `<div>
                <p style="font-family:monospace;">${note.date}</p>
                <textarea id="${note._id}">${note.note}</textarea>
                <button onclick="updateNote('${note._id}')">Update</button>
                <button onclick="deleteNote('${note._id}')">Delete</button>
            </div>`;
  }
  noteview.innerHTML = data.map(contain).reverse().join(`<br>`);
}
```



## devPay

Developers can accept web10 payment with web10 devPay.

| function                                                  | description                                          |
| --------------------------------------------------------- | ---------------------------------------------------- |
| wapi.checkout (seller, title, price,successUrl,cancelUrl) | Opens a subscription checkout portal for a customer. |
| wapi.verifySubscription (seller, title)                   | Verify that a customer is subscribed.                |
| wapi.wapi.cancelSubscription (seller, title)              | Cancel a customer subscription                       |



### Demo - web10 Mail App

Below is a demo mail app. It showcases:

1. service term regexing to allow all web10 users send you an email. 
2. $.50/mo. web10 devPay subscription. 
3. sending of web10 mail as an anon web10 user when not logged in. 

<a href="/demos/mailer">**Demo Link**</a>

```html
<html>
<!-- index.html -->
<head>
    <link rel="shortcut icon" href="#">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.1/css/bulma.min.css" />
    <link rel="stylesheet" href="style.css" />
    <meta name="viewport" content="width=device-width" />
</head>
<body>
    <div class="main">
        <button id="authButton">
            log in
        </button>
        <p id="message">
            app not started
        </p>
        <div id="subscriptionStatus">awaiting subscription check</div>
        <br>
        <div>
            <div>
                <input class="" id="recipient" placeholder="recipient">
                <input class="" id="web10server" placeholder="web10server" value="api.web10.app">
            </div>
            <div>
                <textarea id="curr" placeholder="write message here"></textarea>
            </div>
            <div>
                <button onclick="createMail(curr.value,recipient.value,web10server.value)">create mail</button>
            </div>
        </div>
        <div id="mailview"></div>
    </div>
</body>
<script src="https://unpkg.com/web10-npm/dist/wapi.js"></script>
<script src="script.js"></script>
</html>
```

```css
/* style.css */
div {
  margin-top: 5px;
}
input {
  margin-bottom: 3px;
}
textarea {
  width: 100%;
  height: 200px;
}
```

```js
/* script.js */

//conventient failure messages
const Fs = ([cF, rF, uF, dF] = ["create", "read", "update", "delete"].map(
  (op) => `failed to ${op} mail[s]`
));

/* wapi setup */
const wapi = wapiInit("https://auth.web10.app");
const sirs = [
  {
    service: "web10-docs-mail-demo",
    cross_origins: ["docs.web10.app", "localhost", "docs.localhost"],
    whitelist: [{ username: ".*", provider: ".*", create: true }], //allows all users to write to you
  },
];
wapi.SMROnReady(sirs, []);
authButton.onclick = wapi.openAuthPortal;

/* web10 devPay */
const [seller, subscriptionTitle, price, url] = [
  "seller-web10-username",
  "mailer-premium",
  50,
  window.location.href,
];

/* message for current subscribers */
function displaySubscriberMessage() {
  subscriptionStatus.innerHTML = `subscribed! <button id="cancel"> cancel sub </button>`;
  cancel.onclick = () =>
    wapi
      .cancelSubscription(seller, subscriptionTitle)
      .then(() => window.location.reload())
      .catch((e) => {
        subscriptionStatus.innerHTML = `subscription cancellation failed...`;
      });
}

/* message for users that are not subscribed to onboard them */
function displayOnboardMessage() {
  subscriptionStatus.innerHTML = `not subscribed! <button id="checkout"> subscribe </button>`;
  checkout.onclick = () =>
    wapi.checkout(seller, subscriptionTitle, price, url, url).catch((e) => {
      message.innerHTML = e.response.data.detail;
    });
}

/* a front end weak subscription check [still lucrative!] */
function validSubscription(subscriptionData) {
  return (
    subscriptionData !== null &&
    parseInt(subscriptionData["price"]) === price &&
    subscriptionData["seller"] === seller &&
    subscriptionData["title"] === title
  );
}

/* The devpay functionality */
function devPay() {
  wapi
    .verifySubscription(seller, subscriptionTitle)
    .then((r) => {
      if (validSubscription(r["data"])) displaySubscriberMessage();
      else displayOnboardMessage();
    })
    .catch(
      (e) => (subscriptionStatus.innerHTML = `subscription check failed...`)
    );
}

function initApp() {
  authButton.innerHTML = "log out";
  authButton.onclick = () => {
    wapi.signOut();
    window.location.reload();
    devPay();
  };
  const t = wapi.readToken();
  message.innerHTML = `hello ${t["provider"]}/${t["username"]},<br>`;
  readMail();
  devPay();
}

if (wapi.isSignedIn()) initApp();
else wapi.authListen(initApp);

/* CRUD Calls */
function readMail() {
  wapi
    .read("web10-docs-mail-demo", {})
    .then((response) => displayMail(response.data))
    .catch((error) => (message.innerHTML = `${rF} : ${error}`));
}
function createMail(mail, user, provider) {
  const t = wapi.readToken();
  const sender = t===null ? "anon":t["username"]
  wapi
    .create(
      "web10-docs-mail-demo",
      {
        mail: mail,
        date: String(new Date()),
        provider: provider,
        username: sender,
      },
      user,
      provider
    )
    .then(() => {
      if (sender!=="anon") readMail();
      curr.value = "";
      message.innerHTML = "sent message";
    })
    .catch((error) => (message.innerHTML = `${cF} : ${error}`));
}
function deleteMail(id) {
  wapi
    .delete("web10-docs-mail-demo", { _id: id })
    .then(readMail)
    .catch(
      (error) => (message.innerHTML = `${dF} : ${error.response.data.detail}`)
    );
}

/* display */
function displayMail(data) {
  function contain(mail) {
    return `<div style="margin-top:40px;margin-left:10px">
                <p style="font-family:monospace;">${mail.date}</p>
                <p style="font-family:monospace;">${mail.provider}/${mail.username}</p>                
                <i id="${mail._id}">${mail.mail}</i>
                <button onclick="deleteMail('${mail._id}')">Delete</button>
            </div>`;
  }
  mailview.innerHTML = data.map(contain).reverse().join(`<br>`);
}
```

## P2P (Via. PeerJS) (Coming soon)

web10 peer to peer functionality relies on the PeerJS library. web10 runs it's own webRTC server to keep web10 users secure when using the platform.

### SDK Functions

| Function                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| wapi.initP2P(onInbound=null)                                 | Initializes the client as a peer, and on recieving inbound connections saves the connections to wapi.inBound. and attaches an event listener that triggers the onInbound(conn,data) function to recieved inbound connections |
| wapi.P2P(provider, username, origin, metaData={}, label = "default") | Makes a P2P connection with another web10 peer.              |



### Outbound/Inbound P2P

Connections that other web10 users make to you are stored in the wapi.inBound dictionary under their peer ID.

Connections that you make to other web10 users are stored in the wapi.outBound dictionary under their peer ID.



### web10 Peer IDs

On web10, peer ids look like 'provider/username/origin/label'

1. *provider* is the web10 provider of a user of web10 P2P
2. *username* is the web10 username of a user of web10 P2P
3. *origin* is the origin of the site the user is using to make the web10 P2P connection
   * when connecting to a mobile encryptor, *origin* is set to "mobile"
4. *label* is an extra string a developer can add to the peer id to handle single users being multipeer

### P2P messaging demo (Coming soon)

```
(Coming soon)
```



## Encryption (Coming soon)

web10 does the following to make encryption is as secure as possible : 

1. Implements SEPC256K1 encryption for digital signatures, diffie helman, and assymetric encryption
2. Has a mobile app client to store all of your web10 keys locally on your phone to keep the keys entirely secret.
3. Creates a P2P tunnel between your phone and web10 using devices to keep your web10 apps secure.



### E2E P2P messaging demo (Coming soon)

```
(Coming soon)
```



> *End of web10 docs* ...

