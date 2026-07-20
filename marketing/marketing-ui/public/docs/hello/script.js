/* hello demo — script.js */

const wapi = wapiInit("https://auth.web10.app")

authButton.onclick = wapi.openAuthPortal

function initApp() {
  authButton.innerHTML = "Log out"
  authButton.onclick = () => {
    wapi.signOut()
    window.location.reload()
  }
  const t = wapi.readToken()
  message.innerHTML = `Hello <strong>${t["provider"]}/${t["username"]}</strong> — you just authenticated with a web10 node.`
}

if (wapi.isSignedIn()) initApp()
else wapi.authListen(initApp)