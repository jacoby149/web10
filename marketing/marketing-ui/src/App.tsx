import { Routes, Route, Navigate } from 'react-router-dom'
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

// The pitch is the front door again (the pre-Discover-split layout): `/` is
// the landing page, and the social experience lives at `/trending` (the tab
// is labeled Trending). The experience shell owns the four-destination nav
// (Video · Shorts · Hot Gossip · People); each destination is a flat route
// under `/trending`.
function App({ onReportBug }: { onReportBug: () => void }) {
  return (
    <StarsProvider>
      <Navbar onReportBug={onReportBug} />
      <Routes>
        {/* The pitch (the SELL) — the dedicated landing page. The business case:
            manifesto + reach gap + stats + CTA. (design.md §10: a creator's
            manager believes this is a company in 30 seconds.) Front and center. */}
        <Route path="/" element={<Home />} />
        {/* The experience (the SHOW) — the content pyramid: People → Posts →
            Video → Shorts. Posts is the default (the index) — the content, not
            the profiles (the operator, 29.09.2026: "the people tab is kind of
            boring just a bunch of profiles not actual content, so by default
            have that second tab selected"). */}
        <Route path="/trending" element={<ExperienceShell />}>
          <Route index element={<Trending />} />
          <Route path="people" element={<Trending />} />
          <Route path="video" element={<Trending />} />
          <Route path="shorts" element={<Trending />} />
          {/* Legacy: the old Hot Gossip route (renamed to Posts, 3.185.0). */}
          <Route path="hot-gossip" element={<Navigate to="/trending" replace />} />
        </Route>
        <Route path="/links" element={<Links />} />
        <Route path="/everything" element={<Everything />} />
        {/* Legacy: the old groups redirect (the People destination). */}
        <Route path="/groups" element={<Navigate to="/trending/people" replace />} />
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
