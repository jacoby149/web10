import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import { StarsProvider } from './components/GitHubStarsContext'
import DeployStatus from './components/DeployStatus'
import Home from './pages/Home'
import Trending from './pages/Trending'
import Join from './pages/Join'
import Docs from './pages/Docs'
import AppStore from './pages/AppStore'
import AppDetail from './pages/AppDetail'
import Freedom from './pages/Freedom'
import Exporter from './pages/Exporter'
import Links from './pages/Links'
import Everything from './pages/Everything'

function App({ onReportBug }: { onReportBug: () => void }) {
  return (
    <StarsProvider>
      <Navbar onReportBug={onReportBug} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/links" element={<Links />} />
        <Route path="/everything" element={<Everything />} />
        <Route path="/trending" element={<Trending />} />
        <Route path="/join" element={<Join />} />
        <Route path="/freedom" element={<Freedom />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/:page" element={<Docs />} />
        <Route path="/app-store" element={<AppStore />} />
        <Route path="/app-store/app/:id" element={<AppDetail />} />
        <Route path="/import" element={<Exporter />} />
      </Routes>
      <DeployStatus />
    </StarsProvider>
  )
}

export default App
