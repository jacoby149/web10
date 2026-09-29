import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import { StarsProvider } from './components/GitHubStarsContext'
import DeployStatus from './components/DeployStatus'
import ExperienceShell from './components/ExperienceShell'
import Trending from './pages/Trending'
import Home from './pages/Home'
import Join from './pages/Join'
import Docs from './pages/Docs'
import AppStore from './pages/AppStore'
import AppDetail from './pages/AppDetail'
import GroupDetail from './pages/GroupDetail'
import Freedom from './pages/Freedom'
import Exporter from './pages/Exporter'
import Links from './pages/Links'
import Everything from './pages/Everything'

// The legacy /trending redirect — preserves the query string so old bookmarks
// (?view=grid, ?tab=profiles, ?q=…) land on `/` with their params, and the
// Trending component's in-route legacy redirect routes them to the matching
// flat destination (Hot Gossip / People) carrying the params over.
function LegacyTrendingRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/${search}`} replace />
}

function App({ onReportBug }: { onReportBug: () => void }) {
  return (
    <StarsProvider>
      <Navbar onReportBug={onReportBug} />
      <Routes>
        {/* The experience IS the home (watch-page.md, the Discover split):
            the front door is the live social preview, not the pitch. The
            shell owns the four-destination nav (Video · Shorts · Hot Gossip
            · People); each destination is a flat route under `/`. */}
        <Route path="/" element={<ExperienceShell />}>
          <Route index element={<Trending />} />
          <Route path="shorts" element={<Trending />} />
          <Route path="hot-gossip" element={<Trending />} />
          <Route path="people" element={<Trending />} />
        </Route>
        {/* The pitch (the old landing page) — one click away, last in the nav. */}
        <Route path="/about" element={<Home />} />
        <Route path="/links" element={<Links />} />
        <Route path="/everything" element={<Everything />} />
        {/* Legacy: the old Discover path + the old groups redirect. The
            /trending redirect PRESERVES the query string — old bookmarks
            (?view=grid, ?tab=profiles, ?q=…) land on `/` and the Trending
            component's in-route legacy redirect routes them to the matching
            flat destination, carrying the params over. */}
        <Route path="/trending" element={<LegacyTrendingRedirect />} />
        <Route path="/groups" element={<Navigate to="/people" replace />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
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
