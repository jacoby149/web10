/* script.js */

import { createV3Client } from 'web10-npm'

const w = createV3Client({ apiOrigin: 'https://api.web10.app' })

function initApp() {
  authButton.innerHTML = 'log out'
  authButton.onclick = () => {
    w.signOut()
    window.location.reload()
  }
  const t = w.readToken()
  message.innerHTML = `hello ${t.provider}/${t.username},<br>`
}

if (w.isSignedIn()) initApp()
else {
  authButton.onclick = async () => {
    try {
      await w.login(usernameInput.value, passwordInput.value)
      window.location.reload()
    } catch (e) {
      message.innerHTML = `login failed: ${e.message}`
    }
  }
}
