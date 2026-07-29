import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import { StarsProvider } from './components/GitHubStarsContext'
import DeployStatus from './components/DeployStatus'
import Home from './pages/Home'
import Trending from './pages/Trending'
import Join from './pages/Join'
import Docs from './pages/Docs'
import AppStore from './pages/AppStore'
import Exporter from './pages/Exporter'
import Graph from './pages/Graph'

function App({ onReportBug }: { onReportBug: () => void }) {
  return (
    <StarsProvider>
      <Navbar onReportBug={onReportBug} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trending" element={<Trending />} />
        <Route path="/join" element={<Join />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/:page" element={<Docs />} />
        <Route path="/app-store" element={<AppStore />} />
        <Route path="/import" element={<Exporter />} />
        <Route path="/graph" element={<Graph />} />
      </Routes>
      <DeployStatus />
    </StarsProvider>
  )
}

export default App
