import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Docs from './pages/Docs'
import AppStore from './pages/AppStore'
import Exporter from './pages/Exporter'

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/:page" element={<Docs />} />
        <Route path="/app-store" element={<AppStore />} />
        <Route path="/import" element={<Exporter />} />
      </Routes>
    </>
  )
}

export default App
