/* script.js */

//conventient failure messages
const Fs = ([cF, rF, uF, dF] = ["create", "read", "update", "delete"].map(
  (op) => `failed to ${op} mail[s]`
));

/* wapi setup */
const wapi = wapiInit("http://auth.localhost");
const sirs = [
  {
    service: "web10-docs-mail-demo",
    cross_origins: ["docs.web10.app", "localhost", "docs.localhost"],
    whitelist : [{username:".*",provider:".*",create:true}]//allows all users to write to you
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
  readMail();
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
function createMail(mail,user,provider) {
  const t = wapi.readToken();
  wapi
    .create("web10-docs-mail-demo", { mail: mail, date: String(new Date()),provider:t["provider"],username:t["username"] },user,provider)
    .then(() => {
      readMail();
      curr.value = "";
    })
    .catch(
      (error) => (message.innerHTML = `${cF} : ${error}`)
    );
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
    return `<div>
                <p style="font-family:monospace;">${mail.date}</p>
                <p style="font-family:monospace;">${mail.provider}/${mail.username}</p>                
                <textarea id="${mail._id}">${mail.mail}</textarea>
                <button onclick="deleteMail('${mail._id}')">Delete</button>
            </div>`;
  }
  mailview.innerHTML = data.map(contain).reverse().join(`<br>`);
}