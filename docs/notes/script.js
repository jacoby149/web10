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