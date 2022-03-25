/* script.js */

//initialize a wapi object registered for auth with auth.web10.app
const wapi = wapiInit("https://auth.web10.app")

//conventient failure messages
const Fs = ([cF, rF, uF, dF] = ["create", "read", "update", "delete"].map(
  (op) => `failed to ${op} note[s]`
));

//make the SIR for the notes service
const sirs = [
  {
    // name of the new service
    service: "web10-docs-note-demo",

    // allowed web10 app hostnames[without route specified] that can use this service
    cross_origins: ["auth.web10.app","jacobhoffman.tk"],
  },
];
wapi.SMROnReady(sirs, []);

// make the auth portal open when the log in button is pressed
authButton.onclick = wapi.openAuthPortal;

// callback function that initializes the app on web10 login
function initApp() {
  // make the logout button handle logouts properly on login
  authButton.innerHTML = "log out";
  authButton.onclick = () => {
    wapi.signOut();
    window.location.reload();
  };
  // simple hello world app, saying hello to the user
  const t = wapi.readToken();
  message.innerHTML = `hello ${t["provider"]}/${t["username"]},<br>`;
  readNotes();
}

// either initialize the app if logged in, wait for authentication to do so.
if (wapi.isSignedIn()) initApp();
else wapi.authListen(initApp);

// CRUD
function readNotes() {
  wapi
    .read("web10-docs-note-demo", {})
    .then((response) => displayNotes(response.data))
    .catch(() => (message.innerHTML = rF));
}
function createNote(note) {
  //when it's your service, username and provider are optional
  wapi
    .create("web10-docs-note-demo", { note: note })
    .then(() => {
      readNotes();
      curr.value = "";
    })
    .catch(() => (message.innerHTML = cF));
}
function updateNote(id) {
  const entry = String(document.getElementById(id).value);
  wapi
    .update("web10-docs-note-demo", { _id: id }, { $set:{note: entry }})
    .then(readNotes)
    .catch(() => (message.innerHTML = uF));
}
function deleteNote(id) {
  wapi
    .delete("web10-docs-note-demo", { "_id": id })
    .then(readNotes)
    .catch(() => (message.innerHTML = dF));
}

// display functionality
function displayNotes(data) {
  function contain(note) {
    return `
            <br>
            <div>
                <textarea id="${note._id}">${note.note}</textarea>
                <button onclick="updateNote('${note._id}')">Update</button>
                <button onclick="deleteNote('${note._id}')">Delete</button>
            </div>
            `;
  }
  noteview.innerHTML = data.map(contain);
}
