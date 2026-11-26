import { Navigate, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import { StarsProvider } from './components/GitHubStarsContext'
import DeployStatus from './components/DeployStatus'
import SocialRedirect from './pages/SocialRedirect'
import Home from './pages/Home'
import Audience from './pages/Audience'
import Join from './pages/Join'
import Docs from './pages/Docs'
import AppStore from './pages/AppStore'
import AppDetail from './pages/AppDetail'
import Freedom from './pages/Freedom'

import Links from './pages/Links'
import Appearance from './pages/Appearance'

// Marketing explains the product. Social owns discovery (D111).
function App() {
  return (
    <StarsProvider>
      <Navbar />
      <Routes>
        {/* The classic own-your-data landing is primary. The archived
            creator pitch remains available at /audience. */}
        <Route path="/" element={<Home />} />
        <Route path="/audience" element={<Audience />} />
        <Route path="/appearance" element={<Appearance />} />
        <Route path="/trending/*" element={<SocialRedirect />} />
        <Route path="/links" element={<Links />} />
        <Route path="/everything" element={<Navigate to="/" replace />} />
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
