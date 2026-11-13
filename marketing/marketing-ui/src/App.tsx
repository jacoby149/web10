import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import { StarsProvider } from './components/GitHubStarsContext'
import DeployStatus from './components/DeployStatus'
import SocialRedirect from './pages/SocialRedirect'
import Home from './pages/Home'
import Join from './pages/Join'
import Docs from './pages/Docs'
import AppStore from './pages/AppStore'
import AppDetail from './pages/AppDetail'
import Freedom from './pages/Freedom'

import Links from './pages/Links'
import Everything from './pages/Everything'
import Appearance from './pages/Appearance'

// Marketing explains the product. Social owns discovery (D111).
function App() {
  return (
    <StarsProvider>
      <Navbar />
      <Routes>
        {/* The pitch (the SELL) — the dedicated landing page. The business case:
            manifesto + reach gap + stats + CTA. (design.md §10: a creator's
            manager believes this is a company in 30 seconds.) Front and center. */}
        <Route path="/" element={<Home />} />
        <Route path="/appearance" element={<Appearance />} />
        <Route path="/trending/*" element={<SocialRedirect />} />
        <Route path="/links" element={<Links />} />
        <Route path="/everything" element={<Everything />} />
        <Route path="/groups" element={<SocialRedirect />} />
        <Route path="/join" element={<Join />} />
        <Route path="/freedom" element={<Freedom />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/:page" element={<Docs />} />
        <Route path="/app-store" element={<AppStore />} />
        <Route path="/app-store/app/:id" element={<AppDetail />} />

      </Routes>
      <DeployStatus />
    </StarsProvider>
  )
}

export default App
